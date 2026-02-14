# Part 03: Game Mechanics & Quest System

## 1. Design Philosophy

Every mechanic serves one of three purposes:
1. **Keep the player moving** (exploration loop)
2. **Keep the player learning** (progression loop)
3. **Lead the player to the Terminal** (mystery loop)

If a mechanic doesn't serve one of these, it doesn't belong in the game.

---

## 2. Player Stats & Survival

### 2.1 The Four Bars

The player has four vital stats displayed on the HUD:

```
HEALTH        [████████████████████] 100%   - Damage from falls, creatures, hazards
OXYGEN        [████████████████████] 100%   - Depletes in toxic/underwater/vacuum
ENERGY        [████████████████████] 100%   - Powers jetpack, sprint, tools
HAZARD SHIELD [████████████████████] 100%   - Protection from extreme heat/cold/radiation
```

| Stat | Depletes When | Refilled By |
|------|---------------|-------------|
| Health | Taking damage (creatures, falls, combat) | Health packs (crafted from Sodium + Carbon) |
| Oxygen | In toxic atmosphere, underwater, space EVA | Oxygen plants (common), life support module |
| Energy | Sprinting, jetpack use, mining laser, scanner | Charging at ship, energy cells (crafted) |
| Hazard Shield | On extreme planets (hot, cold, radioactive, toxic) | Sodium (yellow plants), shelter, ship interior |

### 2.2 Death & Respawn

- On death: player respawns at their ship (or last save beacon)
- Inventory is **dropped** at death location (can be recovered)
- No permanent loss - this isn't a punishing game
- Grave marker shows on HUD compass for 30 minutes

---

## 3. Movement & Traversal

### 3.1 On Foot

| Action | Control | Notes |
|--------|---------|-------|
| Walk | WASD | Standard first-person |
| Sprint | Shift + WASD | 2x speed, drains Energy |
| Jump | Space | ~2m height |
| Jetpack | Hold Space (in air) | Vertical thrust, drains Energy fast |
| Swim | Auto in water | Slower, Oxygen depletes |
| Interact | E | Pick up, talk, use terminal |
| Scan | F | Scanner overlay, reveals resources/creatures |

### 3.2 In Ship

| Action | Control | Notes |
|--------|---------|-------|
| Thrust | W/S | Forward/reverse |
| Steer | Mouse | Pitch and yaw |
| Roll | A/D | Barrel roll |
| Boost | Shift | 3x speed in atmosphere, pulse drive in space |
| Pulse Drive | Shift (in space) | Fast interplanetary travel |
| Warp Drive | Hold Shift + T | Jump to another star system (requires fuel) |
| Land | Hold E (near surface) | Auto-landing sequence |
| Take Off | Hold E (on ground) | Vertical launch |

### 3.3 Ship Types (Progression)

| Ship | How to Get | Capability |
|------|-----------|------------|
| Starter Ship | Begin game | Short range, 12 inventory slots, no warp |
| Explorer | Buy/find after 3-5 hours | Medium range, 20 slots, warp drive |
| Fighter | Buy/find, combat-focused | Weapons, shields, 16 slots |
| Freighter | Late game purchase | Mobile base, 48 slots, hangar for smaller ship |

---

## 4. Tools & Equipment

### 4.1 The Multi-Tool

The player's primary handheld device. It has module slots:

```
MULTI-TOOL
├── Mining Laser (default)      - Mines resources from rocks/plants
├── Scanner (default)           - Reveals nearby resources, creatures, points of interest
├── Terrain Manipulator (found) - Dig tunnels, flatten terrain, create structures
├── Combat Module (found)       - Ranged weapon for hostile creatures/pirates
└── Analysis Visor (found)      - Deep scan: species data, mineral composition, lore fragments
```

### 4.2 The Tablet

An in-game device the player carries. It serves as:

| Function | Description |
|----------|-------------|
| Map | Shows discovered locations on current planet |
| Star Chart | Shows current star system and known systems |
| Quest Log | Active quests, objectives, cipher fragment count |
| Terminal Interface | Where the code-breaking happens (see Part 06) |
| AI Chat | Communication with Gemini-powered beings (after API key) |
| Codex | Discovered species, lore, resources catalogued |

The Tablet is opened with TAB and is a 2D overlay that dims the 3D world behind it.

---

## 5. Resource System

### 5.1 Resource Categories

| Category | Resources | Found In | Used For |
|----------|-----------|----------|----------|
| **Common** | Carbon, Ferrite, Oxygen | Everywhere | Basic crafting, survival refills |
| **Uncommon** | Sodium, Cobalt, Copper | Specific biomes, caves | Intermediate crafting, hazard protection |
| **Rare** | Chromatic Metal, Ionized Cobalt | Deep caves, specific planets | Advanced tech, upgrades |
| **Exotic** | Void Crystal, Resonance Shard | Extreme planets, anomalies | End-game tech, warp fuel |
| **Quest** | Cipher Fragment | Quest rewards ONLY | Terminal code-breaking |

### 5.2 Gathering Methods

| Method | Tool | Speed | Resources |
|--------|------|-------|-----------|
| Mining Laser | Multi-Tool (default) | Medium | Ferrite, Carbon, minerals |
| Harvesting | Interact (E) | Fast | Plants (Carbon, Sodium, Oxygen) |
| Terrain Manipulator | Multi-Tool (upgrade) | Slow | Underground deposits (Cobalt, Copper) |
| Refining | Portable Refiner (crafted) | Time-based | Combine/upgrade resources |
| Trading | Space Station NPCs | Instant | Buy/sell any non-quest resource |
| Salvaging | Crashed ships/abandoned structures | One-time | Random loot, sometimes rare |

### 5.3 Inventory

```
PLAYER INVENTORY (expandable):
  Starting:  16 slots
  Max:       48 slots (through upgrades)

  Each slot holds:
    Common resources:    max 250 per stack
    Uncommon resources:  max 100 per stack
    Rare resources:      max 50 per stack
    Exotic resources:    max 10 per stack
    Crafted items:       1 per slot
    Cipher Fragments:    1 per slot (max 1 of each type)

SHIP CARGO (separate):
  Starter:  12 slots
  Explorer: 20 slots
  Freighter: 48 slots
  Same stacking rules as player
```

---

## 6. Crafting System

### 6.1 Philosophy

Crafting is simple and functional. No deep crafting trees. No 47-step recipes. You gather stuff, you combine stuff, you get useful stuff.

### 6.2 Recipes (Core Set)

**Survival Items**:
| Item | Recipe | Effect |
|------|--------|--------|
| Health Pack | 20 Carbon + 10 Sodium | Restores 50% Health |
| Oxygen Capsule | 30 Carbon | Restores 50% Oxygen |
| Energy Cell | 20 Ferrite + 10 Carbon | Restores 50% Energy |
| Hazard Shield Recharge | 40 Sodium | Restores 100% Hazard Shield |

**Equipment**:
| Item | Recipe | Effect |
|------|--------|--------|
| Portable Refiner | 30 Ferrite + 20 Carbon | Place on ground, combine resources |
| Save Beacon | 50 Ferrite + 20 Copper | Manual save point, respawn location |
| Signal Booster | 40 Ferrite + 30 Carbon + 10 Copper | Scans for nearby points of interest |
| Terrain Manipulator | 50 Cobalt + 30 Ferrite | Multi-Tool module: dig/flatten terrain |
| Analysis Visor | 40 Copper + 20 Cobalt | Multi-Tool module: deep scanning |

**Ship Components**:
| Item | Recipe | Effect |
|------|--------|--------|
| Launch Fuel | 40 Ferrite + 20 Carbon | Fuel for ship takeoff (1 use) |
| Pulse Drive Fuel | 50 Copper + 20 Ferrite | Fuel for in-system fast travel |
| Warp Cell | 1 Chromatic Metal + 30 Copper + 50 Ferrite | Fuel for inter-system warp (1 jump) |

### 6.3 Refining (Resource Upgrading)

The Portable Refiner lets you combine/upgrade resources:

```
Carbon + Carbon          -> Condensed Carbon (2x value)
Ferrite + Ferrite        -> Magnetized Ferrite (advanced crafting)
Copper + Chromatic Metal -> Ionized Cobalt (rare resource)
Cobalt + Cobalt          -> Ionized Cobalt
Any Common x3            -> 1 Uncommon equivalent
Any Uncommon x3          -> 1 Rare equivalent
```

---

## 7. Discovery & Naming

### 7.1 What Can Be Discovered

| Discovery | Reward | Naming? |
|-----------|--------|---------|
| New Planet (first landing) | 500 XP | Yes - name persists for all players |
| New Species (first scan) | 200 XP | Yes - name persists for all players |
| New Star System (first warp) | 1000 XP | Yes - name persists for all players |
| Point of Interest | 100 XP | No |
| Resource Deposit | 50 XP | No |
| Ancient Structure | 300 XP + Lore | No |

### 7.2 XP & Level System

XP unlocks new **Tech Tiers**, not character stats. The player doesn't get "stronger" - they get access to better tools and further travel.

| Level | XP Required | Unlocks |
|-------|-------------|---------|
| 1 | 0 | Starting equipment |
| 2 | 1,000 | Terrain Manipulator recipe |
| 3 | 3,000 | Analysis Visor recipe, Signal Booster recipe |
| 4 | 6,000 | Warp Drive access (can craft Warp Cells) |
| 5 | 10,000 | Fighter/Explorer ship purchase enabled |
| 6 | 20,000 | Advanced Mining Laser (faster gathering) |
| 7 | 35,000 | Hazard Protection upgrades |
| 8 | 50,000 | Freighter purchase enabled |
| 9 | 75,000 | Exotic resource detection |
| 10 | 100,000 | "Architect" title - can build persistent bases |

---

## 8. The Quest System

### 8.1 Quest Types

| Type | Description | Reward |
|------|-------------|--------|
| **Main Quest** | The central story, leads to the Terminal | Cipher Fragments, lore, major unlocks |
| **Side Quest** | Optional planet/system-specific tasks | XP, resources, equipment blueprints |
| **AI Quest** | Gemini-generated unique quests per player | Unique lore, Cipher hints, rare resources |
| **Discovery Quest** | Auto-generated: "Scan 5 species on this planet" | XP bonus |
| **Multiplayer Quest** | Co-op objectives when playing with others | Shared rewards, exclusive cosmetics |

### 8.2 Main Quest Line: "The Signal"

This is the central narrative that leads the player from tutorial to Terminal. It has **5 Acts**, each ending with a Cipher Fragment.

---

#### ACT 1: "Awakening" (Tutorial - 15 min)

**Setting**: Starter planet, near crashed ship

**Quest Steps**:
1. **"Vital Signs"** - Your life support is failing. Find Carbon from nearby plants.
   - Objective: Harvest 20 Carbon
   - Teaches: Movement, interaction, gathering

2. **"Patch Job"** - Your ship needs basic repairs.
   - Objective: Mine 30 Ferrite from rocks
   - Teaches: Mining laser, resource types

3. **"First Breath"** - Craft a life support module.
   - Objective: Craft 1 Oxygen Capsule (20 Carbon)
   - Teaches: Crafting menu, inventory management

4. **"Lift Off"** - Repair the launch thrusters and take off.
   - Objective: Craft Launch Fuel (40 Ferrite + 20 Carbon), install in ship
   - Teaches: Ship interaction, departure

**Act 1 Reward**: Discovery of the LOCKED TERMINAL on the ship's bridge
- Player sees: "TERMINAL ACTIVE. ACCESS DENIED. CIPHER KEY REQUIRED: 0 of 5 FRAGMENTS."

---

#### ACT 2: "The Signal" (First system exploration - 30 min)

**Setting**: Starter star system (2-3 planets + space station)

**Quest Steps**:
5. **"The Hum"** - A faint signal is detected. Fly to the space station.
   - Objective: Dock at the space station
   - Teaches: Space flight, docking

6. **"Trade Routes"** - The station has traders. Sell some resources, buy a Scanner upgrade.
   - Objective: Sell 50 Carbon, buy Analysis Visor blueprint
   - Teaches: Trading, economy, NPC interaction

7. **"The Source"** - The signal is coming from the second planet. Investigate.
   - Objective: Fly to Planet 2, land near the signal marker
   - Teaches: Interplanetary travel, planet selection

8. **"Ancient Echoes"** - Find the ancient structure emitting the signal.
   - Objective: Locate and enter the structure
   - Contains: First lore inscription on the walls (CA pattern art)
   - Inside: A pedestal with the first Cipher Fragment

**Act 2 Reward**: CIPHER FRAGMENT 1 of 5
- Terminal now shows: "CIPHER KEY: 1 of 5 FRAGMENTS. Decryption: 20%"
- Fragment contains a partial code + a riddle hinting at where to find the next

---

#### ACT 3: "The Void Traveler" (New system - 45 min)

**Setting**: Second star system (requires crafting first Warp Cell)

**Quest Steps**:
9. **"Beyond the Horizon"** - The fragment contains coordinates to another star system.
   - Objective: Craft a Warp Cell, install Warp Drive, jump to new system
   - Teaches: Warp mechanics, resource planning for long journeys

10. **"Hostile Ground"** - The target planet has extreme conditions (toxic/hot/cold).
    - Objective: Survive on the surface for 3 minutes, reach the signal point
    - Teaches: Hazard shield management, Sodium gathering

11. **"The Mysterious Being"** - Inside an enormous ancient temple, you find... someone.
    - An entity of light. Speaking in fragmented, poetic language.
    - It says: *"You seek the cipher. But the cipher seeks the Key of Insight."*
    - **THE GEMINI MOMENT** (detailed in Part 04):
      - The Being's tablet lights up
      - Text: "To awaken the Ancient Mind, you must retrieve the Key of Insight from the Order of Google."
      - Button: "Seek the Key" -> opens browser to Google AI Studio
      - Player pastes API key into the in-game tablet
      - The Being AWAKENS - now Gemini-powered

12. **"First Communion"** - Talk to the now-awakened Being.
    - Gemini generates unique lore about the player's universe
    - The Being gives a personalized hint about Cipher Fragment 2
    - The Being reveals: *"The code you seek is not hidden. It is the rule that shapes this world. Look at the patterns."*

**Act 3 Reward**: CIPHER FRAGMENT 2 of 5 + Gemini AI unlocked
- Terminal: "CIPHER KEY: 2 of 5 FRAGMENTS. Decryption: 40%"
- The Being can now be contacted through the Tablet from anywhere

---

#### ACT 4: "The Pattern" (Multi-system exploration - 2-3 hours)

This act is less linear. The player must visit **3 different star systems** to collect 3 fragments. The Being provides personalized hints via the Tablet.

**Quest Steps**:
13. **"The Fractal World"** - Visit a Rule 90 galaxy (fractal/crystalline planets).
    - The fragment is hidden in a crystal cave that mirrors the Sierpinski triangle pattern
    - Puzzle: Arrange crystals in the correct fractal pattern to unlock the vault
    - **CIPHER FRAGMENT 3**

14. **"The Chaotic Shore"** - Visit a Rule 30 galaxy (chaotic/organic planets).
    - The fragment is guarded by complex creature ecosystems
    - Puzzle: Scan 10 unique species, their behavior patterns reveal a code sequence
    - **CIPHER FRAGMENT 4**

15. **"The Living Code"** - Visit a Rule 110 galaxy (computational/complex planets).
    - The fragment is inside a structure where walls display actual CA patterns
    - Puzzle: The player must identify the correct rule number by observing the pattern
    - Hints: The Being explains how to "read" cellular automata
    - **CIPHER FRAGMENT 5**

**Act 4 Reward**: All 5 CIPHER FRAGMENTS collected
- Terminal: "CIPHER KEY: 5 of 5 FRAGMENTS. DECRYPTION READY. INITIATE?"

---

#### ACT 5: "The Terminal" (The Endgame Puzzle - 30 min to hours)

**Setting**: The player's own ship

**Quest Steps**:
16. **"Decryption"** - Use the Terminal to combine all 5 fragments.
    - The Terminal presents the code-breaking minigame (detailed in Part 06)
    - Player must solve a multi-step logic puzzle using the cipher fragments as keys
    - The Being offers hints if asked (Gemini-powered assistance)

17. **"The Revelation"** - The Terminal unlocks.
    - The screen displays the RULE NUMBER of the player's home galaxy
    - The actual CA pattern runs on-screen, and the player sees it morph into a terrain map
    - The Being speaks: *"Now you see. The world was never random. It was always this simple. One rule. One constraint. Everything."*
    - **UNLOCKS**:
      - Galaxy Map (can now warp to ANY of the 256 rule-galaxies)
      - "Code Hunter" title
      - Terminal now functions as a CA explorer (run any rule, see the pattern)
      - Access to the "Deep Terminal" (end-game content, procedurally generated puzzles)

---

### 8.3 Side Quest Templates

Side quests are procedurally generated using templates + planet data:

**Rescue Template**:
```
"Distress Signal on [PLANET_NAME]"
- Fly to planet, locate crashed ship
- Repair ship (gather resources)
- Reward: Resources, XP, sometimes a ship upgrade module
```

**Scan Template**:
```
"Cataloguing [BIOME_NAME]"
- Scan [3-10] unique species on this planet
- Reward: XP, Analysis Visor upgrade, species data
```

**Fetch Template**:
```
"[NPC_NAME] needs [RESOURCE x AMOUNT]"
- Gather specific resource
- Return to NPC
- Reward: Credits, rare resource, blueprint
```

**Exploration Template**:
```
"The [ADJECTIVE] [STRUCTURE] of [PLANET_NAME]"
- Locate a specific point of interest
- Investigate (may contain lore, puzzle, or combat encounter)
- Reward: XP, lore entry, sometimes Cipher hint
```

**AI Quest Template** (Gemini-generated):
```
The Being contacts you with a unique, contextual quest.
- Based on player's current location, inventory, and progression
- Generated by Gemini with structured output
- Always rewards: unique lore + Cipher hint or rare resource
- These quests feel "alive" because no two players get the same one
```

---

## 9. Combat (Simple, Not Central)

Combat exists but isn't the focus. This is an exploration game with occasional danger.

### 9.1 Creature Combat

| Threat Level | Behavior | Example |
|-------------|----------|---------|
| Passive | Flees from player | Grazers, flyers |
| Neutral | Ignores player unless attacked | Large beasts |
| Territorial | Attacks if player enters area | Cave dwellers, nest guards |
| Predator | Hunts player on sight | Rare, planet-specific |

**Combat mechanics**:
- Combat Module on Multi-Tool fires energy bolts
- Creatures have health bars (visible when scanned)
- Killing drops resources (Carbon, rare biological materials)
- No PvP in default mode (opt-in only in multiplayer settings)

### 9.2 Space Combat (Rare)

- Pirate encounters when carrying valuable cargo (random event)
- Simple dogfighting: aim ship weapons, dodge incoming fire
- Can flee by boosting away and entering pulse drive
- Reward for defeating pirates: salvaged cargo, rare resources

---

## 10. Base Building (Post-Terminal)

After completing Act 5 and reaching Level 10, players unlock base building:

### 10.1 What You Can Build

| Structure | Cost | Function |
|-----------|------|----------|
| Foundation | 50 Ferrite | Base platform (snap grid) |
| Wall | 30 Ferrite | Vertical wall segment |
| Roof | 30 Ferrite | Ceiling/roof segment |
| Door | 20 Ferrite + 10 Carbon | Entry/exit |
| Storage Container | 50 Ferrite + 20 Carbon | 24 extra inventory slots |
| Refiner Station | 100 Ferrite + 50 Copper | Faster refining, more recipes |
| Landing Pad | 200 Ferrite + 100 Copper | Ship lands here, auto-repair |
| Teleporter | 100 Chromatic Metal + 50 Cobalt | Fast travel between bases |
| Terminal Uplink | 200 Chromatic Metal | Access the Deep Terminal from base |

### 10.2 Base Persistence

- Bases are **server-stored** (not generated from seed)
- Other players can visit your base in multiplayer
- Max 3 bases per player (expandable later)
- Base exists at exact planet coordinates

---

## 11. Economy

### 11.1 Currency

**Credits** - Universal currency. Earned by:
- Selling resources at space stations
- Completing quests
- Scanning discoveries (uploaded to the "Galactic Atlas")
- Trading with other players (multiplayer)

### 11.2 Pricing Guide

| Item | Buy Price | Sell Price |
|------|-----------|------------|
| Carbon (x10) | 20 credits | 10 credits |
| Ferrite (x10) | 25 credits | 12 credits |
| Sodium (x10) | 40 credits | 20 credits |
| Cobalt (x10) | 80 credits | 40 credits |
| Copper (x10) | 60 credits | 30 credits |
| Chromatic Metal (x1) | 500 credits | 250 credits |
| Warp Cell | 2,000 credits | 1,000 credits |
| Explorer Ship | 50,000 credits | — |
| Fighter Ship | 75,000 credits | — |
| Freighter | 500,000 credits | — |

### 11.3 Dynamic Pricing (Per System)

Each star system has a local economy modifier:
```
local_price = base_price * (0.7 + hash(system_seed, resource_id) * 0.6)
```
This means prices vary +-30% per system. Players can profit by buying low in one system and selling high in another. This is deterministic (same system always has same prices) so players can learn trade routes.

---

## 12. Progression Summary

| Hours Played | What the Player Has | What's Unlocked |
|-------------|--------------------|-----------------|
| 0-0.5 | Crashed ship, basic tools | Tutorial planet, survival mechanics |
| 0.5-1 | Repaired ship, 1st fragment | Space flight, space station, trading |
| 1-2 | Warp drive, 2nd fragment, Gemini AI | Inter-system travel, AI companion |
| 2-5 | Fragments 3-5, multiple systems explored | Code-breaking ready, diverse planets |
| 5-8 | Terminal cracked, galaxy map | All 256 galaxies accessible, Code Hunter |
| 8+ | Base building, deep terminal, endgame | Infinite exploration, AI quests, multiplayer |

---

## 13. What This Document Doesn't Cover

- **How exactly does Gemini generate quests?** -> Part 04 (AI Integration)
- **How does multiplayer affect quests and discovery?** -> Part 05 (Multiplayer)
- **What does the Terminal code-breaking minigame look like?** -> Part 06 (Terminal System)
- **How is the HUD/UI rendered?** -> Part 07 (Rendering)
- **How is quest state saved?** -> Part 08 (Database)

---

## Next Document: Part 04 - AI Integration (Gemini API)

How does Gemini become the soul of the game? How does the Mysterious Being remember conversations? How are AI quests structured so they feel alive but don't break the game?
