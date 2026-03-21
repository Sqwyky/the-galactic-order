/**
 * THE GALACTIC ORDER — Server Ship Manager
 *
 * Server-side ship entity management for multi-crew multiplayer.
 * Tracks ship state, crew assignments, and validates actions.
 *
 * Ships exist within rooms (same as player rooms).
 * The pilot client is authoritative for position/physics;
 * the server validates bounds and relays state to crew + observers.
 */

/** @type {Map<string, Object>} shipId → ship state */
const activeShips = new Map();

let nextShipId = 1;

/**
 * Create a new ship entity.
 * @param {string} classId - Ship class from registry
 * @param {number} ownerId - Player who spawned it
 * @param {string} room - Room the ship is in
 * @returns {Object} Ship state
 */
export function createShip(classId, ownerId, room) {
    const shipId = `ship_${nextShipId++}`;
    const ship = {
        id: shipId,
        classId,
        ownerId,
        room,
        crew: new Map(), // roleId → { playerId, username }
        state: {
            position: [0, 0, 0],
            rotation: [0, 0, 0, 1], // quaternion
            velocity: [0, 0, 0],
            thrust: 0,
            shields: 1.0,
            hull: 1.0,
            power: { engines: 2, weapons: 2, shields: 2, sensors: 2 },
        },
        createdAt: Date.now(),
    };

    activeShips.set(shipId, ship);
    return ship;
}

/**
 * Remove a ship entity.
 * @param {string} shipId
 */
export function removeShip(shipId) {
    activeShips.delete(shipId);
}

/**
 * Get a ship by ID.
 * @param {string} shipId
 * @returns {Object|null}
 */
export function getShip(shipId) {
    return activeShips.get(shipId) || null;
}

/**
 * Get all ships in a room.
 * @param {string} room
 * @returns {Object[]}
 */
export function getShipsInRoom(room) {
    const ships = [];
    for (const ship of activeShips.values()) {
        if (ship.room === room) {
            ships.push({
                id: ship.id,
                classId: ship.classId,
                ownerId: ship.ownerId,
                crew: Object.fromEntries(ship.crew),
                state: ship.state,
            });
        }
    }
    return ships;
}

/**
 * Assign a player to a crew station.
 * @param {string} shipId
 * @param {string} roleId
 * @param {number} playerId
 * @param {string} username
 * @returns {boolean}
 */
export function joinCrew(shipId, roleId, playerId, username) {
    const ship = activeShips.get(shipId);
    if (!ship) return false;

    // Check if station is already occupied by someone else
    const current = ship.crew.get(roleId);
    if (current && current.playerId !== playerId) return false;

    ship.crew.set(roleId, { playerId, username });
    return true;
}

/**
 * Remove a player from their crew station.
 * @param {string} shipId
 * @param {string} roleId
 * @returns {boolean}
 */
export function leaveCrew(shipId, roleId) {
    const ship = activeShips.get(shipId);
    if (!ship) return false;

    ship.crew.delete(roleId);
    return true;
}

/**
 * Remove a player from ALL ships (on disconnect).
 * @param {number} playerId
 * @returns {string[]} Ship IDs the player was removed from
 */
export function removePlayerFromAllShips(playerId) {
    const affected = [];
    for (const [shipId, ship] of activeShips) {
        for (const [roleId, crew] of ship.crew) {
            if (crew.playerId === playerId) {
                ship.crew.delete(roleId);
                affected.push(shipId);
            }
        }
    }
    return affected;
}

/**
 * Update ship state (from pilot authority).
 * @param {string} shipId
 * @param {Object} state
 */
export function updateShipState(shipId, state) {
    const ship = activeShips.get(shipId);
    if (!ship) return;

    // Merge state (pilot sends position/rotation/velocity/thrust)
    if (state.position) ship.state.position = state.position;
    if (state.rotation) ship.state.rotation = state.rotation;
    if (state.velocity) ship.state.velocity = state.velocity;
    if (state.thrust !== undefined) ship.state.thrust = state.thrust;
    if (state.shields !== undefined) ship.state.shields = state.shields;
    if (state.hull !== undefined) ship.state.hull = state.hull;
    if (state.power) ship.state.power = state.power;
}

/**
 * Get active ship count.
 * @returns {number}
 */
export function getActiveShipCount() {
    return activeShips.size;
}
