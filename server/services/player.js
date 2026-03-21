/**
 * THE GALACTIC ORDER — Player Service
 *
 * All player-related database operations: create, authenticate, save/load.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDB } from './db.js';
import config from '../config.js';

const SALT_ROUNDS = 10;

/**
 * Create a new player account.
 */
export function createPlayer({ username, email, password, displayName }) {
    const db = getDB();
    const hash = bcrypt.hashSync(password, SALT_ROUNDS);

    const stmt = db.prepare(`
        INSERT INTO players (username, email, password, display_name)
        VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(username, email || null, hash, displayName || username);
    return { id: result.lastInsertRowid, username, displayName: displayName || username };
}

/**
 * Create a guest player (no email/password required later, temporary).
 */
export function createGuest() {
    const db = getDB();
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const hash = bcrypt.hashSync(guestId, SALT_ROUNDS);

    const stmt = db.prepare(`
        INSERT INTO players (username, password, display_name, is_guest)
        VALUES (?, ?, ?, 1)
    `);

    const result = stmt.run(guestId, hash, `Explorer ${Math.floor(Math.random() * 9999)}`);
    return { id: result.lastInsertRowid, username: guestId, isGuest: true };
}

/**
 * Authenticate a player and return a JWT.
 */
export function authenticate(username, password) {
    const db = getDB();
    const player = db.prepare('SELECT * FROM players WHERE username = ?').get(username);

    if (!player || !bcrypt.compareSync(password, player.password)) {
        return null;
    }

    // Update last login
    db.prepare('UPDATE players SET last_login = datetime(\'now\') WHERE id = ?').run(player.id);

    const token = jwt.sign(
        { id: player.id, username: player.username },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
    );

    return {
        token,
        player: {
            id: player.id,
            username: player.username,
            displayName: player.display_name,
            isGuest: !!player.is_guest,
        },
    };
}

/**
 * Generate a JWT for a guest player.
 */
export function authenticateGuest(player) {
    const token = jwt.sign(
        { id: player.id, username: player.username, isGuest: true },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
    );
    return { token, player: { ...player, displayName: player.displayName || player.username } };
}

/**
 * Get a player by ID.
 */
export function getPlayerById(id) {
    const db = getDB();
    const p = db.prepare('SELECT id, username, display_name, is_guest, created_at, last_login FROM players WHERE id = ?').get(id);
    if (!p) return null;
    return { id: p.id, username: p.username, displayName: p.display_name, isGuest: !!p.is_guest, createdAt: p.created_at, lastLogin: p.last_login };
}

/**
 * Save player game state.
 */
export function savePlayerState(playerId, slot, state) {
    const db = getDB();

    const stmt = db.prepare(`
        INSERT INTO player_saves (
            player_id, slot, universe_seed, system_rule, planet_seed,
            position_x, position_y, position_z, rotation_y, game_phase,
            ship_health, ship_fuel, play_time_seconds,
            inventory, quest_state, discovered_systems, saved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(player_id, slot) DO UPDATE SET
            universe_seed = excluded.universe_seed,
            system_rule = excluded.system_rule,
            planet_seed = excluded.planet_seed,
            position_x = excluded.position_x,
            position_y = excluded.position_y,
            position_z = excluded.position_z,
            rotation_y = excluded.rotation_y,
            game_phase = excluded.game_phase,
            ship_health = excluded.ship_health,
            ship_fuel = excluded.ship_fuel,
            play_time_seconds = excluded.play_time_seconds,
            inventory = excluded.inventory,
            quest_state = excluded.quest_state,
            discovered_systems = excluded.discovered_systems,
            saved_at = datetime('now')
    `);

    return stmt.run(
        playerId, slot,
        state.universeSeed || '42',
        state.systemRule || 30,
        state.planetSeed || 42,
        state.position?.x || 0,
        state.position?.y || 50,
        state.position?.z || 0,
        state.rotation?.y || 0,
        state.gamePhase || 'SURFACE',
        state.shipHealth ?? 100,
        state.shipFuel ?? 100,
        state.playTimeSeconds || 0,
        JSON.stringify(state.inventory || {}),
        JSON.stringify(state.questState || {}),
        JSON.stringify(state.discoveredSystems || [])
    );
}

/**
 * Load player game state from a save slot.
 */
export function loadPlayerState(playerId, slot = 0) {
    const db = getDB();
    const save = db.prepare('SELECT * FROM player_saves WHERE player_id = ? AND slot = ?').get(playerId, slot);

    if (!save) return null;

    return {
        slot: save.slot,
        universeSeed: save.universe_seed,
        systemRule: save.system_rule,
        planetSeed: save.planet_seed,
        position: { x: save.position_x, y: save.position_y, z: save.position_z },
        rotation: { y: save.rotation_y },
        gamePhase: save.game_phase,
        shipHealth: save.ship_health,
        shipFuel: save.ship_fuel,
        playTimeSeconds: save.play_time_seconds,
        inventory: JSON.parse(save.inventory),
        questState: JSON.parse(save.quest_state),
        discoveredSystems: JSON.parse(save.discovered_systems),
        savedAt: save.saved_at,
    };
}

/**
 * List all save slots for a player.
 */
export function listSaves(playerId) {
    const db = getDB();
    return db.prepare(
        'SELECT slot, game_phase, system_rule, planet_seed, play_time_seconds, saved_at FROM player_saves WHERE player_id = ? ORDER BY slot'
    ).all(playerId);
}
