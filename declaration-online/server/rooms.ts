// server/rooms.ts
//
// In-memory registry of multiplayer game rooms.
//
// Identity is server-authoritative and decoupled from seat: each member has a
// stable public `memberId` and a secret reconnect `token`; `seatId` is a mutable
// positional attribute (the host can rearrange seats in the lobby, and team =
// seat parity). The socket<->member binding is what authorizes gameplay, so a
// client can never act as a member it isn't bound to. The game rules live in
// GameManager (unchanged); seats are frozen when the game starts.

import { WebSocket } from "ws";
import { GameManager, Team } from "./gameManager";

export type SeatId = string; // "seat1".."seat6"
export type MemberId = string; // stable public id, e.g. "m1"

// Fixed seat order. Team is derived from seat parity so it matches
// GameManager.teamOf when the game is built from this same ordering.
export const SEAT_IDS: SeatId[] = [
  "seat1",
  "seat2",
  "seat3",
  "seat4",
  "seat5",
  "seat6",
];
export const MAX_PLAYERS = SEAT_IDS.length;
const BLUE_SEATS = SEAT_IDS.filter((_, i) => i % 2 === 0); // seat1,3,5
const RED_SEATS = SEAT_IDS.filter((_, i) => i % 2 === 1); // seat2,4,6

export type Phase = "lobby" | "playing";

export interface Member {
  memberId: MemberId;
  token: string;
  seatId: SeatId;
  username: string;
  socket: WebSocket | null;
  connected: boolean;
  ready: boolean;
}

export interface Room {
  id: string;
  hostId: MemberId;
  phase: Phase;
  members: Map<MemberId, Member>;
  game: GameManager | null;
  seq: number; // monotonic counter for member ids
}

export interface Binding {
  gameId: string;
  memberId: MemberId;
}

export interface RosterEntry {
  memberId: MemberId;
  seatId: SeatId;
  username: string;
  team: Team;
  connected: boolean;
  ready: boolean;
  count: number;
}

export function teamForSeat(seatId: SeatId): Team {
  return SEAT_IDS.indexOf(seatId) % 2 === 0 ? "blue" : "red";
}

// Unambiguous alphabet (no 0/O/1/I/L) for room codes and tokens.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function randomString(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private bindings = new Map<WebSocket, Binding>();

  private generateCode(): string {
    let code = "";
    do {
      code = randomString(CODE_LENGTH);
    } while (this.rooms.has(code));
    return code;
  }

  private firstFreeSeat(room: Room): SeatId | null {
    const taken = new Set([...room.members.values()].map((m) => m.seatId));
    return SEAT_IDS.find((s) => !taken.has(s)) ?? null;
  }

  private addMember(room: Room, username: string, socket: WebSocket): Member {
    const seatId = this.firstFreeSeat(room);
    if (!seatId) throw new Error("Room is full"); // guarded by callers
    room.seq += 1;
    const member: Member = {
      memberId: `m${room.seq}`,
      token: randomString(24),
      seatId,
      username: (username ?? "").trim() || `Player ${room.seq}`,
      socket,
      connected: true,
      ready: false,
    };
    room.members.set(member.memberId, member);
    this.bindings.set(socket, { gameId: room.id, memberId: member.memberId });
    return member;
  }

  private resetReady(room: Room): void {
    for (const m of room.members.values()) m.ready = false;
  }

  // Re-pack present members into seat1..seatN in their current seat order (no gaps).
  private repackSeats(room: Room): void {
    const ordered = [...room.members.values()].sort(
      (a, b) => SEAT_IDS.indexOf(a.seatId) - SEAT_IDS.indexOf(b.seatId)
    );
    ordered.forEach((m, i) => (m.seatId = SEAT_IDS[i]));
  }

  createRoom(username: string, socket: WebSocket): { room: Room; member: Member } {
    const id = this.generateCode();
    const room: Room = {
      id,
      hostId: "",
      phase: "lobby",
      members: new Map(),
      game: null,
      seq: 0,
    };
    this.rooms.set(id, room);
    const member = this.addMember(room, username, socket);
    room.hostId = member.memberId;
    return { room, member };
  }

  joinRoom(
    gameId: string,
    username: string,
    socket: WebSocket
  ): { room: Room; member: Member } | { error: string } {
    const room = this.rooms.get(gameId);
    if (!room) return { error: "No game with that code." };
    if (room.phase !== "lobby") return { error: "That game has already started." };
    if (room.members.size >= MAX_PLAYERS) return { error: "That game is full." };
    const member = this.addMember(room, username, socket);
    return { room, member };
  }

  rejoin(
    gameId: string,
    token: string,
    socket: WebSocket
  ): { room: Room; member: Member } | { error: string } {
    const room = this.rooms.get(gameId);
    if (!room) return { error: "That game no longer exists." };
    const member = [...room.members.values()].find((m) => m.token === token);
    if (!member) return { error: "Could not rejoin that game." };
    member.socket = socket;
    member.connected = true;
    this.bindings.set(socket, { gameId: room.id, memberId: member.memberId });
    return { room, member };
  }

  setReady(room: Room, memberId: MemberId, ready: boolean): void {
    const m = room.members.get(memberId);
    if (m) m.ready = ready;
  }

  // Reassign seats from an explicit member order (host drag-reorder).
  arrange(room: Room, order: MemberId[]): { error?: string } {
    if (room.phase !== "lobby") return { error: "You can only arrange seats in the lobby." };
    const ids = [...room.members.keys()];
    const sameSet =
      order.length === ids.length &&
      new Set(order).size === order.length &&
      ids.every((id) => order.includes(id));
    if (!sameSet) return { error: "Invalid seat order." };
    order.forEach((memberId, i) => {
      room.members.get(memberId)!.seatId = SEAT_IDS[i];
    });
    this.resetReady(room);
    return {};
  }

  // Randomly reseat everyone (teams + order change).
  shuffleTeams(room: Room): { error?: string } {
    if (room.phase !== "lobby") return { error: "You can only shuffle in the lobby." };
    return this.arrange(room, shuffled([...room.members.keys()]));
  }

  // Permute members within their current team (team membership preserved, order changes).
  shuffleOrder(room: Room): { error?: string } {
    if (room.phase !== "lobby") return { error: "You can only shuffle in the lobby." };
    const blue = shuffled(
      [...room.members.values()].filter((m) => teamForSeat(m.seatId) === "blue")
    );
    const red = shuffled(
      [...room.members.values()].filter((m) => teamForSeat(m.seatId) === "red")
    );
    blue.forEach((m, i) => (m.seatId = BLUE_SEATS[i]));
    red.forEach((m, i) => (m.seatId = RED_SEATS[i]));
    this.resetReady(room);
    return {};
  }

  startGame(room: Room): { error?: string } {
    if (room.phase !== "lobby") return { error: "Game already started." };
    if (room.members.size !== MAX_PLAYERS)
      return { error: `Need ${MAX_PLAYERS} players to start.` };
    const allReady = [...room.members.values()]
      .filter((m) => m.memberId !== room.hostId)
      .every((m) => m.ready);
    if (!allReady) return { error: "All players must be ready to start." };
    // Build the engine with seat ids in seat order so teamOf lines up.
    const orderedSeats = SEAT_IDS.filter((s) =>
      [...room.members.values()].some((m) => m.seatId === s)
    );
    room.game = new GameManager(orderedSeats);
    room.phase = "playing";
    return {};
  }

  // Host escape hatch: abandon the current game and return everyone to the lobby,
  // dropping members who are no longer connected.
  endGame(room: Room): { error?: string } {
    if (room.phase !== "playing") return { error: "No game in progress." };
    for (const m of [...room.members.values()]) {
      if (!m.connected) {
        room.members.delete(m.memberId);
        if (m.socket) this.bindings.delete(m.socket);
      }
    }
    room.game = null;
    room.phase = "lobby";
    this.resetReady(room);
    if (!room.members.has(room.hostId)) {
      const first = [...room.members.keys()][0];
      if (first) room.hostId = first;
    }
    this.repackSeats(room);
    return {};
  }

  getRoom(gameId: string): Room | undefined {
    return this.rooms.get(gameId);
  }

  bindingFor(socket: WebSocket): Binding | undefined {
    return this.bindings.get(socket);
  }

  memberFor(socket: WebSocket): Member | undefined {
    const b = this.bindings.get(socket);
    if (!b) return undefined;
    return this.rooms.get(b.gameId)?.members.get(b.memberId);
  }

  isHost(room: Room, memberId: MemberId): boolean {
    return room.hostId === memberId;
  }

  hostSeat(room: Room): SeatId | null {
    return room.members.get(room.hostId)?.seatId ?? null;
  }

  isPaused(room: Room): boolean {
    return (
      room.phase === "playing" &&
      [...room.members.values()].some((m) => !m.connected)
    );
  }

  roster(room: Room): RosterEntry[] {
    return [...room.members.values()]
      .sort((a, b) => SEAT_IDS.indexOf(a.seatId) - SEAT_IDS.indexOf(b.seatId))
      .map((m) => ({
        memberId: m.memberId,
        seatId: m.seatId,
        username: m.username,
        team: teamForSeat(m.seatId),
        connected: m.connected,
        ready: m.ready,
        count: room.game ? room.game.getHand(m.seatId).length : 0,
      }));
  }

  /**
   * Handle a socket closing. Returns the affected room if it still exists and
   * should be re-broadcast, or undefined if there was no binding or the room
   * was cleaned up (fully empty).
   */
  handleDisconnect(socket: WebSocket): Room | undefined {
    const binding = this.bindings.get(socket);
    this.bindings.delete(socket);
    if (!binding) return undefined;

    const room = this.rooms.get(binding.gameId);
    if (!room) return undefined;

    const member = room.members.get(binding.memberId);

    // Ignore a stale close: if the member has already reconnected on a newer
    // socket, this closing socket is no longer theirs and must not mark them
    // disconnected or free their seat.
    if (member && member.socket !== socket) return undefined;

    if (member) {
      member.connected = false;
      member.socket = null;
    }

    // In the lobby a seat is only reserved while connected: free it (and
    // reassign the host if they left). In play the member/seat/hand are kept so
    // the player can reconnect via their token; the room stays paused meanwhile.
    if (room.phase === "lobby" && member) {
      room.members.delete(member.memberId);
      if (room.hostId === member.memberId && room.members.size > 0) {
        room.hostId = [...room.members.keys()][0];
      }
      this.repackSeats(room);
    }

    // Clean up a room nobody is connected to.
    const anyConnected = [...room.members.values()].some((m) => m.connected);
    if (!anyConnected) {
      this.rooms.delete(room.id);
      return undefined;
    }

    return room;
  }
}
