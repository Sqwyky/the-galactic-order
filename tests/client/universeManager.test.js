/**
 * Tests for UniverseManager — the seed chain and ghost planet generation.
 */

import { describe, it, expect } from 'vitest';
import {
    UniverseManager,
    generateStarSystem,
    generateGhostPlanet,
    STAR_TYPES,
    PLANET_ARCHETYPES,
} from '../../client/js/universe/UniverseManager.js';

describe('generateStarSystem', () => {
    it('returns star with name and type', () => {
        const system = generateStarSystem(0, 42, 17);
        expect(system.star).toHaveProperty('name');
        expect(system.star).toHaveProperty('type');
        expect(system.star).toHaveProperty('catalog');
        expect(system.star.type).toHaveProperty('color');
        expect(system.star.type).toHaveProperty('temperature');
    });

    it('generates 2-8 planets', () => {
        const system = generateStarSystem(0, 42, 17);
        expect(system.planets.length).toBeGreaterThanOrEqual(2);
        expect(system.planets.length).toBeLessThanOrEqual(8);
        expect(system.planets.length).toBe(system.planetCount);
    });

    it('is deterministic', () => {
        const s1 = generateStarSystem(0, 42, 17);
        const s2 = generateStarSystem(0, 42, 17);
        expect(s1.star.name).toBe(s2.star.name);
        expect(s1.planetCount).toBe(s2.planetCount);
        expect(s1.planets[0].name).toBe(s2.planets[0].name);
        expect(s1.planets[0].rule).toBe(s2.planets[0].rule);
    });

    it('different coordinates produce different systems', () => {
        const s1 = generateStarSystem(0, 42, 17);
        const s2 = generateStarSystem(0, 100, 200);
        // At least one property should differ (extremely unlikely to be the same)
        const differ = s1.star.name !== s2.star.name ||
                       s1.planetCount !== s2.planetCount ||
                       s1.planets[0].rule !== s2.planets[0].rule;
        expect(differ).toBe(true);
    });
});

describe('generateGhostPlanet', () => {
    it('returns all expected properties', () => {
        const planet = generateGhostPlanet(12345, 0, 5);
        expect(planet).toHaveProperty('name');
        expect(planet).toHaveProperty('seed');
        expect(planet).toHaveProperty('rule');
        expect(planet).toHaveProperty('archetype');
        expect(planet).toHaveProperty('orbitRadius');
        expect(planet).toHaveProperty('size');
        expect(planet).toHaveProperty('atmosColor');
        expect(planet).toHaveProperty('moonCount');
        expect(planet).toHaveProperty('hasRings');
    });

    it('rule is in 0-255 range', () => {
        for (let i = 0; i < 10; i++) {
            const planet = generateGhostPlanet(i * 1000, i, 8);
            expect(planet.rule).toBeGreaterThanOrEqual(0);
            expect(planet.rule).toBeLessThanOrEqual(255);
        }
    });

    it('orbit radius increases with planet index', () => {
        const p0 = generateGhostPlanet(12345, 0, 5);
        const p4 = generateGhostPlanet(12345, 4, 5);
        expect(p4.orbitRadius).toBeGreaterThan(p0.orbitRadius);
    });

    it('archetype is valid', () => {
        const planet = generateGhostPlanet(12345, 2, 5);
        expect(planet.archetype).toHaveProperty('id');
        expect(planet.archetype).toHaveProperty('name');
        expect(planet.archetype).toHaveProperty('hasAtmosphere');
    });

    it('atmosphere color is 3-element array', () => {
        const planet = generateGhostPlanet(12345, 0, 5);
        expect(planet.atmosColor.length).toBe(3);
        for (const c of planet.atmosColor) {
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThanOrEqual(1.1); // slight overshoot from rng is ok
        }
    });

    it('is deterministic', () => {
        const p1 = generateGhostPlanet(99999, 2, 6);
        const p2 = generateGhostPlanet(99999, 2, 6);
        expect(p1.name).toBe(p2.name);
        expect(p1.rule).toBe(p2.rule);
        expect(p1.size).toBe(p2.size);
        expect(p1.orbitRadius).toBe(p2.orbitRadius);
    });
});

describe('UniverseManager', () => {
    it('creates with default seed', () => {
        const um = new UniverseManager();
        expect(um.universeSeed).toBe(42);
    });

    it('getSystem returns valid system', () => {
        const um = new UniverseManager(100);
        const system = um.getSystem(10, 20);
        expect(system).toHaveProperty('star');
        expect(system).toHaveProperty('planets');
        expect(system.planets.length).toBeGreaterThan(0);
    });

    it('caches systems', () => {
        const um = new UniverseManager(42);
        const s1 = um.getSystem(5, 5);
        const s2 = um.getSystem(5, 5);
        expect(s1).toBe(s2); // Same reference = cached
    });

    it('enterSystem sets currentSystem', () => {
        const um = new UniverseManager(42);
        const system = um.enterSystem(42, 17);
        expect(um.currentSystem).toBe(system);
    });

    it('approachPlanet returns ghost planet', () => {
        const um = new UniverseManager(42);
        um.enterSystem(42, 17);
        const planet = um.approachPlanet(0);
        expect(planet).not.toBeNull();
        expect(planet).toHaveProperty('name');
        expect(planet).toHaveProperty('rule');
    });

    it('approachPlanet returns null for invalid index', () => {
        const um = new UniverseManager(42);
        um.enterSystem(42, 17);
        expect(um.approachPlanet(-1)).toBeNull();
        expect(um.approachPlanet(999)).toBeNull();
    });

    it('getState returns serializable state', () => {
        const um = new UniverseManager(42);
        um.enterSystem(10, 20);
        um.approachPlanet(0);
        const state = um.getState();
        expect(state.universeSeed).toBe(42);
        expect(state.currentSystem).toEqual({ galaxy: 0, x: 10, y: 20 });
    });

    it('getNearbySystems returns sorted by distance', () => {
        const um = new UniverseManager(42);
        const nearby = um.getNearbySystems(50, 50, 3);
        for (let i = 1; i < nearby.length; i++) {
            expect(nearby[i].distance).toBeGreaterThanOrEqual(nearby[i-1].distance);
        }
    });

    it('generates unique planets across many systems', () => {
        const um = new UniverseManager(42);
        const allRules = new Set();
        const allNames = new Set();
        for (let x = 0; x < 10; x++) {
            for (let y = 0; y < 10; y++) {
                const system = um.getSystem(x, y);
                for (const p of system.planets) {
                    allRules.add(p.rule);
                    allNames.add(p.name);
                }
            }
        }
        // Across 100 systems, we should see meaningful variety
        expect(allRules.size).toBeGreaterThan(20);
        expect(allNames.size).toBeGreaterThan(50);
    });
});

describe('STAR_TYPES', () => {
    it('all star types have required properties', () => {
        for (const star of STAR_TYPES) {
            expect(star).toHaveProperty('id');
            expect(star).toHaveProperty('name');
            expect(star).toHaveProperty('color');
            expect(star).toHaveProperty('temperature');
            expect(star).toHaveProperty('size');
            expect(star.color.length).toBe(3);
        }
    });
});
