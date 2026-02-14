# Part 01: Core Vision & Universe Engine

## 1. The Game in One Sentence

The Galactic Order is a web-based space exploration game where every planet, star system, and creature emerges from cellular automata rules - and players use AI to unlock the deepest mysteries of a procedurally generated universe.

---

## 2. The Elevator Pitch

Imagine No Man's Sky, but:
- It runs in your browser (no download, no install)
- The universe isn't random noise - it's grown from mathematical rules that produce real fractal complexity
- An AI (Gemini) lives inside the game world as ancient beings, giving every player a unique, personalized experience
- There's a central mystery: a locked Terminal on every player's ship that requires cracking a code - and the quest to crack it teaches you how the universe itself works
- Single-player AND multiplayer, seamless transition between both

---

## 3. Core Pillars

### Pillar 1: Emergent Universe
The world isn't designed - it emerges. Just like Rule 30 produces infinite complexity from `p XOR (q OR r)`, every element of the game world grows from simple constraints. Players should feel like they're exploring something that was GROWN, not built.

### Pillar 2: The Code Hunt
The game's central narrative mirrors the real-world question: "Does the universe have source code?" Players collect cipher fragments, solve puzzles, and eventually crack a terminal that reveals the mathematical rule governing their current star system. The game teaches real computational concepts through play.

### Pillar 3: AI-Powered Uniqueness
No two players have the same experience. Gemini-powered NPCs remember conversations, generate unique lore, adapt quests to player behavior, and serve as the bridge between the game's mechanics and its philosophy.

### Pillar 4: Accessible Depth
Runs in a browser. No install. No gaming PC required. You can explore a planet in 5 minutes or lose yourself for hours in the terminal puzzle system. Low floor, high ceiling.

---

## 4. Universe Structure

### 4.1 The Hierarchy

```
THE GALACTIC ORDER (Universe)
|
+-- Galaxy Cluster (Rule Family - e.g., "Chaotic Rules 25-35")
    |
    +-- Galaxy (Single Rule Number - e.g., Rule 30)
        |
        +-- Star System (Rule + Seed Offset)
            |
            +-- Star (Central body, properties derived from rule density)
            |
            +-- Planet 1 (Rule output row N as heightmap seed)
            |   |
            |   +-- Biome A (Sub-rule applied to terrain regions)
            |   +-- Biome B
            |   +-- Structures (L-system flora, CA-derived formations)
            |   +-- Creatures (Behavioral CA - simple rules -> complex behavior)
            |   +-- Resources (Distributed by rule density patterns)
            |
            +-- Planet 2
            +-- Planet 3
            +-- Asteroid Belt (Sparse rule output)
            +-- Space Station (Fixed structure, NPC hub)
```

### 4.2 Scale Numbers

| Level | Count | Generation Method |
|-------|-------|-------------------|
| Galaxy Clusters | ~10 | Rule families (Class I-IV) |
| Galaxies | 256 | One per Wolfram elementary rule |
| Star Systems per Galaxy | ~10,000 | Rule + seed offset combinations |
| Planets per System | 1-8 | Derived from rule density |
| Biomes per Planet | 2-6 | Sub-rule terrain classification |

### 4.3 The Rule-to-World Pipeline

```
RULE NUMBER (0-255)
       |
       v
RUN CA FOR N GENERATIONS ──> 1D Pattern (like your terminal output)
       |
       v
FOLD INTO 2D HEIGHTMAP ──> Terrain elevation data
       |
       v
APPLY NOISE OCTAVES ──> Smooth terrain with CA-driven variation
       |
       v
CLASSIFY BIOMES ──> Rule density determines climate/terrain type
       |
       v
GENERATE MESH (Three.js) ──> 3D planet you can walk on
       |
       v
POPULATE ──> Flora (L-systems), fauna (behavioral CA), resources
```

---

## 5. The Player Experience (First Hour)

### 5.1 Cold Open (No Login Required)
- Player opens the game URL
- Sees a starfield with a slowly rotating planet
- Title: "THE GALACTIC ORDER"
- Single button: "BEGIN"
- No account creation yet - they just start playing

### 5.2 The Awakening (Tutorial Planet - 15 min)
- Player wakes up on a planet surface next to a crashed ship
- HUD appears: health, oxygen, temperature
- Guided by a text prompt system (no voice acting needed):
  - "Your ship's systems are offline. Scan the environment."
  - "Collect carbon from plants to repair life support."
  - "Mine minerals to fix the launch thrusters."
- Player learns: movement, scanning, mining, inventory, crafting
- Ship repair requires 3 basic resources found nearby

### 5.3 First Flight (5 min)
- Ship lifts off, player sees the planet from orbit
- Star system view: 2-3 other planets visible
- Player can fly to another planet or find the space station
- Discovery mechanic: first time visiting a planet = naming rights

### 5.4 The Space Station (10 min)
- Player docks at the star system's space station
- Meets NPC traders (simple scripted dialogue at first)
- Buys/sells resources, upgrades equipment
- Discovers the "LOCKED TERMINAL" on their ship's bridge
  - Terminal displays: "ACCESS DENIED - CIPHER REQUIRED"
  - Player receives Quest: "The Signal" - follow a mysterious signal source

### 5.5 The Mysterious Being (20 min)
- Following the signal leads to a specific planet
- On the surface: an ancient structure
- Inside: The Mysterious Being (first AI-powered NPC)
- The Being speaks in fragmented, philosophical language
- It says: "To see through the machine's eyes, you must bring the Key of Insight."
- **THE GEMINI MOMENT**: An in-game tablet opens showing:
  - "The Key of Insight is held by an ancient order called Google."
  - A button: "Seek the Key" (opens browser to Google AI Studio API key page)
  - Player gets their free Gemini API key
  - Pastes it into the in-game tablet
  - The Being "awakens" - now powered by actual Gemini AI
  - First real AI conversation: the Being gives personalized lore about the player's universe

### 5.6 Account Creation (After Gemini Moment)
- After the Being awakens, player is prompted:
  - "The Order requires your identity to remember your journey."
  - Simple account creation: username + password (or Google OAuth)
  - API key is encrypted and stored locally + server-side
  - Player's progress is now saved

---

## 6. Core Gameplay Loops

### 6.1 The Exploration Loop (Minute-to-Minute)
```
LAND ON PLANET -> SCAN ENVIRONMENT -> FIND RESOURCES/DISCOVERIES
       ^                                         |
       |                                         v
       +--- CRAFT/UPGRADE <--- COLLECT RESOURCES ---+
```

### 6.2 The Progression Loop (Hour-to-Hour)
```
VISIT NEW SYSTEM -> COMPLETE QUESTS -> EARN CIPHER FRAGMENTS
       ^                                        |
       |                                        v
       +--- UNLOCK NEW REGIONS <--- CRACK TERMINAL CODES ---+
```

### 6.3 The Mystery Loop (Session-to-Session)
```
TALK TO AI BEINGS -> RECEIVE PERSONALIZED CLUES -> SOLVE DEEPER PUZZLES
       ^                                                    |
       |                                                    v
       +--- DISCOVER NEW LORE <--- UNDERSTAND THE "CODE" ---+
```

### 6.4 The Multiplayer Loop
```
EXPLORE ALONE -> ENCOUNTER OTHER PLAYER -> TRADE/COOPERATE/COMPETE
       ^                                              |
       |                                              v
       +--- SHARED DISCOVERIES <--- BUILD TOGETHER ---+
```

---

## 7. What Makes This Different From No Man's Sky

| Feature | No Man's Sky | The Galactic Order |
|---------|-------------|-------------------|
| Platform | Console/PC (installed) | Browser (instant play) |
| Universe Gen | Perlin noise + hand-crafted rules | Cellular automata (mathematically deep) |
| AI | None (scripted NPCs) | Gemini-powered beings with memory |
| Central Mystery | Atlas Path (scripted) | Terminal code-breaking (procedural + AI) |
| Learning | None | Teaches real computational concepts |
| Multiplayer Entry | Always online | Start single-player, opt into MP |
| Cost to Run AI | Developer pays for servers | Player provides own API key (free tier) |
| Graphics | AAA (requires good hardware) | Stylized/low-poly (runs in any browser) |

---

## 8. Art Direction

### Style: "Geometric Cosmos"
- NOT trying to be photorealistic (that's No Man's Sky's territory)
- Low-poly planets with sharp, geometric edges
- Color palettes derived from cellular automata patterns
- Glowing wireframe overlays on ancient structures
- Terminal/hacker aesthetic for UI (dark background, neon text)
- The fractal patterns from the Python scripts appear in-game as:
  - Ancient wall inscriptions
  - Star map patterns
  - Terminal code displays
  - Terrain formations when viewed from orbit

### Color Philosophy
- Each rule "family" has a dominant color palette:
  - Chaotic rules (Rule 30 family): Deep reds, oranges, volcanic
  - Fractal rules (Rule 90 family): Blues, cyans, crystalline
  - Computational rules (Rule 110 family): Greens, alive, organic
  - Dead rules (Rule 0 family): Grays, barren, silent

---

## 9. Monetization (Future - Not MVP)

The game is **free to play**. AI features use the player's own API key. Potential future monetization:

- **Cosmetic skins** for ships, suits, terminals
- **Premium star systems** with hand-crafted content layered on top of procedural generation
- **Server hosting** for persistent multiplayer bases
- **No pay-to-win. Ever.**

---

## 10. Technical Constraints

### Must Run In Browser
- WebGL 2.0 target (Three.js handles this)
- Max initial download: <10MB (stream assets on demand)
- Target: 30fps on mid-range laptop, 60fps on desktop
- No plugins, no extensions, just a URL

### Planet Detail Budget
- Max vertices per visible planet surface: 50,000
- LOD system: 4 levels (far orbit -> surface walk)
- Max simultaneous planets rendered: 3 (current system)
- Texture resolution: 512x512 procedural (generated on GPU via shaders)

### Network Budget
- WebSocket message size: <1KB per update
- Player position sync rate: 10Hz (interpolated client-side to 60fps)
- Max players per instance: 16
- Server authoritative for: position, inventory, quest state
- Client authoritative for: camera, UI, local effects

---

## 11. Open Questions (To Resolve in Later Documents)

1. **How exactly do 1D CA rules become 3D terrain?** -> Part 02
2. **What are the specific quest designs?** -> Part 03
3. **How does Gemini maintain conversation context per player?** -> Part 04
4. **How do we handle players in the same location seeing the same world?** -> Part 05
5. **What does the terminal code-breaking actually look like as gameplay?** -> Part 06
6. **What's the shader pipeline for planet rendering?** -> Part 07
7. **How is the API key stored securely?** -> Part 08
8. **What do we build FIRST?** -> Part 10

---

## Next Document: Part 02 - Fractal Foundation & Procedural Generation

This is where we define the MATH. How Rule 30 in a Python terminal becomes a planet you can walk on in Three.js.
