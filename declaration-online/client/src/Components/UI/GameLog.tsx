import { useEffect, useRef } from "react";
import type { LogEntry, RosterEntry } from "../../net/useGameSocket";
import { formatEntry } from "./gameLogFormat";

interface GameLogProps {
  log: LogEntry[];
  roster: RosterEntry[];
}

export default function GameLog({ log, roster }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const nameOf = (seatId?: string) =>
    roster.find((r) => r.seatId === seatId)?.username ?? seatId ?? "?";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [log.length]);

  const line = (e: LogEntry): string => formatEntry(e, nameOf);

  return (
    <div
      style={{
        position: "fixed",
        top: "0.75rem",
        left: "0.75rem",
        width: "min(18rem, 70vw)",
        maxWidth: "70vw",
        boxSizing: "border-box",
        maxHeight: "40vh",
        overflowY: "auto",
        background: "rgba(0,0,0,0.6)",
        color: "white",
        borderRadius: "8px",
        padding: "0.5rem 0.6rem",
        fontSize: "12px",
        lineHeight: 1.35,
        zIndex: 50,
      }}
    >
      <div style={{ fontWeight: 700, opacity: 0.8, marginBottom: "0.3rem" }}>Game log</div>
      {log.length === 0 ? (
        <div style={{ opacity: 0.6 }}>No moves yet.</div>
      ) : (
        log.map((e) => (
          <div key={e.id} style={{ opacity: e.kind === "declare" ? 1 : 0.9 }}>
            {e.kind === "declare" ? "★ " : ""}
            {line(e)}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
