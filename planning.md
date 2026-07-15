# Declaration Web Game Planning

> This is the product spec plus a snapshot of where the build actually stands.
> Status tags reflect the current code: **[done]**, **[partial]**, **[not started]**.
> See `TODOS.md` for the granular task checklist.

## Minimum Viable Product

### Working Rules of Declaration
- **[done]** Hands for each player, dealing random cards (`gameManager.ts:dealCards`)
- **[partial]** Making asks — the flow works end-to-end, but the server does **not** validate
  legality (that you hold a card in the set, that the target is an opponent, or that it's your turn)
  - **[done]** Show whether the ask worked (result speech bubble)
  - **[partial]** Display the previous ask — bubbles show it on top/bottom seats; no persistent history panel
- **[partial]** Making declarations — two-phase declare works and updates team counts, but the
  server logic leans on client-supplied set strings + fragile seat math, and declared cards aren't
  yet pulled into a pile
- **[not started]** Scoring and ending the game at 5 points — teams only accumulate string arrays;
  there is no numeric score and no game-over
- **[not started]** Turn indicator — there is no turn concept anywhere (server or client)
- **[done]** Number of cards in each hand (`OpponentHand`)
- **[done]** Team colors
- **[not started]** Deciding who starts (random/chosen)
- **[not started]** Deciding who goes when a player runs out of cards (leftmost active player)

### Lobbies — **[not started]** (largest remaining gap)
- 6 users can join a lobby
- Joining a lobby via code/url
- Lobby owner can arrange the order of players/teams

> Today there is **no lobby**: one global game is created when the server boots, over a hardcoded
> 6-player roster, and each client picks its identity via a browser `prompt()` stored in
> `localStorage`. Two browsers can both claim `player1`. Real multiplayer needs per-connection
> identity, rooms, and a join flow before lobbies are meaningful.

### UI
- **[not started]** Main menu
- **[done]** Game screen — full 6-seat table with card sprites (not text/ascii)
- **[partial]** Usernames — shown per seat, but entered via `prompt()`, not a real name flow
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

## Known gaps & risks (from code review)
- A bad declaration `throw`s in `handleDeclareCheck` and **crashes the shared server** (no try/catch
  around the WS handler)
- `removeSetFromAllHands` splices an array while iterating it
- Client derives the declaring player by string-slicing a result message — brittle
- Dead weight: unused `socket.io`/`socket.io-client` deps and an orphaned `server/index.js`; a stray
  empty `declaration-online/package.json` scaffold
- `GameManager` has no tests; CI builds only the client (server is never installed/tested/linted)

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
