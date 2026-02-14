/**
 * THE GALACTIC ORDER - Touch Controls for Mobile
 *
 * Twin virtual joystick system for playing on phones/tablets.
 * Designed to work with both WalkingController and FlightController.
 *
 * Layout:
 *   LEFT JOYSTICK  — Movement (walk: WASD, flight: thrust/strafe)
 *   RIGHT JOYSTICK — Look / Steer (walk: mouse look, flight: pitch/yaw)
 *   BOOST BUTTON   — Sprint (walk) / Afterburner (flight)
 *   ACTION BUTTON  — Jump (walk) / Land (flight)
 *   VERTICAL BTNS  — Up/Down thrust (flight only)
 *
 * The joysticks are CSS-only (no images needed) and use touch events.
 * All values are normalized to [-1, 1] for controller input.
 *
 * Pioneer's thruster model works naturally with analog joystick input —
 * partial stick = partial thrust, giving fine control on mobile.
 */

// ============================================================
// TOUCH CONTROLS
// ============================================================

export class TouchControls {
    /**
     * @param {HTMLElement} container - Parent element to inject controls into
     * @param {string} mode - 'walking' or 'flight'
     */
    constructor(container, mode = 'walking') {
        this.container = container;
        this.mode = mode;
        this.enabled = false;

        // Output values (read by controllers)
        this.leftStick = { x: 0, y: 0 };   // Movement: x = strafe, y = forward
        this.rightStick = { x: 0, y: 0 };   // Look: x = yaw, y = pitch
        this.boost = false;
        this.action = false;                 // Jump / Land
        this.verticalUp = false;
        this.verticalDown = false;

        // Internal tracking
        this._leftTouch = null;
        this._rightTouch = null;
        this._leftOrigin = { x: 0, y: 0 };
        this._rightOrigin = { x: 0, y: 0 };

        // DOM elements
        this._overlay = null;
        this._leftBase = null;
        this._leftKnob = null;
        this._rightBase = null;
        this._rightKnob = null;

        // Config
        this.joystickRadius = 50;   // px — maximum knob travel
        this.deadzone = 0.15;       // Inner deadzone (prevents drift)

        // Detect touch device
        this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

        // Bind handlers
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);
    }

    /**
     * Enable touch controls. Creates the overlay UI.
     * Only activates on touch-capable devices.
     */
    enable() {
        if (!this.isTouchDevice) return;
        if (this.enabled) return;
        this.enabled = true;

        this._createOverlay();

        // Touch events on the overlay
        this._overlay.addEventListener('touchstart', this._onTouchStart, { passive: false });
        this._overlay.addEventListener('touchmove', this._onTouchMove, { passive: false });
        this._overlay.addEventListener('touchend', this._onTouchEnd, { passive: false });
        this._overlay.addEventListener('touchcancel', this._onTouchEnd, { passive: false });
    }

    /**
     * Disable and remove touch controls.
     */
    disable() {
        if (!this.enabled) return;
        this.enabled = false;

        if (this._overlay) {
            this._overlay.removeEventListener('touchstart', this._onTouchStart);
            this._overlay.removeEventListener('touchmove', this._onTouchMove);
            this._overlay.removeEventListener('touchend', this._onTouchEnd);
            this._overlay.removeEventListener('touchcancel', this._onTouchEnd);
            this._overlay.remove();
            this._overlay = null;
        }

        this._resetSticks();
    }

    /**
     * Switch between walking and flight mode.
     * Flight mode shows vertical thrust buttons.
     */
    setMode(mode) {
        this.mode = mode;
        if (this._overlay) {
            const vertBtns = this._overlay.querySelector('.tgo-vertical-btns');
            if (vertBtns) {
                vertBtns.style.display = mode === 'flight' ? 'flex' : 'none';
            }
        }
    }

    /**
     * Get current input state for WalkingController.
     */
    getWalkingInput() {
        return {
            moveX: this._applyDeadzone(this.leftStick.x),
            moveZ: this._applyDeadzone(-this.leftStick.y), // Inverted: stick up = forward
            lookYaw: this.rightStick.x * 3.0,   // Scale for sensitivity
            lookPitch: this.rightStick.y * 2.0,
            sprint: this.boost,
            jump: this.action,
        };
    }

    /**
     * Get current input state for FlightController.
     */
    getFlightInput() {
        return {
            x: this._applyDeadzone(this.leftStick.x),       // Strafe L/R
            z: this._applyDeadzone(-this.leftStick.y),       // Main/Retro
            yaw: this._applyDeadzone(this.rightStick.x),     // Yaw
            pitch: this._applyDeadzone(this.rightStick.y),   // Pitch
            boost: this.boost,
            vertical: this.verticalUp ? 1 : (this.verticalDown ? -1 : 0),
        };
    }

    // ============================================================
    // OVERLAY CREATION
    // ============================================================

    _createOverlay() {
        this._overlay = document.createElement('div');
        this._overlay.className = 'tgo-touch-overlay';
        this._overlay.innerHTML = `
            <style>
                .tgo-touch-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    z-index: 1000;
                    pointer-events: auto;
                    touch-action: none;
                    user-select: none;
                    -webkit-user-select: none;
                }

                .tgo-joystick-base {
                    position: absolute;
                    width: 120px; height: 120px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.08);
                    border: 2px solid rgba(255,255,255,0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .tgo-joystick-knob {
                    width: 50px; height: 50px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.25);
                    border: 2px solid rgba(255,255,255,0.4);
                    transition: background 0.1s;
                }
                .tgo-joystick-knob.active {
                    background: rgba(100, 200, 255, 0.4);
                    border-color: rgba(100, 200, 255, 0.6);
                }

                .tgo-left-stick {
                    bottom: 30px;
                    left: 30px;
                }
                .tgo-right-stick {
                    bottom: 30px;
                    right: 30px;
                }

                .tgo-btn {
                    position: absolute;
                    width: 60px; height: 60px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.08);
                    border: 2px solid rgba(255,255,255,0.2);
                    color: rgba(255,255,255,0.5);
                    font-size: 11px;
                    font-family: monospace;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    text-transform: uppercase;
                }
                .tgo-btn.active {
                    background: rgba(100, 200, 255, 0.3);
                    border-color: rgba(100, 200, 255, 0.5);
                    color: rgba(255,255,255,0.8);
                }

                .tgo-boost-btn {
                    bottom: 170px;
                    left: 50px;
                }
                .tgo-action-btn {
                    bottom: 170px;
                    right: 50px;
                }

                .tgo-vertical-btns {
                    position: absolute;
                    right: 160px;
                    bottom: 60px;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .tgo-vertical-btns .tgo-btn {
                    position: static;
                    width: 50px; height: 50px;
                }
            </style>

            <!-- Left Joystick (Movement) -->
            <div class="tgo-joystick-base tgo-left-stick" data-stick="left">
                <div class="tgo-joystick-knob" data-knob="left"></div>
            </div>

            <!-- Right Joystick (Look/Steer) -->
            <div class="tgo-joystick-base tgo-right-stick" data-stick="right">
                <div class="tgo-joystick-knob" data-knob="right"></div>
            </div>

            <!-- Boost Button -->
            <div class="tgo-btn tgo-boost-btn" data-btn="boost">BOOST</div>

            <!-- Action Button -->
            <div class="tgo-btn tgo-action-btn" data-btn="action">JUMP</div>

            <!-- Vertical Thrust (flight only) -->
            <div class="tgo-vertical-btns" style="display: ${this.mode === 'flight' ? 'flex' : 'none'}">
                <div class="tgo-btn" data-btn="vup">UP</div>
                <div class="tgo-btn" data-btn="vdown">DN</div>
            </div>
        `;

        this.container.appendChild(this._overlay);

        // Cache DOM references
        this._leftBase = this._overlay.querySelector('[data-stick="left"]');
        this._leftKnob = this._overlay.querySelector('[data-knob="left"]');
        this._rightBase = this._overlay.querySelector('[data-stick="right"]');
        this._rightKnob = this._overlay.querySelector('[data-knob="right"]');
    }

    // ============================================================
    // TOUCH HANDLERS
    // ============================================================

    _onTouchStart(e) {
        e.preventDefault();

        for (const touch of e.changedTouches) {
            const x = touch.clientX;
            const y = touch.clientY;
            const screenW = window.innerWidth;
            const target = document.elementFromPoint(x, y);

            // Check buttons first
            if (target && target.dataset.btn === 'boost') {
                this.boost = true;
                target.classList.add('active');
                continue;
            }
            if (target && target.dataset.btn === 'action') {
                this.action = true;
                target.classList.add('active');
                continue;
            }
            if (target && target.dataset.btn === 'vup') {
                this.verticalUp = true;
                target.classList.add('active');
                continue;
            }
            if (target && target.dataset.btn === 'vdown') {
                this.verticalDown = true;
                target.classList.add('active');
                continue;
            }

            // Left half = left joystick, Right half = right joystick
            if (x < screenW / 2 && !this._leftTouch) {
                this._leftTouch = touch.identifier;
                const rect = this._leftBase.getBoundingClientRect();
                this._leftOrigin.x = rect.left + rect.width / 2;
                this._leftOrigin.y = rect.top + rect.height / 2;
                this._leftKnob.classList.add('active');
            } else if (x >= screenW / 2 && !this._rightTouch) {
                this._rightTouch = touch.identifier;
                const rect = this._rightBase.getBoundingClientRect();
                this._rightOrigin.x = rect.left + rect.width / 2;
                this._rightOrigin.y = rect.top + rect.height / 2;
                this._rightKnob.classList.add('active');
            }
        }
    }

    _onTouchMove(e) {
        e.preventDefault();

        for (const touch of e.changedTouches) {
            if (touch.identifier === this._leftTouch) {
                const dx = touch.clientX - this._leftOrigin.x;
                const dy = touch.clientY - this._leftOrigin.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const clamped = Math.min(dist, this.joystickRadius);
                const angle = Math.atan2(dy, dx);

                this.leftStick.x = (clamped / this.joystickRadius) * Math.cos(angle);
                this.leftStick.y = (clamped / this.joystickRadius) * Math.sin(angle);

                // Move knob visually
                const knobX = Math.cos(angle) * clamped;
                const knobY = Math.sin(angle) * clamped;
                this._leftKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
            }

            if (touch.identifier === this._rightTouch) {
                const dx = touch.clientX - this._rightOrigin.x;
                const dy = touch.clientY - this._rightOrigin.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const clamped = Math.min(dist, this.joystickRadius);
                const angle = Math.atan2(dy, dx);

                this.rightStick.x = (clamped / this.joystickRadius) * Math.cos(angle);
                this.rightStick.y = (clamped / this.joystickRadius) * Math.sin(angle);

                const knobX = Math.cos(angle) * clamped;
                const knobY = Math.sin(angle) * clamped;
                this._rightKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
            }
        }
    }

    _onTouchEnd(e) {
        for (const touch of e.changedTouches) {
            const target = document.elementFromPoint(touch.clientX, touch.clientY);

            if (touch.identifier === this._leftTouch) {
                this._leftTouch = null;
                this.leftStick.x = 0;
                this.leftStick.y = 0;
                this._leftKnob.style.transform = 'translate(0px, 0px)';
                this._leftKnob.classList.remove('active');
            }
            if (touch.identifier === this._rightTouch) {
                this._rightTouch = null;
                this.rightStick.x = 0;
                this.rightStick.y = 0;
                this._rightKnob.style.transform = 'translate(0px, 0px)';
                this._rightKnob.classList.remove('active');
            }
        }

        // Check if buttons were released
        // Re-check all active touches to see if buttons are still held
        const activeTouches = new Set();
        for (const touch of e.touches) {
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el && el.dataset.btn) activeTouches.add(el.dataset.btn);
        }
        if (!activeTouches.has('boost')) {
            this.boost = false;
            const btn = this._overlay.querySelector('[data-btn="boost"]');
            if (btn) btn.classList.remove('active');
        }
        if (!activeTouches.has('action')) {
            this.action = false;
            const btn = this._overlay.querySelector('[data-btn="action"]');
            if (btn) btn.classList.remove('active');
        }
        if (!activeTouches.has('vup')) {
            this.verticalUp = false;
            const btn = this._overlay.querySelector('[data-btn="vup"]');
            if (btn) btn.classList.remove('active');
        }
        if (!activeTouches.has('vdown')) {
            this.verticalDown = false;
            const btn = this._overlay.querySelector('[data-btn="vdown"]');
            if (btn) btn.classList.remove('active');
        }
    }

    // ============================================================
    // UTILITY
    // ============================================================

    _applyDeadzone(value) {
        if (Math.abs(value) < this.deadzone) return 0;
        // Remap so that just past deadzone = 0, full stick = 1
        const sign = value > 0 ? 1 : -1;
        return sign * (Math.abs(value) - this.deadzone) / (1 - this.deadzone);
    }

    _resetSticks() {
        this.leftStick.x = 0;
        this.leftStick.y = 0;
        this.rightStick.x = 0;
        this.rightStick.y = 0;
        this.boost = false;
        this.action = false;
        this.verticalUp = false;
        this.verticalDown = false;
        this._leftTouch = null;
        this._rightTouch = null;
    }
}
