/**
 * THE GALACTIC ORDER - Tablet UI
 *
 * The player's in-game tablet computer. Press TAB to toggle.
 * A terminal-style overlay that shows:
 * - Planet scan data (biome, rule, classification)
 * - Discovery log
 * - Cipher fragments (found from CA pattern decoding)
 * - The "Key of Insight" input (Gemini API key — provided by the Mysterious Being quest)
 * - Inventory display (collected elements from mining)
 * - Refinery (CA Rule Annealing — transform raw materials into refined elements)
 *
 * Aesthetic: Green-on-black terminal, CRT scanlines, typing animation.
 * Inspired by the terminals in Fallout / the Analysis Visor in NMS.
 */

import { ELEMENTS, REFINERY_RECIPES } from '../generation/HarmonicElements.js';

// ============================================================
// TABLET UI
// ============================================================

export class TabletUI {
    /**
     * @param {Object} options
     * @param {Function} [options.onKeySubmit] - Called when player submits the "Key of Insight"
     * @param {Object} [options.planetData] - Current planet info
     * @param {import('./InventoryManager.js').InventoryManager} [options.inventory] - Inventory manager
     * @param {number} [options.planetRule] - Current planet's CA rule
     */
    constructor(options = {}) {
        this.isOpen = false;
        this.onKeySubmit = options.onKeySubmit || null;
        this.planetData = options.planetData || {};
        this.inventory = options.inventory || null;
        this.planetRule = options.planetRule || 30;

        // Discovery log entries
        this.discoveries = [];

        // Cipher fragments collected
        this.cipherFragments = [];

        // Whether the Key of Insight has been provided
        this.hasKey = false;
        this.keyValue = '';

        // Typing animation state
        this._typingQueue = [];
        this._isTyping = false;

        // Build DOM
        this._buildDOM();
        this._bindEvents();
    }

    // ============================================================
    // DOM CONSTRUCTION
    // ============================================================

    _buildDOM() {
        // Container
        this.container = document.createElement('div');
        this.container.id = 'tablet-overlay';
        this.container.innerHTML = `
            <div class="tablet-frame">
                <div class="tablet-header">
                    <span class="tablet-title">◈ GALACTIC ORDER TABLET v1.0</span>
                    <span class="tablet-close">[TAB TO CLOSE]</span>
                </div>

                <div class="tablet-tabs">
                    <button class="tab-btn active" data-tab="scan">SCAN</button>
                    <button class="tab-btn" data-tab="inventory">CARGO</button>
                    <button class="tab-btn" data-tab="refinery">REFINE</button>
                    <button class="tab-btn" data-tab="log">LOG</button>
                    <button class="tab-btn" data-tab="cipher">CIPHER</button>
                    <button class="tab-btn" data-tab="key">KEY</button>
                </div>

                <div class="tablet-content">
                    <!-- SCAN TAB -->
                    <div class="tab-panel active" id="tab-scan">
                        <div class="scan-header">PLANETARY SCAN</div>
                        <div class="scan-data" id="scanData">
                            <div class="scan-line"><span class="label">DESIGNATION</span><span class="value" id="scanName">---</span></div>
                            <div class="scan-line"><span class="label">CA RULE</span><span class="value" id="scanRule">---</span></div>
                            <div class="scan-line"><span class="label">WOLFRAM CLASS</span><span class="value" id="scanClass">---</span></div>
                            <div class="scan-line"><span class="label">ARCHETYPE</span><span class="value" id="scanType">---</span></div>
                            <div class="scan-line"><span class="label">ATMOSPHERE</span><span class="value" id="scanAtmos">---</span></div>
                            <div class="scan-line"><span class="label">HAZARD</span><span class="value" id="scanHazard">---</span></div>
                        </div>
                        <div class="scan-divider"></div>
                        <div class="scan-note">
                            > The terrain patterns emerge from Rule <span id="scanRuleNote">?</span>.<br>
                            > Each mountain, each valley — computed from a single number.<br>
                            > The universe is not random. It is <em>deterministic</em>.
                        </div>
                    </div>

                    <!-- INVENTORY TAB -->
                    <div class="tab-panel" id="tab-inventory">
                        <div class="scan-header">MOLECULAR CARGO BAY</div>
                        <div id="inventoryGrid" class="inventory-grid"></div>
                        <div class="inv-empty" id="invEmpty">
                            Cargo bay empty. Mine resources with your Multi-tool.<br>
                            <span class="highlight">Left Click</span> to fire mining beam at rocks and flora.
                        </div>
                    </div>

                    <!-- REFINERY TAB -->
                    <div class="tab-panel" id="tab-refinery">
                        <div class="scan-header">MOLECULAR ANNEALER</div>
                        <div class="refinery-intro">
                            > Rearrange atomic lattices using Cellular Automata rules.<br>
                            > Select a recipe and enter a Rule Number as catalyst.
                        </div>
                        <div id="refineryRecipes" class="refinery-recipes"></div>
                        <div class="refinery-active" id="refineryActive" style="display:none;">
                            <div class="refinery-status" id="refineryStatus"></div>
                            <div class="refinery-bar"><div class="refinery-bar-fill" id="refineryBarFill"></div></div>
                            <div class="refinery-ca-grid" id="refineryCaGrid"></div>
                        </div>
                    </div>

                    <!-- LOG TAB -->
                    <div class="tab-panel" id="tab-log">
                        <div class="scan-header">DISCOVERY LOG</div>
                        <div class="log-entries" id="logEntries">
                            <div class="log-empty">No discoveries yet. Explore the surface.</div>
                        </div>
                    </div>

                    <!-- CIPHER TAB -->
                    <div class="tab-panel" id="tab-cipher">
                        <div class="scan-header">CIPHER FRAGMENTS</div>
                        <div class="cipher-display" id="cipherDisplay">
                            <div class="cipher-empty">
                                No cipher fragments decoded.<br><br>
                                The patterns in the terrain encode messages.<br>
                                Find the <span class="highlight">Mysterious Being</span> to learn how to read them.
                            </div>
                        </div>
                    </div>

                    <!-- KEY TAB -->
                    <div class="tab-panel" id="tab-key">
                        <div class="scan-header">KEY OF INSIGHT</div>
                        <div class="key-section" id="keySection">
                            <div class="key-locked" id="keyLocked">
                                <div class="key-icon">◈</div>
                                <div class="key-message">
                                    The Key of Insight has not been revealed.<br><br>
                                    A <span class="highlight">Mysterious Being</span> dwells on this world.<br>
                                    Find them. They hold the knowledge you seek.
                                </div>
                            </div>
                            <div class="key-unlocked" id="keyUnlocked" style="display:none;">
                                <div class="key-prompt">
                                    The Being spoke of a "Key of Insight" —<br>
                                    a bridge between your mind and the universe's truth.<br><br>
                                    Enter the key to awaken the Architect's voice:
                                </div>
                                <div class="key-input-row">
                                    <input type="password" id="keyInput" placeholder="Enter your Key of Insight..."
                                           autocomplete="off" spellcheck="false">
                                    <button id="keySubmitBtn">SUBMIT</button>
                                </div>
                                <div class="key-status" id="keyStatus"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tablet-footer">
                    <span id="tabletCoords">---</span>
                    <span class="tablet-time" id="tabletTime"></span>
                </div>
            </div>
        `;

        // Inject styles
        const style = document.createElement('style');
        style.textContent = `
            #tablet-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                z-index: 50;
                display: none;
                align-items: center;
                justify-content: center;
                background: rgba(0,0,0,0.85);
                backdrop-filter: blur(8px);
                animation: tabletFadeIn 0.3s ease;
            }
            #tablet-overlay.open { display: flex; }
            @keyframes tabletFadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }

            .tablet-frame {
                width: 700px;
                max-height: 80vh;
                background: rgba(0, 8, 4, 0.95);
                border: 1px solid rgba(0, 255, 136, 0.3);
                font-family: 'Courier New', monospace;
                display: flex;
                flex-direction: column;
                box-shadow: 0 0 40px rgba(0, 255, 136, 0.1), inset 0 0 60px rgba(0,0,0,0.5);
            }

            .tablet-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 16px;
                border-bottom: 1px solid rgba(0,255,136,0.15);
            }
            .tablet-title {
                color: #00ff88;
                font-size: 12px;
                letter-spacing: 3px;
            }
            .tablet-close {
                color: #334;
                font-size: 10px;
                letter-spacing: 1px;
            }

            .tablet-tabs {
                display: flex;
                border-bottom: 1px solid rgba(0,255,136,0.1);
            }
            .tab-btn {
                flex: 1;
                background: transparent;
                border: none;
                color: #445;
                font-family: 'Courier New', monospace;
                font-size: 11px;
                letter-spacing: 2px;
                padding: 10px;
                cursor: pointer;
                transition: all 0.3s;
                border-bottom: 2px solid transparent;
            }
            .tab-btn:hover { color: #00ff88; background: rgba(0,255,136,0.03); }
            .tab-btn.active {
                color: #00ff88;
                border-bottom-color: #00ff88;
                background: rgba(0,255,136,0.05);
            }

            .tablet-content {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                min-height: 300px;
            }

            .tab-panel { display: none; }
            .tab-panel.active { display: block; }

            .scan-header {
                color: #00ff88;
                font-size: 13px;
                letter-spacing: 3px;
                margin-bottom: 16px;
                padding-bottom: 8px;
                border-bottom: 1px solid rgba(0,255,136,0.1);
            }

            .scan-line {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
                padding: 4px 0;
            }
            .scan-line .label {
                color: #556;
                font-size: 11px;
                letter-spacing: 1px;
            }
            .scan-line .value {
                color: #aab;
                font-size: 11px;
            }

            .scan-divider {
                height: 1px;
                background: rgba(0,255,136,0.1);
                margin: 16px 0;
            }

            .scan-note {
                color: #445;
                font-size: 11px;
                line-height: 1.6;
                font-style: italic;
            }
            .scan-note em { color: #00ff88; font-style: normal; }

            .log-entries {
                color: #667;
                font-size: 11px;
                line-height: 1.8;
            }
            .log-empty { color: #334; font-style: italic; }
            .log-entry {
                padding: 8px 0;
                border-bottom: 1px solid rgba(0,255,136,0.05);
            }
            .log-entry .timestamp { color: #334; font-size: 10px; }
            .log-entry .message { color: #889; }
            .log-entry .highlight { color: #00ff88; }

            .cipher-empty {
                color: #334;
                font-size: 11px;
                line-height: 1.8;
                text-align: center;
                padding: 40px 0;
            }
            .highlight { color: #00ff88; }

            .key-section { padding: 20px 0; }
            .key-locked { text-align: center; padding: 30px 0; }
            .key-icon {
                font-size: 48px;
                color: #223;
                margin-bottom: 20px;
                animation: keyPulse 3s infinite;
            }
            @keyframes keyPulse {
                0%, 100% { opacity: 0.3; }
                50% { opacity: 0.6; color: #00ff88; }
            }
            .key-message {
                color: #445;
                font-size: 11px;
                line-height: 1.8;
            }
            .key-unlocked { padding: 20px 0; }
            .key-prompt {
                color: #667;
                font-size: 11px;
                line-height: 1.8;
                margin-bottom: 20px;
            }
            .key-input-row {
                display: flex;
                gap: 8px;
            }
            .key-input-row input {
                flex: 1;
                background: rgba(0,0,0,0.5);
                border: 1px solid rgba(0,255,136,0.2);
                color: #00ff88;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                padding: 8px 12px;
                outline: none;
            }
            .key-input-row input:focus { border-color: rgba(0,255,136,0.5); }
            .key-input-row button {
                background: rgba(0,255,136,0.1);
                border: 1px solid rgba(0,255,136,0.3);
                color: #00ff88;
                font-family: 'Courier New', monospace;
                font-size: 11px;
                letter-spacing: 2px;
                padding: 8px 16px;
                cursor: pointer;
                transition: all 0.3s;
            }
            .key-input-row button:hover {
                background: rgba(0,255,136,0.2);
                border-color: #00ff88;
            }
            .key-status {
                color: #445;
                font-size: 10px;
                margin-top: 12px;
            }

            .tablet-footer {
                display: flex;
                justify-content: space-between;
                padding: 8px 16px;
                border-top: 1px solid rgba(0,255,136,0.1);
                color: #223;
                font-size: 9px;
                letter-spacing: 1px;
            }

            /* Inventory grid */
            .inventory-grid {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 8px;
            }
            .inv-slot {
                background: rgba(0,255,136,0.03);
                border: 1px solid rgba(0,255,136,0.1);
                padding: 10px;
                text-align: center;
                transition: all 0.3s;
            }
            .inv-slot:hover { border-color: rgba(0,255,136,0.3); }
            .inv-slot .inv-icon { font-size: 20px; margin-bottom: 4px; }
            .inv-slot .inv-name { color: #667; font-size: 9px; letter-spacing: 1px; }
            .inv-slot .inv-qty { color: #00ff88; font-size: 14px; margin-top: 4px; }
            .inv-slot .inv-bar { height: 2px; background: #111; margin-top: 6px; }
            .inv-slot .inv-bar-fill { height: 100%; background: #00ff88; transition: width 0.3s; }
            .inv-empty { color: #334; font-size: 11px; text-align: center; padding: 30px 0; line-height: 1.8; }

            /* Refinery */
            .refinery-intro { color: #445; font-size: 11px; line-height: 1.6; margin-bottom: 16px; font-style: italic; }
            .refinery-recipes { display: flex; flex-direction: column; gap: 8px; }
            .refinery-recipe {
                display: flex; justify-content: space-between; align-items: center;
                background: rgba(0,255,136,0.03); border: 1px solid rgba(0,255,136,0.1);
                padding: 10px 12px; cursor: pointer; transition: all 0.3s;
            }
            .refinery-recipe:hover { border-color: rgba(0,255,136,0.3); background: rgba(0,255,136,0.06); }
            .refinery-recipe.disabled { opacity: 0.4; cursor: default; }
            .refinery-recipe .recipe-name { color: #889; font-size: 11px; letter-spacing: 1px; }
            .refinery-recipe .recipe-io { color: #556; font-size: 10px; margin-top: 4px; }
            .refinery-recipe .recipe-cost { color: #445; font-size: 9px; }
            .refinery-recipe .recipe-btn {
                background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.3);
                color: #00ff88; font-family: 'Courier New', monospace; font-size: 10px;
                padding: 4px 12px; cursor: pointer; letter-spacing: 1px;
            }
            .refinery-recipe .recipe-btn:hover { background: rgba(0,255,136,0.2); }
            .refinery-recipe .recipe-btn:disabled { opacity: 0.3; cursor: default; }
            .refinery-rule-input {
                display: flex; gap: 6px; align-items: center; margin-top: 8px;
            }
            .refinery-rule-input label { color: #556; font-size: 10px; }
            .refinery-rule-input input {
                width: 60px; background: rgba(0,0,0,0.5); border: 1px solid rgba(0,255,136,0.2);
                color: #00ff88; font-family: 'Courier New', monospace; font-size: 12px;
                padding: 4px 8px; text-align: center; outline: none;
            }
            .refinery-rule-input input:focus { border-color: rgba(0,255,136,0.5); }
            .refinery-active { margin-top: 16px; padding: 12px; background: rgba(0,255,136,0.03); border: 1px solid rgba(0,255,136,0.15); }
            .refinery-status { color: #889; font-size: 11px; margin-bottom: 8px; }
            .refinery-bar { height: 4px; background: #111; margin: 8px 0; }
            .refinery-bar-fill { height: 100%; background: #00ff88; width: 0%; transition: width 0.2s; }
            .refinery-ca-grid {
                display: grid; grid-template-columns: repeat(16, 1fr); gap: 1px;
                margin-top: 8px; opacity: 0.6;
            }
            .refinery-ca-cell { width: 100%; aspect-ratio: 1; background: #111; }
            .refinery-ca-cell.on { background: #00ff88; }

            /* CRT effect */
            .tablet-frame::before {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                pointer-events: none;
                background: repeating-linear-gradient(
                    0deg,
                    transparent,
                    transparent 2px,
                    rgba(0,255,136,0.008) 2px,
                    rgba(0,255,136,0.008) 4px
                );
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(this.container);
    }

    // ============================================================
    // EVENT BINDING
    // ============================================================

    _bindEvents() {
        // Tab switching
        this.container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                this.container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                const tabId = `tab-${btn.dataset.tab}`;
                const panel = this.container.querySelector(`#${tabId}`);
                if (panel) panel.classList.add('active');
            });
        });

        // Key submit
        const submitBtn = this.container.querySelector('#keySubmitBtn');
        const keyInput = this.container.querySelector('#keyInput');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this._submitKey());
        }
        if (keyInput) {
            keyInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._submitKey();
                e.stopPropagation(); // Don't let WASD move player while typing
            });
            keyInput.addEventListener('keyup', (e) => e.stopPropagation());
        }

        // TAB key toggle (bound externally via toggle())
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    toggle() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.container.classList.add('open');
            this._updateTime();
            this.updateInventory();
            this.updateRefinery();
        } else {
            this.container.classList.remove('open');
        }
        return this.isOpen;
    }

    open() {
        this.isOpen = true;
        this.container.classList.add('open');
        this._updateTime();
    }

    close() {
        this.isOpen = false;
        this.container.classList.remove('open');
    }

    /**
     * Update planet scan data.
     */
    setPlanetData(data) {
        this.planetData = data;
        const $ = (id) => this.container.querySelector(`#${id}`);
        if ($('scanName')) $('scanName').textContent = data.name || '---';
        if ($('scanRule')) $('scanRule').textContent = `Rule ${data.rule || '?'}`;
        if ($('scanClass')) $('scanClass').textContent = `Class ${data.ruleClass || '?'} (${data.ruleLabel || '?'})`;
        if ($('scanType')) $('scanType').textContent = data.archetype || '---';
        if ($('scanAtmos')) $('scanAtmos').textContent = data.atmosphere || 'Present';
        if ($('scanHazard')) $('scanHazard').textContent = data.hazard || 'Low';
        if ($('scanRuleNote')) $('scanRuleNote').textContent = data.rule || '?';
    }

    /**
     * Add a discovery to the log.
     */
    addDiscovery(message, type = 'info') {
        this.discoveries.push({ message, type, time: Date.now() });
        this._renderLog();
    }

    /**
     * Unlock the Key input (called after meeting the Mysterious Being).
     */
    unlockKeyInput() {
        const locked = this.container.querySelector('#keyLocked');
        const unlocked = this.container.querySelector('#keyUnlocked');
        if (locked) locked.style.display = 'none';
        if (unlocked) unlocked.style.display = 'block';
    }

    /**
     * Update coordinates display.
     */
    setCoordinates(x, y, z) {
        const el = this.container.querySelector('#tabletCoords');
        if (el) el.textContent = `POS: ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`;
    }

    // ============================================================
    // PRIVATE METHODS
    // ============================================================

    _submitKey() {
        const input = this.container.querySelector('#keyInput');
        const status = this.container.querySelector('#keyStatus');
        if (!input || !input.value.trim()) return;

        this.keyValue = input.value.trim();
        this.hasKey = true;

        if (status) {
            status.textContent = '> Key accepted. The Architect stirs...';
            status.style.color = '#00ff88';
        }

        if (this.onKeySubmit) {
            this.onKeySubmit(this.keyValue);
        }
    }

    _renderLog() {
        const el = this.container.querySelector('#logEntries');
        if (!el) return;

        if (this.discoveries.length === 0) {
            el.innerHTML = '<div class="log-empty">No discoveries yet. Explore the surface.</div>';
            return;
        }

        el.innerHTML = this.discoveries.map(d => {
            const time = new Date(d.time).toLocaleTimeString();
            return `<div class="log-entry">
                <span class="timestamp">[${time}]</span>
                <span class="message ${d.type === 'encounter' ? 'highlight' : ''}">${d.message}</span>
            </div>`;
        }).join('');

        el.scrollTop = el.scrollHeight;
    }

    _updateTime() {
        const el = this.container.querySelector('#tabletTime');
        if (el) el.textContent = new Date().toLocaleTimeString();
    }

    /**
     * Set the inventory manager reference.
     */
    setInventory(inventory) {
        this.inventory = inventory;
    }

    /**
     * Refresh the inventory display.
     */
    updateInventory() {
        if (!this.inventory) return;
        const grid = this.container.querySelector('#inventoryGrid');
        const empty = this.container.querySelector('#invEmpty');
        if (!grid) return;

        const items = this.inventory.getAll();
        if (items.length === 0) {
            grid.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';

        grid.innerHTML = items.map(item => {
            const pct = Math.round((item.quantity / item.element.maxStack) * 100);
            const c = item.element.color;
            const colorHex = `rgb(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)})`;
            return `<div class="inv-slot">
                <div class="inv-icon" style="color:${colorHex}">${item.element.icon}</div>
                <div class="inv-name">${item.element.symbol}</div>
                <div class="inv-qty">${item.quantity}</div>
                <div class="inv-bar"><div class="inv-bar-fill" style="width:${pct}%; background:${colorHex}"></div></div>
            </div>`;
        }).join('');
    }

    /**
     * Refresh the refinery recipes display.
     */
    updateRefinery() {
        if (!this.inventory) return;
        const container = this.container.querySelector('#refineryRecipes');
        const activePanel = this.container.querySelector('#refineryActive');
        if (!container) return;

        // If refinery is active, show progress
        const refState = this.inventory.refining;
        if (refState) {
            container.style.display = 'none';
            if (activePanel) {
                activePanel.style.display = 'block';
                const status = this.container.querySelector('#refineryStatus');
                const barFill = this.container.querySelector('#refineryBarFill');
                if (status) {
                    const recipe = refState.recipe;
                    const outEl = ELEMENTS[recipe.output.element];
                    status.textContent = `> Annealing: ${recipe.name} (Rule ${refState.chosenRule}) — ${refState.efficiency.label}`;
                }
                if (barFill) barFill.style.width = `${Math.round(refState.progress * 100)}%`;
                this._updateRefineryCaGrid(refState.chosenRule, refState.progress);
            }
            return;
        }

        // Show recipes
        container.style.display = 'flex';
        if (activePanel) activePanel.style.display = 'none';

        const available = this.inventory.getAvailableRecipes();
        container.innerHTML = available.map(({ recipe, canStart, reason }) => {
            const inEl = ELEMENTS[recipe.input.element];
            const outEl = ELEMENTS[recipe.output.element];
            const secondIn = recipe.secondInput ? ELEMENTS[recipe.secondInput.element] : null;

            const ioText = secondIn
                ? `${recipe.input.quantity}${inEl.symbol} + ${recipe.secondInput.quantity}${secondIn.symbol} → ${recipe.output.quantity}${outEl.symbol}`
                : `${recipe.input.quantity}${inEl.symbol} → ${recipe.output.quantity}${outEl.symbol}`;

            return `<div class="refinery-recipe ${canStart ? '' : 'disabled'}" data-recipe="${recipe.id}">
                <div>
                    <div class="recipe-name">${recipe.name}</div>
                    <div class="recipe-io">${ioText}</div>
                    <div class="recipe-cost">${canStart ? `Optimal: Rule ${recipe.optimalRule}` : reason}</div>
                    ${canStart ? `<div class="refinery-rule-input">
                        <label>RULE:</label>
                        <input type="number" min="0" max="255" value="${recipe.optimalRule}" class="rule-input" data-recipe="${recipe.id}">
                        <button class="recipe-btn" data-recipe="${recipe.id}">ANNEAL</button>
                    </div>` : ''}
                </div>
            </div>`;
        }).join('');

        // Bind recipe buttons
        container.querySelectorAll('.recipe-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const recipeId = btn.dataset.recipe;
                const ruleInput = container.querySelector(`.rule-input[data-recipe="${recipeId}"]`);
                const rule = ruleInput ? parseInt(ruleInput.value) || this.planetRule : this.planetRule;
                const result = this.inventory.startRefining(recipeId, Math.max(0, Math.min(255, rule)));
                if (result.success) {
                    this.updateRefinery();
                }
            });
        });

        // Stop propagation on rule inputs
        container.querySelectorAll('.rule-input').forEach(input => {
            input.addEventListener('keydown', (e) => e.stopPropagation());
            input.addEventListener('keyup', (e) => e.stopPropagation());
        });
    }

    /**
     * Animate the CA grid in the refinery (shows the annealing process).
     */
    _updateRefineryCaGrid(ruleNumber, progress) {
        const grid = this.container.querySelector('#refineryCaGrid');
        if (!grid) return;

        const width = 16;
        const step = Math.floor(progress * 8);

        // Generate a simple CA row based on the rule
        if (grid.children.length !== width) {
            grid.innerHTML = '';
            for (let i = 0; i < width; i++) {
                const cell = document.createElement('div');
                cell.className = 'refinery-ca-cell';
                grid.appendChild(cell);
            }
        }

        // Apply CA rule visually
        for (let i = 0; i < width; i++) {
            const cell = grid.children[i];
            const left = i > 0 ? (grid.children[i-1].classList.contains('on') ? 1 : 0) : 0;
            const center = cell.classList.contains('on') ? 1 : 0;
            const right = i < width-1 ? (grid.children[i+1].classList.contains('on') ? 1 : 0) : 0;
            const pattern = (left << 2) | (center << 1) | right;
            const newState = (ruleNumber >> pattern) & 1;

            // Animate: toggle based on progress + position
            const shouldBeOn = (step + i) % 3 === 0 ? newState : (Math.random() < progress ? 1 : 0);
            cell.classList.toggle('on', shouldBeOn === 1);
        }
    }

    dispose() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
