/**
 * THE GALACTIC ORDER - Procedural Ship Model
 *
 * Low-poly NMS-style spacecraft built entirely from Three.js primitives.
 * No external models needed — the ship is generated from code.
 *
 * Design: A compact, angular explorer ship inspired by No Man's Sky's
 * starter ships. Cockpit bubble, angular fuselage, swept wings,
 * engine glow pods, and a subtle landing gear.
 */

import * as THREE from 'three';

// ============================================================
// SHIP MODEL BUILDER
// ============================================================

export class ShipModel {
    /**
     * @param {Object} options
     * @param {THREE.Color} options.hullColor - Main hull color
     * @param {THREE.Color} options.accentColor - Accent/trim color
     * @param {THREE.Color} options.engineColor - Engine glow color
     */
    constructor(options = {}) {
        this.hullColor = options.hullColor || new THREE.Color(0x556677);
        this.accentColor = options.accentColor || new THREE.Color(0xcc6633);
        this.engineColor = options.engineColor || new THREE.Color(0x33ccff);

        this.group = new THREE.Group();
        this.engineGlows = [];
        this.landingGear = null;

        this._build();
    }

    _build() {
        const hullMat = new THREE.MeshLambertMaterial({
            color: this.hullColor,
            flatShading: true,
        });
        const accentMat = new THREE.MeshLambertMaterial({
            color: this.accentColor,
            flatShading: true,
        });
        const glassMat = new THREE.MeshLambertMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.4,
        });
        const engineMat = new THREE.MeshBasicMaterial({
            color: this.engineColor,
            transparent: true,
            opacity: 0.8,
        });

        // ---- Fuselage (main body) ----
        // Elongated box, slightly tapered at front
        const fuselageGeo = new THREE.BoxGeometry(1.8, 0.6, 4.0);
        const fuselagePos = fuselageGeo.getAttribute('position');
        // Taper front end (z > 0)
        for (let i = 0; i < fuselagePos.count; i++) {
            const z = fuselagePos.getZ(i);
            if (z > 0.5) {
                const taper = 1.0 - (z - 0.5) / 2.5 * 0.4;
                fuselagePos.setX(i, fuselagePos.getX(i) * taper);
                fuselagePos.setY(i, fuselagePos.getY(i) * (taper * 0.8 + 0.2));
            }
            // Slight bottom flatten
            if (fuselagePos.getY(i) < -0.1) {
                fuselagePos.setY(i, fuselagePos.getY(i) * 0.7);
            }
        }
        fuselageGeo.computeVertexNormals();
        const fuselage = new THREE.Mesh(fuselageGeo, hullMat);
        this.group.add(fuselage);

        // ---- Cockpit bubble ----
        const cockpitGeo = new THREE.SphereGeometry(0.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const cockpit = new THREE.Mesh(cockpitGeo, glassMat);
        cockpit.position.set(0, 0.25, 1.0);
        cockpit.scale.set(1.0, 0.7, 1.2);
        this.group.add(cockpit);

        // ---- Wings ----
        const wingShape = new THREE.Shape();
        wingShape.moveTo(0, 0);
        wingShape.lineTo(3.0, -0.3);
        wingShape.lineTo(2.5, -1.2);
        wingShape.lineTo(0, -0.8);
        wingShape.closePath();

        const wingExtrudeSettings = { depth: 0.08, bevelEnabled: false };
        const wingGeo = new THREE.ExtrudeGeometry(wingShape, wingExtrudeSettings);

        // Right wing
        const rightWing = new THREE.Mesh(wingGeo, accentMat);
        rightWing.position.set(0.7, -0.1, 0.5);
        rightWing.rotation.set(0, 0, -0.05);
        this.group.add(rightWing);

        // Left wing (mirrored)
        const leftWing = new THREE.Mesh(wingGeo, accentMat);
        leftWing.position.set(-0.7, -0.1, 0.5);
        leftWing.rotation.set(0, 0, 0.05);
        leftWing.scale.x = -1;
        this.group.add(leftWing);

        // ---- Wing tips (small vertical fins) ----
        const finGeo = new THREE.BoxGeometry(0.06, 0.4, 0.5);
        const rightFin = new THREE.Mesh(finGeo, hullMat);
        rightFin.position.set(3.5, 0.0, -0.1);
        this.group.add(rightFin);

        const leftFin = new THREE.Mesh(finGeo, hullMat);
        leftFin.position.set(-3.5, 0.0, -0.1);
        this.group.add(leftFin);

        // ---- Engines (two pods, one per side) ----
        const engineGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.8, 6);
        engineGeo.rotateX(Math.PI / 2);

        const rightEngine = new THREE.Mesh(engineGeo, hullMat);
        rightEngine.position.set(1.0, -0.15, -1.8);
        this.group.add(rightEngine);

        const leftEngine = new THREE.Mesh(engineGeo, hullMat);
        leftEngine.position.set(-1.0, -0.15, -1.8);
        this.group.add(leftEngine);

        // Engine glow (emissive discs at the back)
        const glowGeo = new THREE.CircleGeometry(0.22, 8);
        const rightGlow = new THREE.Mesh(glowGeo, engineMat);
        rightGlow.position.set(1.0, -0.15, -2.2);
        rightGlow.rotation.y = Math.PI;
        this.group.add(rightGlow);
        this.engineGlows.push(rightGlow);

        const leftGlow = new THREE.Mesh(glowGeo, engineMat);
        leftGlow.position.set(-1.0, -0.15, -2.2);
        leftGlow.rotation.y = Math.PI;
        this.group.add(leftGlow);
        this.engineGlows.push(leftGlow);

        // ---- Tail fin ----
        const tailGeo = new THREE.BoxGeometry(0.06, 0.7, 1.0);
        const tail = new THREE.Mesh(tailGeo, accentMat);
        tail.position.set(0, 0.5, -1.5);
        tail.rotation.x = -0.1;
        this.group.add(tail);

        // ---- Landing gear (3 legs) ----
        this.landingGear = new THREE.Group();
        const legGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.5, 4);
        const legMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
        const padGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 6);

        const legPositions = [
            [0.6, -0.55, 0.8],   // Front-right
            [-0.6, -0.55, 0.8],  // Front-left
            [0, -0.55, -1.5],    // Rear-center
        ];

        for (const [lx, ly, lz] of legPositions) {
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(lx, ly, lz);
            this.landingGear.add(leg);

            const pad = new THREE.Mesh(padGeo, legMat);
            pad.position.set(lx, ly - 0.25, lz);
            this.landingGear.add(pad);
        }

        this.group.add(this.landingGear);

        // Scale the whole ship
        this.group.scale.setScalar(1.5);
    }

    /**
     * Update engine glow based on thrust.
     * @param {number} thrust - 0 to 1
     * @param {number} time - elapsed time for pulse
     */
    updateEngines(thrust, time) {
        for (const glow of this.engineGlows) {
            const pulse = 0.7 + Math.sin(time * 10) * 0.15;
            const intensity = thrust * pulse;
            glow.material.opacity = 0.3 + intensity * 0.7;
            glow.scale.setScalar(0.8 + intensity * 0.5);
        }
    }

    /**
     * Show/hide landing gear.
     */
    setLandingGear(deployed) {
        if (this.landingGear) {
            this.landingGear.visible = deployed;
        }
    }

    /**
     * Add to scene.
     */
    addToScene(scene) {
        scene.add(this.group);
    }

    removeFromScene(scene) {
        scene.remove(this.group);
    }

    dispose() {
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
}
