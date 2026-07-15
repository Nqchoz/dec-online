// server/rooms.ts
//
// In-memory registry of multiplayer game rooms and per-connection identity.
// The game rules live in GameManager (unchanged); this layer owns rooms,
// seats, usernames, and the socket <-> seat binding that makes identity
// server-authoritative (a client can never act as a seat it isn't bound to).

import { WebSocket } from "ws";
import { GameManager, Team } from "./gameManager";

export type SeatId = string; // "seat1".."seat6"

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

export type Phase = "lobby" | "playing";

export interface Member {
  seatId: SeatId;
  username: string;
  socket: WebSocket | null;
  connected: boolean;
}

export interface Room {
  id: string;
  hostSeat: SeatId;
  phase: Phase;
  members: Map<SeatId, Member>;
  game: GameManager | null;
}

export interface Binding {
  gameId: string;
  seatId: SeatId;
}

export interface RosterEntry {
  seatId: SeatId;
  username: string;
  team: Team;
  connected: boolean;
  count: number;
}

export function teamForSeat(seatId: SeatId): Team {
  return SEAT_IDS.indexOf(seatId) % 2 === 0 ? "blue" : "red";
}

// Unambiguous alphabet (no 0/O/1/I/L) for room codes.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private bindings = new Map<WebSocket, Binding>();

  private generateCode(): string {
    let code = "";
    do {
      code = "";
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  private nextFreeSeat(room: Room): SeatId | null {
    return SEAT_IDS.find((s) => !room.members.has(s)) ?? null;
  }

  private addMember(
    room: Room,
    username: string,
    socket: WebSocket
  ): Member {
    const seatId = this.nextFreeSeat(room);
    if (!seatId) throw new Error("Room is full"); // guarded by callers
    const member: Member = {
      seatId,
      username: (username ?? "").trim() || seatId,
      socket,
      connected: true,
    };
    room.members.set(seatId, member);
    this.bindings.set(socket, { gameId: room.id, seatId });
    return member;
  }

  createRoom(username: string, socket: WebSocket): { room: Room; member: Member } {
    const id = this.generateCode();
    const room: Room = {
      id,
      hostSeat: SEAT_IDS[0],
      phase: "lobby",
      members: new Map(),
      game: null,
    };
    this.rooms.set(id, room);
    const member = this.addMember(room, username, socket);
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

  startGame(room: Room): { error?: string } {
    if (room.phase !== "lobby") return { error: "Game already started." };
    if (room.members.size !== MAX_PLAYERS)
      return { error: `Need ${MAX_PLAYERS} players to start.` };
    // Build the engine with seat ids in seat order so teamOf lines up.
    const orderedSeats = SEAT_IDS.filter((s) => room.members.has(s));
    room.game = new GameManager(orderedSeats);
    room.phase = "playing";
    return {};
  }

  getRoom(gameId: string): Room | undefined {
    return this.rooms.get(gameId);
  }

  bindingFor(socket: WebSocket): Binding | undefined {
    return this.bindings.get(socket);
  }

  isHost(room: Room, seatId: SeatId): boolean {
    return room.hostSeat === seatId;
  }

  roster(room: Room): RosterEntry[] {
    return SEAT_IDS.filter((s) => room.members.has(s)).map((s) => {
      const m = room.members.get(s)!;
      return {
        seatId: s,
        username: m.username,
        team: teamForSeat(s),
        connected: m.connected,
        count: room.game ? room.game.getHand(s).length : 0,
      };
    });
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

    const member = room.members.get(binding.seatId);
    if (member) {
      member.connected = false;
      member.socket = null;
    }

    // In the lobby a seat is only reserved while connected, so free it and
    // reassign the host if they left.
    if (room.phase === "lobby") {
      room.members.delete(binding.seatId);
      if (!room.members.has(room.hostSeat) && room.members.size > 0) {
        room.hostSeat = [...room.members.keys()][0];
      }
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
