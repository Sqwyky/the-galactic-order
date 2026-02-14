/**
 * THE GALACTIC ORDER - Scanner System
 *
 * Press C to scan surroundings. Creates an expanding visual pulse
 * and shows planet/environment info in a HUD overlay.
 */

import * as THREE from 'three';

// ============================================================
// SCANNER SYSTEM
// ============================================================

export class ScannerSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} planetData - { name, rule, frequency, mood, classification, ... }
     */
    constructor(scene, planetData) {
        this.scene = scene;
        this.planetData = planetData;

        // State
        this.isScanning = false;
        this.scanProgress = 0; // 0 to 1
        this.cooldownTimer = 0;
        this.scanCooldown = 5.0; // seconds

        // Scan pulse mesh
        this.scanPulse = null;
        this._scanMat = null;

        // HUD overlay element
        this.overlay = this._createOverlay();
        document.body.appendChild(this.overlay);

        // Input
        this._onKeyDown = this._onKeyDown.bind(this);
    }

    enable() {
        document.addEventListener('keydown', this._onKeyDown);
    }

    disable() {
        document.removeEventListener('keydown', this._onKeyDown);
        this._hideScanResults();
    }

    _onKeyDown(e) {
        if (e.code === 'KeyC' && this.cooldownTimer <= 0 && !this.isScanning) {
            this._startScan();
        }
    }

    _startScan() {
        this.isScanning = true;
        this.scanProgress = 0;
        this.cooldownTimer = this.scanCooldown;

        // Create expanding sphere pulse
        const geo = new THREE.SphereGeometry(1, 32, 16);
        this._scanMat = new THREE.ShaderMaterial({
            uniforms: {
                uProgress: { value: 0 },
                uColor: { value: new THREE.Color(0x00ff88) },
            },
            vertexShader: /* glsl */ `
                varying vec3 vNormal;
                varying vec3 vWorldPos;
                void main() {
                    vNormal = normalize(normalMatrix * normal);
                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                uniform float uProgress;
                uniform vec3 uColor;
                varying vec3 vNormal;
                varying vec3 vWorldPos;

                void main() {
                    // Edge glow (Fresnel-like)
                    float edge = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
                    edge = pow(edge, 2.0);

                    // Grid lines
                    float gridX = abs(sin(vWorldPos.x * 2.0)) < 0.05 ? 1.0 : 0.0;
                    float gridZ = abs(sin(vWorldPos.z * 2.0)) < 0.05 ? 1.0 : 0.0;
                    float grid = max(gridX, gridZ) * 0.3;

                    float alpha = (edge * 0.6 + grid) * (1.0 - uProgress);
                    gl_FragColor = vec4(uColor, alpha * 0.7);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this.scanPulse = new THREE.Mesh(geo, this._scanMat);
        this.scene.add(this.scanPulse);
    }

    update(dt, shipPosition) {
        // Cooldown
        if (this.cooldownTimer > 0 && !this.isScanning) {
            this.cooldownTimer -= dt;
        }

        if (!this.isScanning) return;

        this.scanProgress += dt * 0.4; // ~2.5 seconds for full scan

        if (this.scanPulse) {
            // Expand the pulse sphere
            const radius = this.scanProgress * 150; // Grows to 150m
            this.scanPulse.scale.setScalar(radius);
            this.scanPulse.position.copy(shipPosition);
            this._scanMat.uniforms.uProgress.value = this.scanProgress;
        }

        if (this.scanProgress >= 1.0) {
            // Scan complete
            this.isScanning = false;

            // Remove pulse
            if (this.scanPulse) {
                this.scene.remove(this.scanPulse);
                this.scanPulse.geometry.dispose();
                this._scanMat.dispose();
                this.scanPulse = null;
            }

            // Show results
            this._showScanResults(shipPosition);
        }
    }

    _createOverlay() {
        const el = document.createElement('div');
        el.id = 'scan-overlay';
        el.style.cssText = `
            position: fixed;
            top: 50%;
            right: 30px;
            transform: translateY(-50%);
            background: rgba(0, 10, 5, 0.85);
            border: 1px solid rgba(0, 255, 136, 0.3);
            color: #00ff88;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            padding: 16px 20px;
            max-width: 280px;
            letter-spacing: 1px;
            line-height: 1.6;
            pointer-events: none;
            z-index: 20;
            opacity: 0;
            transition: opacity 0.5s;
        `;
        return el;
    }

    _showScanResults(position) {
        const pd = this.planetData;
        this.overlay.innerHTML = `
            <div style="color: #33ffaa; font-size: 13px; margin-bottom: 8px; letter-spacing: 3px;">
                ◈ SCAN COMPLETE
            </div>
            <div style="border-top: 1px solid rgba(0,255,136,0.2); padding-top: 8px;">
                <b>${(pd.name || 'UNKNOWN').toUpperCase()}</b><br>
                Rule: ${pd.rule || '?'} · Class: ${pd.ruleClass || '?'}<br>
                ${pd.frequency ? `Frequency: ${pd.frequency}` : ''}<br>
                ${pd.musicalNote ? `Note: ${pd.musicalNote}` : ''}<br>
                ${pd.brainwaveBand ? `Band: ${pd.brainwaveBand} (${pd.mood || ''})` : ''}<br>
                ${pd.schumannResonant ? '<span style="color:#ffcc00">★ SCHUMANN RESONANT</span>' : ''}<br>
                <br>
                <span style="color: #556;">Position:</span> ${Math.round(position.x)}, ${Math.round(position.y)}, ${Math.round(position.z)}<br>
                <span style="color: #556;">Atmosphere:</span> ${pd.atmosphere || 'Unknown'}<br>
                <span style="color: #556;">Hazard:</span> ${pd.hazard || 'Unknown'}
            </div>
        `;
        this.overlay.style.opacity = '1';

        // Auto-hide after 4 seconds
        clearTimeout(this._hideTimeout);
        this._hideTimeout = setTimeout(() => this._hideScanResults(), 4000);
    }

    _hideScanResults() {
        this.overlay.style.opacity = '0';
    }

    getHUDInfo() {
        return {
            isScanning: this.isScanning,
            scanProgress: this.scanProgress,
            cooldownPct: Math.max(0, this.cooldownTimer / this.scanCooldown),
            isReady: this.cooldownTimer <= 0 && !this.isScanning,
        };
    }

    dispose() {
        this.disable();
        if (this.scanPulse) {
            this.scene.remove(this.scanPulse);
            this.scanPulse.geometry.dispose();
            this._scanMat.dispose();
        }
        if (this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
    }
}
