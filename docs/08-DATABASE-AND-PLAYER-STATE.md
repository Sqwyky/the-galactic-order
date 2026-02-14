# Part 08: Database & Player State

## THE GALACTIC ORDER - System Design Document
### Data Models, Player Accounts, Save System, Universe Persistence, API Key Storage

---

## 8.1 Database Strategy

### Development vs Production

```
DEVELOPMENT (MVP):
┌─────────────────────────────────┐
│         SQLite (single file)    │
│  tgo_dev.db                     │
│  - Zero config                  │
│  - File-based, portable         │
│  - Good for single-server       │
│  - ~50 concurrent players max   │
└─────────────────────────────────┘

PRODUCTION (Scaled):
┌─────────────────────────────────┐
│      PostgreSQL + Redis         │
│  PostgreSQL:                    │
│  - Player accounts              │
│  - Discoveries                  │
│  - Quest state                  │
│  - Persistent world data        │
│  Redis:                         │
│  - Session tokens               │
│  - Active player positions      │
│  - Instance state               │
│  - Rate limiting counters       │
│  - Chat history (TTL)           │
└─────────────────────────────────┘
```

### Why This Split

SQLite for development because:
- No database server to install or configure
- Single file backup (copy `tgo_dev.db`)
- Identical SQL syntax for 95% of queries
- Fast enough for testing with <50 players

PostgreSQL for production because:
- Concurrent writes from multiple server processes
- JSON/JSONB columns for flexible data (quest state, inventory)
- Full-text search for discovery names
- Connection pooling with `pg-pool`
- Battle-tested at scale

### ORM: None (Query Builder)

We use **Knex.js** as a query builder, NOT a full ORM.

Rationale:
- Supports both SQLite and PostgreSQL with same API
- Migration system built in
- No magic - you write the queries, Knex builds the SQL
- Lightweight (~200KB vs Sequelize ~2MB)

```javascript
// knexfile.js
module.exports = {
  development: {
    client: 'sqlite3',
    connection: { filename: './data/tgo_dev.db' },
    useNullAsDefault: true,
    migrations: { directory: './migrations' }
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: { directory: './migrations' }
  }
};
```

---

## 8.2 Data Models

### Entity Relationship Overview

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐
│ players  │────<│ player_saves │────<│  inventory   │
│          │     │              │     │    _items     │
└──────────┘     └──────────────┘     └──────────────┘
     │                  │
     │                  │           ┌──────────────┐
     │                  └──────────<│  quest_state │
     │                              └──────────────┘
     │
     │           ┌──────────────┐
     ├──────────<│ discoveries  │
     │           └──────────────┘
     │
     │           ┌──────────────┐
     ├──────────<│ ai_contexts  │
     │           └──────────────┘
     │
     │           ┌──────────────┐
     └──────────<│ terminal     │
                 │   _state     │
                 └──────────────┘

Shared (not per-player):
┌──────────────┐     ┌──────────────┐
│ universe     │     │ market       │
│ _discoveries │     │   _prices    │
└──────────────┘     └──────────────┘
```

---

### 8.2.1 `players` Table

The core identity table. Minimal - we don't need much.

```sql
CREATE TABLE players (
    id              TEXT PRIMARY KEY,        -- UUID v4
    username        TEXT UNIQUE NOT NULL,     -- 3-24 chars, alphanumeric + underscore
    display_name    TEXT NOT NULL,            -- What other players see
    password_hash   TEXT NOT NULL,            -- bcrypt, 12 rounds
    email           TEXT UNIQUE,              -- Optional, for password recovery

    -- Gemini integration
    gemini_key_enc  TEXT,                     -- AES-256-GCM encrypted API key
    gemini_key_iv   TEXT,                     -- Initialization vector for decryption
    has_gemini      BOOLEAN DEFAULT FALSE,    -- Quick check without decrypting

    -- Account metadata
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login      DATETIME,
    total_playtime  INTEGER DEFAULT 0,        -- Seconds
    is_banned       BOOLEAN DEFAULT FALSE,
    ban_reason      TEXT,

    -- Settings (stored as JSON)
    settings        TEXT DEFAULT '{}'          -- Graphics, audio, controls, UI prefs
);

CREATE INDEX idx_players_username ON players(username);
CREATE INDEX idx_players_last_login ON players(last_login);
```

**Field Notes:**
- `id`: UUID v4, generated server-side. Never exposed raw to client (use session tokens).
- `password_hash`: bcrypt with cost factor 12. ~250ms to hash on modern hardware - slow enough to resist brute force, fast enough not to annoy users.
- `gemini_key_enc`: See Section 8.6 for encryption details.
- `settings`: JSON blob rather than separate columns. Settings change frequently during development - schema changes for every new toggle would be painful.

---

### 8.2.2 `player_saves` Table

The game state snapshot. One active save per player (no save slots in MVP).

```sql
CREATE TABLE player_saves (
    id              TEXT PRIMARY KEY,         -- UUID v4
    player_id       TEXT NOT NULL REFERENCES players(id),

    -- Location
    galaxy_id       INTEGER NOT NULL DEFAULT 0,
    system_seed     TEXT NOT NULL,            -- The CA seed for current star system
    planet_index    INTEGER,                  -- Which planet in system (NULL = in space)
    position_x      REAL NOT NULL DEFAULT 0,
    position_y      REAL NOT NULL DEFAULT 0,
    position_z      REAL NOT NULL DEFAULT 0,
    rotation_y      REAL NOT NULL DEFAULT 0,  -- Facing direction

    -- Player state
    is_on_planet    BOOLEAN DEFAULT TRUE,
    is_in_ship      BOOLEAN DEFAULT FALSE,
    health          REAL DEFAULT 100,
    oxygen          REAL DEFAULT 100,
    energy          REAL DEFAULT 100,
    hazard_shield   REAL DEFAULT 100,

    -- Ship state
    ship_fuel       REAL DEFAULT 100,
    ship_hull       REAL DEFAULT 100,
    ship_position_x REAL,
    ship_position_y REAL,
    ship_position_z REAL,

    -- Progression
    xp_total        INTEGER DEFAULT 0,
    level           INTEGER DEFAULT 1,
    credits         INTEGER DEFAULT 500,      -- Starting credits

    -- Timestamps
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    playtime        INTEGER DEFAULT 0,        -- Seconds in this save

    -- Active save flag
    is_active       BOOLEAN DEFAULT TRUE,

    UNIQUE(player_id, is_active)              -- One active save per player
);

CREATE INDEX idx_saves_player ON player_saves(player_id);
CREATE INDEX idx_saves_system ON player_saves(system_seed);
```

**Why separate from `players`?**
- Save data changes every few seconds (autosave). Account data changes rarely.
- Future: multiple save slots, save branching, save sharing.
- Clean separation of identity vs game state.

---

### 8.2.3 `inventory_items` Table

```sql
CREATE TABLE inventory_items (
    id              TEXT PRIMARY KEY,
    save_id         TEXT NOT NULL REFERENCES player_saves(id) ON DELETE CASCADE,

    item_type       TEXT NOT NULL,            -- 'resource', 'crafted', 'tool', 'fragment'
    item_id         TEXT NOT NULL,            -- e.g., 'iron_ore', 'warp_cell', 'cipher_frag_3'
    quantity        INTEGER DEFAULT 1,

    -- Slot position (for UI ordering)
    slot_category   TEXT NOT NULL,            -- 'suit', 'ship', 'multitool'
    slot_index      INTEGER NOT NULL,

    -- Item-specific data (JSON)
    metadata        TEXT DEFAULT '{}',        -- Durability, charge level, custom name, etc.

    acquired_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_inventory_save ON inventory_items(save_id);
CREATE INDEX idx_inventory_type ON inventory_items(save_id, item_type);
CREATE UNIQUE INDEX idx_inventory_slot ON inventory_items(save_id, slot_category, slot_index);
```

**Inventory Capacity:**
```
Suit:       28 slots (4x7 grid)
Ship:       35 slots (5x7 grid)
Multi-Tool:  5 slots (module slots)
```

**Fragment tracking:**
Cipher fragments are inventory items with `item_type = 'fragment'` and metadata containing:
```json
{
  "fragment_index": 3,
  "binary_data": "01001110",
  "source_quest": "void_signal_alpha",
  "found_at": "system_0xA3F2:planet_2"
}
```

---

### 8.2.4 `quest_state` Table

```sql
CREATE TABLE quest_state (
    id              TEXT PRIMARY KEY,
    save_id         TEXT NOT NULL REFERENCES player_saves(id) ON DELETE CASCADE,

    quest_id        TEXT NOT NULL,            -- 'main_act1', 'side_mineral_survey', etc.
    quest_type      TEXT NOT NULL,            -- 'main', 'side', 'ai_generated', 'daily'
    status          TEXT NOT NULL DEFAULT 'active',  -- 'active', 'completed', 'failed', 'abandoned'

    -- Progress
    current_step    INTEGER DEFAULT 0,
    total_steps     INTEGER NOT NULL,
    step_data       TEXT DEFAULT '{}',        -- JSON: per-step completion flags

    -- AI-generated quest data
    ai_generated    BOOLEAN DEFAULT FALSE,
    ai_prompt_hash  TEXT,                     -- Hash of the prompt that generated this quest
    quest_text      TEXT,                     -- The full quest description (AI or template)
    reward_data     TEXT DEFAULT '{}',        -- JSON: {xp, credits, items}

    -- Timestamps
    started_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME,
    expires_at      DATETIME                  -- For timed/daily quests
);

CREATE INDEX idx_quest_save ON quest_state(save_id);
CREATE INDEX idx_quest_status ON quest_state(save_id, status);
CREATE INDEX idx_quest_type ON quest_state(save_id, quest_type);
```

**Main Quest Tracking:**

The 5-act main quest is tracked as separate quest entries that reference each other:

```
main_act1_awakening       → Steps: crash site → gather → repair → first launch
main_act2_signal          → Steps: receive signal → 3 systems → cipher frags
main_act3_void_traveler   → Steps: mysterious coord → Being encounter → key entry
main_act4_pattern         → Steps: 5 star systems → 5 fragments → pattern recognition
main_act5_terminal        → Steps: find terminal → 4 puzzle stages → crack code
```

---

### 8.2.5 `discoveries` Table

What this player has personally discovered.

```sql
CREATE TABLE discoveries (
    id              TEXT PRIMARY KEY,
    player_id       TEXT NOT NULL REFERENCES players(id),

    -- What was discovered
    discovery_type  TEXT NOT NULL,            -- 'system', 'planet', 'species', 'flora', 'mineral'

    -- Location identifiers (deterministic from seeds)
    galaxy_id       INTEGER NOT NULL,
    system_seed     TEXT NOT NULL,
    planet_index    INTEGER,                  -- NULL for system discoveries
    entity_seed     TEXT,                     -- Specific creature/plant seed

    -- Player-assigned data
    custom_name     TEXT,                     -- Player's name for this discovery
    notes           TEXT,                     -- Player's personal notes

    -- Metadata
    discovered_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    uploaded        BOOLEAN DEFAULT FALSE     -- Shared to universe_discoveries?
);

CREATE INDEX idx_disc_player ON discoveries(player_id);
CREATE INDEX idx_disc_system ON discoveries(system_seed);
CREATE INDEX idx_disc_type ON discoveries(player_id, discovery_type);
```

---

### 8.2.6 `universe_discoveries` Table

The shared discovery database. When a player "uploads" a discovery, it goes here.

```sql
CREATE TABLE universe_discoveries (
    id              TEXT PRIMARY KEY,

    -- Discovery identity
    discovery_type  TEXT NOT NULL,
    galaxy_id       INTEGER NOT NULL,
    system_seed     TEXT NOT NULL,
    planet_index    INTEGER,
    entity_seed     TEXT,

    -- First discoverer
    discovered_by   TEXT NOT NULL REFERENCES players(id),
    discoverer_name TEXT NOT NULL,            -- Cached display_name at time of discovery
    custom_name     TEXT,                     -- The name they gave it

    -- This is the "canonical" name visible to all players
    discovered_at   DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Prevent duplicates
    UNIQUE(discovery_type, galaxy_id, system_seed, planet_index, entity_seed)
);

CREATE INDEX idx_udisc_system ON universe_discoveries(system_seed);
CREATE INDEX idx_udisc_player ON universe_discoveries(discovered_by);
```

**Discovery Flow:**
1. Player lands on planet, scans creature → entry in `discoveries` (personal)
2. Player names it "Space Chicken" and hits "Upload" → entry in `universe_discoveries` (shared)
3. Next player who scans the same creature sees "Space Chicken - Discovered by PlayerOne"
4. If no one has uploaded yet, the scanner shows "UNDISCOVERED" with a naming prompt

---

### 8.2.7 `ai_contexts` Table

Stores conversation history with the Being (Gemini).

```sql
CREATE TABLE ai_contexts (
    id              TEXT PRIMARY KEY,
    player_id       TEXT NOT NULL REFERENCES players(id),

    context_type    TEXT NOT NULL,            -- 'being', 'npc', 'quest', 'terminal'
    context_key     TEXT NOT NULL,            -- NPC ID, quest ID, or 'main_being'

    -- Conversation data
    messages        TEXT NOT NULL DEFAULT '[]',  -- JSON array of {role, content, timestamp}
    summary         TEXT,                        -- Rolling summary of older messages
    message_count   INTEGER DEFAULT 0,

    -- Memory management
    last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(player_id, context_type, context_key)
);

CREATE INDEX idx_ai_player ON ai_contexts(player_id);
```

**Message Format (JSON):**
```json
[
  {
    "role": "user",
    "content": "What is this place?",
    "timestamp": 1739500000
  },
  {
    "role": "assistant",
    "content": "You stand at the edge of what your kind calls reality...",
    "timestamp": 1739500002
  }
]
```

**Memory Management:**
- Keep last 50 messages in `messages` array
- When exceeding 50, summarize oldest 25 into `summary` field
- Summary is prepended to Gemini context on each call
- Keeps context window manageable (~4K tokens per conversation)

---

### 8.2.8 `terminal_state` Table

Tracks the terminal puzzle progress.

```sql
CREATE TABLE terminal_state (
    id              TEXT PRIMARY KEY,
    save_id         TEXT NOT NULL REFERENCES player_saves(id) ON DELETE CASCADE,

    -- Terminal status
    terminal_found  BOOLEAN DEFAULT FALSE,
    terminal_state  TEXT DEFAULT 'locked',    -- 'locked', 'partial_1'..'partial_4', 'puzzle_active', 'cracked'

    -- Fragment collection
    fragments_json  TEXT DEFAULT '[]',        -- JSON array of collected fragment data
    fragment_count  INTEGER DEFAULT 0,

    -- Puzzle progress
    stage_reached   INTEGER DEFAULT 0,        -- 0-4
    stage_1_data    TEXT DEFAULT '{}',        -- Fragment ordering attempts
    stage_2_data    TEXT DEFAULT '{}',        -- Rule deduction work
    stage_3_data    TEXT DEFAULT '{}',        -- Binary conversion attempts
    stage_4_data    TEXT DEFAULT '{}',        -- Verification attempts

    -- Post-crack state
    rules_explored  TEXT DEFAULT '[]',        -- JSON array of rules the player has run
    deep_terminal_level INTEGER DEFAULT 0,    -- Infinite puzzle progression

    -- Hints
    hints_used      INTEGER DEFAULT 0,
    last_hint_at    DATETIME,

    UNIQUE(save_id)
);

CREATE INDEX idx_terminal_save ON terminal_state(save_id);
```

---

### 8.2.9 `market_prices` Table

Dynamic economy - prices fluctuate based on supply/demand.

```sql
CREATE TABLE market_prices (
    id              TEXT PRIMARY KEY,
    system_seed     TEXT NOT NULL,

    item_id         TEXT NOT NULL,
    base_price      INTEGER NOT NULL,         -- The "standard" galactic price
    current_price   INTEGER NOT NULL,         -- Actual price at this station
    supply_level    REAL DEFAULT 1.0,         -- 0.1 (scarce) to 2.0 (abundant)
    demand_level    REAL DEFAULT 1.0,         -- 0.1 (none) to 2.0 (desperate)

    last_trade_at   DATETIME,
    price_updated   DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(system_seed, item_id)
);

CREATE INDEX idx_market_system ON market_prices(system_seed);
```

**Price Formula:**
```javascript
function calculatePrice(basePrice, supply, demand) {
    const supplyFactor = 1 / Math.max(supply, 0.1);  // Low supply = high price
    const demandFactor = demand;                       // High demand = high price
    const volatility = 0.9 + Math.random() * 0.2;     // ±10% noise
    return Math.round(basePrice * supplyFactor * demandFactor * volatility);
}
```

---

## 8.3 Migration System

### Migration File Structure

```
migrations/
├── 20260214_001_create_players.js
├── 20260214_002_create_player_saves.js
├── 20260214_003_create_inventory.js
├── 20260214_004_create_quests.js
├── 20260214_005_create_discoveries.js
├── 20260214_006_create_universe_discoveries.js
├── 20260214_007_create_ai_contexts.js
├── 20260214_008_create_terminal_state.js
└── 20260214_009_create_market_prices.js
```

### Example Migration

```javascript
// 20260214_001_create_players.js
exports.up = function(knex) {
    return knex.schema.createTable('players', (table) => {
        table.text('id').primary();
        table.text('username').unique().notNullable();
        table.text('display_name').notNullable();
        table.text('password_hash').notNullable();
        table.text('email').unique();

        table.text('gemini_key_enc');
        table.text('gemini_key_iv');
        table.boolean('has_gemini').defaultTo(false);

        table.datetime('created_at').defaultTo(knex.fn.now());
        table.datetime('last_login');
        table.integer('total_playtime').defaultTo(0);
        table.boolean('is_banned').defaultTo(false);
        table.text('ban_reason');
        table.text('settings').defaultTo('{}');

        table.index('username');
        table.index('last_login');
    });
};

exports.down = function(knex) {
    return knex.schema.dropTable('players');
};
```

### Running Migrations

```bash
# Development
npx knex migrate:latest --env development

# Production
npx knex migrate:latest --env production

# Rollback last migration
npx knex migrate:rollback

# Check migration status
npx knex migrate:status
```

---

## 8.4 Save System

### Autosave Strategy

```
AUTOSAVE TRIGGERS:
├── Time-based:     Every 60 seconds while playing
├── Event-based:    On planet landing/takeoff
├── Event-based:    On quest completion/failure
├── Event-based:    On significant inventory change
├── Event-based:    On discovery upload
├── Manual:         Player presses Ctrl+S or uses Tablet menu
└── Disconnect:     On WebSocket disconnect (server-side save)
```

### Save Data Flow

```
CLIENT                              SERVER
  │                                    │
  │  save_request {                    │
  │    position, rotation,             │
  │    stats, inventory_delta,         │
  │    quest_updates                   │
  │  }                                 │
  │──────────────────────────────────>│
  │                                    │
  │                           ┌────────┴────────┐
  │                           │ Validate data    │
  │                           │ Apply deltas     │
  │                           │ Write to DB      │
  │                           │ (transaction)    │
  │                           └────────┬────────┘
  │                                    │
  │  save_confirmed {                  │
  │    save_id, timestamp              │
  │  }                                 │
  │<──────────────────────────────────│
```

### Delta Saves vs Full Saves

```
DELTA SAVE (every 60s):
{
    type: 'delta',
    position: { x, y, z },
    rotation: { y },
    stats: { health, oxygen, energy, hazard },
    playtime_delta: 60
}
Size: ~200 bytes

FULL SAVE (on major events):
{
    type: 'full',
    position: { ... },
    stats: { ... },
    inventory: [ ... all items ... ],
    quests: [ ... all active quests ... ],
    terminal: { ... full state ... },
    settings: { ... }
}
Size: ~5-20 KB
```

### Save Transaction

All save writes use database transactions to prevent partial saves:

```javascript
async function fullSave(playerId, saveData) {
    return knex.transaction(async (trx) => {
        // 1. Update player_saves
        await trx('player_saves')
            .where({ player_id: playerId, is_active: true })
            .update({
                position_x: saveData.position.x,
                position_y: saveData.position.y,
                position_z: saveData.position.z,
                rotation_y: saveData.rotation.y,
                health: saveData.stats.health,
                oxygen: saveData.stats.oxygen,
                energy: saveData.stats.energy,
                hazard_shield: saveData.stats.hazard,
                xp_total: saveData.xp,
                level: saveData.level,
                credits: saveData.credits,
                updated_at: knex.fn.now(),
                playtime: knex.raw('playtime + ?', [saveData.playtimeDelta])
            });

        // 2. Sync inventory (if full save)
        if (saveData.inventory) {
            const saveId = await getSaveId(playerId, trx);
            await trx('inventory_items').where({ save_id: saveId }).del();
            if (saveData.inventory.length > 0) {
                await trx('inventory_items').insert(
                    saveData.inventory.map(item => ({
                        id: generateUUID(),
                        save_id: saveId,
                        ...item
                    }))
                );
            }
        }

        // 3. Update quest state (if changed)
        if (saveData.questUpdates) {
            for (const update of saveData.questUpdates) {
                await trx('quest_state')
                    .where({ id: update.id })
                    .update(update.changes);
            }
        }
    });
}
```

---

## 8.5 Authentication & Sessions

### Registration Flow

```
CLIENT                              SERVER
  │                                    │
  │  POST /api/auth/register           │
  │  { username, password,             │
  │    display_name, email? }          │
  │──────────────────────────────────>│
  │                                    │
  │                           ┌────────┴────────┐
  │                           │ Validate input   │
  │                           │ Check uniqueness │
  │                           │ bcrypt(password) │
  │                           │ Create player    │
  │                           │ Create save      │
  │                           │ Generate JWT     │
  │                           └────────┬────────┘
  │                                    │
  │  { token, player: { id,           │
  │    username, display_name } }      │
  │<──────────────────────────────────│
```

### Login Flow

```
CLIENT                              SERVER
  │                                    │
  │  POST /api/auth/login              │
  │  { username, password }            │
  │──────────────────────────────────>│
  │                                    │
  │                           ┌────────┴────────┐
  │                           │ Find player      │
  │                           │ bcrypt.compare() │
  │                           │ Update last_login│
  │                           │ Generate JWT     │
  │                           └────────┬────────┘
  │                                    │
  │  { token, player: { ... } }        │
  │<──────────────────────────────────│
  │                                    │
  │  WS connect with token             │
  │  (Authorization header)            │
  │──────────────────────────────────>│
  │                                    │
  │                           ┌────────┴────────┐
  │                           │ Verify JWT       │
  │                           │ Load save data   │
  │                           │ Join instance    │
  │                           └────────┬────────┘
  │                                    │
  │  game_state { full save + nearby } │
  │<──────────────────────────────────│
```

### JWT Token Structure

```javascript
const token = jwt.sign(
    {
        sub: player.id,           // Player UUID
        username: player.username,
        iat: Math.floor(Date.now() / 1000)
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }           // 7-day sessions
);
```

**Token Refresh:** No refresh tokens in MVP. Player re-authenticates after 7 days. Simple, and 7 days is generous for a browser game.

### Session Management

```javascript
// Active sessions tracked in memory (or Redis in production)
const activeSessions = new Map();  // playerId -> { socketId, instanceId, lastActivity }

// WebSocket authentication middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.playerId = decoded.sub;
        socket.username = decoded.username;
        next();
    } catch (err) {
        next(new Error('Invalid token'));
    }
});
```

---

## 8.6 API Key Encryption (Gemini)

### Why Encrypt on Server?

The Gemini API key is entered by the player in-game (via the Being encounter). It's used client-side to call Google's API directly. But we store an encrypted backup on the server so players don't have to re-enter it on different devices.

**The key is NEVER used by the server.** It's encrypted, stored, and returned to the client when needed.

### Encryption Details

```
Algorithm:    AES-256-GCM
Key:          Derived from player's password + server secret
IV:           Random 16 bytes per encryption (stored alongside)
Auth Tag:     16 bytes (GCM provides authentication)
```

### Implementation

```javascript
const crypto = require('crypto');

const SERVER_SECRET = process.env.ENCRYPTION_SECRET; // 32+ random bytes

function deriveKey(playerPassword, serverSecret) {
    // PBKDF2: password-based key derivation
    return crypto.pbkdf2Sync(
        playerPassword + serverSecret,
        'tgo-gemini-key-salt',  // Static salt (per-player salt would be better for prod)
        100000,                  // 100K iterations
        32,                      // 256-bit key
        'sha256'
    );
}

function encryptApiKey(apiKey, playerPassword) {
    const key = deriveKey(playerPassword, SERVER_SECRET);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return {
        encrypted: encrypted + ':' + authTag,
        iv: iv.toString('hex')
    };
}

function decryptApiKey(encryptedData, iv, playerPassword) {
    const key = deriveKey(playerPassword, SERVER_SECRET);
    const [encrypted, authTag] = encryptedData.split(':');
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(iv, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
```

### Key Storage Flow

```
ENTERING KEY (Being encounter):
1. Player enters Gemini API key in tablet UI
2. Client validates key by making a test call to Gemini
3. If valid, client sends to server: POST /api/player/gemini-key
4. Server encrypts with player's password hash + server secret
5. Stores encrypted key + IV in players table
6. Client stores key in sessionStorage (cleared on tab close)

RETRIEVING KEY (login from new device):
1. Player logs in with username + password
2. Server decrypts Gemini key using password + server secret
3. Returns decrypted key over HTTPS
4. Client stores in sessionStorage
5. Key never touches localStorage (persists too long)

KEY ROTATION:
- If player changes password, re-encrypt Gemini key with new password
- If server secret changes, re-encrypt ALL keys (migration script)
```

### Security Considerations

```
THREAT                              MITIGATION
─────────────────────────────────────────────────────
DB breach                           Keys are AES-256-GCM encrypted
Server memory dump                  Keys only in memory during encrypt/decrypt
Man-in-the-middle                   HTTPS required for all API key transfer
XSS stealing sessionStorage         Content Security Policy, no eval()
Player forgets password             Key is lost - they re-enter it (acceptable)
Server admin reads keys             Requires both DB access AND server secret
```

---

## 8.7 API Endpoints

### REST API Summary

```
AUTH:
POST   /api/auth/register          Create account
POST   /api/auth/login             Login, receive JWT
POST   /api/auth/logout            Invalidate session

PLAYER:
GET    /api/player/profile         Get own profile
PATCH  /api/player/profile         Update display name, settings
POST   /api/player/gemini-key      Store encrypted Gemini key
GET    /api/player/gemini-key      Retrieve decrypted key (requires re-auth)
DELETE /api/player/gemini-key      Remove stored key

SAVE:
GET    /api/save                   Load active save
POST   /api/save                   Full save
PATCH  /api/save                   Delta save
POST   /api/save/new               Start new game (creates fresh save)

DISCOVERIES:
GET    /api/discoveries            List player's discoveries
POST   /api/discoveries            Record new discovery
POST   /api/discoveries/:id/upload Share to universe
GET    /api/universe/discoveries   Query shared discoveries by system

MARKET:
GET    /api/market/:systemSeed     Get prices for a system
POST   /api/market/:systemSeed/trade  Execute a trade
```

### WebSocket Events (Game State)

```
CLIENT → SERVER:
  player_move          { position, rotation, velocity }
  player_action        { action, target, data }
  chat_message         { text, channel }
  save_delta           { position, stats }
  instance_join        { systemSeed }
  instance_leave       { }

SERVER → CLIENT:
  game_state           { full save data on connect }
  players_update       { nearby player positions }
  player_joined        { id, username, position }
  player_left          { id }
  chat_broadcast       { from, text, channel }
  save_confirmed       { timestamp }
  discovery_broadcast  { type, name, discoverer }
  market_update        { systemSeed, prices }
```

---

## 8.8 Data Lifecycle

### What Gets Cleaned Up

```
DATA TYPE                   RETENTION              CLEANUP
──────────────────────────────────────────────────────────────
Active sessions (memory)    Until disconnect        Immediate
Chat messages (Redis)       24 hours TTL            Auto-expire
Player positions (Redis)    While online            On disconnect
Delta save buffer           Until full save         On full save
AI conversation messages    50 per context          Summarize oldest 25
Market price history        Current only            Overwritten on update
Inactive saves             Forever (MVP)            Future: 1 year
Banned player data         Forever                  Manual review
Universe discoveries       Forever                  Never deleted
Player accounts            Forever (MVP)            Future: GDPR compliance
```

### Backup Strategy

**Development:**
```bash
# SQLite backup is just a file copy
cp data/tgo_dev.db backups/tgo_dev_$(date +%Y%m%d).db
```

**Production:**
```bash
# PostgreSQL automated daily backup
pg_dump $DATABASE_URL | gzip > backups/tgo_$(date +%Y%m%d).sql.gz

# Keep 30 days of backups
find backups/ -name "tgo_*.sql.gz" -mtime +30 -delete
```

---

## 8.9 Query Patterns

### Common Queries and Their Indices

```javascript
// Load game on login - the most critical query
// Uses: idx_saves_player
async function loadGameState(playerId) {
    const save = await knex('player_saves')
        .where({ player_id: playerId, is_active: true })
        .first();

    const inventory = await knex('inventory_items')
        .where({ save_id: save.id });

    const quests = await knex('quest_state')
        .where({ save_id: save.id, status: 'active' });

    const terminal = await knex('terminal_state')
        .where({ save_id: save.id })
        .first();

    return { save, inventory, quests, terminal };
}

// Check if a system has been discovered - happens on every system entry
// Uses: idx_udisc_system
async function getSystemDiscoveries(systemSeed) {
    return knex('universe_discoveries')
        .where({ system_seed: systemSeed });
}

// Get market prices for a station
// Uses: idx_market_system
async function getMarketPrices(systemSeed) {
    return knex('market_prices')
        .where({ system_seed: systemSeed });
}

// Leaderboard: most discoveries
// Uses: idx_udisc_player (for grouping)
async function discoveryLeaderboard(limit = 20) {
    return knex('universe_discoveries')
        .select('discovered_by', 'discoverer_name')
        .count('* as total_discoveries')
        .groupBy('discovered_by', 'discoverer_name')
        .orderBy('total_discoveries', 'desc')
        .limit(limit);
}
```

---

## 8.10 Performance Estimates

### Storage Per Player

```
players row:            ~500 bytes
player_saves row:       ~400 bytes
inventory (28 items):   ~2.8 KB
quest_state (5 active): ~2.5 KB
discoveries (50):       ~5 KB
ai_contexts (3):        ~15 KB (conversation history)
terminal_state:         ~1 KB
─────────────────────────────────
TOTAL per player:       ~27 KB

1,000 players:          ~27 MB
10,000 players:         ~270 MB
100,000 players:        ~2.7 GB
```

### Write Frequency

```
OPERATION               FREQUENCY        SIZE
────────────────────────────────────────────────
Delta save              Every 60s        ~200 bytes
Full save               Every 5-10 min   ~5 KB
Discovery               ~10/hour         ~100 bytes
Quest update            ~5/hour          ~200 bytes
Market trade            ~3/hour          ~100 bytes
AI conversation         ~5/hour          ~500 bytes

PER PLAYER WRITE LOAD:  ~4 KB/minute (average)
100 concurrent players: ~400 KB/minute = ~24 MB/hour
```

### SQLite Limits (Development)

SQLite handles ~50 concurrent writers comfortably with WAL mode:

```javascript
// Enable WAL mode for better concurrent reads during writes
knex.raw('PRAGMA journal_mode=WAL');
knex.raw('PRAGMA synchronous=NORMAL');   // Slightly faster, still safe
knex.raw('PRAGMA cache_size=-64000');     // 64MB cache
```

Beyond 50 concurrent players → switch to PostgreSQL.

---

## 8.11 Data Validation

### Input Validation Rules

```javascript
const validation = {
    username: {
        min: 3, max: 24,
        pattern: /^[a-zA-Z0-9_]+$/,
        message: 'Username: 3-24 characters, letters/numbers/underscore only'
    },
    displayName: {
        min: 1, max: 32,
        pattern: /^[a-zA-Z0-9_ \-']+$/,
        message: 'Display name: 1-32 characters'
    },
    password: {
        min: 8, max: 128,
        message: 'Password: minimum 8 characters'
    },
    customName: {
        min: 1, max: 48,
        pattern: /^[a-zA-Z0-9_ \-']+$/,
        profanityFilter: true,
        message: 'Name: 1-48 characters, no special symbols'
    },
    chatMessage: {
        max: 500,
        rateLimit: '1 per second',
        profanityFilter: true
    }
};
```

### Server-Side Validation Middleware

```javascript
function validateSave(saveData) {
    const errors = [];

    // Position bounds check (prevent teleport hacks)
    if (Math.abs(saveData.position.x) > 10000) errors.push('Position X out of bounds');
    if (Math.abs(saveData.position.y) > 10000) errors.push('Position Y out of bounds');
    if (Math.abs(saveData.position.z) > 10000) errors.push('Position Z out of bounds');

    // Stat bounds check
    for (const stat of ['health', 'oxygen', 'energy', 'hazard_shield']) {
        if (saveData.stats[stat] < 0 || saveData.stats[stat] > 100) {
            errors.push(`${stat} must be 0-100`);
        }
    }

    // Credits can't go negative
    if (saveData.credits < 0) errors.push('Credits cannot be negative');

    // Level bounds
    if (saveData.level < 1 || saveData.level > 10) errors.push('Level must be 1-10');

    return errors;
}
```

---

## 8.12 Environment Variables

```bash
# .env (NEVER committed to git)

# Server
NODE_ENV=development
PORT=3000
HOST=localhost

# Database
DATABASE_URL=sqlite:./data/tgo_dev.db
# DATABASE_URL=postgres://user:pass@localhost:5432/tgo  (production)

# Authentication
JWT_SECRET=your-random-64-char-string-here
BCRYPT_ROUNDS=12

# Encryption
ENCRYPTION_SECRET=another-random-64-char-string-here

# Rate Limiting
RATE_LIMIT_WINDOW=60000     # 1 minute
RATE_LIMIT_MAX=100          # 100 requests per window

# Redis (production only)
# REDIS_URL=redis://localhost:6379
```

---

## Cross-References

- **Part 04 (AI Integration)**: Gemini API key handling, conversation memory format
- **Part 05 (Multiplayer)**: WebSocket events, instance management, position sync
- **Part 06 (Terminal System)**: Fragment data format, puzzle state tracking
- **Part 07 (Frontend)**: Client-side sessionStorage for API key, save UI triggers
- **Part 09 (Project Structure)**: Migration files location, environment config
