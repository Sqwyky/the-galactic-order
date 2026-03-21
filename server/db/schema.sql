-- THE GALACTIC ORDER — Database Schema
-- SQLite for development, portable to Oracle Autonomous DB

-- Players table (auth + profile)
CREATE TABLE IF NOT EXISTS players (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT    UNIQUE NOT NULL,
    email       TEXT    UNIQUE,
    password    TEXT    NOT NULL,  -- bcrypt hash
    display_name TEXT,
    is_guest    INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now')),
    last_login  TEXT    DEFAULT (datetime('now'))
);

-- Player save state (position, inventory, progress)
CREATE TABLE IF NOT EXISTS player_saves (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    slot        INTEGER DEFAULT 0,          -- save slot (0 = autosave)
    -- Location
    universe_seed   TEXT NOT NULL DEFAULT '42',
    system_rule     INTEGER NOT NULL DEFAULT 30,
    planet_seed     INTEGER NOT NULL DEFAULT 42,
    position_x      REAL DEFAULT 0,
    position_y      REAL DEFAULT 50,
    position_z      REAL DEFAULT 0,
    rotation_y      REAL DEFAULT 0,
    game_phase      TEXT DEFAULT 'SURFACE',  -- DESCENT, SURFACE, FLIGHT
    -- Ship state
    ship_health     REAL DEFAULT 100,
    ship_fuel       REAL DEFAULT 100,
    -- Progress
    play_time_seconds INTEGER DEFAULT 0,
    -- Serialized data (JSON)
    inventory       TEXT DEFAULT '{}',
    quest_state     TEXT DEFAULT '{}',
    discovered_systems TEXT DEFAULT '[]',
    -- Timestamps
    saved_at        TEXT DEFAULT (datetime('now')),
    UNIQUE(player_id, slot)
);

-- Discoveries (shared universe state - first player to find something)
CREATE TABLE IF NOT EXISTS discoveries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id       INTEGER NOT NULL REFERENCES players(id),
    discovery_type  TEXT NOT NULL,   -- 'system', 'planet', 'species', 'element'
    universe_seed   TEXT NOT NULL,
    system_rule     INTEGER,
    planet_seed     INTEGER,
    name            TEXT NOT NULL,   -- player-assigned or generated name
    data            TEXT DEFAULT '{}', -- additional JSON data
    discovered_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_discoveries_type ON discoveries(discovery_type, universe_seed);
CREATE INDEX IF NOT EXISTS idx_discoveries_player ON discoveries(player_id);

-- Terminal puzzle state (cipher fragments + puzzle progress)
CREATE TABLE IF NOT EXISTS terminal_state (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    target_rule INTEGER NOT NULL,
    terminal_state TEXT DEFAULT 'LOCKED',  -- LOCKED, PARTIAL, READY, STAGE_1, etc.
    collected_fragments TEXT DEFAULT '[]', -- JSON array of fragment IDs
    puzzle_state TEXT DEFAULT '{}',        -- JSON puzzle progress
    cracked_at  TEXT,
    UNIQUE(player_id)
);

-- AI conversation context (Gemini Being dialogue history)
CREATE TABLE IF NOT EXISTS ai_contexts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id   INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    conversation_history TEXT DEFAULT '[]', -- JSON array of { player, being } exchanges
    total_messages INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(player_id)
);

-- Multiplayer sessions
CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,    -- UUID
    host_id     INTEGER NOT NULL REFERENCES players(id),
    system_rule INTEGER NOT NULL,
    planet_seed INTEGER NOT NULL,
    max_players INTEGER DEFAULT 8,
    is_active   INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
);
