// server/handlers.ts
//
// WebSocket message handling, separated from server bootstrap so it can be
// unit-tested with fake sockets (no port binding). index.ts wires these to the
// real WebSocketServer; tests drive handleMessage directly.

import { WebSocket } from "ws";
import { RoomRegistry, Room } from "./rooms";

export type WSMessage =
  | { type: "createGame"; username: string }
  | { type: "joinGame"; gameId: string; username: string }
  | { type: "startGame" }
  | { type: "ask"; card: string; targetSeatId: string }
  | { type: "declareCheck"; setId: string; assignments: Record<string, string> }
  | { type: "newGame" };

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
    hostSeat: room.hostSeat,
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
  switch (msg.type) {
    case "createGame": {
      const { room, member } = registry.createRoom(msg.username, socket);
      sendTo(socket, { type: "joined", gameId: room.id, seatId: member.seatId });
      pushRoomState(registry, room);
      return;
    }

    case "joinGame": {
      const gameId = (msg.gameId ?? "").trim().toUpperCase();
      const result = registry.joinRoom(gameId, msg.username, socket);
      if ("error" in result) {
        sendTo(socket, { type: "error", error: result.error });
        return;
      }
      sendTo(socket, {
        type: "joined",
        gameId: result.room.id,
        seatId: result.member.seatId,
      });
      pushRoomState(registry, result.room);
      return;
    }
  }

  // Everything below requires an established seat binding.
  const binding = registry.bindingFor(socket);
  if (!binding) {
    sendTo(socket, { type: "error", error: "You are not in a game." });
    return;
  }
  const room = registry.getRoom(binding.gameId);
  if (!room) {
    sendTo(socket, { type: "error", error: "That game no longer exists." });
    return;
  }

  switch (msg.type) {
    case "startGame": {
      if (!registry.isHost(room, binding.seatId)) {
        sendTo(socket, { type: "error", error: "Only the host can start the game." });
        return;
      }
      const r = registry.startGame(room);
      if (r.error) {
        sendTo(socket, { type: "error", error: r.error });
        return;
      }
      pushRoomState(registry, room);
      return;
    }

    case "ask": {
      if (room.phase !== "playing" || !room.game) {
        sendTo(socket, { type: "error", error: "The game hasn't started yet." });
        return;
      }
      const result = room.game.handleAsk(binding.seatId, msg.targetSeatId, msg.card);
      if (!result.success) {
        sendTo(socket, { type: "error", error: result.error });
        return;
      }
      broadcastRoom(room, {
        type: "askResult",
        fromSeat: binding.seatId,
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
      const check = room.game.handleDeclareCheck(
        binding.seatId,
        msg.setId,
        msg.assignments
      );
      if (!check.success) {
        sendTo(socket, { type: "error", error: check.error });
        return;
      }
      broadcastRoom(room, {
        type: "declareResult",
        bySeat: binding.seatId,
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
      if (!registry.isHost(room, binding.seatId)) {
        sendTo(socket, { type: "error", error: "Only the host can start a new game." });
        return;
      }
      if (!room.game) {
        sendTo(socket, { type: "error", error: "The game hasn't started yet." });
        return;
      }
      room.game.resetGame();
      pushRoomState(registry, room);
      return;
    }
  }
}
