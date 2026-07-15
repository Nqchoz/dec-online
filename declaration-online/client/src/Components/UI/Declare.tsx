import { useState } from 'react';
import CardGrid from "../Cards/MultiCard/CardGrid";
import { sets, getSetStrFromCard } from '../Cards/Sets';

import './Declare.css';
import React from 'react';

interface DeclareProps {
  deckType: string;
  selectedOverlayCard: string | null;
  setSelectedOverlayCard: (card: string | null) => void;
  // Emits the server contract: which teammate seat each of the set's 6 cards
  // is claimed to be held by.
  onDeclare: (setId: string, assignments: Record<string, string>) => void;
  prevDeclarations: string[];
  mySeatId: string;
  leftTeammateId: string;
  rightTeammateId: string;
}

export default function Declare({
  deckType,
  selectedOverlayCard,
  setSelectedOverlayCard,
  onDeclare,
  prevDeclarations,
  mySeatId,
  leftTeammateId,
  rightTeammateId,
}: DeclareProps) {
  const [showGrid, setShowDeclareGrid] = useState(false);
  const [declareSetStr, setDeclareSetStr] = useState("SetOfSets");
  const [cardCycle, setCardCycle] = useState(false);
  const [colorIndices, setColorIndices] = React.useState<number[]>(Array(6).fill(0));

  function updateColorIndex(idx: number) {
    if (!cardCycle) return; // Only cycle colors once a set is chosen
    setColorIndices(prev =>
      prev.map((val, i) => (i === idx ? (val < 3 ? val + 1 : 0) : val))
    );
  }

  function reset() {
    setShowDeclareGrid(false);
    setDeclareSetStr("SetOfSets");
    setCardCycle(false);
    setSelectedOverlayCard(null);
    setColorIndices(Array(6).fill(0));
  }

  // color: 1 = self, 2 = left teammate, 3 = right teammate
  function seatForColor(color: number): string {
    if (color === 1) return mySeatId;
    if (color === 2) return leftTeammateId;
    return rightTeammateId;
  }

  function handleConfirm() {
    // Phase 1: pick which set is being declared (from the SetOfSets picker).
    if (declareSetStr === "SetOfSets") {
      if (selectedOverlayCard && !prevDeclarations.includes(selectedOverlayCard)) {
        setDeclareSetStr(getSetStrFromCard(selectedOverlayCard));
        setCardCycle(true);
      } else {
        alert("This set was already declared");
      }
      setSelectedOverlayCard(null);
      return;
    }

    // Phase 2: every card must be assigned to a teammate (1/2/3).
    if (colorIndices.includes(0)) {
      alert("Please assign every card to a teammate before confirming.");
      return;
    }

    const setCards = sets.get(declareSetStr) || [];
    const assignments: Record<string, string> = {};
    setCards.forEach((cardName, idx) => {
      assignments[cardName] = seatForColor(colorIndices[idx]);
    });

    onDeclare(declareSetStr, assignments);
    reset();
  }

  return (
    <>
      <button
        className="declare-button"
        onClick={() => setShowDeclareGrid(prev => !prev)}
        aria-label="Toggle Declare Grid">
            Declaration
      </button>

        {showGrid && (
            <div className="overlay">
                <CardGrid
                    Set={declareSetStr}
                    deckType={deckType}
                    selectedOverlayCard={selectedOverlayCard}
                    setSelectedOverlayCard={setSelectedOverlayCard}
                    cardCycle={cardCycle}
                    colorIndices={colorIndices}
                    updateColorIndex={updateColorIndex}
                />

                {cardCycle ? (
                    <div>
                      <button className="close-button" onClick={reset}>Close</button>
                      <button className="confirm-button" onClick={handleConfirm}>Confirm</button>
                    </div>
                ) : selectedOverlayCard ? (
                    <button className="ask-button" onClick={handleConfirm}>Confirm</button>
                ) : (
                    <button className="close-button" onClick={reset}>Close</button>
                )}
            </div>
        )}
    </>
  );
}
