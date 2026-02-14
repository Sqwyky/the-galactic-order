/**
 * THE GALACTIC ORDER - Tablet UI
 *
 * The player's in-game tablet computer. Press TAB to toggle.
 * A terminal-style overlay that shows:
 * - Planet scan data (biome, rule, classification)
 * - Discovery log
 * - Cipher fragments (found from CA pattern decoding)
 * - The "Key of Insight" input (Gemini API key — provided by the Mysterious Being quest)
 *
 * Aesthetic: Green-on-black terminal, CRT scanlines, typing animation.
 * Inspired by the terminals in Fallout / the Analysis Visor in NMS.
 */

// ============================================================
// TABLET UI
// ============================================================

export class TabletUI {
    /**
     * @param {Object} options
     * @param {Function} [options.onKeySubmit] - Called when player submits the "Key of Insight"
     * @param {Object} [options.planetData] - Current planet info
     */
    constructor(options = {}) {
        this.isOpen = false;
        this.onKeySubmit = options.onKeySubmit || null;
        this.planetData = options.planetData || {};

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

    dispose() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
