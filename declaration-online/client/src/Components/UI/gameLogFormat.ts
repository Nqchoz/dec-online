// Pure formatting helpers for the game log, split out of GameLog.tsx so they
// can be unit-tested without rendering a component.

import type { LogEntry } from "../../net/useGameSocket";
import { formatTextStringToSymbol } from "../../Types/Utils";

// "LowHearts" -> "Low Hearts", "EightsAndJokers" -> "Eights And Jokers"
export function prettySet(setId?: string): string {
  if (!setId) return "a set";
  return setId.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function formatCard(value?: string): string {
  if (!value) return "";
  if (value.includes("joker")) return value.replace("_", " ");
  return formatTextStringToSymbol(value).replace("?", "");
}

// Format one log entry into a display string. `nameOf` resolves a seatId to a
// username (falling back to the seatId).
export function formatEntry(e: LogEntry, nameOf: (seatId?: string) => string): string {
  if (e.kind === "ask") {
    return `${nameOf(e.fromSeat)} asked ${nameOf(e.targetSeat)} for ${formatCard(e.card)} — ${
      e.received ? "got it ✓" : "no ✗"
    }`;
  }
  return `${nameOf(e.bySeat)} declared ${prettySet(e.setId)} → ${
    e.winningTeam === "blue" ? "Blue" : "Red"
  } ${e.correctCheck ? "✓" : "✗"}`;
}
