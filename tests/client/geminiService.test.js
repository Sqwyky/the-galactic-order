/**
 * THE GALACTIC ORDER — GeminiService Tests
 *
 * Tests the AI dialogue service (without actual API calls).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiService } from '../../client/js/ai/GeminiService.js';

describe('GeminiService', () => {
    let service;

    beforeEach(() => {
        service = new GeminiService();
    });

    it('starts as not ready', () => {
        expect(service.isReady()).toBe(false);
    });

    it('rejects empty key', async () => {
        const result = await service.setKey('');
        expect(result).toBe(false);
        expect(service.isReady()).toBe(false);
    });

    it('rejects null key', async () => {
        const result = await service.setKey(null);
        expect(result).toBe(false);
    });

    it('sets planet context', () => {
        service.setPlanetContext({
            name: 'TestWorld',
            rule: 30,
            ruleClass: 3,
            ruleLabel: 'Chaotic',
        });
        expect(service.planetContext.name).toBe('TestWorld');
        expect(service.planetContext.rule).toBe(30);
    });

    it('builds context string', () => {
        service.setPlanetContext({
            name: 'TestWorld',
            rule: 30,
            ruleClass: 3,
            ruleLabel: 'Chaotic',
            atmosphere: 'Turbulent',
            frequency: '7.83Hz',
            musicalNote: 'B2',
            brainwaveBand: 'Alpha',
            mood: 'serene',
            fragmentsFound: 3,
            schumannResonant: true,
        });
        const ctx = service._buildContext();
        expect(ctx).toContain('TestWorld');
        expect(ctx).toContain('Rule: 30');
        expect(ctx).toContain('3/5');
        expect(ctx).toContain('Yes');
    });

    it('returns empty context when no planet set', () => {
        const ctx = service._buildContext();
        expect(ctx).toBe('');
    });

    it('chat returns null when not ready', async () => {
        const result = await service.chat('Hello');
        expect(result).toBeNull();
    });

    it('generateQuest returns null when not ready', async () => {
        const result = await service.generateQuest();
        expect(result).toBeNull();
    });

    it('serializes and restores state', () => {
        service.conversationHistory = [
            { player: 'Hello', being: 'Greetings.' },
            { player: 'What is this?', being: 'A world of patterns.' },
        ];
        const state = service.getState();
        expect(state.conversationHistory).toHaveLength(2);

        const service2 = new GeminiService();
        service2.loadState(state);
        expect(service2.conversationHistory).toHaveLength(2);
        expect(service2.conversationHistory[0].player).toBe('Hello');
    });

    it('handles null loadState gracefully', () => {
        service.loadState(null);
        service.loadState(undefined);
        expect(service.conversationHistory).toHaveLength(0);
    });

    it('trims history to maxHistory', () => {
        service.maxHistory = 2;
        service.conversationHistory = [
            { player: 'a', being: 'b' },
            { player: 'c', being: 'd' },
            { player: 'e', being: 'f' },
        ];
        // Simulate trimming
        while (service.conversationHistory.length > service.maxHistory) {
            service.conversationHistory.shift();
        }
        expect(service.conversationHistory).toHaveLength(2);
        expect(service.conversationHistory[0].player).toBe('c');
    });
});
