// server/sets.ts
//
// Authoritative model of the 9 Declaration sets, mirroring the client's
// client/src/Components/Cards/Sets.ts. The server owns set membership so it can
// validate asks ("you must already hold a card in the set you ask for") and
// declarations independently of anything the client sends.
//
// Cards are identified by their canonical name string ("7_of_hearts",
// "ace_of_spades", "red_joker") — the same form used across the wire, the card
// art filenames, and parseCardName in gameManager.ts.

import { Card } from "./deck";

export type SetId =
  | "LowClubs" | "LowSpades" | "LowHearts" | "LowDiamonds"
  | "HighClubs" | "HighSpades" | "HighHearts" | "HighDiamonds"
  | "EightsAndJokers";

// Suit order matches the client so the "set identifier" (below) lines up with
// the client's set[5] convention.
const SUITS = ["Clubs", "Spades", "Hearts", "Diamonds"] as const;
const LOW_RANKS = ["2", "3", "4", "5", "6", "7"];
const HIGH_RANKS = ["9", "10", "jack", "queen", "king", "ace"];

function buildSetCards(): Record<SetId, string[]> {
  const sets = {} as Record<SetId, string[]>;

  for (const suit of SUITS) {
    const s = suit.toLowerCase();
    sets[`Low${suit}` as SetId] = LOW_RANKS.map((r) => `${r}_of_${s}`);
    sets[`High${suit}` as SetId] = HIGH_RANKS.map((r) => `${r}_of_${s}`);
  }

  sets.EightsAndJokers = [
    ...SUITS.map((suit) => `8_of_${suit.toLowerCase()}`),
    "black_joker",
    "red_joker",
  ];

  return sets;
}

/** The six card-name strings that make up each set. */
export const SET_CARDS: Record<SetId, string[]> = buildSetCards();

/**
 * The representative "set card" string used to label a completed set. Chosen to
 * match the client's existing set[5] convention (Low -> 7, High -> ace,
 * EightsAndJokers -> red_joker) so declareCheck_result.setCard stays compatible
 * with the client's DeclarationPile rendering.
 */
export const SET_IDENTIFIER: Record<SetId, string> = Object.fromEntries(
  (Object.keys(SET_CARDS) as SetId[]).map((id) => [id, SET_CARDS[id][5]])
) as Record<SetId, string>;

export const ALL_SET_IDS = Object.keys(SET_CARDS) as SetId[];

/** Canonical name string for a Card (inverse of parseCardName). */
export function cardToName(card: Card): string {
  if ("rank" in card) {
    return `${card.rank}_of_${card.suit}`;
  }
  return `${card.color.toLowerCase()}_joker`;
}

export function sameCard(a: Card, b: Card): boolean {
  return cardToName(a) === cardToName(b);
}

/**
 * Which set a card belongs to, by name. Port of the client's getSetStrFromCard,
 * but returns null for anything that is not a real set card (the client's
 * "SetOfSets" is a UI-only picker and is intentionally not modeled here).
 */
export function getSetIdForCard(cardName: string): SetId | null {
  if (cardName.includes("joker")) return "EightsAndJokers";

  const [rank, suit] = cardName.split("_of_");
  if (!suit) return null;
  const suitCap = suit.charAt(0).toUpperCase() + suit.slice(1);

  if (LOW_RANKS.includes(rank)) return `Low${suitCap}` as SetId;
  if (HIGH_RANKS.includes(rank)) return `High${suitCap}` as SetId;
  if (rank === "8") return "EightsAndJokers";

  return null;
}

export function isValidSetId(id: string): id is SetId {
  return id in SET_CARDS;
}
