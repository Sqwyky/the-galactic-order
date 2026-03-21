/**
 * THE GALACTIC ORDER — Client Ship Sync Manager
 *
 * Handles sending and receiving ship state via Socket.io:
 *
 * For the local ship (where the local player is crew):
 *   - Pilot sends ship:state at 20Hz (position, rotation, velocity)
 *   - Other roles send ship:input (gunner aim, engineer power, etc.)
 *   - Receives inputs from remote crew and applies locally
 *
 * For remote ships (other players' ships visible in scene):
 *   - Receives ship:state and interpolates position/rotation
 *   - Spawns/despawns remote ship models
 *   - Shows remote engine effects and weapon fire
 */

import { eventBus } from '../core/EventBus.js';

const SEND_RATE = 1 / 20; // 20Hz state updates
const SYSTEM_SYNC_RATE = 1 / 5; // 5Hz full system sync

export class ShipSyncManager {
    /**
     * @param {Object} socket - Socket.io client instance
     */
    constructor(socket) {
        this.socket = socket;
        this.localShipId = null;
        this.localRole = null;

        // Remote ship state buffers for interpolation
        this.remoteShips = new Map(); // shipId → { states: [], model: null }

        // Timing
        this._stateSendTimer = 0;
        this._systemSyncTimer = 0;

        this._setupListeners();
    }

    _setupListeners() {
        // Ship spawned in our room
        this.socket.on('ship:spawned', (data) => {
            eventBus.emit('remote:ship:spawned', data);
        });

        // Ship despawned
        this.socket.on('ship:despawned', (data) => {
            eventBus.emit('remote:ship:despawned', data);
            this.remoteShips.delete(data.shipId);
        });

        // Crew joined a ship
        this.socket.on('crew:joined', (data) => {
            eventBus.emit('crew:joined', data);
        });

        // Crew left a ship
        this.socket.on('crew:left', (data) => {
            eventBus.emit('crew:left', data);
        });

        // Crew roster update
        this.socket.on('crew:roster', (data) => {
            eventBus.emit('crew:roster', data);
        });

        // Remote ship state (from pilot authority)
        this.socket.on('ship:state', (data) => {
            if (data.shipId === this.localShipId) {
                // State for our own ship from remote crew — apply inputs
                eventBus.emit('ship:remoteInput', data);
            } else {
                // Remote ship state — buffer for interpolation
                this._bufferRemoteState(data);
            }
        });

        // Remote crew input (forwarded to authority)
        this.socket.on('ship:input', (data) => {
            eventBus.emit('ship:crewInput', data);
        });

        // Full system sync
        this.socket.on('ship:systems', (data) => {
            eventBus.emit('ship:systemsSync', data);
        });

        // Ship events (firing, impacts)
        this.socket.on('ship:event', (data) => {
            eventBus.emit('ship:remoteEvent', data);
        });
    }

    /**
     * Spawn the local player's ship on the server.
     * @param {string} classId
     * @param {Object} position
     * @returns {Promise<Object>} Server response with shipId
     */
    spawnShip(classId, position) {
        return new Promise((resolve) => {
            this.socket.emit('ship:spawn', { classId, position }, (response) => {
                if (response.shipId) {
                    this.localShipId = response.shipId;
                }
                resolve(response);
            });
        });
    }

    /**
     * Despawn the local player's ship.
     */
    despawnShip() {
        if (this.localShipId) {
            this.socket.emit('ship:despawn', { shipId: this.localShipId });
            this.localShipId = null;
        }
    }

    /**
     * Request to join a ship's crew.
     * @param {string} shipId
     * @param {string} roleId
     * @returns {Promise<Object>}
     */
    joinCrew(shipId, roleId) {
        return new Promise((resolve) => {
            this.socket.emit('crew:join', { shipId, roleId }, (response) => {
                if (response.success) {
                    this.localShipId = shipId;
                    this.localRole = roleId;
                }
                resolve(response);
            });
        });
    }

    /**
     * Leave current crew station.
     */
    leaveCrew() {
        if (this.localShipId && this.localRole) {
            this.socket.emit('crew:leave', {
                shipId: this.localShipId,
                roleId: this.localRole,
            });
            this.localRole = null;
        }
    }

    /**
     * Send ship state (pilot only).
     * @param {Object} state - { position, rotation, velocity, thrust }
     */
    sendState(state) {
        if (!this.localShipId) return;
        this.socket.emit('ship:state', {
            shipId: this.localShipId,
            ...state,
        });
    }

    /**
     * Send crew input (non-pilot roles).
     * @param {Object} input - Role-specific input data
     */
    sendInput(input) {
        if (!this.localShipId || !this.localRole) return;
        this.socket.emit('ship:input', {
            shipId: this.localShipId,
            roleId: this.localRole,
            ...input,
        });
    }

    /**
     * Send full system sync (power, health, shields).
     * @param {Object} systems
     */
    sendSystemSync(systems) {
        if (!this.localShipId) return;
        this.socket.emit('ship:systems', {
            shipId: this.localShipId,
            ...systems,
        });
    }

    /**
     * Send a ship event (weapon fire, impact, etc.)
     * @param {Object} event
     */
    sendEvent(event) {
        if (!this.localShipId) return;
        this.socket.emit('ship:event', {
            shipId: this.localShipId,
            ...event,
        });
    }

    /**
     * Update — call each frame.
     * @param {number} dt
     * @param {Object} [localState] - Current local ship state for sending
     * @param {Object} [localSystems] - Current system states for sync
     */
    update(dt, localState = null, localSystems = null) {
        // Send state at 20Hz
        if (localState && this.localRole === 'pilot') {
            this._stateSendTimer += dt;
            if (this._stateSendTimer >= SEND_RATE) {
                this.sendState(localState);
                this._stateSendTimer = 0;
            }
        }

        // Send system sync at 5Hz
        if (localSystems && this.localRole === 'pilot') {
            this._systemSyncTimer += dt;
            if (this._systemSyncTimer >= SYSTEM_SYNC_RATE) {
                this.sendSystemSync(localSystems);
                this._systemSyncTimer = 0;
            }
        }
    }

    /**
     * Buffer a remote ship's state for interpolation.
     */
    _bufferRemoteState(data) {
        if (!this.remoteShips.has(data.shipId)) {
            this.remoteShips.set(data.shipId, {
                states: [],
                model: null,
            });
        }

        const buffer = this.remoteShips.get(data.shipId);
        buffer.states.push({
            time: performance.now() / 1000,
            position: data.position,
            rotation: data.rotation,
            velocity: data.velocity,
            thrust: data.thrust,
        });

        // Keep last 3 states for interpolation
        while (buffer.states.length > 3) {
            buffer.states.shift();
        }
    }

    /**
     * Get interpolated state for a remote ship.
     * @param {string} shipId
     * @returns {Object|null}
     */
    getInterpolatedState(shipId) {
        const buffer = this.remoteShips.get(shipId);
        if (!buffer || buffer.states.length < 2) {
            return buffer?.states[buffer.states.length - 1] || null;
        }

        const now = performance.now() / 1000;
        const renderTime = now - 0.1; // 100ms interpolation delay

        const states = buffer.states;
        let from = states[0];
        let to = states[1];

        for (let i = 0; i < states.length - 1; i++) {
            if (states[i].time <= renderTime && states[i + 1].time >= renderTime) {
                from = states[i];
                to = states[i + 1];
                break;
            }
        }

        const duration = to.time - from.time;
        const t = duration > 0 ? Math.min(1, (renderTime - from.time) / duration) : 1;

        return {
            position: [
                from.position[0] + (to.position[0] - from.position[0]) * t,
                from.position[1] + (to.position[1] - from.position[1]) * t,
                from.position[2] + (to.position[2] - from.position[2]) * t,
            ],
            rotation: to.rotation, // TODO: slerp quaternion
            thrust: from.thrust + (to.thrust - from.thrust) * t,
        };
    }

    /**
     * Get all remote ship IDs.
     * @returns {string[]}
     */
    getRemoteShipIds() {
        return Array.from(this.remoteShips.keys());
    }

    /** Dispose. */
    dispose() {
        this.socket.off('ship:spawned');
        this.socket.off('ship:despawned');
        this.socket.off('crew:joined');
        this.socket.off('crew:left');
        this.socket.off('crew:roster');
        this.socket.off('ship:state');
        this.socket.off('ship:input');
        this.socket.off('ship:systems');
        this.socket.off('ship:event');
        this.remoteShips.clear();
    }
}
