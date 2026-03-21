/**
 * THE GALACTIC ORDER — Station Manager
 *
 * Manages crew station assignments on a ship.
 * Players physically walk to stations (on walkable-interior ships)
 * or use Tab menu (on smaller ships) to switch roles.
 *
 * Each station has a trigger volume. When a player is within range
 * and presses E, they "sit" at that station and gain authority
 * over its systems. Press E again to stand up.
 *
 * Events (via EventBus):
 *   station:occupied   { roleId, playerId, playerName }
 *   station:vacated    { roleId }
 *   station:localChanged  { roleId, seated }
 */

import { eventBus } from '../../core/EventBus.js';
import { getRoleDefinition } from './CrewRoles.js';

export class StationManager {
    /**
     * @param {Object} classData - Ship class definition from ShipClassRegistry
     * @param {Object[]} stationPositions - From builder.stationPositions
     */
    constructor(classData, stationPositions) {
        this.classData = classData;
        this.hasWalkableInterior = classData.hasWalkableInterior;

        // Station state
        this.stations = new Map();
        for (const sp of stationPositions) {
            this.stations.set(sp.role, {
                roleId: sp.role,
                roleDef: getRoleDefinition(sp.role),
                playerId: null,
                playerName: null,
                isLocal: false,
                position: { x: sp.x, y: sp.y, z: sp.z },
                lookDir: sp.lookDir || [0, 0, 1],
                triggerRadius: 1.5,
            });
        }

        // Local player state
        this.localPlayerId = null;
        this.localPlayerRole = null;
        this.localSeated = false;
    }

    /**
     * Set the local player ID.
     * @param {string} playerId
     */
    setLocalPlayer(playerId) {
        this.localPlayerId = playerId;
    }

    /**
     * Assign a player to a station.
     * @param {string} roleId
     * @param {string} playerId
     * @param {string} [playerName]
     * @returns {boolean} Success
     */
    assignStation(roleId, playerId, playerName = '') {
        const station = this.stations.get(roleId);
        if (!station) return false;
        if (station.playerId && station.playerId !== playerId) return false;

        station.playerId = playerId;
        station.playerName = playerName;
        station.isLocal = playerId === this.localPlayerId;

        if (station.isLocal) {
            // Release any previous station the local player held
            if (this.localPlayerRole && this.localPlayerRole !== roleId) {
                this.releaseStation(this.localPlayerRole);
            }
            this.localPlayerRole = roleId;
            this.localSeated = true;
        }

        eventBus.emit('station:occupied', {
            roleId, playerId, playerName,
        });

        if (station.isLocal) {
            eventBus.emit('station:localChanged', {
                roleId, seated: true,
            });
        }

        return true;
    }

    /**
     * Release a station.
     * @param {string} roleId
     */
    releaseStation(roleId) {
        const station = this.stations.get(roleId);
        if (!station || !station.playerId) return;

        const wasLocal = station.isLocal;

        station.playerId = null;
        station.playerName = null;
        station.isLocal = false;

        eventBus.emit('station:vacated', { roleId });

        if (wasLocal) {
            this.localPlayerRole = null;
            this.localSeated = false;
            eventBus.emit('station:localChanged', {
                roleId, seated: false,
            });
        }
    }

    /**
     * Get available (unoccupied) stations.
     * @returns {Object[]}
     */
    getAvailableStations() {
        const available = [];
        for (const [roleId, station] of this.stations) {
            if (!station.playerId) {
                available.push({
                    roleId,
                    roleDef: station.roleDef,
                    position: station.position,
                });
            }
        }
        return available;
    }

    /**
     * Get all station states for UI display.
     * @returns {Object[]}
     */
    getAllStations() {
        const result = [];
        for (const [roleId, station] of this.stations) {
            result.push({
                roleId,
                roleDef: station.roleDef,
                playerId: station.playerId,
                playerName: station.playerName,
                isLocal: station.isLocal,
                position: station.position,
            });
        }
        return result;
    }

    /**
     * Check if local player is at a specific role.
     * @param {string} roleId
     * @returns {boolean}
     */
    isLocalPlayerAt(roleId) {
        const station = this.stations.get(roleId);
        return station ? station.isLocal : false;
    }

    /**
     * Check if local player is near a station (for walkable interiors).
     * @param {{x: number, y: number, z: number}} playerPos - Player position in ship-local coords
     * @returns {Object|null} Nearest available station within trigger radius, or null
     */
    getNearbyStation(playerPos) {
        let nearest = null;
        let nearestDist = Infinity;

        for (const [roleId, station] of this.stations) {
            if (station.playerId) continue; // Already occupied

            const dx = playerPos.x - station.position.x;
            const dy = playerPos.y - station.position.y;
            const dz = playerPos.z - station.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < station.triggerRadius && dist < nearestDist) {
                nearest = { roleId, station, distance: dist };
                nearestDist = dist;
            }
        }

        return nearest;
    }

    /**
     * Handle E key press — toggle seat at nearest station.
     * @param {{x: number, y: number, z: number}} playerPos
     * @returns {boolean} Whether an action was taken
     */
    handleInteraction(playerPos) {
        // If currently seated, stand up
        if (this.localSeated && this.localPlayerRole) {
            this.releaseStation(this.localPlayerRole);
            return true;
        }

        // If near a station, sit down
        const nearby = this.getNearbyStation(playerPos);
        if (nearby) {
            this.assignStation(nearby.roleId, this.localPlayerId, '');
            return true;
        }

        return false;
    }

    /**
     * Quick station switch (for non-walkable interior ships).
     * @param {string} roleId
     * @returns {boolean}
     */
    quickSwitch(roleId) {
        if (this.hasWalkableInterior) return false;

        // Release current
        if (this.localPlayerRole) {
            this.releaseStation(this.localPlayerRole);
        }

        return this.assignStation(roleId, this.localPlayerId, '');
    }

    /**
     * Get crew roster for display.
     * @returns {Object[]}
     */
    getCrewRoster() {
        const roster = [];
        for (const [roleId, station] of this.stations) {
            roster.push({
                role: station.roleDef?.name || roleId,
                player: station.playerName || (station.playerId ? 'Unknown' : 'Empty'),
                occupied: !!station.playerId,
                isLocal: station.isLocal,
            });
        }
        return roster;
    }

    /** Dispose and clean up. */
    dispose() {
        // Release all local stations
        if (this.localPlayerRole) {
            this.releaseStation(this.localPlayerRole);
        }
        this.stations.clear();
    }
}
