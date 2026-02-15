/**
 * THE GALACTIC ORDER — First-Person View Model
 *
 * Renders the player's arm + multi-tool in the lower-right of the screen.
 * The view model is a child of the camera so it always stays in view.
 *
 * Features:
 * - Simple geometric arm with glove + multi-tool
 * - Sway when walking (lags behind camera rotation)
 * - Bob that matches head bob
 * - Mining beam emits from the tool tip
 * - Tool glows when mining
 * - Visible only on SURFACE phase
 */

import * as THREE from 'three';

// ============================================================
// FPS VIEW MODEL
// ============================================================

export class FPSViewModel {
    /**
     * @param {THREE.Camera} camera - The main camera to attach to
     */
    constructor(camera) {
        this.camera = camera;
        this.group = new THREE.Group();
        this.group.renderOrder = 999; // Render on top

        // State
        this.visible = false;
        this.isMining = false;
        this.swayOffset = { x: 0, y: 0 };
        this._lastYaw = 0;
        this._lastPitch = 0;
        this._swayX = 0;
        this._swayY = 0;
        this._bobPhase = 0;

        this._build();

        // Position in lower-right of view
        this.group.position.set(0.35, -0.32, -0.55);
        this.group.rotation.set(0.1, -0.3, 0.05);
        this.group.visible = false;

        camera.add(this.group);
    }

    _build() {
        // === MATERIALS ===
        const skinMat = new THREE.MeshLambertMaterial({ color: 0xd4a574 }); // Skin tone
        const gloveMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a }); // Dark glove
        const suitMat = new THREE.MeshLambertMaterial({ color: 0x445566 }); // Suit sleeve
        const toolMat = new THREE.MeshLambertMaterial({ color: 0x556677 }); // Tool body
        const toolAccent = new THREE.MeshLambertMaterial({ color: 0x334455 });
        this._toolGlowMat = new THREE.MeshBasicMaterial({
            color: 0x00ffcc,
            transparent: true,
            opacity: 0.0,
        });

        // === FOREARM (suit sleeve) ===
        const forearm = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.04, 0.25, 6),
            suitMat
        );
        forearm.position.set(0, 0.05, 0.12);
        forearm.rotation.x = -1.2;
        this.group.add(forearm);

        // === HAND (glove) ===
        const hand = new THREE.Mesh(
            new THREE.BoxGeometry(0.06, 0.03, 0.08),
            gloveMat
        );
        hand.position.set(0, -0.02, -0.02);
        hand.rotation.x = 0.2;
        this.group.add(hand);

        // === FINGERS (gripping tool) ===
        for (let i = 0; i < 4; i++) {
            const finger = new THREE.Mesh(
                new THREE.CylinderGeometry(0.008, 0.007, 0.04, 4),
                gloveMat
            );
            finger.position.set(-0.02 + i * 0.013, -0.035, -0.03);
            finger.rotation.x = 0.6;
            this.group.add(finger);
        }

        // === THUMB ===
        const thumb = new THREE.Mesh(
            new THREE.CylinderGeometry(0.009, 0.008, 0.035, 4),
            gloveMat
        );
        thumb.position.set(0.035, -0.025, -0.01);
        thumb.rotation.set(0.3, 0, -0.8);
        this.group.add(thumb);

        // === MULTI-TOOL BODY ===
        const toolBody = new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.035, 0.2),
            toolMat
        );
        toolBody.position.set(0, -0.04, -0.12);
        this.group.add(toolBody);

        // Tool barrel
        const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.015, 0.1, 6),
            toolAccent
        );
        barrel.position.set(0, -0.04, -0.24);
        barrel.rotation.x = Math.PI / 2;
        this.group.add(barrel);

        // Tool top ridge
        const ridge = new THREE.Mesh(
            new THREE.BoxGeometry(0.025, 0.008, 0.15),
            toolAccent
        );
        ridge.position.set(0, -0.02, -0.14);
        this.group.add(ridge);

        // Tool side panel (display)
        const panel = new THREE.Mesh(
            new THREE.BoxGeometry(0.002, 0.02, 0.06),
            new THREE.MeshBasicMaterial({ color: 0x003322 })
        );
        panel.position.set(0.022, -0.04, -0.1);
        this.group.add(panel);

        // === TOOL TIP GLOW (visible when mining) ===
        const tipGlow = new THREE.Mesh(
            new THREE.SphereGeometry(0.015, 8, 6),
            this._toolGlowMat
        );
        tipGlow.position.set(0, -0.04, -0.3);
        this.group.add(tipGlow);
        this._tipGlow = tipGlow;

        // === WRIST DETAIL ===
        const wristBand = new THREE.Mesh(
            new THREE.CylinderGeometry(0.042, 0.042, 0.015, 6),
            toolAccent
        );
        wristBand.position.set(0, 0.02, 0.0);
        wristBand.rotation.x = -1.0;
        this.group.add(wristBand);
    }

    /**
     * Show the view model (SURFACE phase).
     */
    show() {
        this.group.visible = true;
        this.visible = true;
    }

    /**
     * Hide the view model (FLIGHT/other phases).
     */
    hide() {
        this.group.visible = false;
        this.visible = false;
    }

    /**
     * Set mining state (tool glow).
     */
    setMining(active) {
        this.isMining = active;
    }

    /**
     * Update every frame.
     * @param {number} dt - Delta time
     * @param {Object} info - { yaw, pitch, speed, isMoving, headBobOffset }
     */
    update(dt, info = {}) {
        if (!this.visible) return;

        // === SWAY ===
        // View model lags behind camera rotation for natural feel
        const yaw = info.yaw || 0;
        const pitch = info.pitch || 0;

        const yawDelta = yaw - this._lastYaw;
        const pitchDelta = pitch - this._lastPitch;
        this._lastYaw = yaw;
        this._lastPitch = pitch;

        // Smooth sway
        this._swayX += (-yawDelta * 0.8 - this._swayX) * Math.min(1, dt * 8);
        this._swayY += (-pitchDelta * 0.5 - this._swayY) * Math.min(1, dt * 8);

        // Clamp sway
        this._swayX = Math.max(-0.04, Math.min(0.04, this._swayX));
        this._swayY = Math.max(-0.03, Math.min(0.03, this._swayY));

        // === BOB ===
        const speed = info.speed || 0;
        const isMoving = speed > 0.5;
        if (isMoving) {
            const bobFreq = speed > 8 ? 9 : 7;
            this._bobPhase += dt * bobFreq;
            const bobX = Math.sin(this._bobPhase * Math.PI * 2) * 0.008;
            const bobY = Math.cos(this._bobPhase * Math.PI * 2 * 2) * 0.006;
            this.group.position.x = 0.35 + this._swayX + bobX;
            this.group.position.y = -0.32 + this._swayY + bobY + (info.headBobOffset || 0) * 0.3;
        } else {
            // Idle gentle sway
            this._bobPhase = 0;
            this.group.position.x = 0.35 + this._swayX;
            this.group.position.y = -0.32 + this._swayY;
        }

        // === MINING GLOW ===
        const targetGlow = this.isMining ? 0.8 : 0.0;
        const currentGlow = this._toolGlowMat.opacity;
        this._toolGlowMat.opacity += (targetGlow - currentGlow) * Math.min(1, dt * 10);
    }

    dispose() {
        this.camera.remove(this.group);
        this.group.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
}
