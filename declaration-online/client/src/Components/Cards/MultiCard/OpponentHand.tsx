import CardHand from "./CardHand";
import { formatTextStringToSymbol } from "../../../Types/Utils";

interface OpponentHandProps {
  cardCount: number;
  position: "top" | "left" | "right";
  teamColor: string; // "red" | "blue"
  playerId: string; // this opponent's seat id
  displayName?: string; // username to show (defaults to playerId)
  isCurrentTurn?: boolean; // highlight when it's this seat's turn
  selectedTargetId: string | null;
  setSelectedTargetId: (id: string | null) => void;
  isOpponent: boolean;
  askState?: {
    from: string;
    to: string;
    card: string;
    result: boolean;
  } | null
}

function OpponentHand({
  cardCount,
  position,
  teamColor,
  playerId,
  displayName,
  isCurrentTurn,
  selectedTargetId,
  setSelectedTargetId,
  isOpponent,
  askState
}: OpponentHandProps) {
  const cardsToShow = Math.min(cardCount, 4);
  const cardBacks = Array.from({ length: cardsToShow }, (_, i) => ({
  value: `cardback-${i}`,
  deckType: "RegularCards",
  faceUp: false,
}));

  const handleUsernameClick = () => {
    if (!isOpponent) return; // Only allow selection for opponents
    if (selectedTargetId === playerId) {
      setSelectedTargetId(null); // Deselect if already selected
    } else {
      setSelectedTargetId(playerId); // Select this player
    }
  };
  
  const isSelected = selectedTargetId === playerId;

  return (
    <div className={`opponent-hand opponent-${position}`}>
      
      <div
        className={`username-box ${teamColor} ${position} ${isSelected ? "selected" : ""} ${isCurrentTurn ? "active-turn" : ""}`}
        onClick={handleUsernameClick}
        style={{ cursor: isOpponent ? "pointer" : "default"}}
      >
        <p className="username">{displayName ?? playerId}</p>
      </div>
      
      <CardHand Cards={cardBacks} deckType="RegularCards" faceUp={false}/>
      {cardCount > 3 && <div className="card-count-label">{cardCount}</div>}
      {askState && askState.from === playerId && (
        <div className={`speech-bubble ask ${position}`}>
          {askState.to} {formatTextStringToSymbol(askState.card)}
        </div>
      )}
      {askState && askState.from === playerId && (
        <div className={`speech-bubble response ${position}`}>
          {askState.result ? "✅" : "❌"}
        </div>
      )}
    </div>
  );
}

export default OpponentHand;