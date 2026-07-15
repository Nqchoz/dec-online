import { useCallback, useEffect, useRef, useState } from "react";
import type { Card } from "../Types/Card";

export type Team = "blue" | "red";

export interface RosterEntry {
  seatId: string;
  username: string;
  team: Team;
  connected: boolean;
  count: number;
}

export interface ServerState {
  gameId: string;
  phase: "lobby" | "playing";
  hostSeat: string;
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

const WS_URL =
  ((import.meta as any).env?.VITE_WS_URL as string) || "ws://localhost:3001";

/**
 * Owns the single WebSocket connection and turns the server's push messages
 * (joined / state / hand / askResult / declareResult / error) into React state.
 * The game is fully event-driven — there is no REST polling.
 */
export function useGameSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [seatId, setSeatId] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [state, setState] = useState<ServerState | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [lastAsk, setLastAsk] = useState<AskInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setError("Connection error — is the server running?");
    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "joined":
          setSeatId(msg.seatId);
          setGameId(msg.gameId);
          break;
        case "state":
          setState(msg as ServerState);
          break;
        case "hand":
          setHand(msg.cards as Card[]);
          break;
        case "askResult":
          setLastAsk({
            from: msg.fromSeat,
            to: msg.targetSeat,
            card: msg.card,
            result: msg.received,
          });
          break;
        case "declareResult":
          setNotice(
            msg.correctCheck
              ? `✅ ${msg.message}`
              : `❌ ${msg.message}`
          );
          break;
        case "error":
          setError(msg.error || "Something went wrong.");
          break;
      }
    };
    return () => ws.close();
  }, []);

  const send = useCallback((obj: any) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
    else setError("Not connected to the server.");
  }, []);

  const api = {
    createGame: (username: string) => send({ type: "createGame", username }),
    joinGame: (code: string, username: string) =>
      send({ type: "joinGame", gameId: code, username }),
    startGame: () => send({ type: "startGame" }),
    ask: (card: string, targetSeatId: string) =>
      send({ type: "ask", card, targetSeatId }),
    declareCheck: (setId: string, assignments: Record<string, string>) =>
      send({ type: "declareCheck", setId, assignments }),
    newGame: () => send({ type: "newGame" }),
  };

  return {
    connected,
    seatId,
    gameId,
    state,
    hand,
    lastAsk,
    notice,
    error,
    clearError: () => setError(null),
    clearNotice: () => setNotice(null),
    api,
  };
}
