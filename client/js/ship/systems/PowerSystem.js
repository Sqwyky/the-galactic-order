/**
 * THE GALACTIC ORDER — Power Management System
 *
 * FTL-inspired reactor power distribution.
 * The engineer distributes limited reactor output across 4 subsystems:
 *   Engines  — thrust multiplier (0.5x to 2.0x)
 *   Weapons  — cooldown rate and damage multiplier
 *   Shields  — recharge rate and max capacity
 *   Sensors  — scan range and hyperspace charge speed
 *
 * Each subsystem can have 0-4 power bars.
 * Total bars cannot exceed reactor output.
 */

import { eventBus } from '../../core/EventBus.js';

export const SUBSYSTEMS = {
    ENGINES:  'engines',
    WEAPONS:  'weapons',
    SHIELDS:  'shields',
    SENSORS:  'sensors',
};

const SUBSYSTEM_LIST = [SUBSYSTEMS.ENGINES, SUBSYSTEMS.WEAPONS, SUBSYSTEMS.SHIELDS, SUBSYSTEMS.SENSORS];
const MAX_BARS = 4;

// Effect multipliers per bar count
const EFFECT_TABLE = {
    [SUBSYSTEMS.ENGINES]: [0.5, 0.75, 1.0, 1.5, 2.0],   // index = bar count
    [SUBSYSTEMS.WEAPONS]: [0.3, 0.6, 1.0, 1.3, 1.6],
    [SUBSYSTEMS.SHIELDS]: [0.0, 0.5, 1.0, 1.5, 2.0],
    [SUBSYSTEMS.SENSORS]: [0.2, 0.5, 1.0, 1.4, 1.8],
};

export class PowerSystem {
    /**
     * @param {number} reactorOutput - Total available power bars
     */
    constructor(reactorOutput = 10) {
        this.reactorOutput = reactorOutput;
        this.hasAuthority = false;

        // Power allocation (bars per subsystem)
        this.allocation = {
            [SUBSYSTEMS.ENGINES]: 2,
            [SUBSYSTEMS.WEAPONS]: 2,
            [SUBSYSTEMS.SHIELDS]: 2,
            [SUBSYSTEMS.SENSORS]: 2,
        };

        // Computed multipliers
        this.multipliers = {};
        this._recalculate();
    }

    /**
     * Set authority (engineer role active).
     * @param {boolean} hasAuthority
     */
    setAuthority(hasAuthority) {
        this.hasAuthority = hasAuthority;
    }

    /**
     * Set power allocation for a subsystem.
     * @param {string} subsystem - SUBSYSTEMS constant
     * @param {number} bars - 0 to MAX_BARS
     * @returns {boolean} Success (false if would exceed reactor output)
     */
    setPower(subsystem, bars) {
        bars = Math.max(0, Math.min(MAX_BARS, Math.floor(bars)));

        // Check total wouldn't exceed reactor output
        const otherTotal = SUBSYSTEM_LIST
            .filter(s => s !== subsystem)
            .reduce((sum, s) => sum + this.allocation[s], 0);

        if (otherTotal + bars > this.reactorOutput) return false;

        this.allocation[subsystem] = bars;
        this._recalculate();

        eventBus.emit('power:changed', {
            subsystem,
            bars,
            allocation: { ...this.allocation },
            multipliers: { ...this.multipliers },
        });

        return true;
    }

    /**
     * Increase power to a subsystem by 1 bar.
     * Automatically steals from the lowest-priority other subsystem.
     * @param {string} subsystem
     */
    increasePower(subsystem) {
        if (this.allocation[subsystem] >= MAX_BARS) return;

        const total = SUBSYSTEM_LIST.reduce((sum, s) => sum + this.allocation[s], 0);

        if (total >= this.reactorOutput) {
            // Need to steal from another subsystem
            const others = SUBSYSTEM_LIST.filter(s => s !== subsystem && this.allocation[s] > 0);
            if (others.length === 0) return;

            // Steal from the one with most bars
            others.sort((a, b) => this.allocation[b] - this.allocation[a]);
            this.allocation[others[0]]--;
        }

        this.allocation[subsystem]++;
        this._recalculate();

        eventBus.emit('power:changed', {
            subsystem,
            bars: this.allocation[subsystem],
            allocation: { ...this.allocation },
            multipliers: { ...this.multipliers },
        });
    }

    /**
     * Decrease power to a subsystem by 1 bar.
     * @param {string} subsystem
     */
    decreasePower(subsystem) {
        if (this.allocation[subsystem] <= 0) return;
        this.allocation[subsystem]--;
        this._recalculate();

        eventBus.emit('power:changed', {
            subsystem,
            bars: this.allocation[subsystem],
            allocation: { ...this.allocation },
            multipliers: { ...this.multipliers },
        });
    }

    /**
     * Get the effect multiplier for a subsystem.
     * @param {string} subsystem
     * @returns {number}
     */
    getMultiplier(subsystem) {
        return this.multipliers[subsystem] ?? 1.0;
    }

    /**
     * Get total power used.
     * @returns {number}
     */
    getTotalUsed() {
        return SUBSYSTEM_LIST.reduce((sum, s) => sum + this.allocation[s], 0);
    }

    /**
     * Get remaining power bars.
     * @returns {number}
     */
    getRemaining() {
        return this.reactorOutput - this.getTotalUsed();
    }

    /**
     * Apply remote power state (from multiplayer sync).
     * @param {Object} allocation
     */
    applyRemoteState(allocation) {
        for (const s of SUBSYSTEM_LIST) {
            if (allocation[s] !== undefined) {
                this.allocation[s] = allocation[s];
            }
        }
        this._recalculate();
    }

    _recalculate() {
        for (const s of SUBSYSTEM_LIST) {
            const bars = this.allocation[s];
            this.multipliers[s] = EFFECT_TABLE[s][bars] ?? 1.0;
        }
    }

    /** Get full state for serialization. */
    getState() {
        return {
            allocation: { ...this.allocation },
            multipliers: { ...this.multipliers },
            reactorOutput: this.reactorOutput,
        };
    }
}
