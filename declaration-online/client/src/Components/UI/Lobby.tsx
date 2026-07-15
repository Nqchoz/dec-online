import type { ServerState, RosterEntry } from "../../net/useGameSocket";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface LobbyProps {
  state: ServerState;
  myMemberId: string;
  onSetReady: (ready: boolean) => void;
  onArrange: (order: string[]) => void;
  onShuffleTeams: () => void;
  onShuffleOrder: () => void;
  onStart: () => void;
  onLeave: () => void;
}

function rowStyle(entry: RosterEntry): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.5rem 0.7rem",
    borderRadius: "6px",
    background: entry.team === "blue" ? "#93E3E6" : "#F7B0B0",
    color: "#222",
  };
}

function RowContent({
  entry,
  hostId,
  myMemberId,
}: {
  entry: RosterEntry;
  hostId: string;
  myMemberId: string;
}) {
  return (
    <>
      <span
        title={entry.connected ? "connected" : "disconnected"}
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: entry.connected ? "#2ecc71" : "#c0392b",
          display: "inline-block",
          flex: "0 0 auto",
        }}
      />
      <span style={{ fontWeight: 600 }}>{entry.username}</span>
      {entry.memberId === hostId && <span title="Host">👑</span>}
      {entry.memberId === myMemberId && <span style={{ opacity: 0.7 }}>(you)</span>}
      <span style={{ marginLeft: "auto", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <span style={{ textTransform: "capitalize" }}>{entry.team}</span>
        <span title={entry.ready ? "ready" : "not ready"}>
          {entry.memberId === hostId ? "★" : entry.ready ? "✅" : "⬜"}
        </span>
      </span>
    </>
  );
}

function SortableSeat({
  entry,
  hostId,
  myMemberId,
}: {
  entry: RosterEntry;
  hostId: string;
  myMemberId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.memberId,
  });
  const style: React.CSSProperties = {
    ...rowStyle(entry),
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: "grab",
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <RowContent entry={entry} hostId={hostId} myMemberId={myMemberId} />
    </li>
  );
}

export default function Lobby({
  state,
  myMemberId,
  onSetReady,
  onArrange,
  onShuffleTeams,
  onShuffleOrder,
  onStart,
  onLeave,
}: LobbyProps) {
  const amHost = state.hostId === myMemberId;
  const me = state.roster.find((r) => r.memberId === myMemberId);
  const full = state.roster.length === 6;
  const allReady = state.roster
    .filter((r) => r.memberId !== state.hostId)
    .every((r) => r.ready);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = state.roster.map((r) => r.memberId);
    const from = ids.indexOf(active.id as string);
    const to = ids.indexOf(over.id as string);
    if (from < 0 || to < 0) return;
    onArrange(arrayMove(ids, from, to));
  };

  const panel: React.CSSProperties = {
    background: "rgba(0,0,0,0.55)",
    color: "white",
    padding: "2rem",
    borderRadius: "12px",
    minWidth: "360px",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "center", flexDirection: "column",
    }}>
      <div style={panel}>
        <h2 style={{ margin: 0 }}>
          Room code:{" "}
          <span style={{ fontFamily: "monospace", letterSpacing: "2px" }}>{state.gameId}</span>
        </h2>
        <p style={{ margin: 0, opacity: 0.8 }}>
          {full ? "Full table." : `Waiting for players (${state.roster.length}/6).`}{" "}
          {amHost ? "Drag to reorder seats (teams alternate)." : ""}
        </p>

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {amHost ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext
                items={state.roster.map((r) => r.memberId)}
                strategy={verticalListSortingStrategy}
              >
                {state.roster.map((entry) => (
                  <SortableSeat key={entry.memberId} entry={entry} hostId={state.hostId} myMemberId={myMemberId} />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            state.roster.map((entry) => (
              <li key={entry.memberId} style={rowStyle(entry)}>
                <RowContent entry={entry} hostId={state.hostId} myMemberId={myMemberId} />
              </li>
            ))
          )}
        </ul>

        {amHost ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button onClick={onShuffleTeams}>Shuffle teams</button>
            <button onClick={onShuffleOrder}>Shuffle order</button>
            <button
              onClick={onStart}
              disabled={!full || !allReady}
              style={{ marginLeft: "auto" }}
              title={!full ? "Need 6 players" : !allReady ? "All players must be ready" : ""}
            >
              Start game
            </button>
          </div>
        ) : (
          <button onClick={() => onSetReady(!me?.ready)}>
            {me?.ready ? "Not ready" : "Ready"}
          </button>
        )}

        <button onClick={onLeave} style={{ opacity: 0.8 }}>Leave</button>
      </div>
    </div>
  );
}
