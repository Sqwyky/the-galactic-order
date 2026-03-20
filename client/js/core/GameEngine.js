/**
 * THE GALACTIC ORDER - Game Engine
 *
 * Orchestrates game systems with a clean lifecycle:
 *   1. Systems register themselves with priority and phase dependencies
 *   2. Each frame, only systems relevant to the current phase update
 *   3. Phase transitions are handled via EventBus, not manual enable/disable
 *
 * This replaces the 200+ line monolithic game loop in landing.html
 * with a structured, extensible system.
 *
 * Usage:
 *   const engine = new GameEngine();
 *   engine.register('terrain', terrainManager, {
 *       phases: ['SURFACE', 'FLIGHT'],
 *       priority: 10,
 *       update: (dt, t) => terrainManager.update(pos, camera, dt)
 *   });
 *   engine.setPhase('SURFACE');
 *   engine.start();
 */

import { eventBus } from './EventBus.js';

export const PHASE = {
    DESCENT: 'DESCENT',
    SURFACE: 'SURFACE',
    FLIGHT: 'FLIGHT',
};

/**
 * @typedef {Object} SystemEntry
 * @property {string} name - System identifier
 * @property {Object} system - The system instance
 * @property {string[]} phases - Which phases this system updates in
 * @property {number} priority - Lower = updates first (default: 100)
 * @property {Function} update - Update function (dt, elapsedTime)
 * @property {Function} [onPhaseEnter] - Called when entering a phase this system belongs to
 * @property {Function} [onPhaseExit] - Called when leaving a phase this system belongs to
 */

export class GameEngine {
    constructor() {
        /** @type {SystemEntry[]} */
        this._systems = [];
        this._sorted = false;
        this._currentPhase = null;
        this._running = false;
    }

    /**
     * Register a game system.
     * @param {string} name - Unique system name
     * @param {Object} system - The system instance
     * @param {Object} options
     * @param {string[]} [options.phases] - Phases where this system updates (default: all)
     * @param {number} [options.priority] - Update order (lower = first, default: 100)
     * @param {Function} options.update - Called each frame: (dt, elapsedTime)
     * @param {Function} [options.onPhaseEnter] - Called when entering a relevant phase
     * @param {Function} [options.onPhaseExit] - Called when leaving a relevant phase
     */
    register(name, system, options = {}) {
        const entry = {
            name,
            system,
            phases: options.phases || Object.values(PHASE),
            priority: options.priority ?? 100,
            update: options.update,
            onPhaseEnter: options.onPhaseEnter || null,
            onPhaseExit: options.onPhaseExit || null,
            enabled: true,
        };

        // Replace existing system with same name
        const idx = this._systems.findIndex(s => s.name === name);
        if (idx !== -1) {
            this._systems[idx] = entry;
        } else {
            this._systems.push(entry);
        }
        this._sorted = false;
    }

    /**
     * Unregister a system by name.
     * @param {string} name
     */
    unregister(name) {
        const idx = this._systems.findIndex(s => s.name === name);
        if (idx !== -1) {
            this._systems.splice(idx, 1);
        }
    }

    /**
     * Set the current game phase.
     * Fires EventBus 'phase:change' and calls lifecycle hooks.
     * @param {string} phase - One of PHASE values
     */
    setPhase(phase) {
        const oldPhase = this._currentPhase;
        if (oldPhase === phase) return;

        // Exit hooks for systems leaving active state
        if (oldPhase) {
            for (const entry of this._systems) {
                if (entry.onPhaseExit && entry.phases.includes(oldPhase)) {
                    entry.onPhaseExit(oldPhase);
                }
            }
        }

        this._currentPhase = phase;

        // Enter hooks for systems becoming active
        for (const entry of this._systems) {
            if (entry.onPhaseEnter && entry.phases.includes(phase)) {
                entry.onPhaseEnter(phase);
            }
        }

        eventBus.emit('phase:change', { from: oldPhase, to: phase });
    }

    /** Get the current phase */
    get currentPhase() {
        return this._currentPhase;
    }

    /**
     * Run one frame update.
     * Only systems registered for the current phase are updated.
     * @param {number} dt - Delta time
     * @param {number} elapsedTime - Total elapsed time
     */
    tick(dt, elapsedTime) {
        if (!this._sorted) {
            this._systems.sort((a, b) => a.priority - b.priority);
            this._sorted = true;
        }

        const phase = this._currentPhase;
        for (let i = 0; i < this._systems.length; i++) {
            const entry = this._systems[i];
            if (entry.enabled && entry.phases.includes(phase) && entry.update) {
                entry.update(dt, elapsedTime);
            }
        }
    }

    /**
     * Get a registered system by name.
     * @param {string} name
     * @returns {Object|null}
     */
    getSystem(name) {
        const entry = this._systems.find(s => s.name === name);
        return entry ? entry.system : null;
    }

    /**
     * Enable/disable a system without unregistering.
     * @param {string} name
     * @param {boolean} enabled
     */
    setEnabled(name, enabled) {
        const entry = this._systems.find(s => s.name === name);
        if (entry) entry.enabled = enabled;
    }

    /**
     * Get all registered system names (for debugging).
     * @returns {string[]}
     */
    getSystemNames() {
        return this._systems.map(s => `${s.name} (pri:${s.priority}, phases:${s.phases.join(',')})`);
    }

    /**
     * Dispose all systems and clear registrations.
     */
    dispose() {
        for (const entry of this._systems) {
            if (entry.system && typeof entry.system.dispose === 'function') {
                entry.system.dispose();
            }
        }
        this._systems = [];
    }
}
