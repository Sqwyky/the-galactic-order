# Part 05: Multiplayer & Networking

## 1. The Multiplayer Philosophy

No Man's Sky launched single-player and bolted on multiplayer later. We design for both from day one, but with a rule: **single-player must never feel incomplete**.

- The game starts single-player. No lobbies. No waiting. You press "BEGIN" and you're playing.
- Multiplayer is opt-in. You choose to open your session to others.
- When two players are in the same star system, they can see each other. That's it. No forced interaction.
- Everything the universe generates is deterministic. Two players at the same coordinates see the same planet. The server doesn't send terrain - both clients compute it from the same seed.

---

## 2. Architecture Overview

```
                    ┌─────────────────────┐
                    │    GAME SERVER       │
                    │  (Node.js + Socket.io)│
                    │                     │
                    │  - Player registry  │
                    │  - Position sync    │
                    │  - Instance manager │
                    │  - Quest state      │
                    │  - Discovery log    │
                    │  - Chat relay       │
                    └──────────┬──────────┘
                               │
              WebSocket (persistent connection)
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
    ┌─────┴─────┐        ┌─────┴─────┐        ┌─────┴─────┐
    │  CLIENT A │        │  CLIENT B │        │  CLIENT C │
    │           │        │           │        │           │
    │ - 3D Render│       │ - 3D Render│       │ - 3D Render│
    │ - Local CA │       │ - Local CA │       │ - Local CA │
    │   generation│      │   generation│      │   generation│
    │ - Physics  │       │ - Physics  │       │ - Physics  │
    │ - Gemini AI│       │ - Gemini AI│       │ - Gemini AI│
    │   (direct) │       │   (direct) │       │   (direct) │
    └───────────┘        └───────────┘        └───────────┘
```

**Key principle**: The server is THIN. It handles coordination, not computation. All heavy work (terrain generation, rendering, AI calls) happens client-side.

---

## 3. What the Server Handles vs. What the Client Handles

### Server (Authoritative)

| Data | Why Server-Authoritative |
|------|-------------------------|
| Player positions | Prevent teleportation cheats |
| Inventory contents | Prevent item duplication |
| Quest completion flags | Prevent quest cheating |
| Discovery names | Must be consistent for all players |
| Credit balances | Prevent currency exploits |
| Base structures | Must persist and be visible to others |
| Player accounts | Authentication, save data |

### Client (Authoritative)

| Data | Why Client-Authoritative |
|------|-------------------------|
| Terrain generation | Deterministic from seed - no need to sync |
| Flora/fauna placement | Deterministic from seed |
| Camera position/rotation | Latency-sensitive, no cheat risk |
| UI state | Local only |
| Gemini AI conversations | Private, direct to Google API |
| Local effects (particles, sound) | No gameplay impact |
| Resource node existence | Deterministic from seed (depletion state is server-synced) |

---

## 4. Connection Lifecycle

### 4.1 Initial Connection

```
1. Player opens game URL
2. Client loads, renders title screen (no server needed yet)
3. Player presses "BEGIN"
4. IF returning player: authenticate (JWT token from localStorage)
   IF new player: play as guest (no server sync until account creation)
5. Client connects WebSocket to game server
6. Server assigns player to an INSTANCE based on their star system
7. Server sends: other players in same instance, discovery names, base data
8. Client generates terrain locally (from seed) and begins rendering
```

### 4.2 Steady State

```
Client -> Server (10Hz):
  { type: "position", x, y, z, rx, ry, rz, system_id, planet_id, state }
  state = "on_foot" | "in_ship" | "in_station" | "in_menu"

Server -> Client (10Hz):
  { type: "players", players: [
    { id, name, x, y, z, rx, ry, rz, state, ship_type },
    ...
  ]}

Client interpolates between received positions at 60fps.
```

### 4.3 Disconnect Handling

```
- WebSocket heartbeat: every 5 seconds
- If no heartbeat for 15 seconds: server marks player as disconnected
- Other players see disconnected player fade out over 2 seconds
- Player's inventory and quest state are saved on last known state
- On reconnect: server sends full state sync, client resumes
```

---

## 5. Instance System

### 5.1 What Is an Instance?

An instance is a "room" on the server that contains all players in the same star system. Players in different star systems are in different instances and can't see each other.

```
INSTANCE HIERARCHY:

Server
├── Instance: System (14, 7, 22) - Rule 30 Galaxy
│   ├── Player A (on Planet 2)
│   ├── Player B (in space)
│   └── Player C (at station)
├── Instance: System (3, 11, 8) - Rule 90 Galaxy
│   └── Player D (on Planet 1)
├── Instance: System (14, 7, 22) - Rule 30 Galaxy [OVERFLOW #2]
│   ├── Player E
│   ├── ... (players 17-32)
│
└── (empty instances are destroyed)
```

### 5.2 Instance Rules

| Rule | Value | Reason |
|------|-------|--------|
| Max players per instance | 16 | Performance budget |
| Instance creation | Automatic when first player enters system | No manual lobby |
| Instance overflow | New instance created at 16+ | Seamless to players |
| Instance destruction | 60 seconds after last player leaves | Free memory |
| Cross-instance visibility | None | Players in overflow instance can't see original instance |

### 5.3 Instance Assignment

When a player warps to a star system:

```
1. Server checks: is there an instance for (galaxy_rule, system_x, system_y, system_z)?
2. IF yes AND instance.player_count < 16:
     Assign player to existing instance
3. IF yes AND instance.player_count >= 16:
     Create new overflow instance, assign player
4. IF no:
     Create new instance, assign player
5. Server notifies all players in instance: "Player X has arrived"
```

### 5.4 Friends and Groups

Players can form a **Group** (max 4 players). Group members are always assigned to the same instance, even if it means creating a new one.

```
GROUP SYSTEM:

  /invite PlayerName     -> Send group invite
  /accept                -> Accept pending invite
  /leave                 -> Leave current group
  /group                 -> List group members

  Group members:
  - Always in the same instance
  - See each other on HUD compass (name + distance)
  - Can voice chat (WebRTC peer-to-peer, not through server)
  - Share quest markers for co-op quests
  - DO NOT share inventory or progression (each player's journey is their own)
```

---

## 6. Data Synchronization

### 6.1 What Gets Synced and How Often

| Data | Sync Method | Frequency | Direction |
|------|-------------|-----------|-----------|
| Player position/rotation | WebSocket broadcast | 10 Hz | Client -> Server -> All in instance |
| Player state (foot/ship/menu) | WebSocket event | On change | Client -> Server -> All |
| Chat messages | WebSocket event | On send | Client -> Server -> All in instance |
| Discovery name | REST POST | On discovery | Client -> Server (persisted) |
| Resource depletion | WebSocket event | On mine | Client -> Server -> All in instance |
| Quest completion | REST POST | On complete | Client -> Server (persisted) |
| Inventory change | REST POST | On change | Client -> Server (persisted) |
| Base building | WebSocket event | On place/remove | Client -> Server -> All in instance |
| Trade | WebSocket event | On trade action | Between two clients via server |
| Player death | WebSocket event | On death | Client -> Server -> All in instance |

### 6.2 Position Sync Protocol

Position updates are the highest-frequency data. We minimize bandwidth with delta compression:

```javascript
// CLIENT: Send position update
const update = {
    t: "p",                          // type: position (1 byte saves bandwidth)
    x: Math.round(pos.x * 100),     // centimeter precision (integer, not float)
    y: Math.round(pos.y * 100),
    z: Math.round(pos.z * 100),
    rx: Math.round(rot.x * 1000),   // milli-radian precision
    ry: Math.round(rot.y * 1000),
    rz: Math.round(rot.z * 1000),
    s: playerState                   // 0=foot, 1=ship, 2=station, 3=menu
};
// ~40 bytes per update. At 10Hz with 16 players = ~6.4 KB/sec total
```

### 6.3 Client-Side Interpolation

Other players' positions are received at 10Hz but rendered at 60fps. We interpolate:

```javascript
// CLIENT: Render other players smoothly
function updateRemotePlayer(player, deltaTime) {
    const INTERP_SPEED = 10; // lerp factor
    player.displayPos.lerp(player.serverPos, INTERP_SPEED * deltaTime);
    player.displayRot.slerp(player.serverRot, INTERP_SPEED * deltaTime);
}
```

This creates smooth movement even with only 10 updates/second. A 100ms latency is invisible to the eye.

### 6.4 Resource Depletion Sync

When a player mines a resource node, that node should disappear for everyone:

```
CLIENT A mines a Ferrite deposit:
  1. Client A: node disappears locally, resources added to inventory
  2. Client A -> Server: { type: "deplete", node_id: hash(x, y, z, resource_type) }
  3. Server: marks node as depleted in instance state
  4. Server -> All other clients in instance: { type: "deplete", node_id: ... }
  5. Client B, C: node disappears with mining particle effect
  6. Server -> Database: persist depletion (node regenerates after 30 min real time)
```

The `node_id` is a hash of the node's world position. Since all clients generate nodes from the same seed, they all know which node was depleted.

---

## 7. Message Protocol

### 7.1 WebSocket Message Format

All messages are JSON, compressed with minimal keys:

```javascript
// Position update (most frequent)
{ t: "p", x: 1423, y: 892, z: -3421, rx: 1571, ry: 0, rz: 234, s: 0 }

// Chat message
{ t: "c", msg: "Hello!", channel: "local" }

// Player joined instance
{ t: "j", id: "abc123", name: "Dudu", ship: 2 }

// Player left instance
{ t: "l", id: "abc123" }

// Resource depleted
{ t: "d", nid: "fe29a8c1" }

// Base block placed
{ t: "b", action: "place", bx: 14, by: 0, bz: -7, block: 3 }

// Trade offer
{ t: "tr", to: "player_id", offer: [...], request: [...] }

// Discovery claim
{ t: "disc", type: "planet", seed: 55109283, name: "Dudu's World" }
```

### 7.2 Bandwidth Budget

| Source | Rate | Size | Total |
|--------|------|------|-------|
| Position updates (self) | 10/sec | 40 bytes | 400 B/s |
| Position updates (15 others) | 10/sec | 40 bytes each | 6,000 B/s |
| Chat (average) | 0.1/sec | 200 bytes | 20 B/s |
| Events (depleting, building) | 0.5/sec | 100 bytes | 50 B/s |
| **Total per player** | | | **~6.5 KB/s** |

6.5 KB/s is negligible. Even a poor mobile connection handles this easily.

---

## 8. Player Interaction

### 8.1 Proximity Detection

Players see each other when within render distance:

```
RENDER DISTANCES:
  On same planet surface:  500 meters  (player model visible)
  In space (same system):  50 km       (ship icon on HUD)
  At space station:        Always      (station is a shared space)
  Different systems:       Never       (different instances)
```

### 8.2 Player Rendering

Other players appear as:
- **On foot**: Astronaut model (same for everyone in MVP, customizable later)
- **In ship**: Their ship model (based on ship type)
- **Nametag**: Floating above head, visible within 100m (foot) or 10km (ship)
- **Group members**: Green nametag + compass marker at any distance

### 8.3 Interaction Menu

When within 10 meters of another player, pressing E opens the interaction menu:

```
┌─────────────────────────┐
│   PLAYER: Dudu          │
│   Level 7 | Explorer    │
│                         │
│   [TRADE]               │
│   [INVITE TO GROUP]     │
│   [INSPECT]             │
│   [WAVE]                │
│                         │
│   [CLOSE]               │
└─────────────────────────┘
```

### 8.4 Trading

Two players can trade resources and items:

```
TRADE FLOW:

1. Player A targets Player B, presses [TRADE]
2. Server relays trade request to Player B
3. Player B accepts -> Trade UI opens for both
4. Both players place items in their "offer" slot
5. Both players see each other's offers in real-time (WebSocket)
6. Both players click [CONFIRM]
7. Server validates: both have the items they offered
8. Server swaps items atomically
9. Trade complete, UI closes
```

Server validates everything. No client can lie about what they have.

### 8.5 Text Chat

```
CHAT CHANNELS:

  Local:   Players within 100m hear you (default)
  System:  All players in the star system instance
  Group:   Your group only (if in a group)
  Global:  All online players (rate limited: 1 msg per 30 sec)
```

Voice chat is handled via WebRTC peer-to-peer between group members. The server only facilitates the WebRTC signaling handshake, not the audio data itself.

---

## 9. Shared Universe State

### 9.1 Discovery Persistence

When a player names a planet, species, or star system, that name persists for ALL players:

```
DISCOVERY FLOW:

1. Player A lands on an unnamed planet
2. Client shows: "Undiscovered Planet. Name it?"
3. Player A types: "Crimson Ridge"
4. Client -> Server: POST /api/discovery
   { type: "planet", seed: 55109283, name: "Crimson Ridge", discoverer: "PlayerA" }
5. Server validates: not already named, name is appropriate (basic filter)
6. Server stores in database
7. Any future player visiting this planet sees: "Crimson Ridge (Discovered by PlayerA)"
```

### 9.2 Shared Base Visibility

Bases built by players are visible to other players who visit the same planet:

```
BASE LOADING:

1. Player B enters a star system
2. Server sends: "There are 2 player bases in this system"
   { bases: [
     { owner: "PlayerA", planet_seed: 55109283, position: {x,y,z}, blocks: [...] },
     { owner: "PlayerC", planet_seed: 55109283, position: {x,y,z}, blocks: [...] }
   ]}
3. Client B renders these bases alongside procedural terrain
4. Player B can visit but NOT modify other players' bases
```

### 9.3 What Is NOT Shared

| Data | Shared? | Why |
|------|---------|-----|
| Terrain/flora/fauna | No (computed locally) | Deterministic from seed |
| Player's quest progress | No | Each journey is personal |
| Cipher fragments collected | No | Personal progression |
| AI conversations with Being | No | Private, player-specific |
| Inventory | No (except during trade) | Personal |
| Terminal puzzle state | No | Personal puzzle |

---

## 10. Anti-Cheat (Lightweight)

This is a browser game, so we can't prevent all cheating. But we can make it not worth the effort:

### 10.1 Server Validation

```
VALIDATED ACTIONS:

- Inventory changes: Server tracks expected inventory. If client claims
  to have 999 Chromatic Metal but never mined any, reject.

- Position: If player moves faster than max speed (ship boost + 20% tolerance),
  snap back to last valid position.

- Trade: Server holds both players' items in escrow during trade.
  Atomic swap prevents duplication.

- Discovery naming: Server checks for duplicates and filters inappropriate names.

- Quest completion: Server validates prerequisites (e.g., can't complete Act 3
  without finishing Act 2).
```

### 10.2 What We Don't Worry About

- Wallhacking: Not meaningful in an exploration game
- Aimbots: Minimal combat, not competitive
- Speed hacks: Server-enforced position makes these visible but harmless
- Inventory editors (offline): Local save can be modified, but server is authoritative. Offline edits are overwritten on reconnect.

The philosophy: if someone wants to cheat in a single-player exploration game, let them. Server-side validation prevents them from affecting other players.

---

## 11. Server Infrastructure

### 11.1 MVP Server (Single Process)

For launch and early player base (up to ~500 concurrent players):

```
Single Node.js process:
  - Express for REST API (auth, discovery, saves)
  - Socket.io for WebSocket (position sync, chat, events)
  - SQLite database (player data, discoveries)
  - In-memory instance map

Hardware: Any VPS with 2 cores, 4GB RAM
  Example: $20/month DigitalOcean or Hetzner
```

### 11.2 Scaled Server (Future)

If the game grows beyond 500 concurrent:

```
                    ┌──────────────┐
                    │  LOAD BALANCER│
                    │  (nginx)      │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌────┴─────┐ ┌────┴─────┐
        │  GAME      │ │  GAME    │ │  GAME    │
        │  SERVER 1  │ │  SERVER 2│ │  SERVER 3│
        │  (instances│ │          │ │          │
        │   1-100)   │ │          │ │          │
        └─────┬──────┘ └─────┬────┘ └────┬─────┘
              │              │           │
              └──────────────┼───────────┘
                             │
                    ┌────────┴────────┐
                    │  PostgreSQL     │
                    │  (shared DB)    │
                    └─────────────────┘

  - Redis for cross-server instance routing
  - Sticky sessions: player stays on same server during session
  - Instance can migrate between servers if load is uneven
```

### 11.3 Server Tick Rate

```
TICK RATES:

  Position broadcast:   10 Hz (every 100ms)
  Instance cleanup:     1 Hz  (every 1 second)
  Resource regeneration: 0.017 Hz (every 60 seconds, check depletions)
  Save persistence:     0.1 Hz (every 10 seconds, batch write dirty data)
  Heartbeat check:      0.2 Hz (every 5 seconds)
```

---

## 12. Session Modes

### 12.1 Solo Mode (Default)

```
- Player is in their own private instance
- No other players can join
- All server features still work (saves, discoveries)
- Lowest latency (no position broadcasting)
- Player can switch to Open at any time
```

### 12.2 Open Mode

```
- Player's instance is visible to matchmaking
- Anyone in the same star system can be placed in this instance
- Max 16 players per instance
- Full interaction: see, chat, trade, group
```

### 12.3 Group Only Mode

```
- Only group members can join this instance
- Up to 4 players
- Best for co-op quest sessions
- Others in the same system are in separate instances
```

### 12.4 Switching Modes

```
Settings -> Multiplayer:
  [Solo]  [Open]  [Group Only]

Switching is instant. If switching from Open to Solo:
  - Player is moved to a new private instance
  - Other players see them "warp out" (fade + particle effect)
```

---

## 13. Multiplayer Quests (Co-Op)

When players are in a group, special co-op objectives appear:

### 13.1 Shared Objectives

```
GROUP QUEST EXAMPLE: "The Resonance Array"

  "A structure on this planet emits a signal on four frequencies.
   Each frequency must be activated simultaneously.
   You will need allies."

  Objective: 4 players stand on 4 pressure plates at the same time
  Reward: Rare resource cache for each player + bonus Cipher hint

  Solo fallback: If attempted solo, a timer mechanic lets one player
  activate plates in sequence (harder but possible).
```

### 13.2 Shared Discovery Bonus

When group members are on the same planet:
- All members get discovery XP when any member scans a new species
- Discovery naming goes to the player who scanned first
- Group members can see each other's scan results on their Analysis Visor

---

## 14. What This Document Doesn't Cover

- **Voice chat implementation details (WebRTC)** -> Future enhancement, not MVP
- **How base building renders for visitors** -> Part 07 (Rendering)
- **Database schema for discovery/saves** -> Part 08 (Database)
- **Server deployment and DevOps** -> Part 09 (Project Structure)

---

## Next Document: Part 06 - Terminal System & Code-Breaking

The signature mechanic of The Galactic Order. How do players crack the terminal? What does the puzzle actually look like? How do Cipher Fragments combine into a solvable challenge?
