/**
 * THE GALACTIC ORDER — Quest System
 *
 * Guides the player through discovery of cipher fragments
 * and the terminal puzzle. Quests are planet-local: each world
 * has its own set of fragment quests derived from the planet seed.
 *
 * Quest types:
 *   - EXPLORE: Walk to a specific location
 *   - MINE:    Mine a specific element
 *   - NPC:     Talk to the Mysterious Being
 *   - SCAN:    Scan the planet from the ship
 *   - SURVIVE: Survive a weather event
 */

import { eventBus } from '../core/EventBus.js';

// ============================================================
// QUEST DEFINITIONS
// ============================================================

export const QUEST_STATUS = {
    LOCKED: 'locked',
    AVAILABLE: 'available',
    ACTIVE: 'active',
    COMPLETE: 'complete',
};

/**
 * Template quests — each planet picks 5 from this pool (one per fragment).
 * The `condition` function receives game state and returns true when done.
 */
const QUEST_TEMPLATES = [
    {
        id: 'explore_ridge',
        type: 'EXPLORE',
        title: 'Signal on the Ridge',
        description: 'A faint signal emanates from a high point. Climb to elevation 12+ to triangulate.',
        hint: 'Seek the highest ground nearby.',
        condition: (state) => state.playerY >= 12,
        fragmentMessage: 'The signal crystallizes into a cipher fragment — data etched in binary.',
    },
    {
        id: 'explore_valley',
        type: 'EXPLORE',
        title: 'Echo in the Deep',
        description: 'Something pulses beneath the low terrain. Descend to elevation 3 or below.',
        hint: 'Follow the valleys downward.',
        condition: (state) => state.playerY <= 3 && state.playerY > -10,
        fragmentMessage: 'In the valley floor, a glyph burns — another fragment of the cipher.',
    },
    {
        id: 'explore_distance',
        type: 'EXPLORE',
        title: 'The Far Beacon',
        description: 'Walk 80m from your landing site to find a resonance point.',
        hint: 'Walk far from where you began.',
        condition: (state) => state.distanceFromOrigin >= 80,
        fragmentMessage: 'At the edge of the known, the cipher reveals itself.',
    },
    {
        id: 'mine_element',
        type: 'MINE',
        title: 'Mineral Resonance',
        description: 'Mine 3 resources. The act of deconstruction reveals hidden data.',
        hint: 'Use the Mining Beam (left-click) on rocks and terrain.',
        condition: (state) => state.totalMined >= 3,
        fragmentMessage: 'Between the atoms, a cipher fragment was hiding all along.',
    },
    {
        id: 'npc_talk',
        type: 'NPC',
        title: 'Words of the Being',
        description: 'The Mysterious Being holds a fragment. Speak with it.',
        hint: 'Approach the ethereal glow and press E.',
        condition: (state) => state.encounterState === 'complete',
        fragmentMessage: 'The Being gifts you a fragment, encoded in light.',
    },
    {
        id: 'scan_planet',
        type: 'SCAN',
        title: 'Orbital Insight',
        description: 'Scan the planet from your ship to decode an atmospheric cipher.',
        hint: 'Enter your ship and activate the scanner (Q).',
        condition: (state) => state.scanCount >= 1,
        fragmentMessage: 'The scanner resolves a cipher fragment from the planet\'s resonance.',
    },
    {
        id: 'survive_weather',
        type: 'SURVIVE',
        title: 'Storm Cipher',
        description: 'Survive a weather shift. The universe tests your resolve.',
        hint: 'Wait for the weather to change, or explore until it does.',
        condition: (state) => state.weatherChanged,
        fragmentMessage: 'Through the storm, patterns emerge — a cipher fragment.',
    },
    {
        id: 'explore_creatures',
        type: 'EXPLORE',
        title: 'Life Signs',
        description: 'Approach an alien creature within 10m. Life carries data.',
        hint: 'Find and approach the alien fauna.',
        condition: (state) => state.creatureProximity,
        fragmentMessage: 'The creature\'s bio-pattern contains a cipher fragment.',
    },
];

// ============================================================
// QUEST SYSTEM
// ============================================================

export class QuestSystem {
    /**
     * @param {Object} options
     * @param {number} options.planetRule - CA rule of current planet
     * @param {number} options.planetSeed - Seed of current planet
     * @param {Object} options.terminalSystem - TerminalSystem instance
     * @param {Object} [options.tablet] - TabletUI for discovery logging
     */
    constructor(options) {
        this.planetRule = options.planetRule;
        this.planetSeed = options.planetSeed;
        this.terminalSystem = options.terminalSystem;
        this.tablet = options.tablet || null;

        /** @type {Map<string, Object>} */
        this.quests = new Map();

        // Tracking state fed by external systems
        this.state = {
            playerY: 0,
            distanceFromOrigin: 0,
            totalMined: 0,
            encounterState: 'waiting',
            scanCount: 0,
            weatherChanged: false,
            creatureProximity: false,
        };

        this._selectQuests();
        this._listenEvents();
    }

    // ============================================================
    // QUEST SELECTION — deterministic from seed
    // ============================================================

    _selectQuests() {
        // Always include NPC talk as quest 0
        const pool = QUEST_TEMPLATES.filter(t => t.id !== 'npc_talk');

        // Simple seeded shuffle
        const shuffled = [...pool];
        let s = this.planetSeed;
        for (let i = shuffled.length - 1; i > 0; i--) {
            s = (s * 16807 + 13) & 0x7FFFFFFF;
            const j = s % (i + 1);
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        // Pick 4 from shuffled + always NPC talk = 5 total
        const npcQuest = QUEST_TEMPLATES.find(t => t.id === 'npc_talk');
        const selected = [npcQuest, ...shuffled.slice(0, 4)];

        selected.forEach((template, i) => {
            this.quests.set(template.id, {
                ...template,
                fragmentIndex: i,
                status: i === 0 ? QUEST_STATUS.AVAILABLE : QUEST_STATUS.LOCKED,
            });
        });
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    _listenEvents() {
        // Mining events
        this._unsubs = [];
        this._unsubs.push(eventBus.on('resource:collected', () => {
            this.state.totalMined++;
        }));
        this._unsubs.push(eventBus.on('scanner:complete', () => {
            this.state.scanCount++;
        }));
        this._unsubs.push(eventBus.on('weather:changed', () => {
            this.state.weatherChanged = true;
        }));
    }

    // ============================================================
    // UPDATE — called each frame from GameManager
    // ============================================================

    /**
     * @param {Object} frameState
     * @param {THREE.Vector3} frameState.playerPosition
     * @param {string} frameState.encounterState
     * @param {boolean} frameState.creatureProximity
     */
    update(frameState) {
        if (frameState) {
            if (frameState.playerPosition) {
                this.state.playerY = frameState.playerPosition.y;
                this.state.distanceFromOrigin = Math.sqrt(
                    frameState.playerPosition.x ** 2 +
                    frameState.playerPosition.z ** 2
                );
            }
            if (frameState.encounterState !== undefined) {
                this.state.encounterState = frameState.encounterState;
            }
            if (frameState.creatureProximity !== undefined) {
                this.state.creatureProximity = frameState.creatureProximity;
            }
        }

        // Check active/available quests for completion
        for (const [id, quest] of this.quests) {
            if (quest.status !== QUEST_STATUS.AVAILABLE && quest.status !== QUEST_STATUS.ACTIVE) continue;

            // Auto-activate available quests when player is moving
            if (quest.status === QUEST_STATUS.AVAILABLE) {
                quest.status = QUEST_STATUS.ACTIVE;
                eventBus.emit('quest:activated', { questId: id, title: quest.title });
                if (this.tablet) {
                    this.tablet.addDiscovery(`Quest: ${quest.title} — ${quest.description}`, 'quest');
                }
            }

            if (quest.condition(this.state)) {
                this._completeQuest(id, quest);
            }
        }
    }

    _completeQuest(id, quest) {
        quest.status = QUEST_STATUS.COMPLETE;

        // Award cipher fragment
        this.terminalSystem.collectFragment(quest.fragmentIndex);

        eventBus.emit('quest:completed', { questId: id, title: quest.title, fragmentIndex: quest.fragmentIndex });

        if (this.tablet) {
            this.tablet.addDiscovery(quest.fragmentMessage, 'cipher');
            this.tablet.addDiscovery(`Fragment ${quest.fragmentIndex + 1}/5 collected.`, 'cipher');
        }

        // Unlock next locked quest
        for (const [, q] of this.quests) {
            if (q.status === QUEST_STATUS.LOCKED) {
                q.status = QUEST_STATUS.AVAILABLE;
                break;
            }
        }

        // Check if all 5 fragments collected
        if (this.terminalSystem.getFragmentCount() >= 5) {
            eventBus.emit('quest:allFragments', {});
            if (this.tablet) {
                this.tablet.addDiscovery('All cipher fragments collected! Open the CIPHER tab to begin decryption.', 'cipher');
            }
        }
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    getActiveQuests() {
        const active = [];
        for (const [, quest] of this.quests) {
            if (quest.status === QUEST_STATUS.ACTIVE || quest.status === QUEST_STATUS.AVAILABLE) {
                active.push({ id: quest.id, title: quest.title, hint: quest.hint, type: quest.type });
            }
        }
        return active;
    }

    getCompletedCount() {
        let count = 0;
        for (const [, quest] of this.quests) {
            if (quest.status === QUEST_STATUS.COMPLETE) count++;
        }
        return count;
    }

    getAllQuests() {
        return Array.from(this.quests.values()).map(q => ({
            id: q.id,
            title: q.title,
            description: q.description,
            hint: q.hint,
            type: q.type,
            status: q.status,
            fragmentIndex: q.fragmentIndex,
        }));
    }

    /** Serialization for save/load */
    getState() {
        return {
            completed: Array.from(this.quests.entries())
                .filter(([, q]) => q.status === QUEST_STATUS.COMPLETE)
                .map(([id]) => id),
            state: { ...this.state },
        };
    }

    loadState(saved) {
        if (!saved) return;
        if (saved.completed) {
            for (const id of saved.completed) {
                const quest = this.quests.get(id);
                if (quest) quest.status = QUEST_STATUS.COMPLETE;
            }
            // Unlock next available
            let foundComplete = false;
            for (const [, q] of this.quests) {
                if (q.status === QUEST_STATUS.COMPLETE) {
                    foundComplete = true;
                } else if (foundComplete && q.status === QUEST_STATUS.LOCKED) {
                    q.status = QUEST_STATUS.AVAILABLE;
                    break;
                }
            }
        }
        if (saved.state) {
            Object.assign(this.state, saved.state);
        }
    }

    /**
     * Reset for a new planet — clears quests and reselects from new seed.
     * @param {number} newRule
     * @param {number} newSeed
     */
    reset(newRule, newSeed) {
        this.planetRule = newRule;
        this.planetSeed = newSeed;
        this.quests.clear();
        this.state = {
            playerY: 0, distanceFromOrigin: 0, totalMined: 0,
            encounterState: 'waiting', scanCount: 0,
            weatherChanged: false, creatureProximity: false,
        };
        this._selectQuests();
    }

    dispose() {
        if (this._unsubs) {
            this._unsubs.forEach(fn => fn());
            this._unsubs = [];
        }
    }
}
