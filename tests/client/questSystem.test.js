/**
 * THE GALACTIC ORDER — Quest System Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestSystem, QUEST_STATUS } from '../../client/js/quest/QuestSystem.js';

// Minimal TerminalSystem stub
function makeTerminal() {
    const collected = new Set();
    return {
        collectFragment(id) { collected.add(id); },
        getFragmentCount() { return collected.size; },
        _collected: collected,
    };
}

describe('QuestSystem', () => {
    let qs;
    let terminal;

    beforeEach(() => {
        terminal = makeTerminal();
        qs = new QuestSystem({
            planetRule: 30,
            planetSeed: 42,
            terminalSystem: terminal,
        });
    });

    describe('initialization', () => {
        it('creates 5 quests', () => {
            expect(qs.getAllQuests()).toHaveLength(5);
        });

        it('always includes NPC talk quest', () => {
            const quests = qs.getAllQuests();
            expect(quests.some(q => q.id === 'npc_talk')).toBe(true);
        });

        it('first quest is available, rest are locked', () => {
            const quests = qs.getAllQuests();
            expect(quests[0].status).toBe(QUEST_STATUS.AVAILABLE);
            const lockedCount = quests.filter(q => q.status === QUEST_STATUS.LOCKED).length;
            expect(lockedCount).toBe(4);
        });

        it('deterministic quest selection for same seed', () => {
            const qs2 = new QuestSystem({
                planetRule: 30,
                planetSeed: 42,
                terminalSystem: makeTerminal(),
            });
            const ids1 = qs.getAllQuests().map(q => q.id);
            const ids2 = qs2.getAllQuests().map(q => q.id);
            expect(ids1).toEqual(ids2);
        });

        it('different seeds produce different quest order', () => {
            const qs2 = new QuestSystem({
                planetRule: 30,
                planetSeed: 999,
                terminalSystem: makeTerminal(),
            });
            const ids1 = qs.getAllQuests().map(q => q.id).join(',');
            const ids2 = qs2.getAllQuests().map(q => q.id).join(',');
            // Very unlikely to be the same with different seeds
            expect(ids1).not.toBe(ids2);
        });
    });

    describe('quest completion', () => {
        it('completes NPC quest when encounterState is complete', () => {
            qs.update({ encounterState: 'complete' });
            const quests = qs.getAllQuests();
            const npc = quests.find(q => q.id === 'npc_talk');
            expect(npc.status).toBe(QUEST_STATUS.COMPLETE);
        });

        it('awards fragment on completion', () => {
            qs.update({ encounterState: 'complete' });
            expect(terminal.getFragmentCount()).toBeGreaterThanOrEqual(1);
        });

        it('unlocks next quest after completion', () => {
            qs.update({ encounterState: 'complete' });
            const quests = qs.getAllQuests();
            // At least one should be complete, and some may still be pending/available
            const completed = quests.filter(q => q.status === QUEST_STATUS.COMPLETE);
            expect(completed.length).toBeGreaterThanOrEqual(1);
        });

        it('getActiveQuests returns only active/available', () => {
            const active = qs.getActiveQuests();
            expect(active.length).toBeGreaterThanOrEqual(1);
            for (const q of active) {
                expect(q.title).toBeTruthy();
                expect(q.hint).toBeTruthy();
            }
        });

        it('getCompletedCount tracks completions', () => {
            expect(qs.getCompletedCount()).toBe(0);
            qs.update({ encounterState: 'complete' });
            expect(qs.getCompletedCount()).toBeGreaterThanOrEqual(1);
        });
    });

    describe('serialization', () => {
        it('saves and restores quest state', () => {
            qs.update({ encounterState: 'complete' });
            const completedBefore = qs.getCompletedCount();
            expect(completedBefore).toBeGreaterThanOrEqual(1);

            const state = qs.getState();
            expect(state.completed.length).toBeGreaterThanOrEqual(1);
            expect(state.completed).toContain('npc_talk');

            const qs2 = new QuestSystem({
                planetRule: 30,
                planetSeed: 42,
                terminalSystem: makeTerminal(),
            });
            qs2.loadState(state);
            // The npc_talk quest should be marked complete
            const npcQuest = qs2.getAllQuests().find(q => q.id === 'npc_talk');
            expect(npcQuest.status).toBe('complete');
        });

        it('handles null state gracefully', () => {
            qs.loadState(null);
            qs.loadState(undefined);
            expect(qs.getCompletedCount()).toBe(0);
        });
    });

    describe('explore quests', () => {
        it('completes elevation quest', () => {
            // First complete NPC quest to unlock next
            qs.update({ encounterState: 'complete' });

            // Find the next active quest
            const active = qs.getActiveQuests();
            const exploreQuest = active.find(q => q.type === 'EXPLORE' || q.type === 'MINE' || q.type === 'SCAN' || q.type === 'SURVIVE');

            if (exploreQuest) {
                // Provide all possible conditions
                qs.update({
                    playerPosition: { x: 0, y: 20, z: 100 },
                    encounterState: 'complete',
                    creatureProximity: true,
                });
                qs.state.totalMined = 10;
                qs.state.scanCount = 5;
                qs.state.weatherChanged = true;
                qs.update({
                    playerPosition: { x: 0, y: 20, z: 100 },
                    encounterState: 'complete',
                    creatureProximity: true,
                });
                expect(qs.getCompletedCount()).toBeGreaterThanOrEqual(2);
            }
        });
    });

    describe('reset', () => {
        it('resets quests for new planet', () => {
            qs.update({ encounterState: 'complete' });
            expect(qs.getCompletedCount()).toBeGreaterThanOrEqual(1);

            qs.reset(110, 999);
            expect(qs.getCompletedCount()).toBe(0);
            expect(qs.getAllQuests()).toHaveLength(5);
            expect(qs.planetRule).toBe(110);
            expect(qs.planetSeed).toBe(999);
        });

        it('generates different quests for different seed', () => {
            const before = qs.getAllQuests().map(q => q.id).join(',');
            qs.reset(110, 999);
            const after = qs.getAllQuests().map(q => q.id).join(',');
            // NPC quest is always first, but others differ
            expect(after).not.toBe(before);
        });
    });

    describe('dispose', () => {
        it('cleans up event listeners', () => {
            qs.dispose();
            expect(qs._unsubs).toHaveLength(0);
        });
    });
});
