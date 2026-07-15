import CardHand from "../Cards/MultiCard/CardHand";
import { getSetFromCard, sets as ALL_SETS } from "../Cards/Sets";

interface DeclarationPileProps {
  decCount: number;
  decSets: string[]; // set-identifier strings, e.g. "7_of_hearts", "red_joker"
  teamColor: string; // "red" | "blue"
}

function DeclarationPile({ decCount, decSets, teamColor }: DeclarationPileProps) {
  // Each completed set is stored as its representative identifier; expand it to
  // the set's actual six cards so the pile shows the real cards that were won.
  const completedSets = decSets
    .map((id) => getSetFromCard(id, ALL_SETS))
    .filter((s): s is string[] => Array.isArray(s));

  return (
    <div className={`declaration-pile-${teamColor}`}>
      <div className={`username-box dec-label-box ${teamColor}`}>
        <p className="username">{teamColor}</p>
      </div>

      <div className="dec-pile-sets">
        {completedSets.length === 0 ? (
          <CardHand
            Cards={[{ value: "cardback", deckType: "RegularCards", faceUp: false }]}
            deckType="RegularCards"
            faceUp={false}
            decPile={true}
          />
        ) : (
          completedSets.map((setCards, i) => (
            <CardHand
              key={i}
              Cards={setCards.map((c) => ({ value: c, deckType: "RegularCards", faceUp: true }))}
              deckType="RegularCards"
              faceUp={true}
              decPile={true}
            />
          ))
        )}
      </div>

      <div className="card-count-label count-dec-pile">{decCount}</div>
    </div>
  );
}

export default DeclarationPile;
