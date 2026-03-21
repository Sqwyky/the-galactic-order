/**
 * THE GALACTIC ORDER — Terminal System & Code-Breaking Puzzle
 *
 * The core mystery mechanic: players collect 5 Cipher Fragments
 * (8-bit CA rows) and solve a 4-stage puzzle to reveal their
 * home galaxy's Wolfram rule number.
 *
 * Terminal States:
 *   LOCKED     → "0/5 FRAGMENTS" (no interaction)
 *   PARTIAL    → Shows progress, loaded fragment data
 *   READY      → All 5 fragments loaded, puzzle available
 *   STAGE_1    → Reconstruction: Arrange fragments by generation
 *   STAGE_2    → The Neighborhood: Determine rule outputs for all 8 neighborhoods
 *   STAGE_3    → The Number: Convert 8-bit binary to decimal rule number
 *   CRACKED    → Terminal unlocked, rule revealed, CA animation plays
 *
 * After cracking, the terminal becomes a Rule Explorer that can
 * run any rule (0-255) and see the CA pattern in real-time.
 */

import { eventBus } from '../core/EventBus.js';

// The 8 possible three-cell neighborhoods for elementary CA
const NEIGHBORHOODS = [
    [1, 1, 1], // 7 → bit 7
    [1, 1, 0], // 6 → bit 6
    [1, 0, 1], // 5 → bit 5
    [1, 0, 0], // 4 → bit 4
    [0, 1, 1], // 3 → bit 3
    [0, 1, 0], // 2 → bit 2
    [0, 0, 1], // 1 → bit 1
    [0, 0, 0], // 0 → bit 0
];

export const TERMINAL_STATE = {
    LOCKED: 'LOCKED',
    PARTIAL: 'PARTIAL',
    READY: 'READY',
    STAGE_1: 'STAGE_1',
    STAGE_2: 'STAGE_2',
    STAGE_3: 'STAGE_3',
    CRACKED: 'CRACKED',
};

/**
 * A Cipher Fragment — an 8-bit CA row captured from terrain patterns.
 */
export class CipherFragment {
    /**
     * @param {number} id - Fragment index (0-4)
     * @param {number[]} row - 8 cells (0 or 1) — the CA output row
     * @param {number} generation - Which generation this row came from
     * @param {string} source - Where it was found (planet name, quest description)
     */
    constructor(id, row, generation, source) {
        this.id = id;
        this.row = row;         // [0,1,1,0,1,1,1,0] — 8 bits
        this.generation = generation;
        this.source = source;
        this.discovered = false;
    }
}

/**
 * Generate the 5 cipher fragments for a given target rule.
 * These are specific generations of the CA that the player must
 * arrange and analyze to deduce the rule number.
 *
 * @param {number} targetRule - The rule to encode (0-255)
 * @param {number} seed - Planet seed for deterministic placement
 * @returns {CipherFragment[]}
 */
export function generateCipherFragments(targetRule, seed) {
    // Run the CA for enough generations to get meaningful fragments
    const width = 8;
    const generations = 12;
    const grid = [];

    // Initial condition: single 1 in center
    const row0 = new Array(width).fill(0);
    row0[Math.floor(width / 2)] = 1;
    grid.push(row0);

    for (let g = 1; g < generations; g++) {
        const prev = grid[g - 1];
        const next = new Array(width).fill(0);
        for (let i = 0; i < width; i++) {
            const left = prev[(i - 1 + width) % width];
            const center = prev[i];
            const right = prev[(i + 1) % width];
            const neighborhood = (left << 2) | (center << 1) | right;
            next[i] = (targetRule >> neighborhood) & 1;
        }
        grid.push(next);
    }

    // Pick 5 interesting generations (not too early, spread out)
    const fragmentGens = [2, 4, 6, 8, 10];
    const sources = [
        'Carved into ancient stone pillar',
        'Etched on crystalline formation',
        'Projected by the Mysterious Being',
        'Decoded from terrain wave pattern',
        'Found in abandoned terminal ruins',
    ];

    return fragmentGens.map((gen, i) =>
        new CipherFragment(i, [...grid[gen]], gen, sources[i])
    );
}

/**
 * Run a single CA step given a rule number.
 */
function applyRule(row, rule) {
    const width = row.length;
    const next = new Array(width).fill(0);
    for (let i = 0; i < width; i++) {
        const left = row[(i - 1 + width) % width];
        const center = row[i];
        const right = row[(i + 1) % width];
        const neighborhood = (left << 2) | (center << 1) | right;
        next[i] = (rule >> neighborhood) & 1;
    }
    return next;
}

export class TerminalSystem {
    /**
     * @param {Object} options
     * @param {number} options.targetRule - The rule the player must deduce
     * @param {number} options.seed - Planet seed
     */
    constructor(options = {}) {
        this.targetRule = options.targetRule || 30;
        this.seed = options.seed || 42;
        this.state = TERMINAL_STATE.LOCKED;

        // Generate the puzzle fragments
        this.fragments = generateCipherFragments(this.targetRule, this.seed);

        // Puzzle state
        this.collectedFragments = new Set(); // fragment IDs collected
        this.playerArrangement = [];         // Stage 1: ordered fragment IDs
        this.playerNeighborhoods = {};       // Stage 2: neighborhood → output bit
        this.playerRuleGuess = null;         // Stage 3: decimal rule guess

        // Rule Explorer (post-crack)
        this.explorerRule = null;
        this.explorerGrid = [];

        // DOM
        this.container = null;
        this._built = false;
    }

    /**
     * Collect a cipher fragment (called when player finds one via quest/exploration).
     * @param {number} fragmentId - 0-4
     */
    collectFragment(fragmentId) {
        if (fragmentId < 0 || fragmentId >= this.fragments.length) return;
        if (this.collectedFragments.has(fragmentId)) return;

        this.collectedFragments.add(fragmentId);
        this.fragments[fragmentId].discovered = true;

        if (this.collectedFragments.size >= 5) {
            this.state = TERMINAL_STATE.READY;
        } else {
            this.state = TERMINAL_STATE.PARTIAL;
        }

        eventBus.emit('terminal:fragment', {
            id: fragmentId,
            total: this.collectedFragments.size,
            fragment: this.fragments[fragmentId],
        });
    }

    /**
     * Get the number of collected fragments.
     */
    getFragmentCount() {
        return this.collectedFragments.size;
    }

    /**
     * Start the puzzle (requires all 5 fragments).
     */
    startPuzzle() {
        if (this.collectedFragments.size < 5) return false;
        this.state = TERMINAL_STATE.STAGE_1;
        eventBus.emit('terminal:puzzleStart', {});
        return true;
    }

    /**
     * Stage 1: Submit fragment arrangement (ordered by generation).
     * @param {number[]} order - Array of fragment IDs in player's chosen order
     * @returns {boolean} Whether the arrangement is correct
     */
    submitArrangement(order) {
        if (this.state !== TERMINAL_STATE.STAGE_1) return false;

        this.playerArrangement = order;

        // Correct order is by generation (ascending)
        const correctOrder = [...this.fragments]
            .sort((a, b) => a.generation - b.generation)
            .map(f => f.id);

        const isCorrect = order.length === 5 &&
            order.every((id, i) => id === correctOrder[i]);

        if (isCorrect) {
            this.state = TERMINAL_STATE.STAGE_2;
            eventBus.emit('terminal:stage1Complete', {});
        }

        return isCorrect;
    }

    /**
     * Stage 2: Submit neighborhood outputs.
     * Player determines what each 3-cell neighborhood produces.
     * @param {Object} outputs - { "111": 0, "110": 1, ... } for all 8 neighborhoods
     * @returns {boolean}
     */
    submitNeighborhoods(outputs) {
        if (this.state !== TERMINAL_STATE.STAGE_2) return false;

        this.playerNeighborhoods = outputs;

        // Check against actual rule
        let correct = true;
        for (let i = 0; i < NEIGHBORHOODS.length; i++) {
            const [l, c, r] = NEIGHBORHOODS[i];
            const key = `${l}${c}${r}`;
            const neighborhoodValue = (l << 2) | (c << 1) | r;
            const expectedOutput = (this.targetRule >> neighborhoodValue) & 1;

            if (outputs[key] !== expectedOutput) {
                correct = false;
                break;
            }
        }

        if (correct) {
            this.state = TERMINAL_STATE.STAGE_3;
            eventBus.emit('terminal:stage2Complete', {});
        }

        return correct;
    }

    /**
     * Stage 3: Submit the rule number guess.
     * @param {number} ruleGuess - The decimal rule number (0-255)
     * @returns {boolean}
     */
    submitRuleGuess(ruleGuess) {
        if (this.state !== TERMINAL_STATE.STAGE_3) return false;

        this.playerRuleGuess = ruleGuess;
        const correct = ruleGuess === this.targetRule;

        if (correct) {
            this.state = TERMINAL_STATE.CRACKED;
            eventBus.emit('terminal:cracked', { rule: this.targetRule });
        }

        return correct;
    }

    /**
     * Run the Rule Explorer (post-crack feature).
     * @param {number} rule - Any rule 0-255
     * @param {number} [generations=20]
     * @returns {number[][]} The CA grid
     */
    runExplorer(rule, generations = 20) {
        const width = 41; // wide enough for interesting patterns
        const grid = [];

        const row0 = new Array(width).fill(0);
        row0[Math.floor(width / 2)] = 1;
        grid.push(row0);

        for (let g = 1; g < generations; g++) {
            grid.push(applyRule(grid[g - 1], rule));
        }

        this.explorerRule = rule;
        this.explorerGrid = grid;
        return grid;
    }

    /**
     * Build the Terminal UI inside a container element.
     * @param {HTMLElement} parentEl - The cipher tab panel
     */
    buildUI(parentEl) {
        if (this._built) return;
        this.container = parentEl;
        this._built = true;
        this.render();
    }

    /**
     * Render the current terminal state into the container.
     */
    render() {
        if (!this.container) return;

        const count = this.collectedFragments.size;

        switch (this.state) {
            case TERMINAL_STATE.LOCKED:
                this.container.innerHTML = this._renderLocked();
                break;
            case TERMINAL_STATE.PARTIAL:
                this.container.innerHTML = this._renderPartial(count);
                break;
            case TERMINAL_STATE.READY:
                this.container.innerHTML = this._renderReady();
                this._bindReadyEvents();
                break;
            case TERMINAL_STATE.STAGE_1:
                this.container.innerHTML = this._renderStage1();
                this._bindStage1Events();
                break;
            case TERMINAL_STATE.STAGE_2:
                this.container.innerHTML = this._renderStage2();
                this._bindStage2Events();
                break;
            case TERMINAL_STATE.STAGE_3:
                this.container.innerHTML = this._renderStage3();
                this._bindStage3Events();
                break;
            case TERMINAL_STATE.CRACKED:
                this.container.innerHTML = this._renderCracked();
                this._bindExplorerEvents();
                break;
        }
    }

    // ============================================================
    // RENDER METHODS
    // ============================================================

    _renderLocked() {
        return `
            <div class="terminal-locked">
                <div class="terminal-icon">◈</div>
                <div class="terminal-status">ACCESS DENIED</div>
                <div class="terminal-progress">0 / 5 FRAGMENTS</div>
                <div class="terminal-hint">
                    The patterns in the terrain encode messages.<br>
                    Find the <span class="highlight">Mysterious Being</span> to learn how to read them.
                </div>
            </div>
        `;
    }

    _renderPartial(count) {
        const bars = Array.from({ length: 5 }, (_, i) =>
            `<span class="frag-bar ${i < count ? 'filled' : ''}">${i < count ? '█' : '░'}</span>`
        ).join('');

        const collected = [...this.collectedFragments].map(id => {
            const f = this.fragments[id];
            return `<div class="frag-item">
                <span class="frag-label">Fragment ${id + 1}</span>
                <span class="frag-row">[${f.row.join('')}]</span>
                <span class="frag-source">${f.source}</span>
            </div>`;
        }).join('');

        return `
            <div class="terminal-partial">
                <div class="terminal-status">FRAGMENTS: ${count} / 5</div>
                <div class="terminal-bars">${bars}</div>
                <div class="terminal-fragments">${collected}</div>
                <div class="terminal-hint">
                    ${5 - count} more fragment${5 - count > 1 ? 's' : ''} needed to begin decryption.
                </div>
            </div>
        `;
    }

    _renderReady() {
        return `
            <div class="terminal-ready">
                <div class="terminal-status" style="color: #00ff88;">ALL FRAGMENTS COLLECTED</div>
                <div class="terminal-bars">
                    <span class="frag-bar filled">█</span>
                    <span class="frag-bar filled">█</span>
                    <span class="frag-bar filled">█</span>
                    <span class="frag-bar filled">█</span>
                    <span class="frag-bar filled">█</span>
                </div>
                <div class="terminal-hint">
                    The cipher is ready to be decoded.<br>
                    Arrange the fragments to reveal the Rule.
                </div>
                <button class="terminal-btn" id="termStartPuzzle">BEGIN DECRYPTION ▸</button>
            </div>
        `;
    }

    _renderStage1() {
        const frags = this.fragments.map(f => `
            <div class="stage1-frag" draggable="true" data-frag-id="${f.id}">
                <span class="frag-gen">Gen ?</span>
                <span class="frag-row">[${f.row.join('')}]</span>
                <span class="frag-hint">${f.source}</span>
            </div>
        `).join('');

        return `
            <div class="terminal-stage1">
                <div class="stage-header">STAGE 1: RECONSTRUCTION</div>
                <div class="stage-desc">
                    Arrange the fragments by complexity — simplest (earliest generation) first.<br>
                    Look at the patterns: fewer active cells = earlier generation.
                </div>
                <div class="stage1-slots" id="stage1Slots">${frags}</div>
                <button class="terminal-btn" id="stage1Submit">VERIFY ORDER ▸</button>
                <div class="stage-feedback" id="stage1Feedback"></div>
            </div>
        `;
    }

    _renderStage2() {
        const neighborhoodRows = NEIGHBORHOODS.map(([l, c, r], i) => {
            const key = `${l}${c}${r}`;
            return `
                <div class="hood-row">
                    <span class="hood-cells">
                        <span class="cell ${l ? 'on' : 'off'}">${l}</span>
                        <span class="cell ${c ? 'on' : 'off'}">${c}</span>
                        <span class="cell ${r ? 'on' : 'off'}">${r}</span>
                    </span>
                    <span class="hood-arrow">→</span>
                    <button class="hood-toggle" data-hood="${key}" data-value="0">0</button>
                </div>
            `;
        }).join('');

        return `
            <div class="terminal-stage2">
                <div class="stage-header">STAGE 2: THE NEIGHBORHOOD</div>
                <div class="stage-desc">
                    For each 3-cell neighborhood, determine the output.<br>
                    Study the fragments — when you see these patterns, what cell appears below?
                </div>
                <div class="hood-grid">${neighborhoodRows}</div>
                <button class="terminal-btn" id="stage2Submit">VERIFY RULE ▸</button>
                <div class="stage-feedback" id="stage2Feedback"></div>
            </div>
        `;
    }

    _renderStage3() {
        // Show the 8 bits the player determined in stage 2
        const bits = NEIGHBORHOODS.map(([l, c, r]) => {
            const key = `${l}${c}${r}`;
            return this.playerNeighborhoods[key] ?? 0;
        });

        return `
            <div class="terminal-stage3">
                <div class="stage-header">STAGE 3: THE NUMBER</div>
                <div class="stage-desc">
                    Your neighborhood outputs form an 8-bit binary number.<br>
                    Convert it to decimal to reveal the Rule.
                </div>
                <div class="bits-display">
                    ${bits.map((b, i) => `<span class="bit">${b}</span>`).join('')}
                </div>
                <div class="bits-labels">
                    ${NEIGHBORHOODS.map(([l, c, r]) => `<span class="bit-label">${l}${c}${r}</span>`).join('')}
                </div>
                <div class="rule-input-row">
                    <span class="rule-prompt">RULE NUMBER =</span>
                    <input type="number" id="ruleGuessInput" min="0" max="255" placeholder="0-255">
                    <button class="terminal-btn" id="stage3Submit">VERIFY ▸</button>
                </div>
                <div class="stage-feedback" id="stage3Feedback"></div>
            </div>
        `;
    }

    _renderCracked() {
        // Run the target rule for display
        const grid = this.runExplorer(this.targetRule, 16);
        const gridHTML = grid.map(row =>
            `<div class="ca-row">${row.map(c => `<span class="ca-cell ${c ? 'alive' : 'dead'}"></span>`).join('')}</div>`
        ).join('');

        return `
            <div class="terminal-cracked">
                <div class="stage-header" style="color: #00ff88;">◈ TERMINAL CRACKED ◈</div>
                <div class="cracked-reveal">
                    <span class="cracked-label">THE RULE IS</span>
                    <span class="cracked-rule">${this.targetRule}</span>
                </div>
                <div class="cracked-ca-display">${gridHTML}</div>
                <div class="cracked-message">
                    Every world in this galaxy was born from Rule ${this.targetRule}.<br>
                    The terrain, the life, the patterns — all from this single number.
                </div>
                <div class="explorer-section">
                    <div class="stage-header">RULE EXPLORER</div>
                    <div class="explorer-input-row">
                        <span class="rule-prompt">Run Rule:</span>
                        <input type="number" id="explorerRuleInput" min="0" max="255" value="${this.targetRule}">
                        <button class="terminal-btn" id="explorerRunBtn">RUN ▸</button>
                    </div>
                    <div class="explorer-display" id="explorerDisplay"></div>
                </div>
            </div>
        `;
    }

    // ============================================================
    // EVENT BINDING
    // ============================================================

    _bindReadyEvents() {
        const btn = this.container.querySelector('#termStartPuzzle');
        if (btn) btn.addEventListener('click', () => {
            this.startPuzzle();
            this.render();
        });
    }

    _bindStage1Events() {
        // Simple click-to-reorder: clicking a fragment moves it to the end
        const slots = this.container.querySelector('#stage1Slots');
        if (slots) {
            slots.addEventListener('click', (e) => {
                const frag = e.target.closest('.stage1-frag');
                if (frag) {
                    slots.appendChild(frag); // Move to end
                }
            });
        }

        const btn = this.container.querySelector('#stage1Submit');
        const feedback = this.container.querySelector('#stage1Feedback');
        if (btn) btn.addEventListener('click', () => {
            const order = [...this.container.querySelectorAll('.stage1-frag')]
                .map(el => parseInt(el.dataset.fragId));
            const correct = this.submitArrangement(order);
            if (correct) {
                this.render();
            } else if (feedback) {
                feedback.textContent = 'Incorrect order. Study the patterns more carefully.';
                feedback.style.color = '#ff4444';
            }
        });
    }

    _bindStage2Events() {
        // Toggle buttons between 0 and 1
        this.container.querySelectorAll('.hood-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const current = parseInt(btn.dataset.value);
                const next = current === 0 ? 1 : 0;
                btn.dataset.value = next;
                btn.textContent = next;
                btn.classList.toggle('on', next === 1);
            });
        });

        const submitBtn = this.container.querySelector('#stage2Submit');
        const feedback = this.container.querySelector('#stage2Feedback');
        if (submitBtn) submitBtn.addEventListener('click', () => {
            const outputs = {};
            this.container.querySelectorAll('.hood-toggle').forEach(btn => {
                outputs[btn.dataset.hood] = parseInt(btn.dataset.value);
            });
            const correct = this.submitNeighborhoods(outputs);
            if (correct) {
                this.render();
            } else if (feedback) {
                feedback.textContent = 'Some neighborhoods are wrong. Re-examine the fragments.';
                feedback.style.color = '#ff4444';
            }
        });
    }

    _bindStage3Events() {
        const btn = this.container.querySelector('#stage3Submit');
        const feedback = this.container.querySelector('#stage3Feedback');
        const input = this.container.querySelector('#ruleGuessInput');

        if (btn) btn.addEventListener('click', () => {
            const guess = parseInt(input?.value);
            if (isNaN(guess) || guess < 0 || guess > 255) {
                if (feedback) {
                    feedback.textContent = 'Enter a number between 0 and 255.';
                    feedback.style.color = '#ff4444';
                }
                return;
            }
            const correct = this.submitRuleGuess(guess);
            if (correct) {
                this.render();
            } else if (feedback) {
                feedback.textContent = `Rule ${guess} is incorrect. Check your binary conversion.`;
                feedback.style.color = '#ff4444';
            }
        });
    }

    _bindExplorerEvents() {
        const btn = this.container.querySelector('#explorerRunBtn');
        const input = this.container.querySelector('#explorerRuleInput');
        const display = this.container.querySelector('#explorerDisplay');

        if (btn) btn.addEventListener('click', () => {
            const rule = parseInt(input?.value);
            if (isNaN(rule) || rule < 0 || rule > 255) return;

            const grid = this.runExplorer(rule, 20);
            if (display) {
                display.innerHTML = grid.map(row =>
                    `<div class="ca-row">${row.map(c => `<span class="ca-cell ${c ? 'alive' : 'dead'}"></span>`).join('')}</div>`
                ).join('');
            }
        });
    }

    // ============================================================
    // SERIALIZATION
    // ============================================================

    getState() {
        return {
            state: this.state,
            collectedFragments: [...this.collectedFragments],
            playerArrangement: this.playerArrangement,
            playerNeighborhoods: this.playerNeighborhoods,
            playerRuleGuess: this.playerRuleGuess,
        };
    }

    loadState(saved) {
        if (!saved) return;
        this.state = saved.state || TERMINAL_STATE.LOCKED;
        this.collectedFragments = new Set(saved.collectedFragments || []);
        this.playerArrangement = saved.playerArrangement || [];
        this.playerNeighborhoods = saved.playerNeighborhoods || {};
        this.playerRuleGuess = saved.playerRuleGuess ?? null;

        // Mark fragments as discovered
        for (const id of this.collectedFragments) {
            if (this.fragments[id]) this.fragments[id].discovered = true;
        }
    }
}
