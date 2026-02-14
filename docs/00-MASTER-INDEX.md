# THE GALACTIC ORDER - System Design Document Index

## Project Codename: TGO
## Version: 0.1 (Initial Architecture)
## Date: 2026-02-14

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

| # | Document | Description | Status |
|---|----------|-------------|--------|
| 00 | **MASTER-INDEX** (this file) | Overview, philosophy, document map | DONE |
| 01 | **Core Vision & Universe Engine** | The "what" and "why" - game concept, universe structure, how cellular automata become a playable world | DONE |
| 02 | **Fractal Foundation & Procedural Generation** | The math - how 1D rules become 3D terrain, biome generation, star system seeding, deterministic universe | DONE |
| 03 | **Game Mechanics & Quest System** | Gameplay loops, progression, resource gathering, crafting, the tutorial quest line, exploration mechanics | DONE |
| 04 | **AI Integration (Gemini API)** | How Gemini powers NPCs, adaptive quests, the Mysterious Being encounter, per-player unique experiences | DONE |
| 05 | **Multiplayer & Networking** | WebSocket architecture, player sync, shared universe state, instancing, lobby system | DONE |
| 06 | **Terminal System & Code-Breaking** | The core puzzle mechanic - the locked terminal, cipher fragments, the code-breaking minigame, progression gates | DONE |
| 07 | **Frontend & Rendering (Three.js/WebGL)** | 3D rendering pipeline, planet LOD system, shader architecture, UI/HUD design, the in-game tablet | DONE |
| 08 | **Database & Player State** | Data models, player accounts, save system, universe persistence, API key storage (encrypted) | DONE |
| 09 | **Project Structure & Tech Stack** | Directory layout, dependencies, build system, dev environment setup, deployment | DONE |
| 10 | **Development Phases & Roadmap** | Phase-by-phase build order, MVP definition, milestones, what to build first | DONE |

---

## Key Design Decisions (Summary)

### Platform
- **Web-based** (browser game, no install required)
- **Desktop-first** with eventual mobile consideration

### Tech Stack
- **Frontend**: Three.js (WebGL), HTML5 Canvas, vanilla JS or lightweight framework
- **Backend**: Node.js + Express + Socket.io
- **Database**: SQLite (dev) / PostgreSQL (prod)
- **AI**: Google Gemini API (player-provided keys)
- **Audio**: Web Audio API + Tone.js

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
- **Player-owned API keys** (no server cost for AI)
- **In-lore introduction**: Players don't enter a key at signup - they encounter a "Mysterious Being" in-game who requests it
- **Uses**: NPC dialogue, adaptive quests, terminal puzzle hints, unique lore generation

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

---

## Contributors

- **Architect**: Claude (Opus 4.6) - System design, rigor, code
- **Explorer**: Gemini - Vision, concepts, creative direction
- **Director**: Dudu - The one who asked "what if?" and made two AIs work together
