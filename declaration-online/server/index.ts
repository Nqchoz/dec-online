import express, { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import { GameManager } from "./gameManager";
import { Card } from "./deck";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Initialize players and game manager
export const players = ["player1", "player2", "player3", "player4", "player5", "player6"];
const game = new GameManager(players);

// REST endpoint: get hand for a single player
app.get("/api/hand/:playerId", (req, res) => {
  const id = req.params.playerId;
  res.json({ hand: game.getHand(id) });
});

// REST endpoint: get all hands (FOR DEBUG/TESTING ONLY)
app.get("/api/hands", (req, res) => {
  const allHands = game.players.reduce((acc, playerId) => {
    acc[playerId] = game.getHand(playerId);
    return acc;
  }, {} as Record<string, typeof game.getHand extends (...args: any) => infer R ? R : never>);

  res.json(allHands);
});

// REST endpoint: get hand counts and cards for current player
app.get("/api/hands/:currentPlayerId", (req, res) => {
  const currentPlayerId = req.params.currentPlayerId;

  type Hand = {
    count: number;
    cards?: ReturnType<typeof game.getHand>;
  };

  const allHands = game.players.reduce((acc, playerId) => {
    const handCards = game.getHand(playerId);
    acc[playerId] = {
      count: handCards.length,
      cards: playerId === currentPlayerId ? handCards : undefined,
    };
    return acc;
  }, {} as Record<string, Hand>);

  res.json(allHands);
});

// REST endpoint: Get declarations
app.get("/api/declarations", (req, res) => {
  res.json({ declarations: game.getDeclarations() });
});

// REST endpoint: Get overall game state (turn, scores, game-over/winner)
app.get("/api/state", (req, res) => {
  res.json(game.getState());
});

// REST endpoint: Start a fresh game with the same players (e.g. a rematch).
app.post("/api/reset", (req, res) => {
  game.resetGame();
  broadcast({ type: "game_reset", ...game.getState() });
  res.json(game.getState());
});


// ------------------- WEBSOCKET SERVER -------------------

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server });
const clients = new Set<WebSocket>();

wss.on("connection", (socket) => {
  console.log("🔌 New WebSocket connection");
  clients.add(socket);

  socket.on("message", (data) => {
    let msg: WSMessage;
    try {
      msg = JSON.parse(data.toString()) as WSMessage;
    } catch {
      sendTo(socket, { type: "error", error: "Malformed message (invalid JSON)." });
      return;
    }
    console.log("Received message:", msg);

    // ------------------- LISTENED MSG LOGIC -------------------
    try {
      switch (msg.type) {
        case "ask": {
          const result = game.handleAsk(msg.playerId, msg.targetPlayerId, msg.card);
          const payload = {
            type: "ask_result",
            playerId: msg.playerId,
            targetPlayerId: msg.targetPlayerId,
            card: msg.card,
            ...result,
          };
          // Illegal asks are reported only to the sender; processed asks
          // (hit or miss) are broadcast so every client updates.
          if (result.success) broadcast(payload);
          else sendTo(socket, payload);
          break;
        }

        case "declareCheck": {
          const check = game.handleDeclareCheck(
            msg.playerId,
            msg.setId,
            msg.assignments
          );
          if (check.success) broadcast({ type: "declareCheck_result", check });
          else sendTo(socket, { type: "declareCheck_result", check });
          break;
        }

        case "newGame": {
          game.resetGame();
          broadcast({ type: "game_reset", ...game.getState() });
          break;
        }
      }
    } catch (err) {
      // Engine methods are designed not to throw; this is a last-resort guard so
      // one bad message can never take down the shared server.
      console.error("Error handling message:", err);
      sendTo(socket, {
        type: "error",
        error: "Internal error handling message.",
      });
    }
  });

  socket.on("close", () => {
    clients.delete(socket);
  });
});

type WSMessage =
  | { type: "ask"; playerId: string; targetPlayerId: string; card: string }
  | {
      type: "declareCheck";
      playerId: string;
      setId: string;
      assignments: Record<string, string>;
    }
  | { type: "newGame" }
  | { type: "message"; text: string };

// Send to a single client.
function sendTo(client: WebSocket, data: any) {
  if (client.readyState === client.OPEN) client.send(JSON.stringify(data));
}

// Broadcast to all connected clients.
function broadcast(data: any) {
  const json = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(json);
    }
  });
}
