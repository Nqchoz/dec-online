import { describe, test, expect } from "vitest";
import { prettySet, formatCard, formatEntry } from "./gameLogFormat";
import type { LogEntry } from "../../net/useGameSocket";

const names: Record<string, string> = { seat1: "Alice", seat2: "Bob" };
const nameOf = (s?: string) => names[s ?? ""] ?? s ?? "?";

describe("prettySet", () => {
  test("spaces camelCase set ids", () => {
    expect(prettySet("LowHearts")).toBe("Low Hearts");
    expect(prettySet("EightsAndJokers")).toBe("Eights And Jokers");
    expect(prettySet(undefined)).toBe("a set");
  });
});

describe("formatCard", () => {
  test("standard card -> symbol without the trailing '?'", () => {
    expect(formatCard("7_of_hearts")).toBe("7♥");
  });
  test("joker -> readable text", () => {
    expect(formatCard("red_joker")).toBe("red joker");
  });
  test("undefined -> empty", () => {
    expect(formatCard(undefined)).toBe("");
  });
});

describe("formatEntry", () => {
  test("ask (hit) resolves names and card", () => {
    const e: LogEntry = {
      id: 1, kind: "ask", fromSeat: "seat1", targetSeat: "seat2",
      card: "7_of_hearts", received: true,
    };
    expect(formatEntry(e, nameOf)).toBe("Alice asked Bob for 7♥ — got it ✓");
  });

  test("ask (miss)", () => {
    const e: LogEntry = {
      id: 2, kind: "ask", fromSeat: "seat2", targetSeat: "seat1",
      card: "8_of_clubs", received: false,
    };
    expect(formatEntry(e, nameOf)).toBe("Bob asked Alice for 8♣ — no ✗");
  });

  test("declare (failed -> other team)", () => {
    const e: LogEntry = {
      id: 3, kind: "declare", bySeat: "seat1", setId: "LowHearts",
      winningTeam: "blue", correctCheck: false,
    };
    expect(formatEntry(e, nameOf)).toBe("Alice declared Low Hearts → Blue ✗");
  });

  test("unknown seat falls back to the seat id", () => {
    const e: LogEntry = {
      id: 4, kind: "ask", fromSeat: "seat6", targetSeat: "seat3",
      card: "2_of_diamonds", received: true,
    };
    expect(formatEntry(e, nameOf)).toBe("seat6 asked seat3 for 2♦ — got it ✓");
  });
});
