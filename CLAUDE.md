# Declaration Online

## Project Context

**Stack:** TypeScript throughout. Client: React 18 + Vite (SWC). Server: Node.js + Express + WebSockets (`ws`). Client tested with Vitest, server with Jest.
**Purpose:** An online, real-time multiplayer version of Declaration (aka Literature / Fish) — a 6-player, two-team card game where players complete sets through asks and declarations. Built by and for friends, re-creating a game learned at summer camp.
**Key dependencies:** `react` / `react-dom`, `vite` + `@vitejs/plugin-react-swc` (client); `express`, `ws`, `socket.io`, `cors`, `nodemon` + `ts-node` (server); `@fontsource/cinzel` fonts.
**Team:** @Nqchoz (repo owner), @londonwafflez, @susheepx, @jlyukim

## Structure

All application code lives under `declaration-online/`:

- `declaration-online/client/` — Vite + React frontend. Components in `src/Components/`, shared types in `src/Types/`, card art in `public/Decks/`.
- `declaration-online/server/` — Express + WebSocket backend. Game rules in `gameManager.ts`, deck/card model in `deck.ts`, entry point `index.ts` (runs on port `3001`).

## KPIs

<!-- Real-time game targets. These are aspirational quality bars, not measured SLAs yet. -->

| Metric | Target | Notes |
|---|---|---|
| Ask/declare round-trip latency | < 150ms | Server → all clients over WebSocket |
| Game state desync rate | 0 | All 6 clients must agree on turn, hands, and score |
| Unhandled server crashes | 0 | A crash drops the whole lobby |
| Client build | passes on Node 18/20/22 | Enforced by `.github/workflows/node.js.yml` |

## Conventions

- **Language:** TypeScript everywhere. Prefer explicit types on shared boundaries (WebSocket messages, REST responses, the `Card` model).
- **Card model:** A `Card` is a discriminated union (`server/deck.ts`, `client/src/Types/Card.ts`): either `{ suit, rank }` or `{ type: "Joker"; color }`. Suits and ranks are lowercase string literals (`"hearts"`, `"ace"`, `"10"`, `"king"`).
- **Card naming:** Asset files and wire strings use `{rank}_of_{suit}` (e.g. `7_of_hearts`, `jack_of_clubs`); jokers are `black_joker` / `red_joker`. `parseCardName` in `gameManager.ts` is the canonical parser.
- **Teams:** Two teams referred to as red and blue (see `redDeclarations` / `blueDeclarations`).
- **Tests:** Vitest on the client (`npm test` in `client/`), Jest on the server (`npm test` in `server/`). Keep tests next to source as `*.test.ts`.
- **Running locally:** client `npm run dev` (Vite), server `npm start` (nodemon on `index.ts`).

---

## Adapting This Template

> These instructions are permanent — do not remove them. They tell Claude how to configure a new project from this template.

When asked to set up a new project from this template:

1. Ask the user: **what type of project is this?** (TypeScript/Node web app, Python AI agent, other?)
2. Replace `.gitignore` with a stack-appropriate version. For Node: include `node_modules/`, `dist/`, `.next/`. For Python: include `__pycache__/`, `.venv/`, `*.pyc`, `dist/`.
3. Update `.github/CODEOWNERS` with the actual GitHub usernames of the dev team.
4. Fill in the **Project Context** and **KPIs** sections above with what the user provides.
