# TODOs for Declaration Web Game

> Status legend: `[x]` done · `[~]` partially done / has known gaps · `[ ]` not started
>
> Refreshed to match the actual code (server, client, tests, CI). The previous
> version's checkboxes were stale — deck, asks, declarations, the WebSocket server,
> and the React table UI are all already built.

## ⚠️ Unreleased breaking change — ship server + client together

The server engine is now **authoritative and strictly enforcing**, and the `declareCheck`
wire contract changed to `{ playerId, setId, assignments }` (was `{ targetIds,
cardsLeftPlayerCheck, cardsRightPlayerCheck, set }`). **The deployed client is broken
against this server** until the migration below lands: out-of-turn asks are rejected, the
declare flow still sends the old shape, and team attribution parses a result message that
no longer contains the expected comma.

**Do not promote the server to `staging`/`main` on its own** — release the server engine and
the client migration in the same PR (or gate one behind the other). Note this in the PR body
as a known temporary breakage.

Client migration (required to un-break the app — `client/src/App.tsx`, `Declare.tsx`):
- [ ] Respect `currentTurn` from broadcasts — disable Ask when it isn't your turn
- [ ] Send the new `declareCheck` shape (`playerId`, `setId`, `assignments`); the declarer id is now required
- [ ] Read `winningTeam` / `gameOver` / `winner` from results instead of parsing the result message; add a win/end screen

## Phase 0: Setup & Planning

- [x] Write planning documents (`README.md`, `rules.md`, `planning.md`, `TODOS.md`)
- [x] Set up Git repository
- [x] Initialize project structure (`client/` frontend, `server/` backend)
- [x] Install base dependencies (`express`, `ws`, React, Vite, etc.)
- [~] Dev workflow — client `npm run dev` (Vite) + server `npm start` (nodemon) work; no ESLint/lint step yet

## Phase 1: Core Game Engine (server)

Goal: A correct, rule-enforcing game on the server.

- [x] Card deck generator (54 cards: 52 + 2 jokers) — `deck.ts`
- [x] Shuffle and deal logic (9 cards × 6 players) — `deck.ts`, `gameManager.ts:dealCards`
- [x] Represent player hands on server — `gameManager.hands`
- [~] Ask logic — `handleAsk` transfers a card on the happy path only
- [ ] **Ask validation** — enforce: asker holds a card in the set, target is an opponent, it's the asker's turn, hands exist (unknown `targetId` currently throws)
- [~] Declaration logic — `handleDeclareCheck` works but relies on client-supplied set strings and fragile seat-parity/teammate math
- [ ] **Turn system** — no current-player/turn concept exists; success keeps turn, failure passes turn to the asked player
- [ ] **Scoring** — replace the string arrays with real per-team scores
- [ ] **Win condition** — end the game at 5 sets (none today)
- [ ] **Empty-hand handling** — skip players with no cards; pass turn to next active player
- [ ] Model the 9 sets and 2 teams server-side (currently inferred from client strings + index parity)

## Phase 2: Card Sprites & Frontend Skeleton

Goal: Visualize cards and game state. **Largely complete.**

- [x] Card assets (two themes: `RegularCards`, `HighContrastPlayingCards`) under `public/Decks/`
- [x] Display local player's hand in browser (`CardHand`)
- [x] Show opponent card counts (`OpponentHand`)
- [x] Render cards as image sprites (`Card.tsx`)
- [x] Visual layout of 6 players around a table (`App.tsx`, `TableLayout.css`)
- [x] High-contrast deck option (Settings toggle)
- [x] Hover/select interaction + drag-to-reorder hand (`@dnd-kit`)

## Phase 3: Multiplayer & Lobby System

Goal: Real-time multiplayer with real per-client identity. **Not started — the largest remaining area.**

- [x] WebSocket server (`ws`) — `index.ts`
- [x] Broadcast asks and results to all clients — `broadcast()`
- [ ] **Per-connection identity** — sockets are anonymous and clients self-assert `playerId`; two browsers can both be `player1`
- [ ] Lobby system
  - [ ] Generate lobby code
  - [ ] Join via code
  - [ ] Assign unique IDs / names (currently a browser `prompt()` + `localStorage`)
  - [ ] Track readiness and team assignment (owner-arranged)
- [ ] Support more than one concurrent game (one global game is created at server boot)
- [ ] Handle disconnection and room cleanup (on close, socket is only removed from a set)
- [ ] Start game only when 6 players are ready

## Phase 4: UI & Game Interaction Polish

Goal: Complete the interactive game screen.

- [ ] Main menu (create lobby / join lobby / enter name)
- [~] In-game screen
  - [x] Display all 6 players
  - [ ] Highlight current player (no turn indicator exists)
  - [x] Team color indicators
  - [x] Number of cards per player
  - [x] Ask controls (card → set overlay → click target)
  - [x] Declare controls (two-phase set/teammate assignment)
  - [~] Feedback area — ask/result speech bubbles work for top/bottom seats; **side seats mis-oriented/mis-placed**
  - [ ] Game log / ask-history area
- [ ] Win / end-of-game screen
- [ ] Finish declare flow: take declared cards from hands + build the visual declaration pile from real cards (`Declare.tsx:111-112`)
- [ ] Side-player styling (rotation + speech-bubble variants) — latest commit's open item

## Robustness & Cleanup (newly identified)

- [x] Wrap WS handlers in try/catch — a bad declaration no longer crashes the shared server
- [x] Fix `removeSetFromAllHands` splicing an array while iterating it (now a filter)
- [x] Guard engine handlers against malformed input so they never throw (non-string card, non-object assignments)
- [x] Prevent an already-declared set from being re-declared and re-scored (`claimedSets`)
- [x] Fix the server `"Reseived message:"` log typo
- [ ] Replace brittle client parse of the declarer from a result message string
- [ ] Remove client debug artifacts: red placeholder `<div>` in `OpponentHand`, stray `console.log`s, commented-out test code
- [ ] De-hardcode `localhost:3001` and duplicated seat/team arrays on the client
- [ ] Remove dead dependencies: `socket.io` / `socket.io-client` (real stack is native `ws`) and orphaned `server/index.js`
- [ ] Resolve the stray scaffold `declaration-online/package.json` (empty Vite/Vitest project, no `src/`)

## Testing & Deployment

- [x] Deck unit tests — `deck.test.ts`, 6 jest tests pass (one shuffle test self-noted flaky)
- [x] **Tests for `GameManager`** — engine covered (`gameManager.test.ts`): dealing, teams, ask success/miss, all ask rejections, teammate handoff + opponent fallback, declaration success/failure/validation, re-declare guard, malformed input, win-at-5
- [ ] Client test tooling + tests (Vitest referenced but not installed/used in `client/`)
- [ ] CI: install/type-check/test the **server** (CI currently builds the client only)
- [ ] CI: add a test run and a lint step
- [ ] Local multi-player test script / documented multi-tab manual test
- [ ] Deployment pipeline (Heroku/Vercel/Fly.io/etc.)
- [ ] HTTPS + secure WebSocket (`wss`)
- [ ] Basic monitoring/logs

## Phase 5: Extras & Enhancements (Post-MVP)

- [ ] Random team generation
- [ ] Training mode (scripted AI/demo)
- [ ] CPU bots (basic logic, memory-limited)
- [ ] Match export to `.txt` / `.json`
- [ ] Elo rating system
- [ ] Spectator support (view-only)
- [ ] Responsive/mobile-friendly layout
- [ ] Chat system in lobby/game
- [ ] Reconnection flow for disconnected players
- [ ] Match history viewer
- [ ] Tournament support (brackets, scores)
