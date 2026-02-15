/**
 * THE GALACTIC ORDER - Hyperspace Jump System
 *
 * Press Space while flying above 50m to charge hyperspace.
 * Hold for 2 seconds → warp to a new planet.
 *
 * Visual sequence:
 * 1. Charge: stars stretch, screen edges blur, engine glow intensifies
 * 2. Jump: flash white, seamlessly transition to new planet (no page reload)
 */

import * as THREE from 'three';

// ============================================================
// HYPERSPACE SYSTEM
// ============================================================

export class HyperspaceSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     */
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // State
        this.isCharging = false;
        this.chargeProgress = 0; // 0 to 1
        this.chargeDuration = 2.0; // seconds to hold Space
        this.minAltitude = 50; // must be above this to jump
        this.isJumping = false;

        // Seamless transition callback — called instead of page redirect
        this.onJump = null;

        // Audio hooks (optional)
        this.onChargeStart = null;
        this.onChargeCancel = null;

        // Visual overlay
        this.overlay = this._createOverlay();
        document.body.appendChild(this.overlay);

        // Star stretch effect (screen-space lines)
        this.starLines = this._createStarLines();
        this.starLines.visible = false;
        this.scene.add(this.starLines);

        // Flash overlay
        this.flashOverlay = this._createFlashOverlay();
        document.body.appendChild(this.flashOverlay);

        // Input
        this._spaceHeld = false;
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
    }

    enable() {
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
    }

    disable() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        this._spaceHeld = false;
        this._cancelCharge();
    }

    _onKeyDown(e) {
        if (e.code === 'Space') {
            e.preventDefault();
            this._spaceHeld = true;
        }
    }

    _onKeyUp(e) {
        if (e.code === 'Space') {
            this._spaceHeld = false;
            if (this.isCharging && !this.isJumping) {
                this._cancelCharge();
            }
        }
    }

    /**
     * @param {number} dt
     * @param {number} altitude - Current altitude above ground
     */
    update(dt, altitude) {
        if (this.isJumping) return; // Don't process during jump animation

        if (this._spaceHeld && altitude >= this.minAltitude) {
            if (!this.isCharging) {
                this.isCharging = true;
                this.chargeProgress = 0;
                if (this.onChargeStart) this.onChargeStart();
            }

            this.chargeProgress += dt / this.chargeDuration;

            // Update charge visual
            this._updateChargeVisual();

            if (this.chargeProgress >= 1.0) {
                this._executeJump();
            }
        } else if (this._spaceHeld && altitude < this.minAltitude) {
            // Too low — flash warning
            this.overlay.innerHTML = `
                <div style="color: #ff4444; text-align: center;">
                    ALTITUDE TOO LOW<br>
                    <span style="font-size: 10px; color: #884444;">
                        MINIMUM ${this.minAltitude}m FOR HYPERSPACE
                    </span>
                </div>
            `;
            this.overlay.style.opacity = '1';
        } else if (!this._spaceHeld && this.isCharging) {
            this._cancelCharge();
        } else {
            // Idle — hide overlay
            this.overlay.style.opacity = '0';
            this.starLines.visible = false;
        }
    }

    _updateChargeVisual() {
        const t = this.chargeProgress;

        // Overlay: charge bar
        const barWidth = Math.round(t * 100);
        this.overlay.innerHTML = `
            <div style="text-align: center; color: #88ccff;">
                HYPERSPACE CHARGING
                <div style="width: 200px; height: 3px; background: #112; margin: 8px auto; border: 1px solid #334;">
                    <div style="width: ${barWidth}%; height: 100%; background: linear-gradient(90deg, #3388ff, #88ccff);"></div>
                </div>
                <span style="font-size: 10px; color: #446;">${Math.round(t * 100)}%</span>
            </div>
        `;
        this.overlay.style.opacity = '1';

        // Star lines stretch effect
        this.starLines.visible = t > 0.2;
        if (this.starLines.material.uniforms) {
            this.starLines.material.uniforms.uStretch.value = t;
            this.starLines.material.uniforms.uOpacity.value = (t - 0.2) / 0.8;
        }
    }

    _cancelCharge() {
        this.isCharging = false;
        this.chargeProgress = 0;
        this.overlay.style.opacity = '0';
        this.starLines.visible = false;
        if (this.onChargeCancel) this.onChargeCancel();
    }

    _executeJump() {
        this.isJumping = true;

        // Flash screen white
        this.flashOverlay.style.opacity = '1';

        // After flash peak, open the galaxy map for destination selection
        setTimeout(() => {
            // Fade out flash immediately — the galaxy map takes over
            this.flashOverlay.style.opacity = '0';

            if (this.onJump) {
                // Open galaxy map — no more random warps
                this.onJump();
            }
        }, 800);
    }

    /**
     * Reset jump state after a seamless transition completes.
     * Called by the game's transitionToPlanet() function.
     */
    resetJumpState() {
        this.isJumping = false;
        this.isCharging = false;
        this.chargeProgress = 0;
        this._spaceHeld = false;
        this.overlay.style.opacity = '0';
        this.starLines.visible = false;
    }

    // ============================================================
    // VISUAL ELEMENTS
    // ============================================================

    _createOverlay() {
        const el = document.createElement('div');
        el.id = 'hyperspace-overlay';
        el.style.cssText = `
            position: fixed;
            bottom: 120px;
            left: 50%;
            transform: translateX(-50%);
            font-family: 'Courier New', monospace;
            font-size: 12px;
            letter-spacing: 2px;
            pointer-events: none;
            z-index: 20;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        return el;
    }

    _createFlashOverlay() {
        const el = document.createElement('div');
        el.id = 'hyperspace-flash';
        el.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: white;
            pointer-events: none;
            z-index: 100;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        return el;
    }

    _createStarLines() {
        // Create a bunch of lines radiating from center (warp tunnel)
        const count = 200;
        const positions = new Float32Array(count * 6); // 2 points per line

        for (let i = 0; i < count; i++) {
            // Random position on a cylinder around the camera
            const angle = Math.random() * Math.PI * 2;
            const radius = 5 + Math.random() * 40;
            const z = -10 - Math.random() * 100;

            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            // Start point
            positions[i * 6 + 0] = x;
            positions[i * 6 + 1] = y;
            positions[i * 6 + 2] = z;

            // End point (stretched along Z)
            positions[i * 6 + 3] = x;
            positions[i * 6 + 4] = y;
            positions[i * 6 + 5] = z - 5;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uStretch: { value: 0 },
                uOpacity: { value: 0 },
            },
            vertexShader: /* glsl */ `
                uniform float uStretch;
                varying float vAlpha;

                void main() {
                    vec3 pos = position;
                    // Stretch lines along Z based on charge progress
                    pos.z *= 1.0 + uStretch * 10.0;

                    vAlpha = smoothstep(-100.0, -10.0, pos.z);

                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                uniform float uOpacity;
                varying float vAlpha;

                void main() {
                    gl_FragColor = vec4(0.5, 0.8, 1.0, vAlpha * uOpacity);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        return new THREE.LineSegments(geo, mat);
    }

    getHUDInfo() {
        return {
            isCharging: this.isCharging,
            chargeProgress: this.chargeProgress,
            isJumping: this.isJumping,
        };
    }

    dispose() {
        this.disable();
        if (this.starLines) {
            this.scene.remove(this.starLines);
            this.starLines.geometry.dispose();
            this.starLines.material.dispose();
        }
        if (this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
        if (this.flashOverlay.parentNode) this.flashOverlay.parentNode.removeChild(this.flashOverlay);
    }
}
