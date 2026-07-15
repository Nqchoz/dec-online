import { WebSocket } from "ws";
import { RoomRegistry, SEAT_IDS, MAX_PLAYERS, teamForSeat } from "./rooms";

// rooms.ts only ever stores sockets and uses them as Map keys / marks
// connected — it never calls socket methods — so a unique empty object per
// "connection" is a sufficient stand-in.
let counter = 0;
function mkSocket(): WebSocket {
  counter++;
  return { id: counter } as unknown as WebSocket;
}

describe("RoomRegistry", () => {
  let reg: RoomRegistry;

  beforeEach(() => {
    reg = new RoomRegistry();
  });

  test("teamForSeat alternates by seat parity", () => {
    expect(teamForSeat("seat1")).toBe("blue");
    expect(teamForSeat("seat2")).toBe("red");
    expect(teamForSeat("seat5")).toBe("blue");
    expect(teamForSeat("seat6")).toBe("red");
  });

  test("createRoom seats the host at seat1 and binds the socket", () => {
    const sock = mkSocket();
    const { room, member } = reg.createRoom("Alice", sock);

    expect(member.seatId).toBe("seat1");
    expect(room.hostSeat).toBe("seat1");
    expect(room.phase).toBe("lobby");
    expect(reg.isHost(room, "seat1")).toBe(true);
    expect(reg.bindingFor(sock)).toEqual({ gameId: room.id, seatId: "seat1" });
    expect(reg.getRoom(room.id)).toBe(room);
    expect(room.id).toHaveLength(6);
  });

  test("joins fill seats in order with alternating teams", () => {
    const { room } = reg.createRoom("host", mkSocket());
    for (let i = 2; i <= MAX_PLAYERS; i++) {
      const res = reg.joinRoom(room.id, `p${i}`, mkSocket());
      expect("member" in res && res.member.seatId).toBe(`seat${i}`);
    }
    const roster = reg.roster(room);
    expect(roster.map((r) => r.seatId)).toEqual(SEAT_IDS);
    expect(roster.map((r) => r.team)).toEqual([
      "blue",
      "red",
      "blue",
      "red",
      "blue",
      "red",
    ]);
  });

  test("join rejects an unknown code, a full room, and a started game", () => {
    expect(reg.joinRoom("ZZZZZZ", "x", mkSocket())).toEqual({
      error: "No game with that code.",
    });

    const { room } = reg.createRoom("host", mkSocket());
    for (let i = 2; i <= MAX_PLAYERS; i++) reg.joinRoom(room.id, `p${i}`, mkSocket());
    const full = reg.joinRoom(room.id, "late", mkSocket());
    expect(full).toEqual({ error: "That game is full." });

    // Fresh room, start it, then a join is rejected.
    const started = reg.createRoom("h2", mkSocket());
    for (let i = 2; i <= MAX_PLAYERS; i++)
      reg.joinRoom(started.room.id, `q${i}`, mkSocket());
    reg.startGame(started.room);
    expect(reg.joinRoom(started.room.id, "late", mkSocket())).toEqual({
      error: "That game has already started.",
    });
  });

  test("startGame needs the full table and builds the engine over the seats", () => {
    const { room } = reg.createRoom("host", mkSocket());
    reg.joinRoom(room.id, "p2", mkSocket());
    expect(reg.startGame(room).error).toMatch(/need 6 players/i);
    expect(room.game).toBeNull();

    for (let i = 3; i <= MAX_PLAYERS; i++) reg.joinRoom(room.id, `p${i}`, mkSocket());
    expect(reg.startGame(room)).toEqual({});
    expect(room.phase).toBe("playing");
    expect(room.game).not.toBeNull();
    // Engine dealt 9 cards to each seat; roster counts reflect it.
    for (const entry of reg.roster(room)) expect(entry.count).toBe(9);
  });

  test("each socket is bound to its own seat (identity is not shared)", () => {
    const hostSock = mkSocket();
    const p2Sock = mkSocket();
    const { room } = reg.createRoom("host", hostSock);
    reg.joinRoom(room.id, "p2", p2Sock);

    expect(reg.bindingFor(hostSock)?.seatId).toBe("seat1");
    expect(reg.bindingFor(p2Sock)?.seatId).toBe("seat2");
    // An unbound socket has no identity.
    expect(reg.bindingFor(mkSocket())).toBeUndefined();
  });

  test("lobby disconnect frees the seat, reassigns host, and cleans an empty room", () => {
    const hostSock = mkSocket();
    const p2Sock = mkSocket();
    const { room } = reg.createRoom("host", hostSock);
    reg.joinRoom(room.id, "p2", p2Sock);
    const id = room.id;

    // Host leaves: seat freed, host reassigned to the remaining member.
    const after = reg.handleDisconnect(hostSock);
    expect(after).toBe(room);
    expect(room.members.has("seat1")).toBe(false);
    expect(room.hostSeat).toBe("seat2");
    expect(reg.bindingFor(hostSock)).toBeUndefined();

    // Last member leaves: room is deleted and nothing is returned to broadcast.
    expect(reg.handleDisconnect(p2Sock)).toBeUndefined();
    expect(reg.getRoom(id)).toBeUndefined();
  });
});
