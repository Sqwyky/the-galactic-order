/**
 * THE GALACTIC ORDER - Mining HUD
 *
 * On-screen overlay for the Molecular Deconstructor (mining tool).
 * Shows heat level, resource pickups, target integrity, and crosshair state.
 *
 * Performance: Uses DOM elements (not canvas) since we only update
 * a few elements per frame. CSS transitions handle animations.
 *
 * z-index layering:
 *   HUD (planet info)  = 10
 *   MiningHUD           = 12  (same as ShipHUD)
 *   Crosshair           = 15
 *   TabletUI             = 50
 */

// ============================================================
// CONSTANTS
// ============================================================

const MAX_PICKUPS = 5;              // Max simultaneous pickup notifications
const PICKUP_LIFETIME = 1.5;        // Seconds before a pickup fully fades
const PICKUP_RISE_PX = 40;          // Pixels the pickup text floats upward
const HEAT_WARN_THRESHOLD = 0.70;   // 70% heat = yellow warning zone
const STYLE_ID = 'mining-hud-styles';

// ============================================================
// MINING HUD
// ============================================================

export class MiningHUD {
    constructor() {
        /** @type {{ el: HTMLElement, age: number, lifetime: number }[]} */
        this._pickupQueue = [];

        // Cached DOM references (assigned in _buildDOM)
        this._container = null;
        this._heatContainer = null;
        this._heatFill = null;
        this._heatLabel = null;
        this._heatPctText = null;
        this._pickupContainer = null;
        this._integrityContainer = null;
        this._integrityFill = null;
        this._integrityLabel = null;
        this._overheatOverlay = null;

        // Crosshair reference (grabbed from existing DOM)
        this._crosshair = null;
        this._crosshairOriginalColor = null;

        this._buildDOM();
    }

    // ============================================================
    // DOM CONSTRUCTION
    // ============================================================

    _buildDOM() {
        // ----- Inject keyframe styles (once) -----
        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                /* Mining HUD pickup float-up animation */
                @keyframes miningPickupFloat {
                    0% {
                        opacity: 1;
                        transform: translateY(0);
                    }
                    70% {
                        opacity: 1;
                    }
                    100% {
                        opacity: 0;
                        transform: translateY(-${PICKUP_RISE_PX}px);
                    }
                }

                /* Overheat pulse */
                @keyframes miningOverheatPulse {
                    0%, 100% { opacity: 0.9; }
                    50% { opacity: 0.4; }
                }

                /* Heat bar glow when critical */
                @keyframes miningHeatGlow {
                    0%, 100% { box-shadow: 0 0 6px rgba(255,51,51,0.4); }
                    50% { box-shadow: 0 0 14px rgba(255,51,51,0.8); }
                }
            `;
            document.head.appendChild(style);
        }

        // ----- Main container (full-screen overlay) -----
        this._container = document.createElement('div');
        this._container.id = 'mining-hud';
        this._container.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            pointer-events: none;
            z-index: 12;
            font-family: 'Courier New', monospace;
            opacity: 0;
            transition: opacity 0.3s;
        `;

        // ----- Heat Bar (bottom-right) -----
        this._heatContainer = document.createElement('div');
        this._heatContainer.style.cssText = `
            position: absolute;
            bottom: 40px;
            right: 20px;
            width: 8px;
            height: 120px;
            background: rgba(0, 0, 0, 0.6);
            border: 1px solid rgba(0, 255, 136, 0.25);
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            overflow: hidden;
        `;

        this._heatFill = document.createElement('div');
        this._heatFill.style.cssText = `
            width: 100%;
            height: 0%;
            background: #00ff88;
            transition: height 0.1s linear, background-color 0.2s;
        `;
        this._heatContainer.appendChild(this._heatFill);

        // Heat percentage text (to the left of the bar)
        this._heatPctText = document.createElement('div');
        this._heatPctText.style.cssText = `
            position: absolute;
            bottom: 40px;
            right: 34px;
            color: rgba(0, 255, 136, 0.5);
            font-size: 9px;
            letter-spacing: 1px;
            text-align: right;
            transition: color 0.2s;
        `;
        this._heatPctText.textContent = '0%';

        // "HEAT" label below bar
        this._heatLabel = document.createElement('div');
        this._heatLabel.style.cssText = `
            position: absolute;
            bottom: 24px;
            right: 16px;
            color: rgba(0, 255, 136, 0.3);
            font-size: 8px;
            letter-spacing: 2px;
            text-align: center;
        `;
        this._heatLabel.textContent = 'HEAT';

        this._container.appendChild(this._heatContainer);
        this._container.appendChild(this._heatPctText);
        this._container.appendChild(this._heatLabel);

        // ----- Resource Pickup Notifications (bottom-center) -----
        this._pickupContainer = document.createElement('div');
        this._pickupContainer.style.cssText = `
            position: absolute;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column-reverse;
            align-items: center;
            gap: 4px;
        `;
        this._container.appendChild(this._pickupContainer);

        // ----- Target Integrity Bar (below crosshair) -----
        this._integrityContainer = document.createElement('div');
        this._integrityContainer.style.cssText = `
            position: absolute;
            top: calc(50% + 20px);
            left: 50%;
            transform: translateX(-50%);
            width: 60px;
            text-align: center;
            opacity: 0;
            transition: opacity 0.2s;
        `;

        // Element symbol label
        this._integrityLabel = document.createElement('div');
        this._integrityLabel.style.cssText = `
            color: rgba(0, 255, 136, 0.7);
            font-size: 9px;
            letter-spacing: 2px;
            margin-bottom: 3px;
        `;
        this._integrityLabel.textContent = '';

        // Bar background
        const integrityBarBg = document.createElement('div');
        integrityBarBg.style.cssText = `
            width: 100%;
            height: 3px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(0, 255, 136, 0.15);
            overflow: hidden;
        `;

        // Bar fill
        this._integrityFill = document.createElement('div');
        this._integrityFill.style.cssText = `
            width: 100%;
            height: 100%;
            background: #00ff88;
            transition: width 0.1s linear, background-color 0.3s;
        `;
        integrityBarBg.appendChild(this._integrityFill);

        this._integrityContainer.appendChild(this._integrityLabel);
        this._integrityContainer.appendChild(integrityBarBg);
        this._container.appendChild(this._integrityContainer);

        // ----- Overheat Warning Overlay -----
        this._overheatOverlay = document.createElement('div');
        this._overheatOverlay.style.cssText = `
            position: absolute;
            top: 35%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #ff3333;
            font-size: 24px;
            font-weight: bold;
            letter-spacing: 8px;
            text-shadow: 0 0 20px rgba(255, 51, 51, 0.6), 0 0 40px rgba(255, 51, 51, 0.3);
            opacity: 0;
            pointer-events: none;
            animation: none;
        `;
        this._overheatOverlay.textContent = 'OVERHEAT';
        this._container.appendChild(this._overheatOverlay);

        // ----- Attach to DOM -----
        document.body.appendChild(this._container);

        // Grab existing crosshair reference
        this._crosshair = document.getElementById('crosshair');
    }

    // ============================================================
    // VISIBILITY
    // ============================================================

    show() {
        this._container.style.opacity = '1';
    }

    hide() {
        this._container.style.opacity = '0';
        this.hideTargetIntegrity();
        this.hideOverheatWarning();
        this._resetCrosshair();
    }

    // ============================================================
    // HEAT BAR
    // ============================================================

    /**
     * Update the heat bar display.
     * @param {number} heatPct - 0 to 1
     * @param {boolean} isOverheated
     */
    updateHeat(heatPct, isOverheated) {
        const pct = Math.max(0, Math.min(1, heatPct));
        const pctInt = Math.round(pct * 100);

        // Fill height
        this._heatFill.style.height = `${pctInt}%`;

        // Color based on heat level
        let color;
        let textColor;
        if (isOverheated) {
            color = '#ff3333';
            textColor = '#ff3333';
            this._heatContainer.style.animation = 'miningHeatGlow 0.5s ease-in-out infinite';
        } else if (pct > HEAT_WARN_THRESHOLD) {
            color = '#ffcc00';
            textColor = '#ffcc00';
            this._heatContainer.style.animation = 'none';
        } else {
            color = '#00ff88';
            textColor = 'rgba(0, 255, 136, 0.5)';
            this._heatContainer.style.animation = 'none';
        }

        this._heatFill.style.backgroundColor = color;
        this._heatPctText.style.color = textColor;
        this._heatPctText.textContent = `${pctInt}%`;

        // Overheat state
        if (isOverheated) {
            this.showOverheatWarning();
        } else {
            this.hideOverheatWarning();
        }
    }

    // ============================================================
    // RESOURCE PICKUP NOTIFICATIONS
    // ============================================================

    /**
     * Show a resource pickup notification.
     * @param {string} symbol - Element symbol (e.g., "Fe")
     * @param {number} quantity - Amount collected
     * @param {number[]} color - [r,g,b] 0-1 color
     * @param {string|null} bonus - "RARE", "EXOTIC", or null
     */
    showPickup(symbol, quantity, color, bonus) {
        // Enforce max pickup limit — remove oldest if at capacity
        while (this._pickupQueue.length >= MAX_PICKUPS) {
            const oldest = this._pickupQueue.shift();
            if (oldest.el.parentNode) {
                oldest.el.parentNode.removeChild(oldest.el);
            }
        }

        // Convert 0-1 color to CSS rgb
        const r = Math.round((color[0] || 0) * 255);
        const g = Math.round((color[1] || 0) * 255);
        const b = Math.round((color[2] || 0) * 255);
        const cssColor = `rgb(${r}, ${g}, ${b})`;

        // Build pickup element
        const el = document.createElement('div');
        el.style.cssText = `
            color: ${cssColor};
            font-size: 14px;
            font-weight: bold;
            letter-spacing: 2px;
            white-space: nowrap;
            text-shadow: 0 0 8px rgba(${r}, ${g}, ${b}, 0.5);
            animation: miningPickupFloat ${PICKUP_LIFETIME}s ease-out forwards;
            pointer-events: none;
        `;

        // Text content
        let text = `+${quantity} ${symbol}`;
        if (bonus) {
            const star = '\u2605'; // filled star
            text = `${star} ${bonus} ${text}`;
        }
        el.textContent = text;

        this._pickupContainer.appendChild(el);

        // Track for cleanup
        const entry = { el, age: 0, lifetime: PICKUP_LIFETIME };
        this._pickupQueue.push(entry);

        // Auto-remove after animation completes (CSS handles visual)
        // Use a timeout slightly longer than the animation to guarantee cleanup
        const self = this;
        setTimeout(() => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
            const idx = self._pickupQueue.indexOf(entry);
            if (idx !== -1) {
                self._pickupQueue.splice(idx, 1);
            }
        }, (PICKUP_LIFETIME + 0.1) * 1000);
    }

    // ============================================================
    // TARGET INTEGRITY BAR
    // ============================================================

    /**
     * Show/update target integrity bar.
     * @param {number} pct - 0 to 1 (1 = full health)
     * @param {string} elementSymbol - What element this target contains
     */
    showTargetIntegrity(pct, elementSymbol) {
        const clamped = Math.max(0, Math.min(1, pct));

        this._integrityContainer.style.opacity = '1';
        this._integrityFill.style.width = `${Math.round(clamped * 100)}%`;

        // Color: green when healthy, yellow at half, red when low
        let barColor;
        if (clamped > 0.5) {
            barColor = '#00ff88';
        } else if (clamped > 0.25) {
            barColor = '#ffcc00';
        } else {
            barColor = '#ff3333';
        }
        this._integrityFill.style.backgroundColor = barColor;

        // Element label
        if (elementSymbol) {
            this._integrityLabel.textContent = elementSymbol;
        }
    }

    hideTargetIntegrity() {
        this._integrityContainer.style.opacity = '0';
    }

    // ============================================================
    // CROSSHAIR FEEDBACK
    // ============================================================

    /**
     * Tint the crosshair to indicate a mineable target is under aim.
     * Uses the existing #crosshair DOM element's pseudo-element colors
     * by changing the element's CSS custom property (background on ::before/::after).
     *
     * Since pseudo-elements can't be directly styled from JS, we override
     * the crosshair's color by injecting a tiny dynamic style rule.
     */
    setCrosshairMineable() {
        if (!this._crosshair) return;
        this._crosshair.style.setProperty('--ch-color', '#00ff88');
        // Override the pseudo-element color via an inline style on the element.
        // The existing CSS uses `background: #fff` on ::before/::after.
        // We change the element's opacity and add a filter to tint it green.
        this._crosshair.style.filter = 'drop-shadow(0 0 4px rgba(0,255,136,0.6))';
        this._crosshair.style.opacity = '0.9';
        // Also directly color the pseudo-element backgrounds using a style override
        if (!document.getElementById('mining-crosshair-override')) {
            const s = document.createElement('style');
            s.id = 'mining-crosshair-override';
            s.textContent = `
                #crosshair.mining-target::before,
                #crosshair.mining-target::after {
                    background: #00ff88 !important;
                }
            `;
            document.head.appendChild(s);
        }
        this._crosshair.classList.add('mining-target');
    }

    _resetCrosshair() {
        if (!this._crosshair) return;
        this._crosshair.classList.remove('mining-target');
        this._crosshair.style.filter = '';
        this._crosshair.style.opacity = '';
    }

    setCrosshairDefault() {
        this._resetCrosshair();
    }

    // ============================================================
    // OVERHEAT WARNING
    // ============================================================

    /**
     * Show the "OVERHEAT" warning — big red pulsing text center screen.
     */
    showOverheatWarning() {
        this._overheatOverlay.style.opacity = '1';
        this._overheatOverlay.style.animation = 'miningOverheatPulse 0.4s ease-in-out infinite';
    }

    hideOverheatWarning() {
        this._overheatOverlay.style.opacity = '0';
        this._overheatOverlay.style.animation = 'none';
    }

    // ============================================================
    // FRAME UPDATE
    // ============================================================

    /**
     * Update pickup animations (call every frame).
     * CSS animations handle the float/fade, so this method is lightweight.
     * It only needs to track ages for manual cleanup if setTimeout is
     * unreliable, and handle any edge-case overflow.
     *
     * @param {number} dt - delta time in seconds
     */
    update(dt) {
        // Age all active pickups (defensive cleanup alongside setTimeout)
        for (let i = this._pickupQueue.length - 1; i >= 0; i--) {
            const entry = this._pickupQueue[i];
            entry.age += dt;

            // Safety net: remove if somehow stuck past lifetime + buffer
            if (entry.age > entry.lifetime + 0.5) {
                if (entry.el.parentNode) {
                    entry.el.parentNode.removeChild(entry.el);
                }
                this._pickupQueue.splice(i, 1);
            }
        }
    }

    // ============================================================
    // CLEANUP
    // ============================================================

    dispose() {
        // Remove all pickup elements
        for (const entry of this._pickupQueue) {
            if (entry.el.parentNode) {
                entry.el.parentNode.removeChild(entry.el);
            }
        }
        this._pickupQueue.length = 0;

        // Reset crosshair
        this._resetCrosshair();

        // Remove injected style overrides
        const overrideStyle = document.getElementById('mining-crosshair-override');
        if (overrideStyle && overrideStyle.parentNode) {
            overrideStyle.parentNode.removeChild(overrideStyle);
        }

        // Remove the keyframe styles
        const keyframeStyle = document.getElementById(STYLE_ID);
        if (keyframeStyle && keyframeStyle.parentNode) {
            keyframeStyle.parentNode.removeChild(keyframeStyle);
        }

        // Remove container from DOM
        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }

        this._container = null;
        this._heatContainer = null;
        this._heatFill = null;
        this._heatLabel = null;
        this._heatPctText = null;
        this._pickupContainer = null;
        this._integrityContainer = null;
        this._integrityFill = null;
        this._integrityLabel = null;
        this._overheatOverlay = null;
        this._crosshair = null;
    }
}
