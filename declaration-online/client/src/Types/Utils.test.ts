import { describe, test, expect } from "vitest";
import { formatTextStringToSymbol, formatTextObjectToString } from "./Utils";
import type { Card } from "./Card";

describe("formatTextStringToSymbol", () => {
  test("formats standard cards with rank + suit symbol", () => {
    expect(formatTextStringToSymbol("7_of_hearts")).toBe("7♥?");
    expect(formatTextStringToSymbol("ace_of_spades")).toBe("ACE♠?");
    expect(formatTextStringToSymbol("10_of_clubs")).toBe("10♣?");
    expect(formatTextStringToSymbol("king_of_diamonds")).toBe("KING♦?");
  });
});

describe("formatTextObjectToString", () => {
  test("standard card -> {rank}_of_{suit}", () => {
    const c: Card = { rank: "7", suit: "hearts" } as Card;
    expect(formatTextObjectToString(c)).toBe("7_of_hearts");
  });

  test("joker -> {color}_joker (lowercased)", () => {
    const red: Card = { type: "Joker", color: "Red" } as Card;
    const black: Card = { type: "Joker", color: "Black" } as Card;
    expect(formatTextObjectToString(red)).toBe("red_joker");
    expect(formatTextObjectToString(black)).toBe("black_joker");
  });
});
