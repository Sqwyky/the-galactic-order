/**
 * Tests for the Cellular Automata Engine
 *
 * These tests verify:
 * 1. Bitwise compatibility with the Python version
 * 2. Deterministic output (same input = same output, always)
 * 3. Correct behavior for edge cases
 * 4. Rule classification accuracy
 */

import { describe, it, expect } from 'vitest';
import {
    applyRule, runCA1D, runCA1DDual,
    generateDensityGrid, classifyRule,
    getRuleTable, ruleToBinary
} from '../../client/js/generation/cellularAutomata.js';

// ============================================================
// applyRule - The core function
// ============================================================

describe('applyRule', () => {
    it('matches Python for Rule 30 - all 8 patterns', () => {
        // Rule 30 = 00011110 in binary
        // Pattern 111 (7) → 0
        // Pattern 110 (6) → 0
        // Pattern 101 (5) → 0
        // Pattern 100 (4) → 1
        // Pattern 011 (3) → 1
        // Pattern 010 (2) → 1
        // Pattern 001 (1) → 1
        // Pattern 000 (0) → 0
        expect(applyRule(30, 1, 1, 1)).toBe(0);
        expect(applyRule(30, 1, 1, 0)).toBe(0);
        expect(applyRule(30, 1, 0, 1)).toBe(0);
        expect(applyRule(30, 1, 0, 0)).toBe(1);
        expect(applyRule(30, 0, 1, 1)).toBe(1);
        expect(applyRule(30, 0, 1, 0)).toBe(1);
        expect(applyRule(30, 0, 0, 1)).toBe(1);
        expect(applyRule(30, 0, 0, 0)).toBe(0);
    });

    it('matches Python for Rule 110 - all 8 patterns', () => {
        // Rule 110 = 01101110 in binary
        expect(applyRule(110, 1, 1, 1)).toBe(0);
        expect(applyRule(110, 1, 1, 0)).toBe(1);
        expect(applyRule(110, 1, 0, 1)).toBe(1);
        expect(applyRule(110, 1, 0, 0)).toBe(0);
        expect(applyRule(110, 0, 1, 1)).toBe(1);
        expect(applyRule(110, 0, 1, 0)).toBe(1);
        expect(applyRule(110, 0, 0, 1)).toBe(1);
        expect(applyRule(110, 0, 0, 0)).toBe(0);
    });

    it('matches Python for Rule 90 (Sierpinski)', () => {
        // Rule 90 = 01011010 → XOR of left and right
        expect(applyRule(90, 1, 1, 1)).toBe(0);
        expect(applyRule(90, 1, 1, 0)).toBe(1);
        expect(applyRule(90, 1, 0, 1)).toBe(0);
        expect(applyRule(90, 1, 0, 0)).toBe(1);
        expect(applyRule(90, 0, 1, 1)).toBe(1);
        expect(applyRule(90, 0, 1, 0)).toBe(0);
        expect(applyRule(90, 0, 0, 1)).toBe(1);
        expect(applyRule(90, 0, 0, 0)).toBe(0);
    });

    it('Rule 0 always returns 0', () => {
        for (let l = 0; l <= 1; l++) {
            for (let c = 0; c <= 1; c++) {
                for (let r = 0; r <= 1; r++) {
                    expect(applyRule(0, l, c, r)).toBe(0);
                }
            }
        }
    });

    it('Rule 255 always returns 1', () => {
        for (let l = 0; l <= 1; l++) {
            for (let c = 0; c <= 1; c++) {
                for (let r = 0; r <= 1; r++) {
                    expect(applyRule(255, l, c, r)).toBe(1);
                }
            }
        }
    });
});

// ============================================================
// runCA1D - Grid generation
// ============================================================

describe('runCA1D', () => {
    it('returns correct dimensions', () => {
        const grid = runCA1D(30, 81, 50);
        expect(grid.length).toBe(50);
        expect(grid[0].length).toBe(81);
    });

    it('first row has single center dot by default', () => {
        const grid = runCA1D(30, 81, 1);
        const row = grid[0];
        expect(row[40]).toBe(1); // Center of 81
        // All others should be 0
        let total = 0;
        for (const cell of row) total += cell;
        expect(total).toBe(1);
    });

    it('respects custom initial cells', () => {
        const grid = runCA1D(30, 81, 1, [10, 20, 30]);
        expect(grid[0][10]).toBe(1);
        expect(grid[0][20]).toBe(1);
        expect(grid[0][30]).toBe(1);
    });

    it('boundaries stay at 0', () => {
        const grid = runCA1D(255, 81, 50); // Rule 255: everything becomes 1
        for (let gen = 1; gen < 50; gen++) {
            expect(grid[gen][0]).toBe(0);
            expect(grid[gen][80]).toBe(0);
        }
    });

    it('is perfectly deterministic', () => {
        const grid1 = runCA1D(30, 81, 50);
        const grid2 = runCA1D(30, 81, 50);
        for (let y = 0; y < 50; y++) {
            for (let x = 0; x < 81; x++) {
                expect(grid1[y][x]).toBe(grid2[y][x]);
            }
        }
    });

    it('Rule 0 dies after first generation', () => {
        const grid = runCA1D(0, 81, 10);
        // Gen 0 has the initial dot
        expect(grid[0][40]).toBe(1);
        // Gen 1 and beyond should be all zeros
        for (let gen = 2; gen < 10; gen++) {
            for (let x = 0; x < 81; x++) {
                expect(grid[gen][x]).toBe(0);
            }
        }
    });

    it('matches Python output for Rule 30 generation 1', () => {
        // Python: start with dot at center (40), width 81
        // Gen 0: ...0 1 0...
        // Gen 1: ...1 1 1... (cells 39, 40, 41 become 1)
        const grid = runCA1D(30, 81, 3);

        // Gen 1: check the 3 cells around center
        expect(grid[1][39]).toBe(1); // 0,0,1 → pattern 001 → bit 1 of 30 → 1
        expect(grid[1][40]).toBe(1); // 0,1,0 → pattern 010 → bit 2 of 30 → 1
        expect(grid[1][41]).toBe(1); // 1,0,0 → pattern 100 → bit 4 of 30 → 1
        expect(grid[1][38]).toBe(0); // 0,0,0 → pattern 000 → bit 0 of 30 → 0
        expect(grid[1][42]).toBe(0); // 0,0,0 → pattern 000 → bit 0 of 30 → 0
    });
});

// ============================================================
// runCA1DDual - Two Big Bangs
// ============================================================

describe('runCA1DDual', () => {
    it('starts with two dots (center and quarter)', () => {
        const grid = runCA1DDual(30, 81, 1);
        expect(grid[0][40]).toBe(1); // center = 81/2 = 40
        expect(grid[0][20]).toBe(1); // quarter = 81/4 = 20

        let total = 0;
        for (const cell of grid[0]) total += cell;
        expect(total).toBe(2);
    });
});

// ============================================================
// generateDensityGrid
// ============================================================

describe('generateDensityGrid', () => {
    it('returns correct dimensions', () => {
        const density = generateDensityGrid(30, 64, 64, 42, 4);
        expect(density.length).toBe(64 * 64);
    });

    it('values are in [0, 1]', () => {
        const density = generateDensityGrid(30, 64, 64, 42, 8);
        for (let i = 0; i < density.length; i++) {
            expect(density[i]).toBeGreaterThanOrEqual(0);
            expect(density[i]).toBeLessThanOrEqual(1);
        }
    });

    it('is deterministic', () => {
        const d1 = generateDensityGrid(30, 64, 64, 42, 8);
        const d2 = generateDensityGrid(30, 64, 64, 42, 8);
        for (let i = 0; i < d1.length; i++) {
            expect(d1[i]).toBe(d2[i]);
        }
    });

    it('different seeds produce different output', () => {
        const d1 = generateDensityGrid(30, 64, 64, 42, 8);
        const d2 = generateDensityGrid(30, 64, 64, 99, 8);
        let diffs = 0;
        for (let i = 0; i < d1.length; i++) {
            if (d1[i] !== d2[i]) diffs++;
        }
        expect(diffs).toBeGreaterThan(0);
    });
});

// ============================================================
// classifyRule
// ============================================================

describe('classifyRule', () => {
    it('Rule 0 is Class 1 (Uniform)', () => {
        const result = classifyRule(0);
        expect(result.class).toBe(1);
    });

    it('Rule 30 is Class 3 (Chaotic)', () => {
        const result = classifyRule(30);
        expect(result.class).toBe(3);
    });

    it('Rule 90 returns a valid classification', () => {
        const result = classifyRule(90);
        expect(result.class).toBeGreaterThanOrEqual(1);
        expect(result.class).toBeLessThanOrEqual(4);
        expect(result.entropy).toBeGreaterThanOrEqual(0);
        expect(result.entropy).toBeLessThanOrEqual(1);
    });

    it('returns all expected properties', () => {
        const result = classifyRule(110);
        expect(result).toHaveProperty('class');
        expect(result).toHaveProperty('label');
        expect(result).toHaveProperty('entropy');
        expect(result).toHaveProperty('density');
        expect(result).toHaveProperty('avgChange');
    });
});

// ============================================================
// Utility functions
// ============================================================

describe('getRuleTable', () => {
    it('returns 8 entries', () => {
        const table = getRuleTable(30);
        expect(table.length).toBe(8);
    });

    it('Rule 30 table matches known values', () => {
        const table = getRuleTable(30);
        // Pattern 7 (111) → 0
        expect(table[0].pattern).toBe(7);
        expect(table[0].output).toBe(0);
        // Pattern 4 (100) → 1
        expect(table[3].pattern).toBe(4);
        expect(table[3].output).toBe(1);
    });
});

describe('ruleToBinary', () => {
    it('Rule 30 → 00011110', () => {
        expect(ruleToBinary(30)).toBe('00011110');
    });

    it('Rule 110 → 01101110', () => {
        expect(ruleToBinary(110)).toBe('01101110');
    });

    it('Rule 0 → 00000000', () => {
        expect(ruleToBinary(0)).toBe('00000000');
    });

    it('Rule 255 → 11111111', () => {
        expect(ruleToBinary(255)).toBe('11111111');
    });
});
