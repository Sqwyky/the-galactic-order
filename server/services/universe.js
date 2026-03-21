/**
 * THE GALACTIC ORDER — Universe Service
 *
 * Manages shared universe state: discoveries, naming rights, visited systems.
 */

import { getDB } from './db.js';

/**
 * Record a discovery (first-to-find gets naming rights).
 */
export function recordDiscovery(playerId, { type, universeSeed, systemRule, planetSeed, name, data }) {
    const db = getDB();

    // Check if already discovered
    const existing = db.prepare(`
        SELECT id, player_id, name FROM discoveries
        WHERE discovery_type = ? AND universe_seed = ? AND system_rule = ? AND planet_seed = ?
    `).get(type, universeSeed, systemRule || null, planetSeed || null);

    if (existing) {
        return { alreadyDiscovered: true, discoveredBy: existing.player_id, name: existing.name };
    }

    const stmt = db.prepare(`
        INSERT INTO discoveries (player_id, discovery_type, universe_seed, system_rule, planet_seed, name, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(playerId, type, universeSeed, systemRule || null, planetSeed || null, name, JSON.stringify(data || {}));
    return { id: result.lastInsertRowid, isNew: true, name };
}

/**
 * Get all discoveries for a system.
 */
export function getSystemDiscoveries(universeSeed, systemRule) {
    const db = getDB();
    return db.prepare(`
        SELECT d.*, p.display_name as discoverer_name
        FROM discoveries d
        JOIN players p ON d.player_id = p.id
        WHERE d.universe_seed = ? AND d.system_rule = ?
        ORDER BY d.discovered_at
    `).all(universeSeed, systemRule);
}

/**
 * Get a player's discovery count and recent discoveries.
 */
export function getPlayerDiscoveries(playerId, limit = 20) {
    const db = getDB();

    const count = db.prepare('SELECT COUNT(*) as total FROM discoveries WHERE player_id = ?').get(playerId);
    const recent = db.prepare(`
        SELECT * FROM discoveries WHERE player_id = ? ORDER BY discovered_at DESC LIMIT ?
    `).all(playerId, limit);

    return { total: count.total, recent };
}
