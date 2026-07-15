import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "../Types/Card";

export type Team = "blue" | "red";

export interface RosterEntry {
  memberId: string;
  seatId: string;
  username: string;
  team: Team;
  connected: boolean;
  ready: boolean;
  count: number;
}

export interface ServerState {
  gameId: string;
  phase: "lobby" | "playing";
  hostId: string;
  hostSeat: string | null;
  paused: boolean;
  currentTurn: string | null;
  scores: { blue: number; red: number };
  gameOver: boolean;
  winner: Team | null;
  declarations: { blueDeclarations: string[]; redDeclarations: string[] };
  roster: RosterEntry[];
}

export interface AskInfo {
  from: string;
  to: string;
  card: string;
  result: boolean;
}

export interface LogEntry {
  id: number;
  kind: "ask" | "declare";
  fromSeat?: string;
  targetSeat?: string;
  card?: string;
  received?: boolean;
  bySeat?: string;
  setId?: string;
  winningTeam?: Team;
  correctCheck?: boolean;
}

const MAX_LOG = 100;

const WS_URL =
  ((import.meta as any).env?.VITE_WS_URL as string) || "ws://localhost:3001";
const CREDS_KEY = "declaration.creds";

interface Creds {
  gameId: string;
  memberId: string;
  token: string;
}
function loadCreds(): Creds | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? (JSON.parse(raw) as Creds) : null;
  } catch {
    return null;
  }
}
function saveCreds(c: Creds) {
  localStorage.setItem(CREDS_KEY, JSON.stringify(c));
}
function clearCreds() {
  localStorage.removeItem(CREDS_KEY);
}

/**
 * Owns the single WebSocket connection and turns the server's push messages
 * (joined / state / hand / askResult / declareResult / error) into React state.
 * Persists {gameId, memberId, token} so a dropped client auto-rejoins its seat.
 */
export function useGameSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const joinedRef = useRef(false); // have we successfully (re)joined this session?
  const logSeq = useRef(0);

  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState<boolean>(() => !!loadCreds());
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [state, setState] = useState<ServerState | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [lastAsk, setLastAsk] = useState<AskInfo | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const appendLog = (entry: Omit<LogEntry, "id">) =>
    setLog((prev) => {
      const next = [...prev, { ...entry, id: ++logSeq.current }];
      return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
    });

  useEffect(() => {
    let disposed = false; // set on teardown (incl. StrictMode remount) so an intentional close isn't treated as an error
    let retries = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const handleMessage = (ev: MessageEvent) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "joined":
          joinedRef.current = true;
          setReconnecting(false);
          setMyMemberId(msg.memberId);
          setGameId(msg.gameId);
          saveCreds({ gameId: msg.gameId, memberId: msg.memberId, token: msg.token });
          break;
        case "state":
          setState(msg as ServerState);
          break;
        case "hand":
          setHand(msg.cards as Card[]);
          break;
        case "askResult":
          setLastAsk({ from: msg.fromSeat, to: msg.targetSeat, card: msg.card, result: msg.received });
          appendLog({
            kind: "ask",
            fromSeat: msg.fromSeat,
            targetSeat: msg.targetSeat,
            card: msg.card,
            received: msg.received,
          });
          break;
        case "declareResult":
          setNotice(msg.correctCheck ? `✅ ${msg.message}` : `❌ ${msg.message}`);
          appendLog({
            kind: "declare",
            bySeat: msg.bySeat,
            setId: msg.setId,
            winningTeam: msg.winningTeam,
            correctCheck: msg.correctCheck,
          });
          break;
        case "error":
          // A failed auto-rejoin (stale creds) shouldn't strand us on a blank
          // screen — drop the creds so the menu shows.
          if (!joinedRef.current && loadCreds()) clearCreds();
          setReconnecting(false);
          setError(msg.error || "Something went wrong.");
          break;
      }
    };

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;

      ws.onopen = () => {
        retries = 0;
        setConnected(true);
        setError(null); // clear any prior "reconnecting" banner
        const creds = loadCreds();
        if (creds) ws.send(JSON.stringify({ type: "rejoin", gameId: creds.gameId, token: creds.token }));
        else setReconnecting(false);
      };
      ws.onmessage = handleMessage;
      // Errors surface via onclose (which drives the retry); a bare error event
      // during connect/teardown shouldn't flash a scary banner.
      ws.onerror = () => {};
      ws.onclose = () => {
        setConnected(false);
        if (disposed) return; // intentional teardown — do not retry or warn
        retries += 1;
        if (retries >= 3) {
          setReconnecting(false);
          setError("Lost connection — reconnecting…");
        }
        reconnectTimer = setTimeout(connect, Math.min(500 * 2 ** retries, 5000));
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, []);

  const send = useCallback((obj: any) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    else setError("Not connected to the server.");
  }, []);

  const leave = useCallback(() => {
    clearCreds();
    window.location.reload();
  }, []);

  const api = {
    createGame: (username: string) => send({ type: "createGame", username }),
    joinGame: (code: string, username: string) => send({ type: "joinGame", gameId: code, username }),
    setReady: (ready: boolean) => send({ type: "setReady", ready }),
    arrange: (order: string[]) => send({ type: "arrange", order }),
    shuffleTeams: () => send({ type: "shuffleTeams" }),
    shuffleOrder: () => send({ type: "shuffleOrder" }),
    startGame: () => send({ type: "startGame" }),
    ask: (card: string, targetSeatId: string) => send({ type: "ask", card, targetSeatId }),
    declareCheck: (setId: string, assignments: Record<string, string>) =>
      send({ type: "declareCheck", setId, assignments }),
    newGame: () => send({ type: "newGame" }),
    endGame: () => send({ type: "endGame" }),
  };

  return {
    connected,
    reconnecting,
    myMemberId,
    gameId,
    state,
    hand,
    lastAsk,
    log,
    notice,
    error,
    clearError: () => setError(null),
    clearNotice: () => setNotice(null),
    leave,
    api,
  };
}
