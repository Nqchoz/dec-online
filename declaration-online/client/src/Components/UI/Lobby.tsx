import type { ServerState } from "../../net/useGameSocket";

interface LobbyProps {
  state: ServerState;
  mySeatId: string;
  onStart: () => void;
  onLeave: () => void;
}

export default function Lobby({ state, mySeatId, onStart, onLeave }: LobbyProps) {
  const amHost = state.hostSeat === mySeatId;
  const full = state.roster.length === 6;

  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem",
    }}>
      <div style={{
        background: "rgba(0,0,0,0.55)", color: "white", padding: "2rem",
        borderRadius: "12px", minWidth: "320px", display: "flex", flexDirection: "column", gap: "1rem",
      }}>
        <h2 style={{ margin: 0 }}>
          Room code: <span style={{ fontFamily: "monospace", letterSpacing: "2px" }}>{state.gameId}</span>
        </h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Share this code. Game starts with 6 players ({state.roster.length}/6).
        </p>

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {state.roster.map((r) => (
            <li key={r.seatId} style={{
              display: "flex", alignItems: "center", gap: "0.6rem",
              padding: "0.4rem 0.6rem", borderRadius: "6px",
              background: r.team === "blue" ? "#93E3E6" : "#F7B0B0",
              color: "#222",
            }}>
              <span style={{
                width: 10, height: 10, borderRadius: "50%",
                background: r.connected ? "#2ecc71" : "#999", display: "inline-block",
              }} />
              <span style={{ fontWeight: 600 }}>{r.username}</span>
              {r.seatId === state.hostSeat && <span title="Host">👑</span>}
              {r.seatId === mySeatId && <span style={{ opacity: 0.7 }}>(you)</span>}
              <span style={{ marginLeft: "auto", textTransform: "capitalize" }}>{r.team}</span>
            </li>
          ))}
        </ul>

        {amHost ? (
          <button disabled={!full} onClick={onStart}>
            {full ? "Start game" : `Waiting for players (${state.roster.length}/6)`}
          </button>
        ) : (
          <p style={{ margin: 0, opacity: 0.8 }}>Waiting for the host to start…</p>
        )}

        <button onClick={onLeave} style={{ opacity: 0.8 }}>Leave</button>
      </div>
    </div>
  );
}
