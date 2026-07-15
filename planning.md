# Declaration Web Game Planning

> This is the product spec plus a snapshot of where the build actually stands.
> Status tags reflect the current code: **[done]**, **[partial]**, **[not started]**.
> See `TODOS.md` for the granular task checklist.

## Minimum Viable Product

### Working Rules of Declaration
- **[done]** Hands for each player, dealing random cards (`gameManager.ts:dealCards`)
- **[done]** Making asks — server-authoritative and fully validated (must hold a card in the set,
  target must be an opponent, must be your turn); illegal asks are rejected and surfaced as errors
  - **[done]** Show whether the ask worked (result speech bubble)
  - **[partial]** Display the previous ask — bubbles show it; no persistent history panel yet
- **[done]** Making declarations — server verifies each card against real hands via the
  `{ setId, assignments }` contract; cards are removed from play and the pile/score update
- **[done]** Scoring and ending the game at 5 points — real scores, `gameOver`/`winner`, win screen
- **[done]** Turn indicator — server tracks `currentTurn`; client highlights the active seat
- **[done]** Number of cards in each hand (`OpponentHand`, roster-driven)
- **[done]** Team colors
- **[done]** Deciding who starts (host/seat1 begins)
- **[done]** Deciding who goes when a player runs out of cards (hand off to nearest active teammate)

### Lobbies — **[done]** (MVP)
- **[done]** 6 users join a lobby via a room code
- **[done]** Username entry; server assigns seats + teams (alternating by seat)
- **[not started]** Lobby owner arranging the order of players/teams + ready toggles (full-lobby upgrade)

> Real multiplayer is in place: a room registry (`server/rooms.ts`) keyed by code, per-connection
> identity (socket bound to `{gameId, seatId}`, spoofed seats rejected), WS-push state, and
> disconnect/empty-room cleanup. Reconnection-resume of a dropped player is still out of scope.

### UI
- **[done]** Main menu — create / join by code / enter username
- **[done]** Game screen — full 6-seat table with card sprites (not text/ascii)
- **[done]** Usernames — entered in the menu, shown per seat
- **[done]** Showing how many cards each player has
- **[done]** High-contrast cards (deck theme toggle in Settings)

## Decisions

### How to Illustrate Asks?
- **[done]** Speech bubble showing the card being asked
- Player being asked is indicated by selecting their username box (gold highlight)

### How to Illustrate the Result?
- **[done]** Speech bubble on the ask-ee showing success/fail
- **[known issue]** Bubbles are styled only for top/bottom orientation; the two side seats are
  mis-oriented/mis-placed and still need styling (latest commit's open item)

## Known gaps & remaining work
- Side-seat styling: ask/result speech bubbles are authored for top/bottom orientation only
- No reconnection-resume for a dropped player mid-game; no game log / ask-history panel
- Full-lobby upgrade (host arranges seats/teams, ready toggles) not built
- No client-side test tooling; no ESLint/lint step in CI
- `server/node_modules` is still committed to git (pre-existing hygiene; now gitignored going forward)
- Not yet deployed (server TLS/`wss://`, hosting) — client already reads `VITE_WS_URL`

## Potential Improvements (post-MVP)
- Randomize teams
- Tutorial match with a set script
- "Training wheels mode" displaying previous asks
- Match history → export to text file
- CPU opponents
  - Adjustable difficulties (e.g. move limit, only tracks sets it has seen)
- Match review / self-evaluation
- Elo system
- Skill-based matchmaking
- Tournament support
