import type { Team } from "../../net/useGameSocket";

interface WinScreenProps {
  winner: Team;
  scores: { blue: number; red: number };
  isHost: boolean;
  onNewGame: () => void;
  onLeave: () => void;
}

export default function WinScreen({ winner, scores, isHost, onNewGame, onLeave }: WinScreenProps) {
  return (
    <div
      className="overlay"
      style={{ zIndex: 2000, flexDirection: "column", gap: "1rem" }}
    >
      <div style={{
        background: "rgba(0,0,0,0.75)", color: "white", padding: "2.5rem",
        borderRadius: "12px", textAlign: "center", display: "flex", flexDirection: "column", gap: "1rem",
        maxWidth: "92vw", boxSizing: "border-box", fontSize: "15px",
      }}>
        <h1 style={{ margin: 0, color: winner === "blue" ? "#93E3E6" : "#F7B0B0" }}>
          {winner === "blue" ? "Blue" : "Red"} team wins!
        </h1>
        <p style={{ margin: 0, fontSize: "1.2rem" }}>
          Final score — Blue {scores.blue} · Red {scores.red}
        </p>
        {isHost ? (
          <button onClick={onNewGame}>New game</button>
        ) : (
          <p style={{ margin: 0, opacity: 0.8 }}>Waiting for the host to start a new game…</p>
        )}
        <button onClick={onLeave} style={{ opacity: 0.8 }}>Leave</button>
      </div>
    </div>
  );
}
