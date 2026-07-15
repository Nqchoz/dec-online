import { describe, test, expect } from "vitest";
import { initSets, getSetStrFromCard, getSetFromCard } from "./Sets";

describe("initSets", () => {
  const sets = initSets();

  test("models the 9 real sets, each with 6 cards", () => {
    const realSetIds = [
      "LowClubs", "LowSpades", "LowHearts", "LowDiamonds",
      "HighClubs", "HighSpades", "HighHearts", "HighDiamonds",
      "EightsAndJokers",
    ];
    for (const id of realSetIds) {
      expect(sets.get(id)?.length).toBe(6);
    }
  });

  test("EightsAndJokers contains the four 8s and both jokers", () => {
    const s = sets.get("EightsAndJokers")!;
    expect(s).toEqual(
      expect.arrayContaining([
        "8_of_clubs", "8_of_spades", "8_of_hearts", "8_of_diamonds",
        "black_joker", "red_joker",
      ])
    );
  });
});

describe("getSetStrFromCard", () => {
  test("maps a card to its set id", () => {
    expect(getSetStrFromCard("7_of_hearts")).toBe("LowHearts");
    expect(getSetStrFromCard("ace_of_spades")).toBe("HighSpades");
    expect(getSetStrFromCard("8_of_clubs")).toBe("EightsAndJokers");
    expect(getSetStrFromCard("red_joker")).toBe("EightsAndJokers");
  });
});

describe("getSetFromCard (declaration-pile expansion)", () => {
  const sets = initSets();

  test("expands a set identifier to its six member cards", () => {
    expect(getSetFromCard("7_of_hearts", sets)).toHaveLength(6);
    expect(getSetFromCard("7_of_hearts", sets)).toContain("2_of_hearts");
    expect(getSetFromCard("ace_of_spades", sets)).toContain("king_of_spades");
    expect(getSetFromCard("red_joker", sets)).toContain("black_joker");
  });
});
