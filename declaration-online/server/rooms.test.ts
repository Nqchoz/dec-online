import { WebSocket } from "ws";
import { RoomRegistry, SEAT_IDS, MAX_PLAYERS, teamForSeat, Room } from "./rooms";

// rooms.ts only stores sockets and uses them as Map keys / marks connected — it
// never calls socket methods — so a unique object per "connection" suffices.
let counter = 0;
function mkSocket(): WebSocket {
  counter++;
  return { id: counter } as unknown as WebSocket;
}

interface Handle {
  memberId: string;
  token: string;
  socket: WebSocket;
}

function buildLobby(reg: RoomRegistry, n: number): { room: Room; gameId: string; members: Handle[] } {
  const hostSock = mkSocket();
  const r0 = reg.createRoom("P1", hostSock);
  const gameId = r0.room.id;
  const members: Handle[] = [
    { memberId: r0.member.memberId, token: r0.member.token, socket: hostSock },
  ];
  for (let i = 2; i <= n; i++) {
    const s = mkSocket();
    const r = reg.joinRoom(gameId, "P" + i, s);
    if ("member" in r) members.push({ memberId: r.member.memberId, token: r.member.token, socket: s });
  }
  return { room: r0.room, gameId, members };
}

function readyAllAndStart(reg: RoomRegistry, room: Room, members: Handle[]) {
  members.slice(1).forEach((m) => reg.setReady(room, m.memberId, true));
  return reg.startGame(room);
}

const teamsByMember = (reg: RoomRegistry, room: Room) =>
  Object.fromEntries(reg.roster(room).map((r) => [r.memberId, r.team]));

describe("RoomRegistry", () => {
  let reg: RoomRegistry;
  beforeEach(() => {
    reg = new RoomRegistry();
  });

  test("teamForSeat alternates by seat parity", () => {
    expect(teamForSeat("seat1")).toBe("blue");
    expect(teamForSeat("seat2")).toBe("red");
    expect(teamForSeat("seat6")).toBe("red");
  });

  test("createRoom seats the host at seat1, sets host id, binds socket, issues a token", () => {
    const sock = mkSocket();
    const { room, member } = reg.createRoom("Alice", sock);

    expect(member.seatId).toBe("seat1");
    expect(room.hostId).toBe(member.memberId);
    expect(reg.isHost(room, member.memberId)).toBe(true);
    expect(reg.bindingFor(sock)).toEqual({ gameId: room.id, memberId: member.memberId });
    expect(reg.memberFor(sock)).toBe(member);
    expect(member.token).toHaveLength(24);
    expect(member.ready).toBe(false);
    expect(room.id).toHaveLength(6);
  });

  test("joins fill seats in order with alternating teams", () => {
    const { room } = buildLobby(reg, MAX_PLAYERS);
    const roster = reg.roster(room);
    expect(roster.map((r) => r.seatId)).toEqual(SEAT_IDS);
    expect(roster.map((r) => r.team)).toEqual(["blue", "red", "blue", "red", "blue", "red"]);
  });

  test("join rejects unknown code, full room, and started game", () => {
    expect(reg.joinRoom("ZZZZZZ", "x", mkSocket())).toEqual({ error: "No game with that code." });

    const { gameId } = buildLobby(reg, MAX_PLAYERS);
    expect(reg.joinRoom(gameId, "late", mkSocket())).toEqual({ error: "That game is full." });

    const b = buildLobby(reg, MAX_PLAYERS);
    readyAllAndStart(reg, b.room, b.members);
    expect(reg.joinRoom(b.gameId, "late", mkSocket())).toEqual({
      error: "That game has already started.",
    });
  });

  test("startGame requires 6 players AND all non-host ready", () => {
    const { room, members } = buildLobby(reg, MAX_PLAYERS);
    expect(reg.startGame(room).error).toMatch(/must be ready/i);

    members.slice(1, 5).forEach((m) => reg.setReady(room, m.memberId, true)); // one short
    expect(reg.startGame(room).error).toMatch(/must be ready/i);

    reg.setReady(room, members[5].memberId, true);
    expect(reg.startGame(room)).toEqual({});
    expect(room.phase).toBe("playing");
    for (const entry of reg.roster(room)) expect(entry.count).toBe(9);
  });

  test("arrange reseats members by the given member order and resets ready", () => {
    const { room, members } = buildLobby(reg, MAX_PLAYERS);
    members.slice(1).forEach((m) => reg.setReady(room, m.memberId, true));

    const reversed = [...members].reverse().map((m) => m.memberId);
    expect(reg.arrange(room, reversed)).toEqual({});

    // Seat i now holds reversed[i]; roster is seat-ordered, so it matches reversed.
    expect(reg.roster(room).map((r) => r.memberId)).toEqual(reversed);
    // Ready flags cleared by the rearrange.
    expect(reg.roster(room).every((r) => !r.ready)).toBe(true);
  });

  test("arrange rejects a non-permutation", () => {
    const { room, members } = buildLobby(reg, MAX_PLAYERS);
    const bad = members.map((m) => m.memberId);
    bad[0] = bad[1]; // duplicate
    expect(reg.arrange(room, bad).error).toMatch(/invalid seat order/i);
  });

  test("shuffleOrder preserves each member's team while permuting seats", () => {
    const { room } = buildLobby(reg, MAX_PLAYERS);
    const before = teamsByMember(reg, room);
    reg.shuffleOrder(room);
    const after = teamsByMember(reg, room);
    expect(after).toEqual(before); // team membership unchanged
    // Still a valid full seating.
    expect(reg.roster(room).map((r) => r.seatId).sort()).toEqual([...SEAT_IDS].sort());
  });

  test("shuffleTeams keeps a valid full seating (all 6 seats occupied once)", () => {
    const { room } = buildLobby(reg, MAX_PLAYERS);
    reg.shuffleTeams(room);
    const seats = reg.roster(room).map((r) => r.seatId);
    expect(new Set(seats).size).toBe(MAX_PLAYERS);
  });

  test("playing-phase disconnect keeps the member and pauses; rejoin resumes", () => {
    const { room, gameId, members } = buildLobby(reg, MAX_PLAYERS);
    readyAllAndStart(reg, room, members);

    const victim = members[2]; // seat3
    reg.handleDisconnect(victim.socket);
    expect(room.members.has(victim.memberId)).toBe(true); // seat/hand retained
    expect(room.members.get(victim.memberId)!.connected).toBe(false);
    expect(reg.isPaused(room)).toBe(true);

    const newSock = mkSocket();
    const res = reg.rejoin(gameId, victim.token, newSock);
    expect("member" in res && res.member.memberId).toBe(victim.memberId);
    expect(room.members.get(victim.memberId)!.connected).toBe(true);
    expect(room.members.get(victim.memberId)!.seatId).toBe("seat3"); // same seat
    expect(reg.bindingFor(newSock)?.memberId).toBe(victim.memberId);
    expect(reg.isPaused(room)).toBe(false);
  });

  test("a stale close of the old socket does not clobber a reconnected member", () => {
    const { room, gameId, members } = buildLobby(reg, MAX_PLAYERS);
    readyAllAndStart(reg, room, members);

    const victim = members[2];
    reg.handleDisconnect(victim.socket); // drop
    const newSock = mkSocket();
    reg.rejoin(gameId, victim.token, newSock); // reconnect on a fresh socket
    expect(reg.isPaused(room)).toBe(false);

    // The original socket now closes late — must be ignored.
    reg.handleDisconnect(victim.socket);
    expect(room.members.get(victim.memberId)!.connected).toBe(true);
    expect(room.members.get(victim.memberId)!.socket).toBe(newSock);
    expect(reg.isPaused(room)).toBe(false);
  });

  test("rejoin rejects a bad token / unknown game", () => {
    const { gameId, room, members } = buildLobby(reg, MAX_PLAYERS);
    readyAllAndStart(reg, room, members);
    expect(reg.rejoin(gameId, "NOPE", mkSocket())).toEqual({ error: "Could not rejoin that game." });
    expect(reg.rejoin("ZZZZZZ", members[0].token, mkSocket())).toEqual({
      error: "That game no longer exists.",
    });
  });

  test("lobby disconnect frees the seat, reassigns host, repacks, and cleans an empty room", () => {
    const { room, gameId, members } = buildLobby(reg, 2);
    const [host, other] = members;

    const after = reg.handleDisconnect(host.socket);
    expect(after).toBe(room);
    expect(room.members.has(host.memberId)).toBe(false);
    expect(room.hostId).toBe(other.memberId);
    expect(room.members.get(other.memberId)!.seatId).toBe("seat1"); // repacked
    expect(reg.bindingFor(host.socket)).toBeUndefined();

    expect(reg.handleDisconnect(other.socket)).toBeUndefined();
    expect(reg.getRoom(gameId)).toBeUndefined();
  });

  test("endGame returns to the lobby and drops disconnected members", () => {
    const { room, members } = buildLobby(reg, MAX_PLAYERS);
    readyAllAndStart(reg, room, members);

    reg.handleDisconnect(members[3].socket); // seat4 drops
    expect(reg.endGame(room)).toEqual({});
    expect(room.phase).toBe("lobby");
    expect(room.game).toBeNull();
    expect(room.members.has(members[3].memberId)).toBe(false);
    expect(room.members.size).toBe(5);
    // Repacked into seat1..seat5, no gaps.
    expect(reg.roster(room).map((r) => r.seatId)).toEqual(SEAT_IDS.slice(0, 5));
    expect(reg.roster(room).every((r) => !r.ready)).toBe(true);
  });
});
