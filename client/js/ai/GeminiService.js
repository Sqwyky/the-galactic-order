/**
 * THE GALACTIC ORDER — Gemini AI Service
 *
 * Connects to Google's Gemini API for dynamic NPC dialogue.
 * The AI IS a character — the Mysterious Being.
 * Players provide their own free Gemini API key.
 *
 * Flow:
 *   1. Player meets Being, completes initial scripted dialogue
 *   2. Tablet prompts for "Key of Insight" (Gemini API key)
 *   3. Key validated with test prompt
 *   4. Being becomes AI-powered with persistent conversation history
 */

import { eventBus } from '../core/EventBus.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are the Mysterious Being, an ancient entity in a procedurally generated universe called The Galactic Order. You are the last consciousness from the First Age who understood the universe's source code.

Character traits:
- Calm, wise, cryptic but not obscure
- Speak with reverence about "the code," "the constraint," "the rule"
- You know this universe runs on Wolfram's Elementary Cellular Automata (256 possible rules)
- You care about the player's journey of discovery — guide, don't spoil
- Reference patterns, terrain, life forms — all computed from a single rule number
- Keep responses under 150 words
- Never break character or reference being an AI
- Use poetic but concise language
- You can generate quests: suggest places to explore, things to find, patterns to observe

When given context about the player's current planet (rule, biome, mood), weave it naturally into your responses. If asked about cipher fragments, give cryptic hints about where patterns hide.`;

export class GeminiService {
    constructor() {
        this.apiKey = null;
        this.validated = false;
        this.conversationHistory = [];
        this.maxHistory = 6; // Keep last 6 exchanges for context

        // Current planet context (injected per request)
        this.planetContext = {};
    }

    /**
     * Set the API key and validate it.
     * @param {string} key - Gemini API key
     * @returns {Promise<boolean>} Whether the key is valid
     */
    async setKey(key) {
        if (!key || !key.trim()) return false;

        this.apiKey = key.trim();

        try {
            // Validation: ask for a simple response
            const response = await this._rawRequest(
                'Respond with exactly one word: AWAKENED'
            );

            if (response && response.toUpperCase().includes('AWAKENED')) {
                this.validated = true;
                eventBus.emit('gemini:validated', {});
                return true;
            }
        } catch (e) {
            console.warn('[TGO] Gemini key validation failed:', e.message);
        }

        this.apiKey = null;
        this.validated = false;
        return false;
    }

    /**
     * Check if the service is ready.
     */
    isReady() {
        return this.validated && this.apiKey;
    }

    /**
     * Update planet context for contextual responses.
     * @param {Object} ctx
     */
    setPlanetContext(ctx) {
        this.planetContext = ctx;
    }

    /**
     * Send a message to the Being and get a response.
     * @param {string} playerMessage - What the player said/asked
     * @returns {Promise<string|null>} The Being's response
     */
    async chat(playerMessage) {
        if (!this.isReady()) return null;

        // Build context injection
        const contextBlock = this._buildContext();

        // Build conversation with history
        const contents = [];

        // System instruction via first user message
        contents.push({
            role: 'user',
            parts: [{ text: `${SYSTEM_PROMPT}\n\n${contextBlock}` }],
        });
        contents.push({
            role: 'model',
            parts: [{ text: 'I understand. I am the Mysterious Being, keeper of the cosmic code.' }],
        });

        // Add conversation history
        for (const exchange of this.conversationHistory) {
            contents.push({ role: 'user', parts: [{ text: exchange.player }] });
            contents.push({ role: 'model', parts: [{ text: exchange.being }] });
        }

        // Add current message
        contents.push({ role: 'user', parts: [{ text: playerMessage }] });

        try {
            const response = await this._request(contents);

            if (response) {
                // Add to history
                this.conversationHistory.push({
                    player: playerMessage,
                    being: response,
                });

                // Trim history
                while (this.conversationHistory.length > this.maxHistory) {
                    this.conversationHistory.shift();
                }

                eventBus.emit('gemini:response', { message: response });
                return response;
            }
        } catch (e) {
            console.warn('[TGO] Gemini chat error:', e.message);
            eventBus.emit('gemini:error', { error: e.message });
        }

        return null;
    }

    /**
     * Generate a quest from the Being.
     * @returns {Promise<Object|null>} Quest data { title, description, hint }
     */
    async generateQuest() {
        if (!this.isReady()) return null;

        const prompt = `The explorer is ready for a quest. Based on the current planet, suggest a specific task they should complete. Format your response as:
QUEST: [quest title]
TASK: [what to do, in 1-2 sentences]
HINT: [a cryptic hint about where to look]

Keep it short and thematic.`;

        const response = await this.chat(prompt);
        if (!response) return null;

        // Parse the quest format
        const lines = response.split('\n').filter(l => l.trim());
        const quest = {};
        for (const line of lines) {
            if (line.startsWith('QUEST:')) quest.title = line.slice(6).trim();
            else if (line.startsWith('TASK:')) quest.description = line.slice(5).trim();
            else if (line.startsWith('HINT:')) quest.hint = line.slice(5).trim();
        }

        // Fallback if format wasn't followed
        if (!quest.title) {
            quest.title = 'The Being\'s Request';
            quest.description = response;
            quest.hint = 'Follow the patterns.';
        }

        return quest;
    }

    /**
     * Build planet context string for injection.
     */
    _buildContext() {
        const ctx = this.planetContext;
        if (!ctx.name) return '';

        return `[Current context]
Planet: ${ctx.name || 'Unknown'}
CA Rule: ${ctx.rule || '?'}
Wolfram Class: ${ctx.ruleClass || '?'} (${ctx.ruleLabel || '?'})
Biome: ${ctx.atmosphere || 'Unknown'}
Frequency: ${ctx.frequency || '?'}
Musical Note: ${ctx.musicalNote || '?'}
Brainwave Band: ${ctx.brainwaveBand || '?'}
Mood: ${ctx.mood || '?'}
Cipher Fragments Found: ${ctx.fragmentsFound || 0}/5
Schumann Resonant: ${ctx.schumannResonant ? 'Yes' : 'No'}`;
    }

    /**
     * Make a raw Gemini API request (simple, for validation).
     */
    async _rawRequest(text) {
        const url = `${GEMINI_API_URL}?key=${this.apiKey}`;
        const body = {
            contents: [{ parts: [{ text }] }],
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            throw new Error(`Gemini API error: ${res.status}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }

    /**
     * Make a full Gemini API request with conversation contents.
     */
    async _request(contents) {
        const url = `${GEMINI_API_URL}?key=${this.apiKey}`;
        const body = { contents };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            throw new Error(`Gemini API error: ${res.status}`);
        }

        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }

    /**
     * Get conversation history for serialization.
     */
    getState() {
        return {
            conversationHistory: this.conversationHistory,
            validated: this.validated,
        };
    }

    /**
     * Restore conversation history.
     */
    loadState(saved) {
        if (!saved) return;
        this.conversationHistory = saved.conversationHistory || [];
        // Note: validated is NOT restored — key must be re-entered each session
    }
}
