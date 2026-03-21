/**
 * THE GALACTIC ORDER — Terminal System Tests
 *
 * Tests the cipher puzzle logic, fragment collection,
 * and puzzle solving stages.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    TerminalSystem,
    CipherFragment,
    generateCipherFragments,
    TERMINAL_STATE,
} from '../../client/js/terminal/TerminalSystem.js';

describe('TerminalSystem', () => {
    let terminal;

    beforeEach(() => {
        terminal = new TerminalSystem({ targetRule: 30, seed: 42 });
    });

    // ============================================================
    // INITIALIZATION
    // ============================================================

    describe('initialization', () => {
        it('starts in LOCKED state', () => {
            expect(terminal.state).toBe(TERMINAL_STATE.LOCKED);
        });

        it('generates 5 cipher fragments', () => {
            expect(terminal.fragments).toHaveLength(5);
        });

        it('starts with 0 collected fragments', () => {
            expect(terminal.getFragmentCount()).toBe(0);
        });

        it('fragments have correct structure', () => {
            const frag = terminal.fragments[0];
            expect(frag).toBeInstanceOf(CipherFragment);
            expect(frag.row).toHaveLength(8);
            expect(frag.row.every(c => c === 0 || c === 1)).toBe(true);
            expect(frag.generation).toBeGreaterThan(0);
            expect(typeof frag.source).toBe('string');
        });
    });

    // ============================================================
    // FRAGMENT COLLECTION
    // ============================================================

    describe('fragment collection', () => {
        it('collecting a fragment transitions to PARTIAL', () => {
            terminal.collectFragment(0);
            expect(terminal.state).toBe(TERMINAL_STATE.PARTIAL);
            expect(terminal.getFragmentCount()).toBe(1);
        });

        it('collecting duplicate fragment has no effect', () => {
            terminal.collectFragment(0);
            terminal.collectFragment(0);
            expect(terminal.getFragmentCount()).toBe(1);
        });

        it('collecting all 5 fragments transitions to READY', () => {
            for (let i = 0; i < 5; i++) {
                terminal.collectFragment(i);
            }
            expect(terminal.state).toBe(TERMINAL_STATE.READY);
            expect(terminal.getFragmentCount()).toBe(5);
        });

        it('invalid fragment ID is ignored', () => {
            terminal.collectFragment(-1);
            terminal.collectFragment(5);
            terminal.collectFragment(99);
            expect(terminal.getFragmentCount()).toBe(0);
        });

        it('marks fragments as discovered', () => {
            terminal.collectFragment(2);
            expect(terminal.fragments[2].discovered).toBe(true);
            expect(terminal.fragments[0].discovered).toBe(false);
        });
    });

    // ============================================================
    // PUZZLE STAGES
    // ============================================================

    describe('puzzle stages', () => {
        beforeEach(() => {
            // Collect all fragments
            for (let i = 0; i < 5; i++) {
                terminal.collectFragment(i);
            }
        });

        it('cannot start puzzle without all fragments', () => {
            const incomplete = new TerminalSystem({ targetRule: 30, seed: 42 });
            incomplete.collectFragment(0);
            expect(incomplete.startPuzzle()).toBe(false);
        });

        it('starts puzzle and transitions to STAGE_1', () => {
            expect(terminal.startPuzzle()).toBe(true);
            expect(terminal.state).toBe(TERMINAL_STATE.STAGE_1);
        });

        it('Stage 1: correct arrangement advances to STAGE_2', () => {
            terminal.startPuzzle();

            // Correct order is by generation (ascending)
            const correctOrder = [...terminal.fragments]
                .sort((a, b) => a.generation - b.generation)
                .map(f => f.id);

            expect(terminal.submitArrangement(correctOrder)).toBe(true);
            expect(terminal.state).toBe(TERMINAL_STATE.STAGE_2);
        });

        it('Stage 1: wrong arrangement stays at STAGE_1', () => {
            terminal.startPuzzle();
            expect(terminal.submitArrangement([4, 3, 2, 1, 0])).toBe(false);
            expect(terminal.state).toBe(TERMINAL_STATE.STAGE_1);
        });

        it('Stage 2: correct neighborhood outputs advance to STAGE_3', () => {
            terminal.startPuzzle();

            // Pass Stage 1
            const correctOrder = [...terminal.fragments]
                .sort((a, b) => a.generation - b.generation)
                .map(f => f.id);
            terminal.submitArrangement(correctOrder);

            // Build correct neighborhood outputs for Rule 30
            const outputs = {};
            const neighborhoods = [
                [1,1,1], [1,1,0], [1,0,1], [1,0,0],
                [0,1,1], [0,1,0], [0,0,1], [0,0,0],
            ];
            for (const [l, c, r] of neighborhoods) {
                const key = `${l}${c}${r}`;
                const val = (l << 2) | (c << 1) | r;
                outputs[key] = (30 >> val) & 1;
            }

            expect(terminal.submitNeighborhoods(outputs)).toBe(true);
            expect(terminal.state).toBe(TERMINAL_STATE.STAGE_3);
        });

        it('Stage 3: correct rule guess cracks the terminal', () => {
            terminal.startPuzzle();

            // Pass Stage 1
            const correctOrder = [...terminal.fragments]
                .sort((a, b) => a.generation - b.generation)
                .map(f => f.id);
            terminal.submitArrangement(correctOrder);

            // Pass Stage 2
            const outputs = {};
            const neighborhoods = [
                [1,1,1], [1,1,0], [1,0,1], [1,0,0],
                [0,1,1], [0,1,0], [0,0,1], [0,0,0],
            ];
            for (const [l, c, r] of neighborhoods) {
                const key = `${l}${c}${r}`;
                const val = (l << 2) | (c << 1) | r;
                outputs[key] = (30 >> val) & 1;
            }
            terminal.submitNeighborhoods(outputs);

            // Submit correct guess
            expect(terminal.submitRuleGuess(30)).toBe(true);
            expect(terminal.state).toBe(TERMINAL_STATE.CRACKED);
        });

        it('Stage 3: wrong rule guess stays at STAGE_3', () => {
            terminal.startPuzzle();
            const correctOrder = [...terminal.fragments]
                .sort((a, b) => a.generation - b.generation)
                .map(f => f.id);
            terminal.submitArrangement(correctOrder);

            const outputs = {};
            const neighborhoods = [
                [1,1,1], [1,1,0], [1,0,1], [1,0,0],
                [0,1,1], [0,1,0], [0,0,1], [0,0,0],
            ];
            for (const [l, c, r] of neighborhoods) {
                const key = `${l}${c}${r}`;
                const val = (l << 2) | (c << 1) | r;
                outputs[key] = (30 >> val) & 1;
            }
            terminal.submitNeighborhoods(outputs);

            expect(terminal.submitRuleGuess(90)).toBe(false);
            expect(terminal.state).toBe(TERMINAL_STATE.STAGE_3);
        });
    });

    // ============================================================
    // RULE EXPLORER
    // ============================================================

    describe('Rule Explorer', () => {
        it('generates correct CA grid', () => {
            const grid = terminal.runExplorer(30, 10);
            expect(grid).toHaveLength(10);
            expect(grid[0]).toHaveLength(41); // width = 41
            // First row has single 1 in center
            expect(grid[0][20]).toBe(1);
            expect(grid[0][0]).toBe(0);
        });

        it('Rule 0 produces all zeros after first generation', () => {
            const grid = terminal.runExplorer(0, 5);
            // Rule 0: every neighborhood → 0
            for (let g = 1; g < 5; g++) {
                expect(grid[g].every(c => c === 0)).toBe(true);
            }
        });

        it('Rule 255 produces all ones after first generation', () => {
            const grid = terminal.runExplorer(255, 3);
            // Rule 255: every neighborhood → 1
            expect(grid[1].every(c => c === 1)).toBe(true);
        });
    });

    // ============================================================
    // CIPHER FRAGMENT GENERATION
    // ============================================================

    describe('generateCipherFragments', () => {
        it('generates 5 fragments for any rule', () => {
            for (const rule of [0, 30, 90, 110, 255]) {
                const frags = generateCipherFragments(rule, 42);
                expect(frags).toHaveLength(5);
            }
        });

        it('fragments are deterministic for same rule+seed', () => {
            const frags1 = generateCipherFragments(30, 42);
            const frags2 = generateCipherFragments(30, 42);
            for (let i = 0; i < 5; i++) {
                expect(frags1[i].row).toEqual(frags2[i].row);
                expect(frags1[i].generation).toBe(frags2[i].generation);
            }
        });

        it('different rules produce different fragments', () => {
            const frags30 = generateCipherFragments(30, 42);
            const frags90 = generateCipherFragments(90, 42);
            // At least one fragment should differ
            const allSame = frags30.every((f, i) =>
                f.row.every((c, j) => c === frags90[i].row[j])
            );
            expect(allSame).toBe(false);
        });

        it('each fragment has valid 8-bit row', () => {
            const frags = generateCipherFragments(110, 99);
            for (const frag of frags) {
                expect(frag.row).toHaveLength(8);
                for (const cell of frag.row) {
                    expect(cell === 0 || cell === 1).toBe(true);
                }
            }
        });
    });

    // ============================================================
    // SERIALIZATION
    // ============================================================

    describe('serialization', () => {
        it('saves and restores state', () => {
            terminal.collectFragment(0);
            terminal.collectFragment(1);
            terminal.collectFragment(2);

            const state = terminal.getState();
            expect(state.state).toBe(TERMINAL_STATE.PARTIAL);
            expect(state.collectedFragments).toEqual([0, 1, 2]);

            const terminal2 = new TerminalSystem({ targetRule: 30, seed: 42 });
            terminal2.loadState(state);

            expect(terminal2.state).toBe(TERMINAL_STATE.PARTIAL);
            expect(terminal2.getFragmentCount()).toBe(3);
            expect(terminal2.fragments[0].discovered).toBe(true);
            expect(terminal2.fragments[3].discovered).toBe(false);
        });

        it('handles null/undefined saved state', () => {
            const t = new TerminalSystem({ targetRule: 30, seed: 42 });
            t.loadState(null);
            expect(t.state).toBe(TERMINAL_STATE.LOCKED);
            t.loadState(undefined);
            expect(t.state).toBe(TERMINAL_STATE.LOCKED);
        });
    });
});
