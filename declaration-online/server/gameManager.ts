import { Deck, Card, Suit, Rank } from "./deck";
import {
  SetId,
  SET_CARDS,
  SET_IDENTIFIER,
  cardToName,
  getSetIdForCard,
  isValidSetId,
} from "./sets";

type PlayerID = string;
export type Team = "blue" | "red";

function parseCardName(cardName: string): Card | null {
  if (typeof cardName !== "string") return null;
  if (cardName === "black_joker") return { type: "Joker", color: "Black" };
  if (cardName === "red_joker") return { type: "Joker", color: "Red" };

  const [rankStr, suit] = cardName.split("_of_");
  if (typeof suit !== "string" || suit.length === 0) return null;

  return { suit: suit as Suit, rank: rankStr as Rank };
}

export interface GameState {
  currentTurn: PlayerID;
  scores: { blue: number; red: number };
  gameOver: boolean;
  winner: Team | null;
}

export interface AskResult extends GameState {
  success: boolean; // was the ask legal and processed
  received: boolean; // did the asker actually get the card
  message: string;
  error?: string; // present iff success === false
}

export interface DeclareResult extends GameState {
  success: boolean; // was the declaration legal and processed
  correctCheck: boolean; // were all assignments correct
  message: string;
  error?: string; // present iff success === false
  setId: SetId | null;
  setCard: string | null; // representative identifier, kept for client compat
  winningTeam: Team | null;
}

/**
 * Declaration is played by 6 players in two alternating teams of 3.
 * Seat parity defines the teams (even index = blue, odd index = red), matching
 * the client's playerTeams map (player1/3/5 = blue, player2/4/6 = red).
 */
export class GameManager {
  deck = new Deck();
  hands: Record<PlayerID, Card[]> = {};
  players: PlayerID[] = [];
  blueDeclarations: string[] = [];
  redDeclarations: string[] = [];
  currentTurn: PlayerID;
  gameOver = false;
  winner: Team | null = null;
  // Sets already resolved (won or lost). A set may only be declared once — its
  // cards are removed from play, so a re-declare would otherwise always "fail"
  // and hand the opposing team a bogus extra point.
  private claimedSets = new Set<SetId>();

  constructor(playerIds: PlayerID[], startingPlayer?: PlayerID) {
    this.players = playerIds;
    this.currentTurn =
      startingPlayer && playerIds.includes(startingPlayer)
        ? startingPlayer
        : playerIds[0];
    this.dealCards();
  }

  /**
   * Start a fresh game with the same players: re-shuffle and re-deal, and clear
   * all declarations, claimed sets, turn, and game-over/winner state. Lets a
   * completed game be replayed without restarting the server process.
   */
  resetGame(startingPlayer?: PlayerID): void {
    this.deck.reset();
    this.hands = {};
    this.blueDeclarations = [];
    this.redDeclarations = [];
    this.claimedSets = new Set<SetId>();
    this.gameOver = false;
    this.winner = null;
    this.currentTurn =
      startingPlayer && this.players.includes(startingPlayer)
        ? startingPlayer
        : this.players[0];
    this.dealCards();
  }

  private dealCards() {
    for (const id of this.players) this.hands[id] = [];

    for (let i = 0; i < 9; i++) {
      for (const id of this.players) {
        const card = this.deck.draw();
        if (card) this.hands[id].push(card);
      }
    }
  }

  // ------------------- QUERIES -------------------
  getHand(id: PlayerID): Card[] {
    return this.hands[id] ?? [];
  }

  getDeclarations(): { blueDeclarations: string[]; redDeclarations: string[] } {
    return {
      blueDeclarations: this.blueDeclarations,
      redDeclarations: this.redDeclarations,
    };
  }

  getCurrentTurn(): PlayerID {
    return this.currentTurn;
  }

  getScores(): { blue: number; red: number } {
    return {
      blue: this.blueDeclarations.length,
      red: this.redDeclarations.length,
    };
  }

  getState(): GameState {
    return {
      currentTurn: this.currentTurn,
      scores: this.getScores(),
      gameOver: this.gameOver,
      winner: this.winner,
    };
  }

  // ------------------- TEAMS -------------------
  teamOf(id: PlayerID): Team {
    return this.players.indexOf(id) % 2 === 0 ? "blue" : "red";
  }

  getTeammates(id: PlayerID): PlayerID[] {
    return this.players.filter(
      (p) => p !== id && this.teamOf(p) === this.teamOf(id)
    );
  }

  getOpponents(id: PlayerID): PlayerID[] {
    return this.players.filter((p) => this.teamOf(p) !== this.teamOf(id));
  }

  private hasCards(id: PlayerID): boolean {
    return (this.hands[id]?.length ?? 0) > 0;
  }

  /**
   * When the turn lands on an out (0-card) player, hand off to the nearest
   * teammate who still has cards, walking seat order (same-parity seats). If no
   * teammate has cards, fall back to the nearest active opponent so play can
   * continue; if nobody has cards, leave the turn as-is (game is effectively over).
   */
  private advanceTurnToActiveTeammate(fromId: PlayerID): void {
    if (this.hasCards(fromId)) {
      this.currentTurn = fromId;
      return;
    }

    const n = this.players.length;
    const start = this.players.indexOf(fromId);

    // Same-team seats first (step by 2 preserves parity in an alternating table).
    for (let step = 2; step < n; step += 2) {
      const cand = this.players[(start + step) % n];
      if (this.hasCards(cand)) {
        this.currentTurn = cand;
        return;
      }
    }

    // Fallback: nearest active player of either team.
    for (let step = 1; step < n; step++) {
      const cand = this.players[(start + step) % n];
      if (this.hasCards(cand)) {
        this.currentTurn = cand;
        return;
      }
    }

    this.currentTurn = fromId;
  }

  private checkWin(): void {
    if (this.blueDeclarations.length >= 5) {
      this.gameOver = true;
      this.winner = "blue";
    } else if (this.redDeclarations.length >= 5) {
      this.gameOver = true;
      this.winner = "red";
    }
  }

  // ------------------- ASK + RESPONSE LOGIC -------------------
  handleAsk(
    playerId: PlayerID,
    targetId: PlayerID,
    cardName: string
  ): AskResult {
    const reject = (error: string): AskResult => ({
      success: false,
      received: false,
      message: error,
      error,
      ...this.getState(),
    });

    if (this.gameOver) return reject("Game is over.");
    if (playerId !== this.currentTurn)
      return reject(`It is not ${playerId}'s turn.`);

    const card = parseCardName(cardName);
    if (!card) return reject(`Invalid card name: ${cardName}`);

    if (targetId === playerId) return reject("You cannot ask yourself.");
    if (!this.hands[playerId]) return reject(`Unknown player: ${playerId}`);
    if (!this.hands[targetId]) return reject(`Unknown player: ${targetId}`);
    if (this.teamOf(targetId) === this.teamOf(playerId))
      return reject("You can only ask players on the opposing team.");
    if (!this.hasCards(targetId)) return reject(`${targetId} has no cards.`);

    const askerHand = this.hands[playerId];
    if (askerHand.some((c) => cardToName(c) === cardName))
      return reject("You cannot ask for a card you already hold.");

    const setId = getSetIdForCard(cardName);
    if (!setId) return reject(`${cardName} is not part of any set.`);
    const holdsSetCard = askerHand.some(
      (c) => getSetIdForCard(cardToName(c)) === setId
    );
    if (!holdsSetCard)
      return reject(
        `You must hold a card in the ${setId} set to ask for ${cardName}.`
      );

    // Legal ask — resolve it.
    const targetHand = this.hands[targetId];
    const idx = targetHand.findIndex((c) => cardToName(c) === cardName);

    if (idx !== -1) {
      targetHand.splice(idx, 1);
      askerHand.push(card);
      // Successful ask: the asker keeps the turn.
      return {
        success: true,
        received: true,
        message: `${playerId} got ${cardName} from ${targetId}`,
        ...this.getState(),
      };
    }

    // Failed ask: the turn passes to the asked player (validated to have cards).
    this.currentTurn = targetId;
    return {
      success: true,
      received: false,
      message: `${targetId} does not have ${cardName}`,
      ...this.getState(),
    };
  }

  // ------------------- DECLARE LOGIC -------------------
  private removeSetFromAllHands(cardNames: string[]): void {
    const names = new Set(cardNames);
    for (const player of this.players) {
      this.hands[player] = (this.hands[player] ?? []).filter(
        (c) => !names.has(cardToName(c))
      );
    }
  }

  /**
   * A declaration: `playerId` claims that the six cards of `setId` are held by
   * the players named in `assignments` (each card name -> a teammate's id). The
   * server verifies every assignment against actual hands. All correct -> the
   * declaring team scores the set; any wrong -> the opposing team scores it.
   * Either way the set leaves play. Returns a structured result; never throws.
   */
  handleDeclareCheck(
    playerId: PlayerID,
    setId: string,
    assignments: Record<string, PlayerID>
  ): DeclareResult {
    const reject = (error: string): DeclareResult => ({
      success: false,
      correctCheck: false,
      message: error,
      error,
      setId: null,
      setCard: null,
      winningTeam: null,
      ...this.getState(),
    });

    if (this.gameOver) return reject("Game is over.");
    if (!this.hands[playerId]) return reject(`Unknown player: ${playerId}`);
    if (!isValidSetId(setId)) return reject(`Invalid set: ${setId}`);
    if (this.claimedSets.has(setId))
      return reject(`The ${setId} set has already been declared.`);
    if (assignments === null || typeof assignments !== "object")
      return reject("Assignments must be an object mapping each set card to a player.");

    const declaringTeam = this.teamOf(playerId);
    const opposingTeam: Team = declaringTeam === "blue" ? "red" : "blue";
    const setCards = SET_CARDS[setId];

    // Assignments must cover exactly the six cards of the set.
    const assignedCards = Object.keys(assignments);
    if (
      assignedCards.length !== setCards.length ||
      !setCards.every((c) => c in assignments)
    ) {
      return reject(`Assignments must cover exactly the ${setId} set.`);
    }

    // Every assigned holder must be a member of the declaring team.
    for (const c of setCards) {
      const owner = assignments[c];
      if (!this.hands[owner]) return reject(`Unknown player: ${owner}`);
      if (this.teamOf(owner) !== declaringTeam)
        return reject(`${owner} is not on the declaring team.`);
    }

    // Verify each assignment against the real hand.
    let correct = true;
    let firstWrong = "";
    for (const c of setCards) {
      const owner = assignments[c];
      const has = (this.hands[owner] ?? []).some((h) => cardToName(h) === c);
      if (!has) {
        correct = false;
        firstWrong = c;
        break;
      }
    }

    // The set leaves play regardless of outcome, and can never be declared again.
    this.removeSetFromAllHands(setCards);
    this.claimedSets.add(setId);

    const winningTeam: Team = correct ? declaringTeam : opposingTeam;
    if (winningTeam === "blue") this.blueDeclarations.push(SET_IDENTIFIER[setId]);
    else this.redDeclarations.push(SET_IDENTIFIER[setId]);

    // If the declaration emptied whoever holds the turn, hand off to a teammate.
    if (!this.hasCards(this.currentTurn)) {
      this.advanceTurnToActiveTeammate(this.currentTurn);
    }

    this.checkWin();

    return {
      success: true,
      correctCheck: correct,
      message: correct
        ? `${playerId} correctly declared ${setId}`
        : `Declaration failed: ${assignments[firstWrong]} did not have ${firstWrong}`,
      setId,
      setCard: SET_IDENTIFIER[setId],
      winningTeam,
      ...this.getState(),
    };
  }
}
