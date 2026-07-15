import { useEffect, useMemo, useState } from "react";
import { initSets } from "./Components/Cards/Sets";
import { Card } from "./Types/Card";
import { formatTextObjectToString, formatTextStringToSymbol } from "./Types/Utils";

import OpponentHand from "./Components/Cards/MultiCard/OpponentHand";
import CardHand from "./Components/Cards/MultiCard/CardHand";
import CardGrid from "./Components/Cards/MultiCard/CardGrid";
import Settings from "./Components/UI/Settings";
import Declare from "./Components/UI/Declare";
import DeclarationPile from "./Components/UI/DeclarationPile";
import MainMenu from "./Components/UI/MainMenu";
import Lobby from "./Components/UI/Lobby";
import WinScreen from "./Components/UI/WinScreen";
import { useGameSocket, RosterEntry } from "./net/useGameSocket";

import "./Components/UI/TableLayout.css";
import "./Components/UI/Overlay.css";
import "./Components/Cards/Card.css";
import "./App.css";

function App() {
  const {
    connected,
    reconnecting,
    myMemberId,
    state,
    hand,
    lastAsk,
    notice,
    error,
    clearError,
    clearNotice,
    leave,
    api,
  } = useGameSocket();

  const [deckType, setDeckType] = useState("RegularCards");
  const toggleDeck = () =>
    setDeckType((d) => (d === "RegularCards" ? "HighContrastPlayingCards" : "RegularCards"));

  // Card-select / ask overlay state
  const sets = useMemo(() => initSets(), []);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<string | null>(null);
  const [selectedOverlayCard, setSelectedOverlayCard] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // Local (cosmetic) hand ordering, re-synced whenever the server pushes a new hand.
  const [localHand, setLocalHand] = useState<Card[]>([]);
  useEffect(() => setLocalHand(hand), [hand]);

  const banner = (
    <Banner error={error} notice={notice} onClearError={clearError} onClearNotice={clearNotice} />
  );

  // ---- Menu / lobby gating ----
  if (reconnecting) return <Centered>Reconnecting…</Centered>;
  if (!myMemberId) {
    return (
      <>
        {banner}
        <MainMenu connected={connected} onCreate={api.createGame} onJoin={api.joinGame} />
      </>
    );
  }
  if (!state) return <Centered>Loading…</Centered>;
  if (state.phase === "lobby") {
    return (
      <>
        {banner}
        <Lobby
          state={state}
          myMemberId={myMemberId}
          onSetReady={api.setReady}
          onArrange={api.arrange}
          onShuffleTeams={api.shuffleTeams}
          onShuffleOrder={api.shuffleOrder}
          onStart={api.startGame}
          onLeave={leave}
        />
      </>
    );
  }

  // ---- Game view (phase === "playing") ----
  const roster = state.roster;
  const byId: Record<string, RosterEntry> = Object.fromEntries(roster.map((r) => [r.seatId, r]));
  const mySeatId = roster.find((r) => r.memberId === myMemberId)?.seatId ?? "";
  const seatIds = roster.map((r) => r.seatId);
  const myIdx = seatIds.indexOf(mySeatId);
  const rotated = myIdx >= 0 ? [...seatIds.slice(myIdx), ...seatIds.slice(0, myIdx)] : seatIds;

  const myTeam = byId[mySeatId]?.team;
  const topPlayers = [rotated[4], rotated[3], rotated[2]];
  const sidePlayers = [rotated[1], rotated[5]];
  const leftTeammateId = rotated[2];
  const rightTeammateId = rotated[4];
  const amHost = state.hostId === myMemberId;
  const isMyTurn = state.currentTurn === mySeatId && !state.paused;

  const nameOf = (sid: string) => byId[sid]?.username ?? sid;
  const teamOf = (sid: string) => byId[sid]?.team ?? "blue";
  const countOf = (sid: string) => byId[sid]?.count ?? 0;

  const handleCardClick = (cardValue: string) => {
    setSelectedCard(cardValue);
    for (const [key, cardsInSet] of sets.entries()) {
      if (cardsInSet.includes(cardValue)) {
        setSelectedSet(key);
        break;
      }
    }
  };

  const clearAsk = () => {
    setSelectedOverlayCard(null);
    setSelectedSet(null);
    setSelectedCard(null);
  };

  const handleAsk = () => {
    if (!selectedOverlayCard || !selectedTargetId) {
      alert("Select a player and a card first.");
      return;
    }
    if (state.paused) {
      alert("The game is paused — waiting for players to reconnect.");
      return;
    }
    if (!isMyTurn) {
      alert("It isn't your turn.");
      return;
    }
    if (localHand.some((c) => formatTextObjectToString(c) === selectedOverlayCard)) {
      alert("You can't ask for a card you already hold.");
      clearAsk();
      return;
    }
    api.ask(selectedOverlayCard, selectedTargetId);
    clearAsk();
  };

  const renderSeat = (sid: string, position: "top" | "left" | "right") => (
    <OpponentHand
      key={sid}
      playerId={sid}
      displayName={nameOf(sid)}
      cardCount={countOf(sid)}
      position={position}
      teamColor={teamOf(sid)}
      isCurrentTurn={state.currentTurn === sid}
      selectedTargetId={selectedTargetId}
      setSelectedTargetId={setSelectedTargetId}
      isOpponent={teamOf(sid) !== myTeam}
      askState={lastAsk}
    />
  );

  const disconnectedNames = roster.filter((r) => !r.connected).map((r) => r.username);

  return (
    <div className="App">
      {banner}
      <Settings deckType={deckType} toggleDeck={toggleDeck} onLeave={leave} />

      <div className="table-layout">
        <div className="top-players">{topPlayers.map((sid) => renderSeat(sid, "top"))}</div>

        <div className="middle-row">
          {renderSeat(sidePlayers[0], "left")}
          <DeclarationPile
            decCount={state.declarations.blueDeclarations.length}
            decSets={state.declarations.blueDeclarations}
            teamColor="blue"
          />
          <Declare
            deckType={deckType}
            selectedOverlayCard={selectedOverlayCard}
            setSelectedOverlayCard={setSelectedOverlayCard}
            onDeclare={api.declareCheck}
            prevDeclarations={state.declarations.blueDeclarations.concat(
              state.declarations.redDeclarations
            )}
            mySeatId={mySeatId}
            leftTeammateId={leftTeammateId}
            rightTeammateId={rightTeammateId}
          />
          <DeclarationPile
            decCount={state.declarations.redDeclarations.length}
            decSets={state.declarations.redDeclarations}
            teamColor="red"
          />
          {renderSeat(sidePlayers[1], "right")}
        </div>

        <div className="current-player-hand">
          <CardHand
            Cards={localHand.map((card) => ({
              deckType,
              faceUp: true,
              value: formatTextObjectToString(card),
            }))}
            deckType={deckType}
            faceUp={true}
            onCardClick={handleCardClick}
            selectedCardValue={selectedCard}
            onReorder={(newCardProps) => {
              const reordered = newCardProps.map(
                (cp) => localHand.find((c) => formatTextObjectToString(c) === cp.value)!
              );
              setLocalHand(reordered);
            }}
          />
          <div className={`player-username ${myTeam} ${isMyTurn ? "active-turn" : ""}`}>
            {nameOf(mySeatId)}
          </div>
          {lastAsk?.from === mySeatId && (
            <div className="speech-bubble ask">{formatTextStringToSymbol(lastAsk.card)}</div>
          )}
        </div>
      </div>

      {selectedSet && (
        <div className="overlay">
          <CardGrid
            Set={selectedSet}
            deckType={deckType}
            selectedOverlayCard={selectedOverlayCard}
            setSelectedOverlayCard={setSelectedOverlayCard}
            cardCycle={false}
            colorIndices={[]}
            updateColorIndex={() => {}}
          />
          {selectedOverlayCard ? (
            <button className="ask-button" onClick={handleAsk}>
              Ask
            </button>
          ) : (
            <button className="close-button" onClick={clearAsk}>
              Close
            </button>
          )}
        </div>
      )}

      {state.paused && !state.gameOver && (
        <div className="overlay" style={{ zIndex: 1800, flexDirection: "column", gap: "1rem" }}>
          <div style={{ background: "rgba(0,0,0,0.8)", color: "white", padding: "2rem", borderRadius: "12px", textAlign: "center" }}>
            <h2 style={{ marginTop: 0 }}>Game paused</h2>
            <p>Waiting for {disconnectedNames.join(", ") || "a player"} to reconnect…</p>
            {amHost && <button onClick={api.endGame}>End game &amp; return to lobby</button>}
          </div>
        </div>
      )}

      {state.gameOver && state.winner && (
        <WinScreen
          winner={state.winner}
          scores={state.scores}
          isHost={amHost}
          onNewGame={api.newGame}
          onLeave={leave}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
      {children}
    </div>
  );
}

function Banner({
  error,
  notice,
  onClearError,
  onClearNotice,
}: {
  error: string | null;
  notice: string | null;
  onClearError: () => void;
  onClearNotice: () => void;
}) {
  if (!error && !notice) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 3000 }}>
      {error && (
        <div
          onClick={onClearError}
          style={{ background: "#c0392b", color: "white", padding: "0.6rem 1rem", cursor: "pointer", textAlign: "center" }}
        >
          {error} <span style={{ opacity: 0.7 }}>(dismiss)</span>
        </div>
      )}
      {notice && (
        <div
          onClick={onClearNotice}
          style={{ background: "#2c3e50", color: "white", padding: "0.6rem 1rem", cursor: "pointer", textAlign: "center" }}
        >
          {notice} <span style={{ opacity: 0.7 }}>(dismiss)</span>
        </div>
      )}
    </div>
  );
}

export default App;
