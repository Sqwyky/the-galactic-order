/**
 * Tests for heightmap generation.
 */

import { describe, it, expect } from 'vitest';
import { generateHeightmap, heightmapStats, terraceHeightmap } from '../../client/js/generation/heightmap.js';

describe('generateHeightmap', () => {
    it('returns correct size', () => {
        const hm = generateHeightmap(30, 64, 64, 42);
        expect(hm.length).toBe(64 * 64);
    });

    it('values are in [0, 1]', () => {
        const hm = generateHeightmap(30, 64, 64, 42);
        for (let i = 0; i < hm.length; i++) {
            expect(hm[i]).toBeGreaterThanOrEqual(0);
            expect(hm[i]).toBeLessThanOrEqual(1);
        }
    });

    it('is deterministic', () => {
        const hm1 = generateHeightmap(30, 64, 64, 42);
        const hm2 = generateHeightmap(30, 64, 64, 42);
        for (let i = 0; i < hm1.length; i++) {
            expect(hm1[i]).toBe(hm2[i]);
        }
    });

    it('different rules produce different heightmaps', () => {
        const hm1 = generateHeightmap(30, 64, 64, 42);
        const hm2 = generateHeightmap(110, 64, 64, 42);
        let diffs = 0;
        for (let i = 0; i < hm1.length; i++) {
            if (Math.abs(hm1[i] - hm2[i]) > 0.01) diffs++;
        }
        expect(diffs).toBeGreaterThan(0);
    });

    it('different seeds produce different heightmaps', () => {
        const hm1 = generateHeightmap(30, 64, 64, 42);
        const hm2 = generateHeightmap(30, 64, 64, 99);
        let diffs = 0;
        for (let i = 0; i < hm1.length; i++) {
            if (Math.abs(hm1[i] - hm2[i]) > 0.01) diffs++;
        }
        expect(diffs).toBeGreaterThan(0);
    });

    it('generates 128x128 in reasonable time', () => {
        const start = performance.now();
        generateHeightmap(30, 128, 128, 42);
        const elapsed = performance.now() - start;
        // Should be well under 5 seconds
        expect(elapsed).toBeLessThan(5000);
    });
});

describe('heightmapStats', () => {
    it('returns all expected fields', () => {
        const hm = generateHeightmap(30, 64, 64, 42);
        const stats = heightmapStats(hm);
        expect(stats).toHaveProperty('min');
        expect(stats).toHaveProperty('max');
        expect(stats).toHaveProperty('mean');
        expect(stats).toHaveProperty('stddev');
    });

    it('min <= mean <= max', () => {
        const hm = generateHeightmap(30, 64, 64, 42);
        const stats = heightmapStats(hm);
        expect(stats.min).toBeLessThanOrEqual(stats.mean);
        expect(stats.mean).toBeLessThanOrEqual(stats.max);
    });

    it('normalized heightmap has min=0 and max=1', () => {
        const hm = generateHeightmap(30, 64, 64, 42);
        const stats = heightmapStats(hm);
        expect(stats.min).toBeCloseTo(0, 1);
        expect(stats.max).toBeCloseTo(1, 1);
    });
});

describe('terraceHeightmap', () => {
    it('preserves value range [0, 1]', () => {
        const hm = generateHeightmap(30, 64, 64, 42);
        const terraced = terraceHeightmap(hm, 8, 0.5);
        for (let i = 0; i < terraced.length; i++) {
            expect(terraced[i]).toBeGreaterThanOrEqual(0);
            expect(terraced[i]).toBeLessThanOrEqual(1);
        }
    });

    it('sharpness 0 returns original values', () => {
        const hm = generateHeightmap(30, 64, 64, 42);
        const terraced = terraceHeightmap(hm, 8, 0);
        for (let i = 0; i < hm.length; i++) {
            expect(terraced[i]).toBeCloseTo(hm[i], 5);
        }
    });
});
