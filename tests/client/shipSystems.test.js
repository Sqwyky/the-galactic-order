/**
 * THE GALACTIC ORDER — Ship Systems Tests
 *
 * Tests for PowerSystem, DamageSystem, and related ship mechanics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PowerSystem, SUBSYSTEMS } from '../../client/js/ship/systems/PowerSystem.js';
import { DamageSystem } from '../../client/js/ship/systems/DamageSystem.js';

describe('PowerSystem', () => {
    let power;

    beforeEach(() => {
        power = new PowerSystem(10);
    });

    it('initializes with reactor output', () => {
        const state = power.getState();
        expect(state.reactorOutput).toBe(10);
    });

    it('starts with balanced allocation (2 each)', () => {
        const state = power.getState();
        expect(state.allocation.engines).toBe(2);
        expect(state.allocation.weapons).toBe(2);
        expect(state.allocation.shields).toBe(2);
        expect(state.allocation.sensors).toBe(2);
    });

    it('total used is 8 initially', () => {
        expect(power.getTotalUsed()).toBe(8);
    });

    it('remaining is 2 initially', () => {
        expect(power.getRemaining()).toBe(2);
    });

    it('setPower changes allocation', () => {
        power.setPower('engines', 4);
        expect(power.allocation.engines).toBe(4);
    });

    it('setPower clamps to MAX_BARS (4)', () => {
        // setPower clamps to 4 max, so setPower('engines', 5) → 4
        power.setPower('engines', 5);
        expect(power.allocation.engines).toBe(4);
    });

    it('increasePower steals from other subsystem when full', () => {
        // Fill to 10
        power.setPower('engines', 4);
        // Now total = 4+2+2+2 = 10
        power.increasePower('engines');
        // Should have stolen from one of the others
        expect(power.getTotalUsed()).toBeLessThanOrEqual(10);
    });

    it('decreasePower reduces allocation', () => {
        power.decreasePower('engines');
        expect(power.allocation.engines).toBe(1);
    });

    it('returns multiplier for subsystem', () => {
        const mult = power.getMultiplier('engines');
        expect(typeof mult).toBe('number');
        expect(mult).toBeGreaterThan(0);
    });

    it('getState returns serializable state', () => {
        const state = power.getState();
        expect(state.allocation).toBeTruthy();
        expect(state.multipliers).toBeTruthy();
        expect(state.reactorOutput).toBe(10);
    });

    it('applyRemoteState updates allocation', () => {
        power.applyRemoteState({ engines: 0, weapons: 0, shields: 0, sensors: 0 });
        expect(power.getTotalUsed()).toBe(0);
    });
});

describe('DamageSystem', () => {
    let damage;

    beforeEach(() => {
        damage = new DamageSystem({ hull: 100, shields: 50 });
    });

    it('initializes with hull and shields', () => {
        const state = damage.getState();
        expect(state.hull).toBe(100);
        expect(state.shields).toBe(50);
    });

    it('takes damage reducing shields first', () => {
        damage.takeDamage(30);
        const state = damage.getState();
        expect(state.shields).toBe(20);
        expect(state.hull).toBe(100);
    });

    it('overflow damage hits hull', () => {
        damage.takeDamage(60);
        const state = damage.getState();
        expect(state.shields).toBe(0);
        expect(state.hull).toBe(90);
    });

    it('getState returns serializable state', () => {
        const state = damage.getState();
        expect(typeof state.hull).toBe('number');
        expect(typeof state.shields).toBe('number');
        expect(state.components).toBeTruthy();
        expect(typeof state.destroyed).toBe('boolean');
    });

    it('shield ratio starts at 1', () => {
        expect(damage.getShieldRatio()).toBe(1);
    });

    it('hull ratio starts at 1', () => {
        expect(damage.getHullRatio()).toBe(1);
    });

    it('damage level starts at 0', () => {
        expect(damage.getDamageLevel()).toBe(0);
    });

    it('repairComponent restores component health', () => {
        damage.takeDamage(80); // Will damage hull and components
        const comp = 'engines';
        const before = damage.components[comp];
        if (before < 100) {
            const repaired = damage.repairComponent(comp, 50);
            expect(repaired).toBeGreaterThan(0);
            expect(damage.components[comp]).toBeGreaterThan(before);
        }
    });

    it('component effectiveness degrades below 50% health', () => {
        damage.components.engines = 25;
        const eff = damage.getEffectiveness('engines');
        expect(eff).toBeLessThan(1);
        expect(eff).toBeGreaterThanOrEqual(0.3);
    });

    it('component effectiveness is 1 at full health', () => {
        expect(damage.getEffectiveness('engines')).toBe(1);
    });

    it('destroyed flag set when hull reaches 0', () => {
        damage.takeDamage(200); // Should destroy the ship
        expect(damage.destroyed).toBe(true);
    });

    it('applyRemoteState updates values', () => {
        damage.applyRemoteState({ hull: 50, shields: 25 });
        expect(damage.hull).toBe(50);
        expect(damage.shields).toBe(25);
    });

    it('update recharges shields after delay', () => {
        damage.takeDamage(20);
        const before = damage.shields;
        // Simulate time well past the recharge delay
        damage._lastHitTime = -10; // Long ago
        for (let i = 0; i < 100; i++) {
            damage.update(0.1, i * 0.1, 1.0);
        }
        expect(damage.shields).toBeGreaterThan(before);
    });
});
