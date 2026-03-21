# THE GALACTIC ORDER - System Design Document Index

## Project Codename: TGO
## Version: 0.5 (Updated March 2026)
## Date: 2026-03-21

---

## What Is This?

"The Galactic Order" is a web-based space exploration game inspired by No Man's Sky, built on a foundation of cellular automata and fractal mathematics. The universe isn't randomly generated - it's grown from simple rules, the same way the real universe might be.

Players explore procedurally generated star systems, planets, and biomes that emerge from Wolfram-class cellular automata rules. The game integrates Google's Gemini AI to create unique, personalized experiences - NPCs that remember you, quests that adapt, and a terminal system where players must crack codes to unlock deeper layers of the game.

---

## The Philosophy

From the Gemini/Claude conversation that birthed this project:

> "The constraint IS the code. The code IS the constraint."

> "The 'source code' of a universe isn't data. It's the constraint that shapes what data can become."

Every planet, every creature, every star system in The Galactic Order grows from a simple rule applied repeatedly. Rule 30 creates chaos. Rule 90 creates fractals. Rule 110 creates computation. Our game uses ALL of these to build a universe that feels alive, because at a mathematical level, it IS alive.

---

## Document Map

Each part of this design is a separate document. Together they form the complete blueprint.

| # | Document | Description | Status | Implementation |
|---|----------|-------------|--------|----------------|
| 00 | **MASTER-INDEX** (this file) | Overview, philosophy, document map | DONE | N/A |
| 01 | **Core Vision & Universe Engine** | The "what" and "why" - game concept, universe structure, how cellular automata become a playable world | DONE | ~80% (core vision implemented, AI/multiplayer planned) |
| 02 | **Fractal Foundation & Procedural Generation** | The math - how 1D rules become 3D terrain, biome generation, star system seeding, deterministic universe | DONE | ~90% (generation fully works, uses superformula instead of L-systems) |
| 03 | **Game Mechanics & Quest System** | Gameplay loops, progression, resource gathering, crafting, the tutorial quest line, exploration mechanics | DONE | ~30% (movement, mining, inventory work; quests/crafting/terminal NOT built) |
| 04 | **AI Integration (Gemini API)** | How Gemini powers NPCs, adaptive quests, the Mysterious Being encounter, per-player unique experiences | DONE | ~5% (scaffolding only - NPC mesh + dialogue UI exist, no Gemini API calls) |
| 05 | **Multiplayer & Networking** | WebSocket architecture, player sync, shared universe state, instancing, lobby system | DONE | 0% (server is static file only, no multiplayer) |
| 06 | **Terminal System & Code-Breaking** | The core puzzle mechanic - the locked terminal, cipher fragments, the code-breaking minigame, progression gates | DONE | 0% (terminal system not implemented) |
| 07 | **Frontend & Rendering (Three.js/WebGL)** | 3D rendering pipeline, planet LOD system, shader architecture, UI/HUD design, the in-game tablet | DONE | ~95% (rendering FAR exceeds doc - 25+ passes implemented) |
| 08 | **Database & Player State** | Data models, player accounts, save system, universe persistence, API key storage (encrypted) | DONE | 0% (no database layer) |
| 09 | **Project Structure & Tech Stack** | Directory layout, dependencies, build system, dev environment setup, deployment | DONE | ~50% (client structure matches, server structure doesn't exist) |
| 10 | **Development Phases & Roadmap** | Phase-by-phase build order, MVP definition, milestones, what to build first | DONE | Phases 0-2 complete, Phase 3 partial |
| 11 | **Living Economy & Infrastructure** | Self-coding AI pipeline, Oracle Cloud hosting, distributed GPU compute, $GALACTIC token, player reward system | DRAFT | 0% (design only) |

---

## Key Design Decisions (Summary)

### Platform
- **Web-based** (browser game, no install required)
- **Desktop-first** with eventual mobile consideration

### Tech Stack
- **Frontend**: Three.js (WebGL 2.0 + WebGPU), vanilla JS ES modules (no framework, no bundler)
- **Backend**: Node.js on Oracle Cloud Free Tier (ARM Ampere, 4 cores, 24GB RAM)
- **Database**: Oracle Autonomous DB (free tier) — player accounts, world state, economy
- **AI**: Claude API for server-side content generation + WebLLM for in-browser NPC dialogue
- **Compute**: WebGPU distributed AI inference network (player GPUs earn revenue)
- **Blockchain**: $GALACTIC token on Base or Solana L2 (for player rewards/cash-out)
- **Audio**: Not yet implemented (Web Audio API planned)

### Universe Generation
- **Seed**: Cellular automata rules (Wolfram elementary automata as foundation)
- **Terrain**: Multi-octave noise derived from CA rule outputs
- **Deterministic**: Same seed = same universe for all players (multiplayer requirement)
- **Layered**: 1D rules -> 2D heightmaps -> 3D mesh generation

### Multiplayer Model
- **Hybrid**: Single-player by default, opt-in multiplayer
- **Architecture**: Authoritative server, client-side prediction
- **Sync**: WebSocket for real-time, REST for persistence

### AI Integration
- **Server-side**: Claude API agents generate new content continuously (quests, creatures, mechanics)
- **Client-side**: WebLLM for NPC dialogue (zero server cost, runs on player GPU)
- **Self-coding**: AI-generated code passes automated tests → hot-deployed to live game
- **Evolutionary**: Player engagement metrics drive selection of best AI-generated content

### Economy & Rewards
- **Revenue source**: Distributed AI compute network (player GPUs run inference jobs for paying businesses)
- **Token**: $GALACTIC on Base/Solana L2
- **Zero developer cost**: All revenue from organic sources (GPU compute, cosmetics, API licensing)
- **Player earnings**: GPU contribution (60%), task completion (25%), dev fund (10%), infra (5%)
- **Opt-in everything**: GPU compute, wallet connection, ads are always optional

---

## The Fractal Files (Origin)

These files started the project. They were generated during a conversation exploring whether the universe has "source code":

```
C:\Users\Dudu\rule30.py          - Rule 30: Chaos from a single dot
C:\Users\Dudu\universe_rules.py  - Comparing Rules 0, 30, 90, 110
C:\Users\Dudu\explore_rules.py   - Rules 105, 73, 150, 169
C:\Users\Dudu\run_rule.py        - Run any rule 0-255 from command line
```

These will be ported to JavaScript and extended to 2D/3D for the game engine.

---

## How To Read These Documents

1. Start with **Part 01** (Core Vision) to understand WHAT we're building
2. Read **Part 02** (Fractal Foundation) to understand HOW the universe is generated
3. Read **Part 03** (Game Mechanics) to understand the GAMEPLAY
4. Parts 04-08 are technical deep-dives into specific systems
5. **Part 09** (Project Structure) tells you where every file goes
6. **Part 10** (Roadmap) tells you what to build FIRST
7. **Part 11** (Living Economy) describes the self-sustaining economy and infrastructure

---

## Contributors

- **Architect**: Claude (Opus 4.6) - System design + implementation
- **Explorer**: Gemini - Vision, concepts, creative direction
- **Director**: Dudu - The one who asked "what if?" and made two AIs work together
