import { GameManager } from "./gameManager";
import { Card } from "./deck";

const PLAYERS = [
  "player1",
  "player2",
  "player3",
  "player4",
  "player5",
  "player6",
];

// Build a Card from its canonical name string (test-side inverse of parseCardName).
function mk(name: string): Card {
  if (name === "black_joker") return { type: "Joker", color: "Black" };
  if (name === "red_joker") return { type: "Joker", color: "Red" };
  const [rank, suit] = name.split("_of_");
  return { suit, rank } as Card;
}

describe("GameManager", () => {
  let game: GameManager;

  beforeEach(() => {
    game = new GameManager(PLAYERS, "player1");
  });

  // ---- Dealing & teams ---- //
  test("deals 9 cards to each of 6 players (54 total) and drains the deck", () => {
    const total = PLAYERS.reduce((n, p) => n + game.getHand(p).length, 0);
    expect(total).toBe(54);
    for (const p of PLAYERS) expect(game.getHand(p).length).toBe(9);
    expect(game.deck.isEmpty()).toBe(true);
  });

  test("assigns teams by seat parity (blue = player1/3/5, red = player2/4/6)", () => {
    expect(game.teamOf("player1")).toBe("blue");
    expect(game.teamOf("player2")).toBe("red");
    expect(game.getTeammates("player1").sort()).toEqual(["player3", "player5"]);
    expect(game.getOpponents("player1").sort()).toEqual([
      "player2",
      "player4",
      "player6",
    ]);
  });

  test("starting turn defaults to the first player when unspecified", () => {
    const g = new GameManager(PLAYERS);
    expect(g.getCurrentTurn()).toBe("player1");
  });

  // ---- Asks: happy paths ---- //
  test("successful ask transfers the card and the asker keeps the turn", () => {
    game.currentTurn = "player1";
    game.hands["player1"] = [mk("2_of_hearts")];
    game.hands["player2"] = [mk("3_of_hearts")];

    const res = game.handleAsk("player1", "player2", "3_of_hearts");

    expect(res.success).toBe(true);
    expect(res.received).toBe(true);
    expect(game.getHand("player1").map((c) => (c as any).rank)).toContain("3");
    expect(game.getHand("player2").length).toBe(0);
    expect(res.currentTurn).toBe("player1");
  });

  test("failed ask passes the turn to the asked player", () => {
    game.currentTurn = "player1";
    game.hands["player1"] = [mk("2_of_hearts")];
    game.hands["player2"] = [mk("4_of_spades")]; // does not hold 3_of_hearts

    const res = game.handleAsk("player1", "player2", "3_of_hearts");

    expect(res.success).toBe(true);
    expect(res.received).toBe(false);
    expect(res.currentTurn).toBe("player2");
    expect(game.getHand("player1").length).toBe(1); // unchanged
  });

  // ---- Asks: rejections ---- //
  test("rejects an out-of-turn ask", () => {
    game.currentTurn = "player2";
    game.hands["player1"] = [mk("2_of_hearts")];
    game.hands["player2"] = [mk("3_of_hearts")];

    const res = game.handleAsk("player1", "player2", "3_of_hearts");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/turn/i);
    expect(game.getHand("player1").length).toBe(1);
    expect(game.getCurrentTurn()).toBe("player2");
  });

  test("rejects asking a teammate", () => {
    game.currentTurn = "player1";
    game.hands["player1"] = [mk("2_of_hearts")];
    game.hands["player3"] = [mk("3_of_hearts")];

    const res = game.handleAsk("player1", "player3", "3_of_hearts");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/opposing team/i);
  });

  test("rejects asking yourself", () => {
    game.currentTurn = "player1";
    game.hands["player1"] = [mk("2_of_hearts")];

    const res = game.handleAsk("player1", "player1", "3_of_hearts");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/yourself/i);
  });

  test("rejects asking for a card you already hold", () => {
    game.currentTurn = "player1";
    game.hands["player1"] = [mk("2_of_hearts"), mk("3_of_hearts")];
    game.hands["player2"] = [mk("4_of_hearts")];

    const res = game.handleAsk("player1", "player2", "3_of_hearts");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/already hold/i);
  });

  test("rejects asking for a set you hold no card in", () => {
    game.currentTurn = "player1";
    game.hands["player1"] = [mk("king_of_spades")]; // HighSpades, not LowHearts
    game.hands["player2"] = [mk("3_of_hearts")];

    const res = game.handleAsk("player1", "player2", "3_of_hearts");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/must hold a card in the LowHearts set/i);
  });

  test("rejects asking a player with no cards", () => {
    game.currentTurn = "player1";
    game.hands["player1"] = [mk("2_of_hearts")];
    game.hands["player2"] = [];

    const res = game.handleAsk("player1", "player2", "3_of_hearts");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no cards/i);
  });

  // ---- Turn handoff to teammate ---- //
  test("when a declaration empties the turn-holder, the turn goes to a teammate with cards", () => {
    game.currentTurn = "player1";
    game.hands = {
      player1: [mk("2_of_hearts"), mk("3_of_hearts")], // both in the set -> emptied
      player3: [mk("4_of_hearts"), mk("5_of_hearts"), mk("9_of_clubs")], // keeps 9_of_clubs
      player5: [mk("6_of_hearts"), mk("7_of_hearts")],
      player2: [mk("king_of_spades")],
      player4: [mk("queen_of_spades")],
      player6: [mk("jack_of_spades")],
    };
    const assignments = {
      "2_of_hearts": "player1",
      "3_of_hearts": "player1",
      "4_of_hearts": "player3",
      "5_of_hearts": "player3",
      "6_of_hearts": "player5",
      "7_of_hearts": "player5",
    };

    const res = game.handleDeclareCheck("player1", "LowHearts", assignments);

    expect(res.correctCheck).toBe(true);
    expect(game.getHand("player1").length).toBe(0);
    expect(res.currentTurn).toBe("player3"); // nearest teammate still holding cards
  });

  // ---- Declarations ---- //
  test("correct declaration scores the declaring team and clears the set from all hands", () => {
    game.hands = {
      player1: [mk("2_of_hearts"), mk("3_of_hearts")],
      player3: [mk("4_of_hearts"), mk("5_of_hearts")],
      player5: [mk("6_of_hearts"), mk("7_of_hearts")],
      player2: [mk("king_of_spades")],
      player4: [mk("queen_of_spades")],
      player6: [mk("jack_of_spades")],
    };
    const assignments = {
      "2_of_hearts": "player1",
      "3_of_hearts": "player1",
      "4_of_hearts": "player3",
      "5_of_hearts": "player3",
      "6_of_hearts": "player5",
      "7_of_hearts": "player5",
    };

    const res = game.handleDeclareCheck("player1", "LowHearts", assignments);

    expect(res.success).toBe(true);
    expect(res.correctCheck).toBe(true);
    expect(res.winningTeam).toBe("blue");
    expect(res.setCard).toBe("7_of_hearts");
    expect(game.blueDeclarations).toEqual(["7_of_hearts"]);
    expect(res.scores.blue).toBe(1);

    // None of the six set cards remain anywhere.
    const remaining = PLAYERS.flatMap((p) =>
      game.getHand(p).map((c) => JSON.stringify(c))
    );
    for (const name of [
      "2_of_hearts",
      "3_of_hearts",
      "4_of_hearts",
      "5_of_hearts",
      "6_of_hearts",
      "7_of_hearts",
    ]) {
      expect(remaining).not.toContain(JSON.stringify(mk(name)));
    }
  });

  test("incorrect declaration awards the set to the opposing team", () => {
    game.hands = {
      player1: [mk("2_of_hearts"), mk("3_of_hearts")],
      player3: [mk("5_of_hearts")], // missing 4_of_hearts
      player5: [mk("6_of_hearts"), mk("7_of_hearts")],
      player2: [mk("king_of_spades")],
      player4: [mk("queen_of_spades")],
      player6: [mk("jack_of_spades")],
    };
    const assignments = {
      "2_of_hearts": "player1",
      "3_of_hearts": "player1",
      "4_of_hearts": "player3", // wrong
      "5_of_hearts": "player3",
      "6_of_hearts": "player5",
      "7_of_hearts": "player5",
    };

    const res = game.handleDeclareCheck("player1", "LowHearts", assignments);

    expect(res.success).toBe(true);
    expect(res.correctCheck).toBe(false);
    expect(res.winningTeam).toBe("red");
    expect(game.redDeclarations).toEqual(["7_of_hearts"]);
  });

  test("a set cannot be declared twice — the repeat is rejected and scores are unchanged", () => {
    game.hands = {
      player1: [mk("2_of_hearts"), mk("3_of_hearts")],
      player3: [mk("4_of_hearts"), mk("5_of_hearts")],
      player5: [mk("6_of_hearts"), mk("7_of_hearts")],
      player2: [mk("king_of_spades")],
      player4: [mk("queen_of_spades")],
      player6: [mk("jack_of_spades")],
    };
    const assignments = {
      "2_of_hearts": "player1",
      "3_of_hearts": "player1",
      "4_of_hearts": "player3",
      "5_of_hearts": "player3",
      "6_of_hearts": "player5",
      "7_of_hearts": "player5",
    };

    const first = game.handleDeclareCheck("player1", "LowHearts", assignments);
    expect(first.correctCheck).toBe(true);
    const scoresAfterFirst = { ...game.getScores() };

    const second = game.handleDeclareCheck("player1", "LowHearts", assignments);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already been declared/i);
    expect(game.getScores()).toEqual(scoresAfterFirst); // no bogus extra point
    expect(game.blueDeclarations).toEqual(["7_of_hearts"]);
    expect(game.redDeclarations).toEqual([]);
  });

  test("turn handoff falls back to an opponent when the whole team is out", () => {
    game.currentTurn = "player1";
    // The entire blue team's only cards are the declared set -> all emptied.
    game.hands = {
      player1: [mk("2_of_hearts"), mk("3_of_hearts")],
      player3: [mk("4_of_hearts"), mk("5_of_hearts")],
      player5: [mk("6_of_hearts"), mk("7_of_hearts")],
      player2: [mk("king_of_spades")],
      player4: [mk("queen_of_spades")],
      player6: [mk("jack_of_spades")],
    };
    const assignments = {
      "2_of_hearts": "player1",
      "3_of_hearts": "player1",
      "4_of_hearts": "player3",
      "5_of_hearts": "player3",
      "6_of_hearts": "player5",
      "7_of_hearts": "player5",
    };

    const res = game.handleDeclareCheck("player1", "LowHearts", assignments);

    expect(res.correctCheck).toBe(true);
    expect(game.getHand("player3").length).toBe(0);
    expect(game.getHand("player5").length).toBe(0);
    // No blue teammate has cards, so the turn falls back to the nearest active
    // player of the other team (player2).
    expect(res.currentTurn).toBe("player2");
  });

  test("invalid declarations return an error without throwing", () => {
    const base = {
      "2_of_hearts": "player1",
      "3_of_hearts": "player1",
      "4_of_hearts": "player3",
      "5_of_hearts": "player3",
      "6_of_hearts": "player5",
      "7_of_hearts": "player5",
    };

    // Invalid set id
    expect(() =>
      game.handleDeclareCheck("player1", "Nonsense", base)
    ).not.toThrow();
    expect(game.handleDeclareCheck("player1", "Nonsense", base).error).toMatch(
      /invalid set/i
    );

    // Card assigned to an opponent (player2 is red; declarer player1 is blue)
    const offTeam = { ...base, "2_of_hearts": "player2" };
    const r = game.handleDeclareCheck("player1", "LowHearts", offTeam);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/declaring team/i);

    // Missing a card from the set
    const { ["7_of_hearts"]: _omit, ...incomplete } = base;
    const r2 = game.handleDeclareCheck("player1", "LowHearts", incomplete);
    expect(r2.success).toBe(false);
    expect(r2.error).toMatch(/exactly/i);
  });

  // ---- Win condition ---- //
  test("reaching 5 sets ends the game and rejects further actions", () => {
    game.blueDeclarations = ["a", "b", "c", "d"]; // 4 sets already
    game.hands = {
      player1: [mk("2_of_hearts"), mk("3_of_hearts")],
      player3: [mk("4_of_hearts"), mk("5_of_hearts")],
      player5: [mk("6_of_hearts"), mk("7_of_hearts")],
      player2: [mk("king_of_spades")],
      player4: [mk("queen_of_spades")],
      player6: [mk("jack_of_spades")],
    };
    const assignments = {
      "2_of_hearts": "player1",
      "3_of_hearts": "player1",
      "4_of_hearts": "player3",
      "5_of_hearts": "player3",
      "6_of_hearts": "player5",
      "7_of_hearts": "player5",
    };

    const res = game.handleDeclareCheck("player1", "LowHearts", assignments);
    expect(res.gameOver).toBe(true);
    expect(res.winner).toBe("blue");

    // Any further ask is rejected.
    game.currentTurn = "player2";
    game.hands["player2"] = [mk("9_of_clubs")];
    game.hands["player4"] = [mk("10_of_clubs")];
    const ask = game.handleAsk("player2", "player4", "10_of_clubs");
    expect(ask.success).toBe(false);
    expect(ask.error).toMatch(/over/i);
  });

  // ---- Reset / rematch ---- //
  test("resetGame clears all state and re-deals for a rematch", () => {
    // Drive the game to a finished state.
    game.blueDeclarations = ["a", "b", "c", "d"];
    game.hands = {
      player1: [mk("2_of_hearts"), mk("3_of_hearts")],
      player3: [mk("4_of_hearts"), mk("5_of_hearts")],
      player5: [mk("6_of_hearts"), mk("7_of_hearts")],
      player2: [mk("king_of_spades")],
      player4: [mk("queen_of_spades")],
      player6: [mk("jack_of_spades")],
    };
    game.handleDeclareCheck("player1", "LowHearts", {
      "2_of_hearts": "player1",
      "3_of_hearts": "player1",
      "4_of_hearts": "player3",
      "5_of_hearts": "player3",
      "6_of_hearts": "player5",
      "7_of_hearts": "player5",
    });
    expect(game.gameOver).toBe(true);

    game.resetGame();

    expect(game.gameOver).toBe(false);
    expect(game.winner).toBeNull();
    expect(game.getScores()).toEqual({ blue: 0, red: 0 });
    expect(game.getCurrentTurn()).toBe("player1");
    expect(game.deck.isEmpty()).toBe(true);
    const total = PLAYERS.reduce((n, p) => n + game.getHand(p).length, 0);
    expect(total).toBe(54);
    for (const p of PLAYERS) expect(game.getHand(p).length).toBe(9);

    // A previously-claimed set is no longer blocked in the new game: the
    // declaration is processed (success) rather than rejected as already-declared.
    const res = game.handleDeclareCheck("player1", "LowHearts", {
      "2_of_hearts": "player1",
      "3_of_hearts": "player1",
      "4_of_hearts": "player3",
      "5_of_hearts": "player3",
      "6_of_hearts": "player5",
      "7_of_hearts": "player5",
    });
    expect(res.success).toBe(true);
  });

  // ---- Malformed input never throws ---- //
  test("handleAsk rejects a non-string card without throwing", () => {
    game.currentTurn = "player1";
    game.hands["player1"] = [mk("2_of_hearts")];
    game.hands["player2"] = [mk("3_of_hearts")];

    let res!: ReturnType<typeof game.handleAsk>;
    expect(() => {
      res = game.handleAsk("player1", "player2", undefined as any);
    }).not.toThrow();
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/invalid card/i);
  });

  test("handleDeclareCheck rejects missing/non-object assignments without throwing", () => {
    for (const bad of [undefined, null, "LowHearts", 42] as any[]) {
      let res!: ReturnType<typeof game.handleDeclareCheck>;
      expect(() => {
        res = game.handleDeclareCheck("player1", "LowHearts", bad);
      }).not.toThrow();
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/assignments must be an object/i);
    }
  });
});
