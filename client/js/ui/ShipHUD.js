/**
 * THE GALACTIC ORDER - Ship Flight HUD
 *
 * In-flight heads-up display showing:
 * - Speed + altitude (bottom center)
 * - Weapon mode + cooldown (top right)
 * - Boost indicator (bottom bar)
 * - Ship crosshair (center)
 * - Scan/Hyperspace indicators
 *
 * All CSS/DOM-based, matching the existing green monospace HUD style.
 */

export class ShipHUD {
    constructor() {
        this.container = this._createContainer();
        this.visible = false;

        // Elements
        this.speedEl = null;
        this.altEl = null;
        this.weaponEl = null;
        this.boostBar = null;
        this.crosshair = null;
        this.promptEl = null;

        this._build();
        document.body.appendChild(this.container);
    }

    _createContainer() {
        const el = document.createElement('div');
        el.id = 'ship-hud';
        el.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            pointer-events: none;
            z-index: 12;
            font-family: 'Courier New', monospace;
            opacity: 0;
            transition: opacity 0.5s;
        `;
        return el;
    }

    _build() {
        this.container.innerHTML = `
            <!-- Ship Crosshair -->
            <div id="ship-crosshair" style="
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%);
                width: 40px; height: 40px;
            ">
                <svg viewBox="0 0 40 40" width="40" height="40" style="opacity: 0.6;">
                    <!-- Angular crosshair corners -->
                    <path d="M5 2 L20 2 L20 5" fill="none" stroke="#00ff88" stroke-width="1"/>
                    <path d="M35 2 L20 2 L20 5" fill="none" stroke="#00ff88" stroke-width="1" transform="scale(-1,1) translate(-40,0)"/>
                    <path d="M5 38 L20 38 L20 35" fill="none" stroke="#00ff88" stroke-width="1"/>
                    <path d="M35 38 L20 38 L20 35" fill="none" stroke="#00ff88" stroke-width="1" transform="scale(-1,1) translate(-40,0)"/>
                    <!-- Center dot -->
                    <circle cx="20" cy="20" r="1.5" fill="#00ff88" opacity="0.8"/>
                </svg>
            </div>

            <!-- Speed + Altitude (bottom center) -->
            <div style="
                position: absolute;
                bottom: 40px;
                left: 50%;
                transform: translateX(-50%);
                text-align: center;
            ">
                <div id="ship-speed" style="
                    color: #00ff88;
                    font-size: 28px;
                    letter-spacing: 3px;
                ">0 m/s</div>
                <div id="ship-alt" style="
                    color: #337755;
                    font-size: 12px;
                    letter-spacing: 2px;
                    margin-top: 2px;
                ">ALT 0m</div>
                <!-- Boost bar -->
                <div style="width: 200px; height: 3px; background: #111; margin: 8px auto 0; border: 1px solid #223;">
                    <div id="ship-boost-bar" style="
                        width: 0%;
                        height: 100%;
                        background: linear-gradient(90deg, #00ff88, #33ffcc);
                        transition: width 0.1s;
                    "></div>
                </div>
                <div id="ship-boost-label" style="
                    color: #224;
                    font-size: 9px;
                    letter-spacing: 2px;
                    margin-top: 2px;
                ">BOOST</div>
            </div>

            <!-- Weapon indicator (top right) -->
            <div id="ship-weapon" style="
                position: absolute;
                top: 60px;
                right: 20px;
                text-align: right;
            ">
                <div id="ship-weapon-name" style="
                    color: #00ffcc;
                    font-size: 14px;
                    letter-spacing: 3px;
                ">LASER</div>
                <div id="ship-weapon-cooldown" style="
                    width: 80px;
                    height: 2px;
                    background: #111;
                    margin-top: 4px;
                    margin-left: auto;
                ">
                    <div id="ship-weapon-cd-fill" style="
                        width: 100%;
                        height: 100%;
                        background: #00ffcc;
                    "></div>
                </div>
                <div style="color: #334; font-size: 9px; margin-top: 2px; letter-spacing: 1px;">
                    [G] SWITCH
                </div>
            </div>

            <!-- Flight info (top left) -->
            <div style="
                position: absolute;
                top: 60px;
                left: 20px;
            ">
                <div id="ship-phase" style="
                    color: #00ff88;
                    font-size: 12px;
                    letter-spacing: 3px;
                ">FLIGHT MODE</div>
                <div id="ship-coords" style="
                    color: #334;
                    font-size: 10px;
                    letter-spacing: 1px;
                    margin-top: 4px;
                "></div>
            </div>

            <!-- Controls reminder (bottom right) -->
            <div style="
                position: absolute;
                bottom: 40px;
                right: 20px;
                text-align: right;
                color: #223;
                font-size: 9px;
                letter-spacing: 1px;
                line-height: 1.8;
            ">
                [E] EXIT SHIP<br>
                [C] SCAN<br>
                [SPACE] HYPERSPACE<br>
                [ALT] FREE LOOK
            </div>

            <!-- Enter ship prompt (shown when near ship while walking) -->
            <div id="ship-enter-prompt" style="
                position: absolute;
                bottom: 180px;
                left: 50%;
                transform: translateX(-50%);
                color: #00ff88;
                font-size: 13px;
                letter-spacing: 3px;
                text-align: center;
                opacity: 0;
                transition: opacity 0.3s;
                text-shadow: 0 0 10px rgba(0,255,136,0.3);
            ">
                PRESS <span style="border: 1px solid rgba(0,255,136,0.4); padding: 2px 8px;">E</span> TO BOARD SHIP
            </div>
        `;

        this.speedEl = this.container.querySelector('#ship-speed');
        this.altEl = this.container.querySelector('#ship-alt');
        this.weaponNameEl = this.container.querySelector('#ship-weapon-name');
        this.weaponCdFill = this.container.querySelector('#ship-weapon-cd-fill');
        this.boostBar = this.container.querySelector('#ship-boost-bar');
        this.boostLabel = this.container.querySelector('#ship-boost-label');
        this.coordsEl = this.container.querySelector('#ship-coords');
        this.promptEl = this.container.querySelector('#ship-enter-prompt');
    }

    show() {
        this.visible = true;
        this.container.style.opacity = '1';
    }

    hide() {
        this.visible = false;
        this.container.style.opacity = '0';
    }

    showEnterPrompt() {
        if (this.promptEl) this.promptEl.style.opacity = '1';
    }

    hideEnterPrompt() {
        if (this.promptEl) this.promptEl.style.opacity = '0';
    }

    /**
     * Update HUD with current flight data.
     */
    update(flightInfo, weaponInfo) {
        if (!this.visible) return;

        // Speed
        this.speedEl.textContent = `${flightInfo.speed} m/s`;

        // Speed color: green → yellow → red
        if (flightInfo.speed > 150) {
            this.speedEl.style.color = '#ff6644';
        } else if (flightInfo.speed > 80) {
            this.speedEl.style.color = '#ffcc44';
        } else {
            this.speedEl.style.color = '#00ff88';
        }

        // Altitude
        this.altEl.textContent = `ALT ${flightInfo.altitude}m`;

        // Boost bar
        if (flightInfo.isBoosting) {
            this.boostBar.style.width = `${Math.min(100, flightInfo.thrust * 100)}%`;
            this.boostLabel.style.color = '#00ff88';
        } else {
            this.boostBar.style.width = '0%';
            this.boostLabel.style.color = '#224';
        }

        // Coordinates
        this.coordsEl.textContent = `X:${flightInfo.x} Z:${flightInfo.z}`;

        // Weapon
        if (weaponInfo) {
            this.weaponNameEl.textContent = weaponInfo.weapon;
            this.weaponNameEl.style.color = weaponInfo.weapon === 'LASER' ? '#00ffcc' : '#ff6633';
            const cdPct = (1 - weaponInfo.cooldownPct) * 100;
            this.weaponCdFill.style.width = `${cdPct}%`;
            this.weaponCdFill.style.background = weaponInfo.weapon === 'LASER' ? '#00ffcc' : '#ff6633';
        }
    }

    dispose() {
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
