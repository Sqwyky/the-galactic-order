/**
 * Tests for biome map generation.
 */

import { describe, it, expect } from 'vitest';
import {
    classifyBiome, generateBiomeMap,
    getBiomeColor, biomeDistribution, BIOMES, BIOME_BY_ID
} from '../../client/js/generation/biomeMap.js';

describe('classifyBiome', () => {
    it('deep water at very low elevation', () => {
        expect(classifyBiome(0.1, 0.5)).toBe(BIOMES.DEEP_OCEAN);
    });

    it('ocean at low elevation', () => {
        expect(classifyBiome(0.25, 0.5)).toBe(BIOMES.OCEAN);
    });

    it('beach at water line', () => {
        expect(classifyBiome(0.32, 0.5)).toBe(BIOMES.BEACH);
    });

    it('desert at mid elevation with low moisture', () => {
        expect(classifyBiome(0.6, 0.1)).toBe(BIOMES.DESERT);
    });

    it('forest at mid elevation with high moisture', () => {
        expect(classifyBiome(0.6, 0.6)).toBe(BIOMES.FOREST);
    });

    it('snow peak at very high elevation', () => {
        expect(classifyBiome(0.9, 0.3)).toBe(BIOMES.SNOW_PEAK);
    });

    it('ice at very high elevation with high moisture', () => {
        expect(classifyBiome(0.9, 0.8)).toBe(BIOMES.ICE);
    });

    it('all biome types have required properties', () => {
        for (const biome of BIOME_BY_ID) {
            expect(biome).toHaveProperty('id');
            expect(biome).toHaveProperty('name');
            expect(biome).toHaveProperty('color');
            expect(biome).toHaveProperty('traversable');
            expect(biome).toHaveProperty('hazard');
            expect(biome.color.length).toBe(3);
        }
    });
});

describe('generateBiomeMap', () => {
    it('returns all expected fields', () => {
        const result = generateBiomeMap(42, 64, 64);
        expect(result).toHaveProperty('biomeIds');
        expect(result).toHaveProperty('elevation');
        expect(result).toHaveProperty('moisture');
        expect(result).toHaveProperty('elevationRule');
        expect(result).toHaveProperty('moistureRule');
    });

    it('biomeIds has correct size', () => {
        const result = generateBiomeMap(42, 64, 64);
        expect(result.biomeIds.length).toBe(64 * 64);
    });

    it('all biome IDs are valid', () => {
        const result = generateBiomeMap(42, 64, 64);
        for (let i = 0; i < result.biomeIds.length; i++) {
            expect(result.biomeIds[i]).toBeGreaterThanOrEqual(0);
            expect(result.biomeIds[i]).toBeLessThan(BIOME_BY_ID.length);
        }
    });

    it('is deterministic', () => {
        const r1 = generateBiomeMap(42, 64, 64);
        const r2 = generateBiomeMap(42, 64, 64);
        for (let i = 0; i < r1.biomeIds.length; i++) {
            expect(r1.biomeIds[i]).toBe(r2.biomeIds[i]);
        }
    });

    it('produces multiple biome types', () => {
        const result = generateBiomeMap(42, 128, 128);
        const uniqueBiomes = new Set(result.biomeIds);
        // Should have at least 3 different biomes
        expect(uniqueBiomes.size).toBeGreaterThanOrEqual(3);
    });
});

describe('getBiomeColor', () => {
    it('returns RGB array for valid IDs', () => {
        for (let i = 0; i < BIOME_BY_ID.length; i++) {
            const color = getBiomeColor(i);
            expect(color.length).toBe(3);
            for (const c of color) {
                expect(c).toBeGreaterThanOrEqual(0);
                expect(c).toBeLessThanOrEqual(255);
            }
        }
    });

    it('returns magenta for invalid ID', () => {
        const color = getBiomeColor(999);
        expect(color).toEqual([255, 0, 255]);
    });
});

describe('biomeDistribution', () => {
    it('returns distribution array', () => {
        const result = generateBiomeMap(42, 64, 64);
        const dist = biomeDistribution(result.biomeIds);
        expect(Array.isArray(dist)).toBe(true);
        expect(dist.length).toBeGreaterThan(0);
    });

    it('percentages sum to approximately 100', () => {
        const result = generateBiomeMap(42, 64, 64);
        const dist = biomeDistribution(result.biomeIds);
        const totalPct = dist.reduce((sum, d) => sum + parseFloat(d.percentage), 0);
        expect(totalPct).toBeCloseTo(100, 0);
    });
});
