// server/handlers.ts
//
// WebSocket message handling, separated from server bootstrap so it can be
// unit-tested with fake sockets (no port binding). index.ts wires these to the
// real WebSocketServer; tests drive handleMessage directly. Identity/authz comes
// from the socket<->member binding (registry.memberFor), never from the payload.

import { WebSocket } from "ws";
import { RoomRegistry, Room } from "./rooms";

export type WSMessage =
  | { type: "createGame"; username: string }
  | { type: "joinGame"; gameId: string; username: string }
  | { type: "rejoin"; gameId: string; token: string }
  | { type: "setReady"; ready: boolean }
  | { type: "arrange"; order: string[] }
  | { type: "shuffleTeams" }
  | { type: "shuffleOrder" }
  | { type: "startGame" }
  | { type: "ask"; card: string; targetSeatId: string }
  | { type: "declareCheck"; setId: string; assignments: Record<string, string> }
  | { type: "newGame" }
  | { type: "endGame" };

export function sendTo(client: WebSocket, data: any): void {
  if (client.readyState === client.OPEN) client.send(JSON.stringify(data));
}

export function broadcastRoom(room: Room, data: any): void {
  for (const member of room.members.values()) {
    if (member.socket && member.connected) sendTo(member.socket, data);
  }
}

export function buildState(registry: RoomRegistry, room: Room) {
  const gs = room.game
    ? room.game.getState()
    : { currentTurn: null, scores: { blue: 0, red: 0 }, gameOver: false, winner: null };
  return {
    type: "state" as const,
    gameId: room.id,
    phase: room.phase,
    hostId: room.hostId,
    hostSeat: registry.hostSeat(room),
    paused: registry.isPaused(room),
    currentTurn: gs.currentTurn,
    scores: gs.scores,
    gameOver: gs.gameOver,
    winner: gs.winner,
    declarations: room.game
      ? room.game.getDeclarations()
      : { blueDeclarations: [], redDeclarations: [] },
    roster: registry.roster(room),
  };
}

// Broadcast public state to every connected member, and send each its own hand.
export function pushRoomState(registry: RoomRegistry, room: Room): void {
  const state = buildState(registry, room);
  for (const member of room.members.values()) {
    if (!member.socket || !member.connected) continue;
    sendTo(member.socket, state);
    sendTo(member.socket, {
      type: "hand",
      cards: room.game ? room.game.getHand(member.seatId) : [],
    });
  }
}

export function handleMessage(
  registry: RoomRegistry,
  socket: WebSocket,
  msg: WSMessage
): void {
  const alreadyIn = () =>
    sendTo(socket, { type: "error", error: "You are already in a game." });

  switch (msg.type) {
    case "createGame": {
      if (registry.bindingFor(socket)) return alreadyIn();
      const { room, member } = registry.createRoom(msg.username, socket);
      sendTo(socket, {
        type: "joined",
        gameId: room.id,
        memberId: member.memberId,
        token: member.token,
      });
      pushRoomState(registry, room);
      return;
    }

    case "joinGame": {
      if (registry.bindingFor(socket)) return alreadyIn();
      const gameId = (msg.gameId ?? "").trim().toUpperCase();
      const result = registry.joinRoom(gameId, msg.username, socket);
      if ("error" in result) {
        sendTo(socket, { type: "error", error: result.error });
        return;
      }
      sendTo(socket, {
        type: "joined",
        gameId: result.room.id,
        memberId: result.member.memberId,
        token: result.member.token,
      });
      pushRoomState(registry, result.room);
      return;
    }

    case "rejoin": {
      if (registry.bindingFor(socket)) return alreadyIn();
      const gameId = (msg.gameId ?? "").trim().toUpperCase();
      const result = registry.rejoin(gameId, msg.token, socket);
      if ("error" in result) {
        sendTo(socket, { type: "error", error: result.error });
        return;
      }
      sendTo(socket, {
        type: "joined",
        gameId: result.room.id,
        memberId: result.member.memberId,
        token: result.member.token,
      });
      pushRoomState(registry, result.room);
      return;
    }
  }

  // Everything below requires an established member binding.
  const member = registry.memberFor(socket);
  if (!member) {
    sendTo(socket, { type: "error", error: "You are not in a game." });
    return;
  }
  const room = registry.getRoom(registry.bindingFor(socket)!.gameId);
  if (!room) {
    sendTo(socket, { type: "error", error: "That game no longer exists." });
    return;
  }
  const isHost = registry.isHost(room, member.memberId);
  const hostOnly = () =>
    sendTo(socket, { type: "error", error: "Only the host can do that." });

  switch (msg.type) {
    case "setReady": {
      registry.setReady(room, member.memberId, !!msg.ready);
      pushRoomState(registry, room);
      return;
    }

    case "arrange": {
      if (!isHost) return hostOnly();
      if (!Array.isArray(msg.order)) {
        sendTo(socket, { type: "error", error: "Invalid seat order." });
        return;
      }
      const r = registry.arrange(room, msg.order);
      if (r.error) return void sendTo(socket, { type: "error", error: r.error });
      pushRoomState(registry, room);
      return;
    }

    case "shuffleTeams": {
      if (!isHost) return hostOnly();
      const r = registry.shuffleTeams(room);
      if (r.error) return void sendTo(socket, { type: "error", error: r.error });
      pushRoomState(registry, room);
      return;
    }

    case "shuffleOrder": {
      if (!isHost) return hostOnly();
      const r = registry.shuffleOrder(room);
      if (r.error) return void sendTo(socket, { type: "error", error: r.error });
      pushRoomState(registry, room);
      return;
    }

    case "startGame": {
      if (!isHost) return hostOnly();
      const r = registry.startGame(room);
      if (r.error) return void sendTo(socket, { type: "error", error: r.error });
      pushRoomState(registry, room);
      return;
    }

    case "ask": {
      if (room.phase !== "playing" || !room.game) {
        sendTo(socket, { type: "error", error: "The game hasn't started yet." });
        return;
      }
      if (registry.isPaused(room)) {
        sendTo(socket, {
          type: "error",
          error: "Game is paused — waiting for players to reconnect.",
        });
        return;
      }
      const result = room.game.handleAsk(member.seatId, msg.targetSeatId, msg.card);
      if (!result.success) {
        sendTo(socket, { type: "error", error: result.error });
        return;
      }
      broadcastRoom(room, {
        type: "askResult",
        fromSeat: member.seatId,
        targetSeat: msg.targetSeatId,
        card: msg.card,
        received: result.received,
      });
      pushRoomState(registry, room);
      return;
    }

    case "declareCheck": {
      if (room.phase !== "playing" || !room.game) {
        sendTo(socket, { type: "error", error: "The game hasn't started yet." });
        return;
      }
      if (registry.isPaused(room)) {
        sendTo(socket, {
          type: "error",
          error: "Game is paused — waiting for players to reconnect.",
        });
        return;
      }
      const check = room.game.handleDeclareCheck(
        member.seatId,
        msg.setId,
        msg.assignments
      );
      if (!check.success) {
        sendTo(socket, { type: "error", error: check.error });
        return;
      }
      broadcastRoom(room, {
        type: "declareResult",
        bySeat: member.seatId,
        correctCheck: check.correctCheck,
        winningTeam: check.winningTeam,
        setId: check.setId,
        setCard: check.setCard,
        message: check.message,
      });
      pushRoomState(registry, room);
      return;
    }

    case "newGame": {
      if (!isHost) return hostOnly();
      if (!room.game) {
        sendTo(socket, { type: "error", error: "The game hasn't started yet." });
        return;
      }
      room.game.resetGame();
      pushRoomState(registry, room);
      return;
    }

    case "endGame": {
      if (!isHost) return hostOnly();
      const r = registry.endGame(room);
      if (r.error) return void sendTo(socket, { type: "error", error: r.error });
      pushRoomState(registry, room);
      return;
    }
  }
}
