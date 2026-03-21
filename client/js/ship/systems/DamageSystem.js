/**
 * THE GALACTIC ORDER — Ship Health & Damage System
 *
 * Component-based health tracking:
 *   - Overall hull HP
 *   - Per-subsystem health (engines, weapons, shields, cockpit, cargo)
 *   - Damage reduces subsystem effectiveness
 *   - Engineer can repair subsystems (costs resources)
 *
 * Visual damage is communicated via events so the ship model
 * can darken materials, add crack emissives, and spawn smoke.
 */

import { eventBus } from '../../core/EventBus.js';

export const SHIP_COMPONENTS = {
    ENGINES:  'engines',
    WEAPONS:  'weapons',
    SHIELDS:  'shields',
    COCKPIT:  'cockpit',
    CARGO:    'cargo',
};

const COMPONENT_LIST = Object.values(SHIP_COMPONENTS);

export class DamageSystem {
    /**
     * @param {Object} stats - Ship stats from ShipClassRegistry
     */
    constructor(stats) {
        this.maxHull = stats.hull || 100;
        this.maxShields = stats.shields || 50;

        this.hull = this.maxHull;
        this.shields = this.maxShields;

        // Per-component health (0-100%)
        this.components = {};
        for (const comp of COMPONENT_LIST) {
            this.components[comp] = 100;
        }

        // Shield recharge
        this.shieldRechargeRate = 5; // per second (modified by power)
        this.shieldRechargeDelay = 3.0; // seconds after last hit
        this._lastHitTime = -999;

        this.destroyed = false;
    }

    /**
     * Apply damage to the ship.
     * @param {number} amount - Damage points
     * @param {string} [targetComponent] - Specific component hit, or null for general
     * @returns {Object} Damage result
     */
    takeDamage(amount, targetComponent = null) {
        if (this.destroyed) return { absorbed: 0, hull: 0, component: null };

        this._lastHitTime = performance.now() / 1000;
        let remaining = amount;
        let shieldAbsorbed = 0;

        // Shields absorb first
        if (this.shields > 0) {
            shieldAbsorbed = Math.min(this.shields, remaining);
            this.shields -= shieldAbsorbed;
            remaining -= shieldAbsorbed;
        }

        // Remaining hits hull
        let hullDamage = 0;
        if (remaining > 0) {
            hullDamage = Math.min(this.hull, remaining);
            this.hull -= hullDamage;

            // Damage specific component or random
            const comp = targetComponent || COMPONENT_LIST[Math.floor(Math.random() * COMPONENT_LIST.length)];
            const compDamage = (hullDamage / this.maxHull) * 100;
            this.components[comp] = Math.max(0, this.components[comp] - compDamage);

            eventBus.emit('damage:component', {
                component: comp,
                health: this.components[comp],
                damage: compDamage,
            });
        }

        eventBus.emit('damage:taken', {
            amount,
            shieldAbsorbed,
            hullDamage,
            hullRemaining: this.hull,
            shieldsRemaining: this.shields,
        });

        // Check destruction
        if (this.hull <= 0) {
            this.destroyed = true;
            eventBus.emit('ship:destroyed', {});
        }

        return { absorbed: shieldAbsorbed, hull: hullDamage, component: targetComponent };
    }

    /**
     * Repair a specific component.
     * @param {string} component
     * @param {number} amount - Repair amount (0-100%)
     * @returns {number} Actual amount repaired
     */
    repairComponent(component, amount = 25) {
        const current = this.components[component] ?? 100;
        const repaired = Math.min(100 - current, amount);
        this.components[component] = current + repaired;

        // Also restore some hull
        const hullRestored = (repaired / 100) * this.maxHull * 0.2;
        this.hull = Math.min(this.maxHull, this.hull + hullRestored);

        eventBus.emit('damage:repaired', {
            component,
            health: this.components[component],
            hullRestored,
        });

        return repaired;
    }

    /**
     * Update shield recharge.
     * @param {number} dt - Delta time
     * @param {number} time - Elapsed time
     * @param {number} [powerMultiplier=1.0] - Shield power multiplier
     */
    update(dt, time, powerMultiplier = 1.0) {
        if (this.destroyed) return;

        // Shield recharge after delay
        const timeSinceHit = time - this._lastHitTime;
        if (timeSinceHit > this.shieldRechargeDelay && this.shields < this.maxShields) {
            const recharge = this.shieldRechargeRate * powerMultiplier * dt;
            this.shields = Math.min(this.maxShields, this.shields + recharge);
        }
    }

    /**
     * Get effectiveness multiplier for a component (0-1).
     * @param {string} component
     * @returns {number}
     */
    getEffectiveness(component) {
        const health = this.components[component] ?? 100;
        // Below 50% health, effectiveness degrades linearly
        if (health >= 50) return 1.0;
        return 0.3 + (health / 50) * 0.7; // 30% minimum effectiveness
    }

    /**
     * Get shield strength ratio (0-1).
     * @returns {number}
     */
    getShieldRatio() {
        return this.maxShields > 0 ? this.shields / this.maxShields : 0;
    }

    /**
     * Get hull integrity ratio (0-1).
     * @returns {number}
     */
    getHullRatio() {
        return this.maxHull > 0 ? this.hull / this.maxHull : 0;
    }

    /**
     * Get overall damage level (0 = pristine, 1 = destroyed).
     * @returns {number}
     */
    getDamageLevel() {
        return 1.0 - this.getHullRatio();
    }

    /** Get full state for serialization / sync. */
    getState() {
        return {
            hull: this.hull,
            maxHull: this.maxHull,
            shields: this.shields,
            maxShields: this.maxShields,
            components: { ...this.components },
            destroyed: this.destroyed,
        };
    }

    /** Apply remote state. */
    applyRemoteState(state) {
        if (state.hull !== undefined) this.hull = state.hull;
        if (state.shields !== undefined) this.shields = state.shields;
        if (state.components) {
            for (const comp of COMPONENT_LIST) {
                if (state.components[comp] !== undefined) {
                    this.components[comp] = state.components[comp];
                }
            }
        }
        if (state.destroyed) this.destroyed = true;
    }
}
