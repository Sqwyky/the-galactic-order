# Part 10: Development Phases & Roadmap

## THE GALACTIC ORDER - System Design Document
### Phase-by-Phase Build Order, MVP Definition, Milestones

---

## 10.1 Development Philosophy

### Build Order Principles

1. **Core math first.** The CA engine is the foundation of everything. If this doesn't work, nothing works.
2. **Visual feedback early.** Rendering a planet (even ugly) motivates more than perfect back-end code you can't see.
3. **Playable at every phase.** Each phase ends with something you can actually interact with in a browser.
4. **Server late.** Single-player works without a server. Don't build multiplayer infrastructure until the game is fun alone.
5. **AI last.** Gemini integration is a layer on top. The game must work without it.

### Time Estimates

None. Timelines depend on hours per week, experience level, debugging luck, and a hundred other variables. Instead, each phase has a **Definition of Done** - a concrete list of things that work when the phase is complete.

---

## 10.2 Phase Overview

```
PHASE 0: Foundation          The math works. CA runs in browser. Numbers become terrain.
PHASE 1: First Planet        You can see a planet. You can walk on it. It has color.
PHASE 2: Star Systems        Multiple planets. Space flight. A starfield.
PHASE 3: Survival Game       Stats, inventory, resources. It's a game now.
PHASE 4: Quests & Terminal   The main quest line. The terminal puzzle. A reason to play.
PHASE 5: Accounts & Saves    Login, save, load. Play across sessions.
PHASE 6: Multiplayer         See other players. Chat. Share discoveries.
PHASE 7: AI Integration      The Being. Gemini-powered NPCs and quests.
PHASE 8: Polish & Launch     Audio, post-processing, balance, bugs. Ship it.
```

---

## 10.3 PHASE 0: Foundation

**Goal:** The mathematical core works. Cellular automata generate deterministic terrain data in JavaScript.

### What to Build

```
Files to create:
├── client/js/generation/cellularAutomata.js   ← Port from Python
├── client/js/generation/hashSeed.js           ← FNV-1a hash
├── client/js/generation/heightmap.js           ← CA → smoothed heightmap
├── client/js/generation/biomeMap.js            ← Dual heightmap → biomes
├── client/js/generation/nameGenerator.js       ← Procedural names
└── tests/client/                               ← Tests for all above
```

### Tasks

1. **Port `apply_rule` to JavaScript**
   - Direct translation from `run_rule.py`
   - Must produce identical output to Python for same rule + width + generations
   - Write: `applyRule(ruleNumber, left, center, right) → 0 or 1`

2. **Build `runCA1D(rule, width, generations)` → 2D array**
   - Runs a 1D CA for N generations
   - Returns array of arrays: `grid[generation][cell]`
   - Support single-dot and dual-dot initial conditions

3. **Port FNV-1a hash function**
   - `hashSeed(...args) → uint32`
   - Deterministic: same args = same hash, always
   - Test cross-platform: same result in Node.js and browser

4. **Build heightmap generator**
   - Input: rule number, width, generations
   - Run CA → apply 6-scale density smoothing → output float array [0.0, 1.0]
   - Test: output dimensions match input, all values in range

5. **Build biome classifier**
   - Two heightmaps (elevation + moisture from different rules)
   - Classify each point into one of 12 biomes
   - Test: known inputs produce expected biome types

6. **Build name generator**
   - Seed-deterministic syllable combination
   - Produces names like "Keth-Voran", "Zilphi Prime"
   - Different name pools for stars, planets, species

7. **Write tests for everything above**
   - Determinism tests (same input = same output, 1000 runs)
   - Edge cases (rule 0, rule 255, width 1, etc.)
   - Performance (heightmap 256x256 in <50ms)

### Definition of Done (Phase 0)

- [ ] `applyRule(30, 1, 0, 0)` returns `1` (matches Python)
- [ ] `runCA1D(30, 81, 50)` produces 50 rows of 81 cells
- [ ] `hashSeed('galaxy', 0, 'system', 42)` returns same uint32 every time
- [ ] Heightmap 256x256 generates in <50ms
- [ ] Biome map produces 12 distinct biome types
- [ ] All tests pass
- [ ] No external dependencies (pure JavaScript)

---

## 10.4 PHASE 1: First Planet

**Goal:** Open a browser, see a 3D planet generated from a CA rule, land on it, walk around.

### What to Build

```
Files to create:
├── client/index.html                          ← Single page entry
├── client/style.css                           ← Basic styles
├── client/js/main.js                          ← Init everything
├── client/js/engine/scene.js                  ← Three.js setup
├── client/js/engine/gameLoop.js               ← Frame loop
├── client/js/engine/camera.js                 ← Orbit + first-person camera
├── client/js/engine/input.js                  ← Keyboard/mouse
├── client/js/world/planet.js                  ← Planet mesh generation
├── client/js/world/terrain.js                 ← Heightmap → sphere mesh
├── client/js/world/atmosphere.js              ← Simple atmosphere shader
├── client/shaders/terrain.vert                ← Terrain vertex shader
├── client/shaders/terrain.frag                ← Terrain fragment shader
├── client/shaders/atmosphere.vert             ← Atmosphere vertex
└── client/shaders/atmosphere.frag             ← Atmosphere fragment
```

### Tasks

1. **Three.js scene setup**
   - Create renderer, scene, camera
   - Attach to `<canvas id="game-canvas">`
   - Basic lighting (directional sun + ambient)
   - Background: dark space color

2. **Planet mesh from heightmap**
   - Generate heightmap using Phase 0 code
   - Create cube-sphere geometry (icosphere subdivision)
   - Displace vertices by heightmap values
   - Apply biome-based vertex colors

3. **Terrain shader**
   - Vertex shader: displace vertices by height
   - Fragment shader: color by height + slope (biome colors)
   - Simple lighting (Lambert diffuse)

4. **Atmosphere shader**
   - Transparent sphere slightly larger than planet
   - Blue-ish glow, fades at edges (Fresnel approximation)
   - Color varies by planet type (from rule class)

5. **Camera system (orbit mode)**
   - Click + drag to orbit around planet
   - Scroll to zoom
   - Double-click to "land" at that point

6. **On-planet mode**
   - First-person camera at ground level
   - WASD movement, mouse look
   - Collision with terrain (raycast down)
   - Gravity (basic: always pull toward planet center)

7. **Loading screen**
   - "Generating planet..." with progress bar
   - Shows which CA rule is being used
   - Fades to game view when ready

### Definition of Done (Phase 1)

- [ ] Open `localhost:3000` → see a 3D planet in space
- [ ] Planet terrain is generated from a CA rule (not random noise)
- [ ] Different rule numbers produce visibly different planets
- [ ] Planet has colored biomes (green lowlands, brown mountains, white peaks)
- [ ] Atmosphere glow visible from orbit
- [ ] Can orbit around the planet with mouse
- [ ] Can land on the planet surface
- [ ] Can walk around on the surface with WASD + mouse
- [ ] Character doesn't fall through terrain
- [ ] 30+ FPS on a mid-range laptop

---

## 10.5 PHASE 2: Star Systems

**Goal:** Multiple planets in a star system. Fly between them in a ship.

### What to Build

```
Files to create:
├── client/js/world/universe.js                ← System generation from seed
├── client/js/world/starSystem.js              ← Compose star + planets
├── client/js/world/space.js                   ← Starfield particles
├── client/js/player/ship.js                   ← Ship model + flight
├── client/js/player/character.js              ← Player mesh on-foot
├── client/shaders/star.vert                   ← Star shader
├── client/shaders/star.frag
└── client/assets/models/ship_starter.glb      ← Simple ship model
```

### Tasks

1. **Star system generation**
   - Input: system seed (from hashSeed)
   - Output: star type, planet count (2-6), planet parameters
   - Each planet gets its own CA rule, size, distance, orbital position
   - Deterministic: same seed = same system always

2. **Space scene**
   - Starfield: 5000 particles at random far positions
   - Central star: emissive sphere with glow shader
   - Planets at orbital distances, visible as colored dots from far away

3. **Planet LOD (basic)**
   - Far: colored sphere (no terrain detail)
   - Medium: low-poly terrain
   - Close: full terrain detail
   - Switch based on camera distance

4. **Ship flight**
   - Third-person camera behind ship
   - WASD/arrow keys for pitch/yaw
   - Shift to accelerate, brake to decelerate
   - Simple physics (velocity, drag)

5. **Planet entry/exit**
   - Flying close to planet triggers "entry" transition
   - Loading screen while generating full terrain
   - Landing animation (ship descends to surface)
   - Taking off reverses the process

6. **Warp between systems**
   - UI prompt: enter system coordinates or pick from galaxy map (placeholder)
   - Warp animation (tunnel effect or fade)
   - Load new system on arrival

### Definition of Done (Phase 2)

- [ ] Star system has 2-6 planets orbiting a star
- [ ] Each planet is visually distinct (different CA rule, biome colors)
- [ ] Can fly ship between planets
- [ ] Can land on any planet and walk around
- [ ] Can take off and return to space
- [ ] Starfield visible in space
- [ ] Star has emissive glow
- [ ] Can warp to a different system (different seed → different planets)
- [ ] Planet LOD switches smoothly (no pop-in)

---

## 10.6 PHASE 3: Survival Game

**Goal:** Health, oxygen, energy, inventory, resources. It's actually a game now.

### What to Build

```
Files to create:
├── client/js/player/stats.js                  ← 4 survival stats
├── client/js/player/inventory.js              ← Item management
├── client/js/player/multiTool.js              ← Scanner + mining
├── client/js/world/resources.js               ← Resource node placement
├── client/js/world/flora.js                   ← L-system plants
├── client/js/gameplay/crafting.js             ← Recipes
├── client/js/gameplay/discovery.js            ← Scanning system
├── client/js/ui/hud.js                        ← Health bars, compass
├── client/js/ui/tablet.js                     ← Inventory/map tabs
└── client/js/ui/notifications.js              ← Toast messages
```

### Tasks

1. **Survival stats system**
   - Health, Oxygen, Energy, Hazard Shield
   - Oxygen drains on hazardous planets
   - Energy drains while sprinting or using tools
   - Hazard Shield drains in extreme environments
   - Death = respawn at last save point

2. **Resource nodes**
   - Place resource deposits on terrain (iron, carbon, silicon, etc.)
   - Visible as glowing formations
   - Position determined by CA pattern + seed (deterministic)

3. **Multi-Tool: Scanner**
   - Point at object, hold scan button
   - Reveals resource type, creature species, or plant type
   - Shows info popup

4. **Multi-Tool: Mining Laser**
   - Point at resource node, hold fire
   - Resource transfers to inventory over time
   - Node shrinks and eventually disappears

5. **Inventory system**
   - Grid-based UI (28 suit slots, 35 ship slots)
   - Stack same items, split stacks
   - Drop items

6. **Crafting**
   - Open crafting tab in Tablet
   - See available recipes based on inventory
   - Click to craft → items consumed → product created

7. **L-system flora (basic)**
   - Simple procedural trees/bushes on planet surface
   - Parameters from CA rule characteristics
   - Billboards at distance, 3D mesh up close

8. **HUD**
   - Health/oxygen/energy/hazard bars (bottom left)
   - Compass (top center)
   - Crosshair (center)
   - Quick notification toasts

9. **Tablet UI (first pass)**
   - Tab 1: Inventory grid
   - Tab 2: Crafting recipes
   - Tab 3: Discoveries log
   - Press Tab to open/close

### Definition of Done (Phase 3)

- [ ] Stats drain appropriately (oxygen on planets, energy when sprinting)
- [ ] Can die (health reaches 0) and respawn
- [ ] Resource nodes appear on planets, positioned deterministically
- [ ] Can scan resources, flora, and terrain features
- [ ] Can mine resources with the multi-tool
- [ ] Items appear in inventory
- [ ] Can craft basic items (fuel cells, batteries, repair kits)
- [ ] HUD shows all 4 stats, compass, and crosshair
- [ ] Tablet opens with inventory and crafting tabs
- [ ] Plants/trees visible on planet surfaces
- [ ] Feels like a survival game loop: explore → gather → craft → survive

---

## 10.7 PHASE 4: Quests & Terminal

**Goal:** The main quest line gives purpose. The terminal puzzle is the endgame.

### What to Build

```
Files to create:
├── client/js/gameplay/questManager.js         ← Quest tracking
├── client/js/terminal/terminalUI.js           ← CRT terminal renderer
├── client/js/terminal/cipherPuzzle.js         ← 4-stage puzzle
├── client/js/terminal/ruleExplorer.js         ← Post-crack explorer
├── client/js/gameplay/combat.js               ← Basic combat
└── client/js/ui/tablet.js                     ← Add quest log tab
```

### Tasks

1. **Quest system framework**
   - Quest definition format (JSON)
   - Step tracking, completion detection
   - Reward distribution (XP, credits, items)
   - Quest log in Tablet UI

2. **Main quest Act 1: Awakening**
   - Player "crashes" on starting planet (scripted intro)
   - Gather resources to repair ship
   - Teaches mining, crafting, scanning
   - Reward: functional ship + warp drive

3. **Main quest Act 2: The Signal**
   - Receive mysterious signal (scripted event on first warp)
   - Visit 3 specific systems to triangulate
   - Each system has a cipher fragment hidden somewhere
   - Teaches exploration across systems

4. **Main quest Act 4: The Pattern**
   - Visit 5 more systems for remaining cipher fragments
   - Each fragment is an 8-bit binary row from a CA
   - Player collects all fragments

5. **Terminal discovery**
   - Player finds the terminal at a specific location
   - CRT terminal UI activates

6. **Terminal puzzle (4 stages)**
   - Stage 1: Order fragments by complexity
   - Stage 2: Deduce the 8 rule outputs
   - Stage 3: Convert binary to decimal (the rule number)
   - Stage 4: Run the rule and verify
   - Each stage has its own UI within the terminal

7. **Terminal CRT renderer**
   - Green-on-black text display
   - Scanlines, flicker, CRT curvature effect
   - Typing animation for terminal output
   - Input field for player commands

8. **Post-crack features**
   - Rule Explorer: run any rule 0-255 in the terminal
   - Deep Terminal: procedurally generated harder puzzles

9. **Basic combat**
   - Hostile creatures on some planets
   - Multi-tool damage mode
   - Simple health-based combat
   - Drops resources on kill

### Definition of Done (Phase 4)

- [ ] Act 1 quest plays from crash to ship repair
- [ ] Act 2 sends player to 3 systems with cipher fragments
- [ ] Cipher fragments collectible as inventory items
- [ ] Terminal found at designated location
- [ ] CRT terminal UI renders with retro aesthetic
- [ ] All 4 puzzle stages functional
- [ ] Correct rule number cracks the terminal
- [ ] Post-crack Rule Explorer works
- [ ] Quest log tracks progress in Tablet
- [ ] Basic combat with hostile creatures
- [ ] XP and level progression working

---

## 10.8 PHASE 5: Accounts & Saves

**Goal:** Players can create accounts, save their progress, and resume later.

### What to Build

```
Files to create:
├── server/index.js                            ← Express + Socket.io server
├── server/config.js                           ← Environment config
├── server/routes/auth.js                      ← Registration/login
├── server/routes/save.js                      ← Save/load endpoints
├── server/middleware/auth.js                   ← JWT middleware
├── server/services/saveService.js             ← Save logic
├── server/services/encryptionService.js       ← API key crypto
├── server/db/connection.js                    ← Knex setup
├── server/db/queries/*.js                     ← All query modules
├── migrations/*.js                            ← All migration files
├── client/js/network/saveClient.js            ← Autosave client
├── client/js/ui/menus.js                      ← Login/register/main menu
└── knexfile.js                                ← DB config
```

### Tasks

1. **Server setup**
   - Express app with middleware stack
   - Serve client files as static
   - REST API routes

2. **Database setup**
   - Knex configuration for SQLite (dev)
   - Write all migrations (Part 08 schemas)
   - Run migrations on first setup

3. **Authentication**
   - Register: username + password → bcrypt hash → JWT
   - Login: username + password → verify → JWT
   - JWT middleware for protected routes

4. **Save system**
   - Full save endpoint (POST /api/save)
   - Delta save endpoint (PATCH /api/save)
   - Load endpoint (GET /api/save)
   - Autosave every 60 seconds from client

5. **Game state integration**
   - On login: load save → initialize game at saved position
   - On play: autosave runs in background
   - On close: final save attempt (beforeunload)

6. **Login/Register UI**
   - Simple form overlays (not Three.js)
   - Main menu: New Game / Continue / Settings
   - Error messages for invalid input

7. **Gemini key storage**
   - Encrypt and store on server
   - Retrieve on login
   - Store in sessionStorage on client

### Definition of Done (Phase 5)

- [ ] Can register a new account
- [ ] Can login with existing account
- [ ] Game loads from saved position after login
- [ ] Autosave runs every 60 seconds
- [ ] Manual save works (Ctrl+S)
- [ ] Inventory, quests, terminal state all persist
- [ ] Can close browser and resume later with all progress
- [ ] Invalid credentials show appropriate errors
- [ ] Passwords are bcrypt hashed
- [ ] JWT tokens expire after 7 days

---

## 10.9 PHASE 6: Multiplayer

**Goal:** Multiple players in the same star system. See each other, chat, share discoveries.

### What to Build

```
Files to create:
├── server/socket/index.js                     ← Socket.io setup
├── server/socket/movement.js                  ← Position sync
├── server/socket/instances.js                 ← Instance management
├── server/socket/chat.js                      ← Chat handler
├── server/socket/discovery.js                 ← Discovery broadcasts
├── server/services/instanceService.js         ← Instance lifecycle
├── client/js/network/socketClient.js          ← Socket.io client
├── client/js/network/playerSync.js            ← Interpolation
├── client/js/network/chatClient.js            ← Chat client
└── client/js/ui/chat.js                       ← Chat window
```

### Tasks

1. **Socket.io server setup**
   - Authentication middleware (verify JWT on connect)
   - Room-based instances (one room per star system)

2. **Instance system**
   - Max 16 players per star system instance
   - Auto-create new instance when full
   - Player joins instance for their current system

3. **Position sync**
   - Client sends position 10 times per second
   - Server broadcasts to all players in same instance
   - Delta compression (only send what changed)

4. **Other player rendering**
   - Simple character mesh for other players
   - Interpolate between received positions (smooth movement)
   - Show username floating above character

5. **Chat system**
   - Text chat (global within instance)
   - Chat window UI in corner of screen
   - Message rate limiting

6. **Discovery sharing**
   - Upload discovery → broadcast to all in instance
   - "PlayerX discovered Space Chicken!" notification
   - Shared discoveries visible to all future visitors

7. **Session mode selection**
   - Solo: no multiplayer connection
   - Open: see all nearby players
   - Setting in main menu

### Definition of Done (Phase 6)

- [ ] Two browser tabs can connect to same server
- [ ] Players in same star system see each other
- [ ] Other players move smoothly (interpolation)
- [ ] Chat messages appear for all players in system
- [ ] Discovery uploads visible to other players
- [ ] Instance overflow creates new instance
- [ ] Solo mode works without Socket.io connection
- [ ] Player join/leave notifications
- [ ] No visible lag at <100ms latency

---

## 10.10 PHASE 7: AI Integration

**Goal:** The Mysterious Being comes alive. Gemini-powered NPCs and adaptive quests.

### What to Build

```
Files to create:
├── client/js/ai/geminiClient.js               ← API caller
├── client/js/ai/beingConversation.js          ← Being dialogue
├── client/js/ai/npcDialogue.js                ← NPC conversations
├── client/js/ai/questGenerator.js             ← AI quest creation
├── client/js/ai/contextManager.js             ← Memory system
├── server/routes/player.js                    ← Gemini key endpoints (extend)
└── server/db/queries/aiContexts.js            ← AI context storage
```

### Tasks

1. **Gemini client**
   - Call Google's generativelanguage API from browser
   - Handle rate limiting, errors, timeouts
   - 5-second cooldown between calls

2. **Main quest Act 3: The Mysterious Being**
   - Player reaches specific coordinates from Act 2
   - Being appears (particle effect + dialogue)
   - Asks for the "Key of Insight" (Gemini API key)
   - Tablet shows instruction to get key from Google AI Studio
   - On key entry: validation call → Being "awakens"

3. **Being conversation system**
   - Full dialogue UI (chat-like interface)
   - System prompt from Part 04 injected
   - Context includes player's current situation
   - Conversation memory (50 messages + rolling summary)

4. **NPC dialogue**
   - Space station NPCs with basic dialogue
   - Gemini generates contextual responses if key is available
   - Fallback to scripted dialogue if no key

5. **AI-generated side quests**
   - Being offers personalized quests
   - Quest parameters as structured JSON output
   - Integrate with existing quest system

6. **Terminal hints**
   - Being gives progressively more direct hints
   - 6 hint levels based on attempts
   - Only available after Act 3

7. **Fallback mode**
   - Everything works without a Gemini key
   - Scripted dialogue instead of AI
   - Template quests instead of generated ones
   - Being encounter is skipped, hints come from terminal itself

### Definition of Done (Phase 7)

- [ ] Being encounter triggers at correct quest stage
- [ ] API key entry flow works (enter → validate → store)
- [ ] Being responds to free-form player input via Gemini
- [ ] Being remembers previous conversations
- [ ] NPC dialogue uses Gemini when available
- [ ] AI-generated quests appear in quest log and are completable
- [ ] Terminal hints escalate appropriately
- [ ] Game is fully playable without a Gemini key (fallback mode)
- [ ] API key encrypted and stored on server
- [ ] Rate limiting prevents excessive API calls

---

## 10.11 PHASE 8: Polish & Launch

**Goal:** Audio, visual effects, balance, bug fixes. Ship it.

### Tasks

1. **Audio**
   - Ambient space music (procedural or looped tracks)
   - Planet ambient sounds (wind, wildlife based on biome)
   - UI sounds (menu clicks, inventory, notifications)
   - Ship engine sounds
   - Mining/scanning sound effects
   - Terminal keyboard typing sounds

2. **Post-processing**
   - Bloom (stars, hot surfaces, UI elements)
   - Color grading (biome-specific look)
   - Vignette
   - Space dust particles in atmosphere

3. **Visual polish**
   - Planet surface detail (more flora variety)
   - Better creature models/animations
   - Ship trail effects
   - Warp tunnel animation
   - Scanning beam visual

4. **Balance pass**
   - Resource distribution tuning
   - Survival stat drain rates
   - Crafting recipe costs
   - Market price ranges
   - Combat difficulty
   - Quest rewards

5. **Performance optimization**
   - Profile and fix frame rate issues
   - Optimize terrain generation (Web Workers)
   - Texture atlas for flora (reduce draw calls)
   - Frustum culling verification
   - Network bandwidth optimization

6. **Bug fixing**
   - Collision edge cases
   - Save/load data integrity
   - Multiplayer desync issues
   - UI overflow/scaling
   - Memory leaks (Three.js dispose patterns)

7. **Settings menu**
   - Graphics quality (High/Medium/Low)
   - Audio volume sliders
   - Key rebinding
   - Mouse sensitivity
   - Network mode (Solo/Open)

8. **Loading and onboarding**
   - Loading screen tips
   - First-time tutorial markers
   - Control hints (contextual)

9. **Deployment**
   - Set up production server (VPS or cloud)
   - Configure Nginx + SSL
   - PostgreSQL database
   - PM2 process manager
   - Automated backups

10. **Testing**
    - Full playthrough test (Act 1 → Terminal crack)
    - Multiplayer stress test (16 players)
    - Browser compatibility (Chrome, Firefox, Edge)
    - Performance test on low-end hardware

### Definition of Done (Phase 8)

- [ ] Full game playable from register → terminal crack
- [ ] Audio for all major interactions
- [ ] Post-processing makes the game look polished
- [ ] 30+ FPS on mid-range hardware
- [ ] No game-breaking bugs
- [ ] Deployed to public URL
- [ ] HTTPS working
- [ ] Can handle 50+ concurrent players
- [ ] Works in Chrome, Firefox, and Edge

---

## 10.12 MVP Definition

The **Minimum Viable Product** is reached at the end of **Phase 5**.

At that point you have:
- Procedural universe generated from cellular automata
- 3D planets you can explore on foot
- Ship flight between planets and star systems
- Survival mechanics (health, oxygen, energy)
- Resource gathering and crafting
- Main quest line with terminal puzzle
- Player accounts and persistent saves

What's NOT in the MVP:
- Multiplayer (Phase 6)
- AI/Gemini integration (Phase 7)
- Audio and visual polish (Phase 8)
- Base building
- Trading with NPC markets
- Deep Terminal infinite puzzles

The MVP is a complete single-player game. Multiplayer and AI are enhancements on top.

---

## 10.13 Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| CA terrain looks ugly/boring | High | Medium | Multiple smoothing passes, biome coloring, fallback to noise if needed |
| WebGL performance on low-end | High | Medium | LOD system, performance modes, reduce vertex count |
| Three.js learning curve | Medium | High | Start with simple geometries, add complexity gradually |
| Multiplayer desync | High | Medium | Authoritative server, keep sync logic simple |
| Gemini API changes | Medium | Low | Abstraction layer, fallback mode works without it |
| Scope creep | High | High | Strict phase gates, MVP definition, "not in this phase" discipline |
| Save data corruption | High | Low | Transactions, validation, backup system |
| Browser compatibility issues | Medium | Medium | Stick to WebGL 2.0 baseline, test early |

---

## 10.14 What to Build FIRST (Today)

If you're reading this and want to start coding right now:

### Step 1: Set up the project

```bash
mkdir the-galactic-order
cd the-galactic-order
npm init -y
mkdir -p client/js/generation tests/client
```

### Step 2: Port the CA engine

Create `client/js/generation/cellularAutomata.js`:

```javascript
export function applyRule(ruleNumber, left, center, right) {
    const pattern = (left << 2) | (center << 1) | right;
    return (ruleNumber >> pattern) & 1;
}

export function runCA1D(ruleNumber, width, generations, startCells = []) {
    const grid = [];
    let row = new Uint8Array(width);

    if (startCells.length > 0) {
        for (const pos of startCells) row[pos] = 1;
    } else {
        row[Math.floor(width / 2)] = 1;
    }

    for (let gen = 0; gen < generations; gen++) {
        grid.push(Array.from(row));
        const next = new Uint8Array(width);
        for (let i = 1; i < width - 1; i++) {
            next[i] = applyRule(ruleNumber, row[i - 1], row[i], row[i + 1]);
        }
        row = next;
    }
    return grid;
}
```

### Step 3: Verify it matches Python

Run `python run_rule.py 30` and compare output with `runCA1D(30, 81, 50)`.

### Step 4: Open `index.html` and see a CA pattern render in the browser

A `<canvas>` drawing the 2D grid as black and white pixels. This is your first "does it work?" moment.

### Step 5: Three.js scene with a sphere

A colored sphere in 3D space. Rotate with mouse. This is your first "this will become a planet" moment.

### Step 6: Heightmap on the sphere

Displace sphere vertices by CA-generated heightmap values. This is the moment the math becomes a world.

From there, follow the phases.

---

## 10.15 The Big Picture

```
PHASE 0 ──→ PHASE 1 ──→ PHASE 2 ──→ PHASE 3 ──→ PHASE 4 ──→ PHASE 5 ──→ PHASE 6 ──→ PHASE 7 ──→ PHASE 8
  Math       Planet      Systems     Survival     Quests      Accounts    Multiplayer   AI          Ship It
  ────       ──────      ───────     ────────     ──────      ────────    ───────────   ──         ───────
  CA engine  3D render   Flight      Stats        Main quest  Login/save  Socket.io     Gemini      Audio
  Heightmap  Terrain     Starfield   Resources    Terminal    Database    Instances     Being       VFX
  Biomes     Atmosphere  Warp        Inventory    Puzzle      JWT auth    Chat          NPCs        Balance
  Seeds      Walking     LOD         Crafting     Combat      Autosave    Discovery     AI quests   Deploy
                                     HUD          XP/levels               Sync

      ◄── FOUNDATION ──►  ◄──── GAME ────►  ◄── ENDGAME ──►  ◄── INFRA ──►  ◄── SOCIAL ──►  ◄─ LAUNCH ─►
```

---

## Cross-References

- **Part 01 (Core Vision)**: First-hour experience maps to Phases 1-4
- **Part 02 (Fractal Foundation)**: Phase 0 implements this entire document
- **Part 03 (Game Mechanics)**: Phase 3 (survival) and Phase 4 (quests)
- **Part 04 (AI Integration)**: Phase 7
- **Part 05 (Multiplayer)**: Phase 6
- **Part 06 (Terminal System)**: Phase 4
- **Part 07 (Frontend)**: Phases 1-2 (rendering), Phase 8 (polish)
- **Part 08 (Database)**: Phase 5
- **Part 09 (Project Structure)**: Referenced throughout all phases
