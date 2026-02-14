# Part 09: Project Structure & Tech Stack

## THE GALACTIC ORDER - System Design Document
### Directory Layout, Dependencies, Build System, Dev Environment, Deployment

---

## 9.1 Complete Directory Structure

```
the-galactic-order/
│
├── package.json                    # Root package - scripts, dependencies
├── package-lock.json
├── .env                            # Environment variables (NEVER in git)
├── .env.example                    # Template for .env
├── .gitignore
├── knexfile.js                     # Database configuration
├── README.md
│
├── docs/                           # Design documents (these files)
│   ├── 00-MASTER-INDEX.md
│   ├── 01-CORE-VISION-AND-UNIVERSE-ENGINE.md
│   ├── ...
│   └── 10-DEVELOPMENT-PHASES-AND-ROADMAP.md
│
├── server/                         # Backend (Node.js + Express + Socket.io)
│   ├── index.js                    # Entry point - creates HTTP + WebSocket server
│   ├── config.js                   # Loads .env, exports config object
│   │
│   ├── routes/                     # Express REST routes
│   │   ├── auth.js                 # POST /api/auth/register, /login, /logout
│   │   ├── player.js               # GET/PATCH /api/player/profile, gemini-key
│   │   ├── save.js                 # GET/POST/PATCH /api/save
│   │   ├── discoveries.js          # GET/POST /api/discoveries
│   │   └── market.js               # GET/POST /api/market
│   │
│   ├── middleware/                  # Express middleware
│   │   ├── auth.js                 # JWT verification
│   │   ├── validate.js             # Input validation
│   │   └── rateLimit.js            # Rate limiting
│   │
│   ├── socket/                     # WebSocket handlers
│   │   ├── index.js                # Socket.io setup, auth middleware
│   │   ├── movement.js             # Player position sync
│   │   ├── instances.js            # Instance creation/joining/leaving
│   │   ├── chat.js                 # Chat message handling
│   │   ├── actions.js              # Player actions (scan, mine, trade)
│   │   └── discovery.js            # Real-time discovery broadcasts
│   │
│   ├── services/                   # Business logic (no HTTP/WS awareness)
│   │   ├── playerService.js        # Account CRUD, settings
│   │   ├── saveService.js          # Save/load game state
│   │   ├── instanceService.js      # Instance lifecycle management
│   │   ├── discoveryService.js     # Discovery recording and sharing
│   │   ├── marketService.js        # Price calculation, trade execution
│   │   ├── encryptionService.js    # AES-256-GCM for Gemini keys
│   │   └── validationService.js    # Anti-cheat validation
│   │
│   └── db/                         # Database layer
│       ├── connection.js           # Knex instance creation
│       └── queries/                # Named query functions
│           ├── players.js
│           ├── saves.js
│           ├── inventory.js
│           ├── quests.js
│           ├── discoveries.js
│           ├── aiContexts.js
│           ├── terminal.js
│           └── market.js
│
├── client/                         # Frontend (served as static files)
│   ├── index.html                  # Single HTML entry point
│   ├── style.css                   # Global styles, UI overlay styles
│   │
│   ├── js/                         # Client JavaScript
│   │   ├── main.js                 # Entry point - init game, connect to server
│   │   ├── config.js               # Client-side constants
│   │   │
│   │   ├── engine/                 # Three.js rendering engine
│   │   │   ├── scene.js            # Scene setup, camera, renderer
│   │   │   ├── gameLoop.js         # requestAnimationFrame loop
│   │   │   ├── camera.js           # Camera controller (5 modes)
│   │   │   ├── input.js            # Keyboard/mouse/gamepad input
│   │   │   ├── postProcessing.js   # Bloom, color grading, vignette
│   │   │   └── audio.js            # Tone.js audio manager
│   │   │
│   │   ├── world/                  # Universe and planet generation
│   │   │   ├── universe.js         # Galaxy/system/planet hierarchy
│   │   │   ├── starSystem.js       # Star system scene composition
│   │   │   ├── planet.js           # Planet mesh + LOD management
│   │   │   ├── terrain.js          # Heightmap → mesh conversion
│   │   │   ├── atmosphere.js       # Atmospheric shader setup
│   │   │   ├── flora.js            # L-system plant generation
│   │   │   ├── creatures.js        # CA-based creature system
│   │   │   ├── space.js            # Starfield, nebula particles
│   │   │   └── resources.js        # Resource node placement
│   │   │
│   │   ├── generation/             # Procedural generation core
│   │   │   ├── cellularAutomata.js # The CA engine (applyRule, run1D, etc.)
│   │   │   ├── hashSeed.js         # FNV-1a deterministic hashing
│   │   │   ├── heightmap.js        # CA → smoothed heightmap
│   │   │   ├── biomeMap.js         # Dual heightmap → biome assignment
│   │   │   ├── lSystem.js          # L-system grammar + turtle renderer
│   │   │   └── nameGenerator.js    # Procedural name generation
│   │   │
│   │   ├── player/                 # Player systems
│   │   │   ├── character.js        # Player mesh, animations, state
│   │   │   ├── movement.js         # On-foot movement + physics
│   │   │   ├── ship.js             # Ship model, flight controls
│   │   │   ├── multiTool.js        # Scanner, mining laser, etc.
│   │   │   ├── inventory.js        # Client inventory management
│   │   │   └── stats.js            # Health, oxygen, energy, hazard
│   │   │
│   │   ├── gameplay/               # Game mechanics
│   │   │   ├── questManager.js     # Quest tracking, step progression
│   │   │   ├── crafting.js         # Recipe checking, item creation
│   │   │   ├── trading.js          # Market UI, trade execution
│   │   │   ├── discovery.js        # Scanning, naming, uploading
│   │   │   ├── combat.js           # Basic combat system
│   │   │   └── baseBuilding.js     # Structure placement
│   │   │
│   │   ├── terminal/               # Terminal code-breaking system
│   │   │   ├── terminalUI.js       # CRT terminal renderer
│   │   │   ├── cipherPuzzle.js     # The 4-stage puzzle logic
│   │   │   ├── ruleExplorer.js     # Post-crack rule visualization
│   │   │   └── deepTerminal.js     # Infinite procedural puzzles
│   │   │
│   │   ├── ai/                     # Gemini AI integration
│   │   │   ├── geminiClient.js     # API calls to Google (client-side)
│   │   │   ├── beingConversation.js # The Mysterious Being dialogue
│   │   │   ├── npcDialogue.js      # NPC conversation manager
│   │   │   ├── questGenerator.js   # AI-generated quest handler
│   │   │   └── contextManager.js   # Conversation memory/summary
│   │   │
│   │   ├── network/                # Multiplayer client
│   │   │   ├── socketClient.js     # Socket.io connection + events
│   │   │   ├── playerSync.js       # Other player position interpolation
│   │   │   ├── chatClient.js       # Chat message send/receive
│   │   │   └── saveClient.js       # Autosave trigger + delta sync
│   │   │
│   │   └── ui/                     # DOM overlay UI
│   │       ├── hud.js              # Health bars, compass, crosshair
│   │       ├── tablet.js           # Tablet UI (7 tabs)
│   │       ├── menus.js            # Main menu, pause, settings
│   │       ├── notifications.js    # Toast notifications, alerts
│   │       ├── chat.js             # Chat window UI
│   │       └── loading.js          # Loading screens, progress bars
│   │
│   ├── shaders/                    # GLSL shader files
│   │   ├── terrain.vert            # Planet terrain vertex shader
│   │   ├── terrain.frag            # Planet terrain fragment shader
│   │   ├── atmosphere.vert         # Atmospheric scattering vertex
│   │   ├── atmosphere.frag         # Atmospheric scattering fragment
│   │   ├── star.vert               # Star/sun emissive vertex
│   │   ├── star.frag               # Star/sun emissive fragment
│   │   ├── water.vert              # Water surface vertex
│   │   ├── water.frag              # Water surface fragment
│   │   └── postprocess/
│   │       ├── bloom.frag          # Bloom post-process
│   │       ├── colorGrade.frag     # Color grading LUT
│   │       └── vignette.frag       # Vignette overlay
│   │
│   ├── workers/                    # Web Workers (background threads)
│   │   ├── terrainWorker.js        # Heightmap generation off main thread
│   │   ├── caWorker.js             # CA computation off main thread
│   │   └── meshWorker.js           # Mesh geometry building
│   │
│   └── assets/                     # Static assets
│       ├── textures/
│       │   ├── noise/              # Pre-baked noise textures
│       │   ├── ui/                 # UI element textures
│       │   └── particles/          # Particle effect sprites
│       ├── fonts/
│       │   └── monospace.woff2     # Terminal font
│       ├── audio/
│       │   ├── sfx/                # Sound effects
│       │   └── ambient/            # Ambient loops (space, planet, cave)
│       └── models/                 # Pre-built 3D models (ship, station)
│           ├── ship_starter.glb
│           └── space_station.glb
│
├── migrations/                     # Knex database migrations
│   ├── 20260214_001_create_players.js
│   ├── 20260214_002_create_player_saves.js
│   ├── ...
│   └── 20260214_009_create_market_prices.js
│
├── seeds/                          # Database seed data (development)
│   ├── 01_test_players.js
│   └── 02_test_discoveries.js
│
├── data/                           # Runtime data (gitignored)
│   ├── tgo_dev.db                  # SQLite database file
│   └── backups/                    # Database backup files
│
├── scripts/                        # Utility scripts
│   ├── setup.js                    # First-time setup (create dirs, run migrations)
│   ├── generate-secret.js          # Generate random JWT/encryption secrets
│   └── backup-db.js               # Database backup utility
│
└── tests/                          # Test files
    ├── server/
    │   ├── auth.test.js
    │   ├── save.test.js
    │   ├── discovery.test.js
    │   └── encryption.test.js
    ├── client/
    │   ├── cellularAutomata.test.js
    │   ├── heightmap.test.js
    │   ├── hashSeed.test.js
    │   └── biomeMap.test.js
    └── integration/
        ├── gameFlow.test.js
        └── multiplayer.test.js
```

---

## 9.2 Tech Stack (Complete)

### Core Runtime

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Runtime | Node.js | 20 LTS | Server-side JavaScript |
| Package Manager | npm | 10+ | Dependency management |
| Module System | ES Modules | native | `import`/`export` syntax |

### Server Dependencies

```json
{
  "dependencies": {
    "express": "^4.18",
    "socket.io": "^4.7",
    "knex": "^3.1",
    "better-sqlite3": "^11.0",
    "pg": "^8.12",
    "jsonwebtoken": "^9.0",
    "bcrypt": "^5.1",
    "uuid": "^9.0",
    "dotenv": "^16.4",
    "cors": "^2.8",
    "helmet": "^7.1",
    "express-rate-limit": "^7.1",
    "compression": "^1.7"
  },
  "devDependencies": {
    "nodemon": "^3.0",
    "vitest": "^1.2",
    "supertest": "^6.3"
  }
}
```

**Dependency Rationale:**

| Package | Why This One | Alternatives Considered |
|---------|-------------|------------------------|
| `express` | Industry standard, huge middleware ecosystem | Fastify (faster but smaller community) |
| `socket.io` | Automatic fallbacks, rooms, namespaces | ws (lighter but no fallbacks) |
| `knex` | Query builder, multi-DB, migrations | Sequelize (too heavy), raw SQL (too manual) |
| `better-sqlite3` | Synchronous SQLite, fastest Node binding | sqlite3 (async, slower) |
| `pg` | Standard PostgreSQL client | none worth considering |
| `jsonwebtoken` | JWT standard implementation | jose (newer but less ecosystem support) |
| `bcrypt` | Proven password hashing, native binding | argon2 (better but harder to install on Windows) |
| `helmet` | Security headers in one line | Manual header setting (error-prone) |
| `compression` | Gzip responses, reduces bandwidth | Nginx-level compression (not in MVP) |

### Client Dependencies (CDN or bundled)

```html
<!-- Three.js - 3D rendering -->
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.170/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170/examples/jsm/"
  }
}
</script>

<!-- Socket.io client (served by server automatically) -->
<script src="/socket.io/socket.io.js"></script>

<!-- Tone.js - Audio -->
<script src="https://cdn.jsdelivr.net/npm/tone@15/build/Tone.js"></script>
```

**No bundler for MVP.** Native ES modules + import maps. Reasons:
- Zero build step = faster development iteration
- Modern browsers support ES modules natively
- Import maps handle CDN resolution
- Three.js works perfectly with ES module imports
- When we need a bundler (for code splitting, tree shaking at scale), we add Vite

### Client Library Rationale

| Library | Why | Alternatives |
|---------|-----|-------------|
| `three.js` | Dominant WebGL library, huge community, great docs | Babylon.js (heavier, more game-engine-like) |
| `socket.io-client` | Matches server, auto-reconnect, fallbacks | Raw WebSocket (no reconnect logic) |
| `tone.js` | High-level Web Audio API wrapper, synthesizers | Howler.js (simpler but no synthesis) |

---

## 9.3 Development Environment Setup

### Prerequisites

```
Node.js 20 LTS       https://nodejs.org/
Git                   https://git-scm.com/
A code editor         VS Code recommended
A modern browser      Chrome or Firefox (WebGL 2.0 required)
```

### First-Time Setup

```bash
# 1. Clone the repository
git clone <repo-url> the-galactic-order
cd the-galactic-order

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env
# Edit .env with your secrets (or run: node scripts/generate-secret.js)

# 4. Run setup script (creates directories, runs migrations)
npm run setup

# 5. Start development server
npm run dev
```

### package.json Scripts

```json
{
  "scripts": {
    "start": "node server/index.js",
    "dev": "nodemon server/index.js",
    "setup": "node scripts/setup.js",
    "migrate": "knex migrate:latest",
    "migrate:rollback": "knex migrate:rollback",
    "migrate:status": "knex migrate:status",
    "seed": "knex seed:run",
    "backup": "node scripts/backup-db.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "generate-secret": "node scripts/generate-secret.js"
  }
}
```

### Setup Script (`scripts/setup.js`)

```javascript
// scripts/setup.js
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const dirs = ['data', 'data/backups'];

console.log('Setting up The Galactic Order...\n');

// Create directories
for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`  Created: ${dir}/`);
    }
}

// Check .env exists
if (!fs.existsSync('.env')) {
    console.log('\n  WARNING: .env file not found!');
    console.log('  Run: cp .env.example .env');
    console.log('  Then edit .env with your secrets.\n');
    process.exit(1);
}

// Run migrations
console.log('\n  Running database migrations...');
execSync('npx knex migrate:latest', { stdio: 'inherit' });

console.log('\n  Setup complete! Run: npm run dev\n');
```

---

## 9.4 Server Architecture

### Entry Point (`server/index.js`)

```javascript
// server/index.js
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import config from './config.js';
import { authRouter } from './routes/auth.js';
import { playerRouter } from './routes/player.js';
import { saveRouter } from './routes/save.js';
import { discoveryRouter } from './routes/discoveries.js';
import { marketRouter } from './routes/market.js';
import { setupSocketHandlers } from './socket/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);

// Socket.io
const io = new SocketServer(httpServer, {
    cors: { origin: config.corsOrigin },
    pingInterval: 10000,     // 10s keepalive
    pingTimeout: 5000
});

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "cdn.jsdelivr.net"],
            connectSrc: ["'self'", "ws:", "wss:", "generativelanguage.googleapis.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            styleSrc: ["'self'", "'unsafe-inline'"]
        }
    }
}));
app.use(compression());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '100kb' }));

// Static files (client)
app.use(express.static(path.join(__dirname, '..', 'client')));

// REST API routes
app.use('/api/auth', authRouter);
app.use('/api/player', playerRouter);
app.use('/api/save', saveRouter);
app.use('/api/discoveries', discoveryRouter);
app.use('/api/market', marketRouter);

// WebSocket handlers
setupSocketHandlers(io);

// Start
httpServer.listen(config.port, config.host, () => {
    console.log(`The Galactic Order running at http://${config.host}:${config.port}`);
    console.log(`Environment: ${config.env}`);
});
```

### Request Flow

```
INCOMING REQUEST
       │
       ▼
┌──────────────┐
│   helmet()   │  Security headers
└──────┬───────┘
       │
┌──────┴───────┐
│ compression()│  Gzip response
└──────┬───────┘
       │
┌──────┴───────┐
│   cors()     │  Cross-origin check
└──────┬───────┘
       │
┌──────┴───────┐
│  json()      │  Parse request body
└──────┬───────┘
       │
       ├── /api/auth/*     → authRouter      → playerService    → db/queries
       ├── /api/player/*   → auth middleware  → playerRouter     → db/queries
       ├── /api/save/*     → auth middleware  → saveRouter       → saveService → db/queries
       ├── /api/discoveries/* → auth middleware → discoveryRouter → db/queries
       ├── /api/market/*   → auth middleware  → marketRouter     → db/queries
       └── /*              → express.static   → client files
```

### Service Layer Pattern

Every service follows the same pattern - pure business logic, no HTTP/WebSocket awareness:

```javascript
// server/services/saveService.js
import { getSave, updateSave, getInventory, setInventory } from '../db/queries/saves.js';
import { validateSave } from './validationService.js';

export async function loadGame(playerId) {
    const save = await getSave(playerId);
    if (!save) throw new Error('No active save found');

    const inventory = await getInventory(save.id);
    const quests = await getQuests(save.id);
    const terminal = await getTerminal(save.id);

    return { save, inventory, quests, terminal };
}

export async function deltaSave(playerId, deltaData) {
    const errors = validateSave(deltaData);
    if (errors.length > 0) throw new Error(errors.join(', '));

    await updateSave(playerId, {
        position_x: deltaData.position.x,
        position_y: deltaData.position.y,
        position_z: deltaData.position.z,
        // ...
    });

    return { saved: true, timestamp: Date.now() };
}
```

---

## 9.5 Client Architecture

### Module Loading Order

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Galactic Order</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <!-- UI Overlay (DOM) -->
    <div id="game-container">
        <canvas id="game-canvas"></canvas>
        <div id="hud-overlay"></div>
        <div id="tablet-overlay" class="hidden"></div>
        <div id="terminal-overlay" class="hidden"></div>
        <div id="menu-overlay" class="hidden"></div>
        <div id="chat-overlay"></div>
        <div id="notifications"></div>
        <div id="loading-screen">
            <div class="loading-text">Initializing Universe...</div>
            <div class="loading-bar"><div class="loading-fill"></div></div>
        </div>
    </div>

    <!-- Socket.io (served by server) -->
    <script src="/socket.io/socket.io.js"></script>

    <!-- Import map for Three.js -->
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.170/build/three.module.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170/examples/jsm/"
        }
    }
    </script>

    <!-- Entry point -->
    <script type="module" src="js/main.js"></script>
</body>
</html>
```

### Client Module Dependency Graph

```
main.js
├── engine/scene.js
│   ├── THREE (import map)
│   ├── engine/camera.js
│   ├── engine/postProcessing.js
│   └── engine/audio.js
│
├── engine/gameLoop.js
│   ├── engine/scene.js (scene ref)
│   ├── player/movement.js
│   ├── world/universe.js
│   └── network/playerSync.js
│
├── engine/input.js
│   └── (pure module, no deps)
│
├── world/universe.js
│   ├── generation/cellularAutomata.js
│   ├── generation/hashSeed.js
│   ├── world/starSystem.js
│   │   ├── world/planet.js
│   │   │   ├── world/terrain.js
│   │   │   ├── world/atmosphere.js
│   │   │   ├── world/flora.js
│   │   │   └── world/creatures.js
│   │   └── world/space.js
│   └── world/resources.js
│
├── network/socketClient.js
│   ├── socket.io (global)
│   ├── network/playerSync.js
│   ├── network/chatClient.js
│   └── network/saveClient.js
│
├── ui/hud.js
├── ui/tablet.js
├── ui/menus.js
└── ui/loading.js
```

### Client-Side State Management

No framework, no store library. Simple module-scoped state:

```javascript
// client/js/state.js
// Central game state - imported by modules that need it

export const gameState = {
    // Player
    player: {
        id: null,
        username: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { y: 0 },
        stats: { health: 100, oxygen: 100, energy: 100, hazard: 100 },
        level: 1,
        xp: 0,
        credits: 500,
        isInShip: false,
        isOnPlanet: true
    },

    // World
    world: {
        currentGalaxy: 0,
        currentSystem: null,       // { seed, starType, planets[] }
        currentPlanet: null,       // { index, mesh, terrain, biome }
        loadedChunks: new Map()
    },

    // Multiplayer
    network: {
        connected: false,
        socket: null,
        instanceId: null,
        nearbyPlayers: new Map()   // id -> { position, rotation, username }
    },

    // UI
    ui: {
        tabletOpen: false,
        terminalOpen: false,
        menuOpen: false,
        chatFocused: false,
        activeTab: 'map'
    },

    // AI
    ai: {
        hasGeminiKey: false,
        beingUnlocked: false
    }
};
```

Modules import `gameState` and read/write directly. No pub/sub, no reducers - this isn't a complex SPA, it's a game. Direct mutation with explicit update calls is simpler and faster.

---

## 9.6 Build & Bundle Strategy

### MVP: No Bundler

For the MVP phase, we serve raw ES modules:

```
Browser requests:
GET /js/main.js                  → 200 (ES module)
GET /js/engine/scene.js          → 200 (imported by main.js)
GET /js/generation/cellularAutomata.js → 200 (imported by universe.js)
...

Three.js loaded via CDN import map → zero bundle cost
Socket.io served by Express       → auto-handled
```

**Pros:** Zero config, instant reloads, WYSIWYG debugging
**Cons:** Many HTTP requests on first load (~50 modules)

### Future: Vite

When we need bundling (production optimization, code splitting):

```javascript
// vite.config.js (future)
import { defineConfig } from 'vite';

export default defineConfig({
    root: 'client',
    build: {
        outDir: '../dist/client',
        rollupOptions: {
            external: ['three'],   // Keep Three.js on CDN
        }
    },
    server: {
        proxy: {
            '/api': 'http://localhost:3000',
            '/socket.io': { target: 'http://localhost:3000', ws: true }
        }
    }
});
```

Vite is chosen because:
- Native ES module dev server (no bundling during development)
- Rollup-based production build (tree shaking, code splitting)
- Near-zero config for vanilla JS projects
- Hot module replacement works with vanilla JS

### When to Switch

Stay on raw ES modules until ANY of these:
- First load time exceeds 3 seconds on broadband
- More than 100 client-side modules
- Need code splitting for lazy-loaded features
- Need tree shaking to reduce bundle size

---

## 9.7 .gitignore

```gitignore
# Dependencies
node_modules/

# Environment
.env

# Database
data/
*.db

# OS
.DS_Store
Thumbs.db

# Editor
.vscode/
*.swp
*.swo

# Build (future)
dist/

# Logs
*.log
npm-debug.log*

# Test coverage
coverage/
```

---

## 9.8 .env.example

```bash
# ===================================
# THE GALACTIC ORDER - Configuration
# ===================================

# Server
NODE_ENV=development
PORT=3000
HOST=localhost
CORS_ORIGIN=http://localhost:3000

# Database
# Development (SQLite)
DATABASE_URL=sqlite:./data/tgo_dev.db
# Production (PostgreSQL)
# DATABASE_URL=postgres://user:password@localhost:5432/tgo

# Authentication
# Generate with: node scripts/generate-secret.js
JWT_SECRET=CHANGE_ME_TO_64_RANDOM_CHARACTERS
BCRYPT_ROUNDS=12

# Encryption (for Gemini API key storage)
# Generate with: node scripts/generate-secret.js
ENCRYPTION_SECRET=CHANGE_ME_TO_ANOTHER_64_RANDOM_CHARACTERS

# Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Redis (production only)
# REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=debug
```

---

## 9.9 Config Module

```javascript
// server/config.js
import dotenv from 'dotenv';
dotenv.config();

const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    host: process.env.HOST || 'localhost',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

    db: {
        url: process.env.DATABASE_URL || 'sqlite:./data/tgo_dev.db',
        isSqlite: (process.env.DATABASE_URL || '').startsWith('sqlite:'),
    },

    auth: {
        jwtSecret: process.env.JWT_SECRET,
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
        tokenExpiry: '7d'
    },

    encryption: {
        secret: process.env.ENCRYPTION_SECRET
    },

    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60000,
        max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100
    }
};

// Validate critical config
if (config.env === 'production') {
    const required = ['JWT_SECRET', 'ENCRYPTION_SECRET', 'DATABASE_URL'];
    for (const key of required) {
        if (!process.env[key] || process.env[key].includes('CHANGE_ME')) {
            console.error(`FATAL: ${key} must be set in production`);
            process.exit(1);
        }
    }
}

export default config;
```

---

## 9.10 Testing Strategy

### Test Framework: Vitest

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['server/**/*.js', 'client/js/generation/**/*.js']
        }
    }
});
```

### Test Categories

```
UNIT TESTS (fast, no I/O):
├── Cellular automata engine     - Deterministic output for known rules
├── Hash seed function           - Same input = same output
├── Heightmap generation         - Output dimensions, value ranges
├── Biome classification         - Correct biome for given height/moisture
├── Price calculation            - Market formula correctness
├── Input validation             - Accept valid, reject invalid
└── Encryption round-trip        - Encrypt → decrypt = original

INTEGRATION TESTS (database):
├── Auth flow                    - Register → login → get token → use token
├── Save/load cycle              - Save game → load game → data matches
├── Discovery flow               - Discover → name → upload → query
└── Trade execution              - Check price → execute → verify balance

E2E TESTS (future, browser):
├── Login → spawn → move          - Basic game flow
├── Planet landing                - Terrain loads, can walk
└── Multiplayer join              - Two clients see each other
```

### Example Test

```javascript
// tests/client/cellularAutomata.test.js
import { describe, it, expect } from 'vitest';
import { applyRule, runCA1D } from '../../client/js/generation/cellularAutomata.js';

describe('Cellular Automata Engine', () => {
    it('Rule 30: 111 → 0', () => {
        expect(applyRule(30, 1, 1, 1)).toBe(0);
    });

    it('Rule 30: 100 → 1', () => {
        expect(applyRule(30, 1, 0, 0)).toBe(1);
    });

    it('Rule 30: 000 → 0', () => {
        expect(applyRule(30, 0, 0, 0)).toBe(0);
    });

    it('produces deterministic output', () => {
        const run1 = runCA1D(30, 81, 50);
        const run2 = runCA1D(30, 81, 50);
        expect(run1).toEqual(run2);
    });

    it('Rule 0 produces all zeros after gen 1', () => {
        const result = runCA1D(0, 81, 10);
        // After first generation, Rule 0 maps everything to 0
        for (let gen = 2; gen < 10; gen++) {
            for (let cell = 0; cell < 81; cell++) {
                expect(result[gen][cell]).toBe(0);
            }
        }
    });
});
```

---

## 9.11 Deployment

### MVP Deployment (Single Server)

```
Target: Any VPS with Node.js
Recommended: DigitalOcean $12/mo droplet (2GB RAM, 1 vCPU)
             or Railway.app / Render.com free tier

SETUP:
1. SSH into server
2. Install Node.js 20 LTS
3. Clone repo
4. npm install --production
5. Create .env with production values
6. npm run migrate
7. npm start (or use PM2)
```

### Process Manager: PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start server/index.js --name tgo

# Auto-restart on crash
pm2 startup
pm2 save

# Monitor
pm2 monit

# View logs
pm2 logs tgo
```

### PM2 Ecosystem File

```javascript
// ecosystem.config.cjs
module.exports = {
    apps: [{
        name: 'tgo',
        script: 'server/index.js',
        instances: 1,                // Single instance (Socket.io state)
        autorestart: true,
        max_memory_restart: '1G',
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000
        }
    }]
};
```

### Nginx Reverse Proxy (Production)

```nginx
# /etc/nginx/sites-available/tgo
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Static files (client)
    location / {
        root /var/www/tgo/client;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket proxy
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### HTTPS Setup

```bash
# Let's Encrypt free SSL
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
# Auto-renews every 90 days
```

---

## 9.12 Development Workflow

### Daily Development

```bash
# Start dev server (auto-restarts on file changes)
npm run dev

# Open browser to http://localhost:3000
# Edit files → server restarts automatically
# Refresh browser to see client changes

# Run tests
npm test

# Run specific test file
npx vitest run tests/client/cellularAutomata.test.js
```

### Git Workflow

```
main              ← stable, deployable
  └── dev         ← integration branch
       ├── feature/terrain-generation
       ├── feature/multiplayer-sync
       ├── fix/inventory-overflow
       └── feature/terminal-puzzle
```

**Branch Rules:**
- `main`: Always deployable. Merge from `dev` only.
- `dev`: Integration testing. Features merge here.
- `feature/*`: One feature per branch. PR to `dev`.
- `fix/*`: Bug fixes. PR to `dev` (or `main` for hotfix).

### Commit Convention

```
feat: add planet terrain generation from CA rules
fix: prevent inventory overflow past 28 slots
docs: complete Part 09 project structure
refactor: extract CA engine to separate module
test: add heightmap boundary tests
chore: update Three.js to 0.170
```

---

## 9.13 Performance Monitoring

### Server-Side Metrics (Simple)

```javascript
// server/middleware/metrics.js
const metrics = {
    requests: 0,
    websocketConnections: 0,
    activePlayers: 0,
    savesPerMinute: 0,
    dbQueryTime: { avg: 0, max: 0 }
};

// Log every 60 seconds
setInterval(() => {
    console.log(`[METRICS] Players: ${metrics.activePlayers} | ` +
                `Requests/min: ${metrics.requests} | ` +
                `WS: ${metrics.websocketConnections} | ` +
                `DB avg: ${metrics.dbQueryTime.avg}ms`);
    metrics.requests = 0;
    metrics.savesPerMinute = 0;
}, 60000);

export { metrics };
```

### Client-Side Performance

```javascript
// client/js/engine/performanceMonitor.js
export class PerformanceMonitor {
    constructor() {
        this.fps = 0;
        this.frameTime = 0;
        this.drawCalls = 0;
        this.triangles = 0;
        this.frames = 0;
        this.lastTime = performance.now();
    }

    update(renderer) {
        this.frames++;
        const now = performance.now();

        if (now - this.lastTime >= 1000) {
            this.fps = this.frames;
            this.frameTime = 1000 / this.frames;
            this.drawCalls = renderer.info.render.calls;
            this.triangles = renderer.info.render.triangles;
            this.frames = 0;
            this.lastTime = now;
        }
    }
}
```

---

## Cross-References

- **Part 02 (Fractal Foundation)**: `generation/` module contents, CA engine API
- **Part 05 (Multiplayer)**: `socket/` handlers, instance management
- **Part 07 (Frontend)**: `engine/`, `world/`, `shaders/` structure
- **Part 08 (Database)**: `migrations/`, `db/queries/`, Knex configuration
- **Part 10 (Roadmap)**: Build order for these modules, what to implement first
