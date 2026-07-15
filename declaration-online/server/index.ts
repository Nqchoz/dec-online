import express from "express";
import { WebSocketServer } from "ws";
import cors from "cors";
import { RoomRegistry } from "./rooms";
import { handleMessage, pushRoomState, buildState, sendTo, WSMessage } from "./handlers";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

const registry = new RoomRegistry();

// ------------------- REST (debug / health) -------------------
// Gameplay flows over WebSockets; these are room-scoped read-only helpers.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/state/:gameId", (req, res) => {
  const room = registry.getRoom(req.params.gameId);
  if (!room) {
    res.status(404).json({ error: "No such game." });
    return;
  }
  res.json(buildState(registry, room));
});

// ------------------- WEBSOCKET SERVER -------------------
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket) => {
  console.log("🔌 New WebSocket connection");

  socket.on("message", (data) => {
    let msg: WSMessage;
    try {
      msg = JSON.parse(data.toString()) as WSMessage;
    } catch {
      sendTo(socket, { type: "error", error: "Malformed message (invalid JSON)." });
      return;
    }

    try {
      handleMessage(registry, socket, msg);
    } catch (err) {
      // Handlers are designed not to throw; last-resort guard so one bad
      // message can never take down the shared server.
      console.error("Error handling message:", err);
      sendTo(socket, { type: "error", error: "Internal error handling message." });
    }
  });

  socket.on("close", () => {
    const room = registry.handleDisconnect(socket);
    if (room) pushRoomState(registry, room);
  });
});
