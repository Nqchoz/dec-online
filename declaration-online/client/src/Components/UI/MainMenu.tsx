import { useState } from "react";

interface MainMenuProps {
  connected: boolean;
  onCreate: (username: string) => void;
  onJoin: (code: string, username: string) => void;
}

const panel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  padding: "2rem",
  width: "min(22rem, 92vw)",
  maxWidth: "92vw",
  boxSizing: "border-box",
  background: "rgba(0,0,0,0.55)",
  borderRadius: "12px",
  color: "white",
  // Fixed px so menu text stays readable regardless of the table's root-font scaling.
  fontSize: "15px",
};

export default function MainMenu({ connected, onCreate, onJoin }: MainMenuProps) {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");

  const nameOk = username.trim().length > 0;

  return (
    <div className="menu-screen" style={{
      position: "fixed", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: "1.5rem",
    }}>
      <h1 style={{ fontFamily: "Cinzel Decorative, serif", color: "white", fontSize: "clamp(28px, 8vw, 56px)", margin: 0 }}>Declaration</h1>

      <div style={panel}>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            style={{ width: "100%", marginTop: "0.25rem" }}
          />
        </label>

        <button disabled={!connected || !nameOk} onClick={() => onCreate(username.trim())}>
          Create game
        </button>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.2)", margin: "0.5rem 0" }} />

        <label>
          Room code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDEF"
            maxLength={6}
            style={{ width: "100%", marginTop: "0.25rem", textTransform: "uppercase" }}
          />
        </label>
        <button
          disabled={!connected || !nameOk || code.trim().length === 0}
          onClick={() => onJoin(code.trim().toUpperCase(), username.trim())}
        >
          Join game
        </button>

        {!connected && (
          <p style={{ color: "#F7B0B0", margin: 0 }}>Connecting to server…</p>
        )}
      </div>
    </div>
  );
}
