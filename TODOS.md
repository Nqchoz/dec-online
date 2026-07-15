# TODOs for Declaration Web Game

> Status legend: `[x]` done · `[~]` partially done / has known gaps · `[ ]` not started
>
> Refreshed to match the actual code (server, client, tests, CI). The previous
> version's checkboxes were stale — deck, asks, declarations, the WebSocket server,
> and the React table UI are all already built.

## Tier 2 — real multiplayer (server + client shipped together)

The Tier 1 engine break has been resolved: the client was migrated to the new realtime
protocol (room-based, server-owned identity, WS-push state). Server and client are now in
sync — no standalone-promotion hazard. What landed:
- [x] Room registry + join-by-code lobby; server assigns seats/teams (`server/rooms.ts`)
- [x] Per-connection identity (socket bound to `{gameId, seatId}`; spoofed seats rejected)
- [x] WS-push state (public `state` + private `hand`); REST polling removed
- [x] Client respects `currentTurn` (Ask gated + turn indicator)
- [x] Client sends `{ playerId/seat, setId, assignments }` for declarations (incl. self cards)
- [x] Client reads `winningTeam`/`gameOver`/`winner` directly; win screen added

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

Goal: Real-time multiplayer with real per-client identity. **MVP done.**

- [x] WebSocket server (`ws`) — `index.ts`
- [x] Broadcast state/results, scoped per room
- [x] **Per-connection identity** — socket bound to `{gameId, seatId}`; spoofed seats rejected
- [x] Lobby system (MVP)
  - [x] Generate lobby code
  - [x] Join via code
  - [x] Assign seats/usernames (username entry replaces the `prompt()`)
  - [~] Team assignment — auto-assigned by seat parity; owner-arranged order/teams still TODO
  - [ ] Ready toggles (full-lobby upgrade)
- [x] Support more than one concurrent game (room registry)
- [x] Handle disconnection and room cleanup (empty lobbies deleted)
- [x] Start game only when 6 players are present (host-initiated)
- [ ] Reconnection-resume of a dropped player (out of scope for MVP)

## Phase 4: UI & Game Interaction Polish

Goal: Complete the interactive game screen.

- [x] Main menu (create / join by code / enter username)
- [~] In-game screen
  - [x] Display all 6 players (roster-driven)
  - [x] Highlight current player (green turn indicator)
  - [x] Team color indicators
  - [x] Number of cards per player
  - [x] Ask controls (card → set overlay → click target; gated on your turn)
  - [x] Declare controls (two-phase set/teammate assignment)
  - [~] Feedback area — ask/result speech bubbles + declare notice; **side seats still mis-oriented**
  - [ ] Game log / ask-history area
- [x] Win / end-of-game screen (host can start a new game)
- [~] Declare flow: cards are removed from hands server-side and piles show the set; a richer pile-from-real-cards animation is still open
- [ ] Side-player styling (rotation + speech-bubble variants)

## Robustness & Cleanup (newly identified)

- [x] Wrap WS handlers in try/catch — a bad declaration no longer crashes the shared server
- [x] Fix `removeSetFromAllHands` splicing an array while iterating it (now a filter)
- [x] Guard engine handlers against malformed input so they never throw (non-string card, non-object assignments)
- [x] Prevent an already-declared set from being re-declared and re-scored (`claimedSets`)
- [x] Fix the server `"Reseived message:"` log typo
- [x] Replace brittle client parse of the declarer — client reads `winningTeam`/`setCard` directly
- [x] Remove client debug artifacts in `OpponentHand` (red placeholder div, commented test code)
- [x] De-hardcode `localhost:3001` — client reads `VITE_WS_URL` (`.env.example` added); seats/teams now roster-driven
- [x] Remove dead dependencies (`socket.io` / `socket.io-client`) and orphaned `server/index.js`
- [x] Delete the stray scaffold `declaration-online/package.json` (empty Vite/Vitest project)

## Testing & Deployment

- [x] Deck unit tests — `deck.test.ts`, 6 jest tests pass (one shuffle test self-noted flaky)
- [x] **Tests for `GameManager`** — engine covered (`gameManager.test.ts`): dealing, teams, ask success/miss, all ask rejections, teammate handoff + opponent fallback, declaration success/failure/validation, re-declare guard, malformed input, win-at-5
- [x] Tests for `rooms.ts` — `rooms.test.ts` (seat/team assignment, join rejections, host+6 start, identity binding, disconnect cleanup)
- [ ] Client test tooling + tests (no Vitest wired in `client/`)
- [x] CI: install + type-check + test the **server** (separate `server` job in `node.js.yml`)
- [ ] CI: add a lint step (no ESLint configured yet)
- [ ] Local multi-player test script / documented multi-tab manual test
- [ ] Deployment pipeline (Heroku/Vercel/Fly.io/etc.)
- [~] HTTPS + secure WebSocket — client supports `wss://` via `VITE_WS_URL`; server TLS/deploy still TODO
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
