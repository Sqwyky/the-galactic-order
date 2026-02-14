/**
 * Tests for the deterministic seed hashing system.
 *
 * The hash function must be:
 * 1. Deterministic (same input = same output, always)
 * 2. Well-distributed (small input change → big output change)
 * 3. Consistent across multiple runs
 */

import { describe, it, expect } from 'vitest';
import {
    hashSeed, hashRange, hashFloat, hashRule,
    seededRandom, generateSeedChain
} from '../../client/js/generation/hashSeed.js';

// ============================================================
// hashSeed
// ============================================================

describe('hashSeed', () => {
    it('returns a 32-bit unsigned integer', () => {
        const h = hashSeed('test');
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(0xFFFFFFFF);
        expect(Number.isInteger(h)).toBe(true);
    });

    it('is deterministic', () => {
        const h1 = hashSeed('galaxy', 0, 'system', 42);
        const h2 = hashSeed('galaxy', 0, 'system', 42);
        expect(h1).toBe(h2);
    });

    it('is deterministic over 1000 calls', () => {
        const first = hashSeed('stress', 'test', 12345);
        for (let i = 0; i < 1000; i++) {
            expect(hashSeed('stress', 'test', 12345)).toBe(first);
        }
    });

    it('different inputs produce different hashes', () => {
        const h1 = hashSeed('galaxy', 0, 'system', 42);
        const h2 = hashSeed('galaxy', 0, 'system', 43);
        expect(h1).not.toBe(h2);
    });

    it('order matters', () => {
        const h1 = hashSeed('a', 'b');
        const h2 = hashSeed('b', 'a');
        expect(h1).not.toBe(h2);
    });

    it('handles numbers and strings', () => {
        const h1 = hashSeed(42);
        const h2 = hashSeed('42');
        // These should be the same since String(42) === '42'
        expect(h1).toBe(h2);
    });

    it('handles empty input', () => {
        const h = hashSeed();
        expect(h).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(h)).toBe(true);
    });

    it('has good avalanche (single char difference)', () => {
        const h1 = hashSeed('test1');
        const h2 = hashSeed('test2');
        // They should differ in many bits
        const xor = h1 ^ h2;
        let bitDiffs = 0;
        for (let i = 0; i < 32; i++) {
            if ((xor >> i) & 1) bitDiffs++;
        }
        // Good avalanche = ~16 bits differ on average, allow 6+
        expect(bitDiffs).toBeGreaterThan(5);
    });
});

// ============================================================
// hashRange
// ============================================================

describe('hashRange', () => {
    it('returns value within range', () => {
        for (let i = 0; i < 100; i++) {
            const v = hashRange(2, 6, 'test', i);
            expect(v).toBeGreaterThanOrEqual(2);
            expect(v).toBeLessThanOrEqual(6);
        }
    });

    it('is deterministic', () => {
        const v1 = hashRange(0, 255, 'planet', 42);
        const v2 = hashRange(0, 255, 'planet', 42);
        expect(v1).toBe(v2);
    });

    it('returns integers', () => {
        for (let i = 0; i < 50; i++) {
            const v = hashRange(0, 100, 'int_test', i);
            expect(Number.isInteger(v)).toBe(true);
        }
    });
});

// ============================================================
// hashFloat
// ============================================================

describe('hashFloat', () => {
    it('returns value in [0, 1)', () => {
        for (let i = 0; i < 100; i++) {
            const v = hashFloat('float_test', i);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('is deterministic', () => {
        expect(hashFloat('a', 'b')).toBe(hashFloat('a', 'b'));
    });
});

// ============================================================
// hashRule
// ============================================================

describe('hashRule', () => {
    it('returns value in [0, 255]', () => {
        for (let i = 0; i < 100; i++) {
            const v = hashRule('rule_test', i);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(255);
        }
    });

    it('is deterministic', () => {
        expect(hashRule('planet', 42)).toBe(hashRule('planet', 42));
    });
});

// ============================================================
// seededRandom
// ============================================================

describe('seededRandom', () => {
    it('produces values in [0, 1)', () => {
        const rng = seededRandom('test');
        for (let i = 0; i < 1000; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('is deterministic (same seed = same sequence)', () => {
        const rng1 = seededRandom('test', 42);
        const rng2 = seededRandom('test', 42);
        for (let i = 0; i < 100; i++) {
            expect(rng1()).toBe(rng2());
        }
    });

    it('different seeds produce different sequences', () => {
        const rng1 = seededRandom('test', 42);
        const rng2 = seededRandom('test', 43);
        let diffs = 0;
        for (let i = 0; i < 100; i++) {
            if (rng1() !== rng2()) diffs++;
        }
        expect(diffs).toBeGreaterThan(90); // Almost all should differ
    });

    it('has reasonable distribution', () => {
        const rng = seededRandom('distribution_test');
        let sum = 0;
        const n = 10000;
        for (let i = 0; i < n; i++) {
            sum += rng();
        }
        const mean = sum / n;
        // Mean should be close to 0.5 for uniform distribution
        expect(mean).toBeGreaterThan(0.45);
        expect(mean).toBeLessThan(0.55);
    });
});

// ============================================================
// generateSeedChain
// ============================================================

describe('generateSeedChain', () => {
    it('returns all expected fields for system level', () => {
        const chain = generateSeedChain(0, 10, 20);
        expect(chain).toHaveProperty('galaxy');
        expect(chain).toHaveProperty('system');
        expect(chain).toHaveProperty('starType');
        expect(chain).toHaveProperty('planetCount');
    });

    it('returns planet fields when planetIndex is given', () => {
        const chain = generateSeedChain(0, 10, 20, 3);
        expect(chain).toHaveProperty('planet');
        expect(chain).toHaveProperty('planetRule');
        expect(chain).toHaveProperty('terrainSeed');
        expect(chain).toHaveProperty('biomeSeed');
        expect(chain).toHaveProperty('floraSeed');
        expect(chain).toHaveProperty('creatureSeed');
        expect(chain).toHaveProperty('resourceSeed');
    });

    it('planetRule is in [0, 255]', () => {
        const chain = generateSeedChain(0, 10, 20, 0);
        expect(chain.planetRule).toBeGreaterThanOrEqual(0);
        expect(chain.planetRule).toBeLessThanOrEqual(255);
    });

    it('planetCount is in [2, 6]', () => {
        for (let i = 0; i < 50; i++) {
            const chain = generateSeedChain(0, i, i * 3);
            expect(chain.planetCount).toBeGreaterThanOrEqual(2);
            expect(chain.planetCount).toBeLessThanOrEqual(6);
        }
    });

    it('is deterministic', () => {
        const c1 = generateSeedChain(0, 42, 100, 2);
        const c2 = generateSeedChain(0, 42, 100, 2);
        expect(c1.galaxy).toBe(c2.galaxy);
        expect(c1.system).toBe(c2.system);
        expect(c1.planet).toBe(c2.planet);
        expect(c1.planetRule).toBe(c2.planetRule);
    });

    it('different systems produce different seeds', () => {
        const c1 = generateSeedChain(0, 10, 20, 0);
        const c2 = generateSeedChain(0, 11, 20, 0);
        expect(c1.system).not.toBe(c2.system);
        expect(c1.planet).not.toBe(c2.planet);
    });
});
