import { WebSocket } from "ws";
import { RoomRegistry } from "./rooms";
import { handleMessage } from "./handlers";
import { Card } from "./deck";

interface FakeSocket extends WebSocket {
  sent: any[];
}
function mkSocket(): FakeSocket {
  const sent: any[] = [];
  return {
    readyState: 1,
    OPEN: 1,
    send: (s: string) => sent.push(JSON.parse(s)),
    sent,
  } as unknown as FakeSocket;
}

function mk(name: string): Card {
  const [rank, suit] = name.split("_of_");
  return { suit, rank } as Card;
}

const msgsOfType = (s: FakeSocket, type: string) => s.sent.filter((m) => m.type === type);
const lastOfType = (s: FakeSocket, type: string) => {
  const a = msgsOfType(s, type);
  return a[a.length - 1];
};

describe("WS message handlers", () => {
  let reg: RoomRegistry;
  beforeEach(() => {
    reg = new RoomRegistry();
  });

  // Fill a room to 6 and return the sockets (host first) + the room code.
  function fullRoom() {
    const socks = [mkSocket()];
    handleMessage(reg, socks[0], { type: "createGame", username: "P1" });
    const gameId = lastOfType(socks[0], "joined").gameId;
    for (let i = 2; i <= 6; i++) {
      const s = mkSocket();
      handleMessage(reg, s, { type: "joinGame", gameId, username: "P" + i });
      socks.push(s);
    }
    return { socks, gameId };
  }

  function readyAll(socks: FakeSocket[]) {
    for (let i = 1; i < socks.length; i++) handleMessage(reg, socks[i], { type: "setReady", ready: true });
  }

  test("createGame replies joined (with memberId + token) and pushes lobby state", () => {
    const s = mkSocket();
    handleMessage(reg, s, { type: "createGame", username: "Alice" });
    const joined = lastOfType(s, "joined");
    expect(joined.memberId).toBeTruthy();
    expect(joined.token).toHaveLength(24);
    expect(lastOfType(s, "state").phase).toBe("lobby");
  });

  test("a socket already in a game cannot create or join another", () => {
    const s = mkSocket();
    handleMessage(reg, s, { type: "createGame", username: "A" });
    const gameId = lastOfType(s, "joined").gameId;
    s.sent.length = 0;

    handleMessage(reg, s, { type: "createGame", username: "A" });
    expect(lastOfType(s, "error").error).toMatch(/already in a game/i);
    handleMessage(reg, s, { type: "joinGame", gameId, username: "A" });
    expect(lastOfType(s, "error").error).toMatch(/already in a game/i);
  });

  test("a gameplay message from an unbound socket is rejected", () => {
    const s = mkSocket();
    handleMessage(reg, s, { type: "ask", card: "2_of_clubs", targetSeatId: "seat2" });
    expect(lastOfType(s, "error").error).toMatch(/not in a game/i);
  });

  test("Start is gated on all players being ready", () => {
    const { socks } = fullRoom();
    handleMessage(reg, socks[0], { type: "startGame" });
    expect(lastOfType(socks[0], "error").error).toMatch(/must be ready/i);

    readyAll(socks);
    handleMessage(reg, socks[0], { type: "startGame" });
    expect(lastOfType(socks[0], "state").phase).toBe("playing");
  });

  test("only the host can arrange / shuffle / start", () => {
    const { socks } = fullRoom();
    handleMessage(reg, socks[1], { type: "shuffleTeams" });
    expect(lastOfType(socks[1], "error").error).toMatch(/only the host/i);
    handleMessage(reg, socks[1], { type: "arrange", order: [] });
    expect(lastOfType(socks[1], "error").error).toMatch(/only the host/i);
  });

  test("a malformed arrange (non-array order) is rejected, not thrown", () => {
    const { socks } = fullRoom();
    expect(() =>
      handleMessage(reg, socks[0], { type: "arrange", order: undefined as any })
    ).not.toThrow();
    expect(lastOfType(socks[0], "error").error).toMatch(/invalid seat order/i);
  });

  test("an ask acts as the socket's bound seat (identity cannot be spoofed)", () => {
    const { socks } = fullRoom();
    readyAll(socks);
    handleMessage(reg, socks[0], { type: "startGame" });
    // seat2's socket asking while it's seat1's turn is rejected AS seat2.
    handleMessage(reg, socks[1], { type: "ask", card: "9_of_clubs", targetSeatId: "seat1" });
    expect(lastOfType(socks[1], "error").error).toMatch(/not seat2's turn/i);
  });

  test("a legal ask by the current-turn seat broadcasts to the whole room", () => {
    const { socks, gameId } = fullRoom();
    readyAll(socks);
    handleMessage(reg, socks[0], { type: "startGame" });

    const room = reg.getRoom(gameId)!;
    room.game!.hands["seat1"] = [mk("2_of_hearts")];
    room.game!.hands["seat2"] = [mk("3_of_hearts")];
    room.game!.currentTurn = "seat1";

    handleMessage(reg, socks[0], { type: "ask", card: "3_of_hearts", targetSeatId: "seat2" });
    for (const s of socks) expect(lastOfType(s, "askResult")).toBeTruthy();
    expect(lastOfType(socks[0], "askResult").received).toBe(true);
  });

  test("asks are rejected while the game is paused (a player disconnected)", () => {
    const { socks, gameId } = fullRoom();
    readyAll(socks);
    handleMessage(reg, socks[0], { type: "startGame" });

    reg.handleDisconnect(socks[2]); // seat3 drops -> room paused
    handleMessage(reg, socks[0], { type: "ask", card: "3_of_hearts", targetSeatId: "seat2" });
    expect(lastOfType(socks[0], "error").error).toMatch(/paused/i);
  });

  test("a dropped player can rejoin with their token and resume", () => {
    const { socks, gameId } = fullRoom();
    readyAll(socks);
    handleMessage(reg, socks[0], { type: "startGame" });

    const token = lastOfType(socks[2], "joined").token;
    reg.handleDisconnect(socks[2]);
    expect(reg.isPaused(reg.getRoom(gameId)!)).toBe(true);

    const back = mkSocket();
    handleMessage(reg, back, { type: "rejoin", gameId, token });
    expect(lastOfType(back, "joined").token).toBe(token);
    expect(reg.isPaused(reg.getRoom(gameId)!)).toBe(false);
  });

  test("only the host can end the game", () => {
    const { socks } = fullRoom();
    readyAll(socks);
    handleMessage(reg, socks[0], { type: "startGame" });
    handleMessage(reg, socks[1], { type: "endGame" });
    expect(lastOfType(socks[1], "error").error).toMatch(/only the host/i);
  });
});
