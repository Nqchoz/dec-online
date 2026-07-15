import { WebSocket } from "ws";
import { RoomRegistry } from "./rooms";
import { handleMessage } from "./handlers";
import { Card } from "./deck";

// Fake socket: captures everything sent, and looks "open" to sendTo.
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

  // Create a room and fill it to 6; returns the sockets (host first) and code.
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

  test("createGame replies joined and pushes lobby state + empty hand", () => {
    const s = mkSocket();
    handleMessage(reg, s, { type: "createGame", username: "Alice" });

    expect(lastOfType(s, "joined").seatId).toBe("seat1");
    expect(lastOfType(s, "state").phase).toBe("lobby");
    expect(lastOfType(s, "hand").cards).toEqual([]);
  });

  test("a gameplay message from an unbound socket is rejected", () => {
    const s = mkSocket();
    handleMessage(reg, s, { type: "ask", card: "2_of_clubs", targetSeatId: "seat2" });
    expect(lastOfType(s, "error").error).toMatch(/not in a game/i);
  });

  test("asking before the game starts is rejected", () => {
    const s = mkSocket();
    handleMessage(reg, s, { type: "createGame", username: "H" });
    handleMessage(reg, s, { type: "ask", card: "2_of_clubs", targetSeatId: "seat2" });
    expect(lastOfType(s, "error").error).toMatch(/hasn't started/i);
  });

  test("only the host can start the game", () => {
    const { socks } = fullRoom();

    handleMessage(reg, socks[1], { type: "startGame" }); // seat2, not host
    expect(lastOfType(socks[1], "error").error).toMatch(/only the host/i);

    handleMessage(reg, socks[0], { type: "startGame" }); // host
    expect(lastOfType(socks[0], "state").phase).toBe("playing");
  });

  test("an ask acts as the socket's bound seat (identity cannot be spoofed)", () => {
    const { socks } = fullRoom();
    handleMessage(reg, socks[0], { type: "startGame" });

    // The ask message carries no actor id; seat2's socket asking while it's
    // seat1's turn must be rejected AS seat2.
    handleMessage(reg, socks[1], { type: "ask", card: "9_of_clubs", targetSeatId: "seat1" });
    expect(lastOfType(socks[1], "error").error).toMatch(/not seat2's turn/i);
  });

  test("a legal ask by the current-turn seat broadcasts to the whole room", () => {
    const { socks, gameId } = fullRoom();
    handleMessage(reg, socks[0], { type: "startGame" });

    // Deterministic hands: seat1 holds a LowHearts card; seat2 holds the asked one.
    const room = reg.getRoom(gameId)!;
    room.game!.hands["seat1"] = [mk("2_of_hearts")];
    room.game!.hands["seat2"] = [mk("3_of_hearts")];
    room.game!.currentTurn = "seat1";

    handleMessage(reg, socks[0], { type: "ask", card: "3_of_hearts", targetSeatId: "seat2" });

    for (const s of socks) expect(lastOfType(s, "askResult")).toBeTruthy();
    expect(lastOfType(socks[0], "askResult").received).toBe(true);
  });

  test("only the host can start a new game", () => {
    const { socks } = fullRoom();
    handleMessage(reg, socks[0], { type: "startGame" });

    handleMessage(reg, socks[1], { type: "newGame" });
    expect(lastOfType(socks[1], "error").error).toMatch(/only the host/i);
  });
});
