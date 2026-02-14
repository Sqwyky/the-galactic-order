/**
 * THE GALACTIC ORDER - Procedural Ship Model v2
 *
 * A detailed NMS-style explorer spacecraft built from Three.js primitives.
 * No external models needed — every panel, vent, and thruster is code-generated.
 *
 * Design language: Sleek angular explorer with:
 *   - Sculpted fuselage (tapered nose, raised spine, flat belly)
 *   - Bubble cockpit with visible frame struts
 *   - Swept delta wings with anhedral tips
 *   - Twin engine nacelles with intake scoops
 *   - Dorsal fin + twin ventral stabilisers
 *   - Hull panel lines and greeble detail
 *   - Emissive engine glow with exhaust trail
 *   - Retractable landing gear with shock absorbers
 */

import * as THREE from 'three';

// ============================================================
// HELPER: merge buffer geometries manually (avoid import)
// ============================================================
function mergeInto(targetGroup, geo, mat, pos, rot, scale, shadow = true) {
    const mesh = new THREE.Mesh(geo, mat);
    if (pos) mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    if (scale) {
        if (typeof scale === 'number') mesh.scale.setScalar(scale);
        else mesh.scale.set(...scale);
    }
    if (shadow) { mesh.castShadow = true; mesh.receiveShadow = true; }
    targetGroup.add(mesh);
    return mesh;
}

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
        this.hullColor   = options.hullColor   || new THREE.Color(0x5a6b7a);
        this.accentColor = options.accentColor  || new THREE.Color(0xd4722a);
        this.engineColor = options.engineColor  || new THREE.Color(0x33ccff);

        this.group = new THREE.Group();
        this.engineGlows = [];       // Emissive exhaust discs
        this.engineTrails = [];      // Particle trail meshes
        this.landingGear = null;
        this.cockpitFrame = null;
        this.headlights = [];

        this._build();
    }

    // ========================================================
    // MATERIALS
    // ========================================================
    _createMaterials() {
        // Main hull — semi-rough painted metal
        this.hullMat = new THREE.MeshStandardMaterial({
            color: this.hullColor,
            flatShading: true,
            roughness: 0.45,
            metalness: 0.55,
        });

        // Darker hull panels for visual break-up
        this.panelMat = new THREE.MeshStandardMaterial({
            color: this.hullColor.clone().multiplyScalar(0.7),
            flatShading: true,
            roughness: 0.5,
            metalness: 0.6,
        });

        // Accent trim (wing edges, fin, stripes)
        this.accentMat = new THREE.MeshStandardMaterial({
            color: this.accentColor,
            flatShading: true,
            roughness: 0.35,
            metalness: 0.5,
        });

        // Dark structural metal (landing gear, joints, intakes)
        this.structMat = new THREE.MeshStandardMaterial({
            color: 0x333840,
            flatShading: true,
            roughness: 0.6,
            metalness: 0.7,
        });

        // Cockpit glass — physically-based transparency
        this.glassMat = new THREE.MeshPhysicalMaterial({
            color: 0x88ccff,
            transparent: true,
            opacity: 0.25,
            roughness: 0.05,
            metalness: 0.05,
            transmission: 0.85,
            thickness: 0.4,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05,
            envMapIntensity: 1.5,
        });

        // Engine glow (additive-like emissive)
        this.engineMat = new THREE.MeshBasicMaterial({
            color: this.engineColor,
            transparent: true,
            opacity: 0.9,
        });

        // Engine inner glow (brighter core)
        this.engineCoreMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
        });

        // Emissive accent (running lights, cockpit glow strip)
        this.emissiveMat = new THREE.MeshStandardMaterial({
            color: this.accentColor,
            emissive: this.accentColor,
            emissiveIntensity: 2.0,
            roughness: 0.3,
            metalness: 0.2,
        });

        // Nav light — green (starboard) / red (port)
        this.navGreenMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });
        this.navRedMat   = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    }

    // ========================================================
    // BUILD THE SHIP
    // ========================================================
    _build() {
        this._createMaterials();

        this._buildFuselage();
        this._buildCockpit();
        this._buildWings();
        this._buildEngineNacelles();
        this._buildDorsalFin();
        this._buildVentralStabilisers();
        this._buildHullDetails();
        this._buildLandingGear();

        // Scale — ship is about 8m long at 1.0 scale
        this.group.scale.setScalar(1.6);
    }

    // ---- FUSELAGE ----
    _buildFuselage() {
        // Main body — sculpted box
        const fGeo = new THREE.BoxGeometry(2.0, 0.7, 5.5, 4, 2, 6);
        const pos = fGeo.getAttribute('position');

        for (let i = 0; i < pos.count; i++) {
            let x = pos.getX(i);
            let y = pos.getY(i);
            let z = pos.getZ(i);

            // Nose taper (front z > 1.5)
            if (z > 1.5) {
                const t = (z - 1.5) / 1.25;
                const taper = 1.0 - t * 0.55;
                x *= taper;
                y *= (taper * 0.6 + 0.4);
            }

            // Tail taper (rear z < -1.5)
            if (z < -1.5) {
                const t = (-1.5 - z) / 1.25;
                const taper = 1.0 - t * 0.3;
                x *= taper;
            }

            // Raised spine — top vertices pushed up slightly toward rear
            if (y > 0.1) {
                const spineRaise = 0.15 * Math.max(0, 1.0 - (z + 1.0) / 4.0);
                y += spineRaise;
            }

            // Flat belly
            if (y < -0.1) {
                y *= 0.65;
            }

            // Slight lateral pinch at center for aerodynamic look
            const centerPinch = 1.0 - 0.08 * Math.exp(-z * z * 0.3);
            x *= centerPinch;

            pos.setXYZ(i, x, y, z);
        }

        fGeo.computeVertexNormals();
        mergeInto(this.group, fGeo, this.hullMat, [0, 0, 0]);

        // Belly plate — darker panel under the hull
        const bellyGeo = new THREE.BoxGeometry(1.4, 0.06, 3.8);
        mergeInto(this.group, bellyGeo, this.panelMat, [0, -0.28, -0.2]);

        // Nose cap — accent-coloured tip
        const noseCone = new THREE.ConeGeometry(0.25, 0.6, 6);
        noseCone.rotateX(-Math.PI / 2);
        mergeInto(this.group, noseCone, this.accentMat, [0, 0.05, 3.05]);
    }

    // ---- COCKPIT ----
    _buildCockpit() {
        // Glass canopy — elongated half-sphere
        const canopyGeo = new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
        const canopy = new THREE.Mesh(canopyGeo, this.glassMat);
        canopy.position.set(0, 0.3, 1.5);
        canopy.scale.set(0.9, 0.65, 1.4);
        this.group.add(canopy);

        // Cockpit frame struts — thin accent-coloured ribs over the glass
        this.cockpitFrame = new THREE.Group();
        const strutGeo = new THREE.BoxGeometry(0.04, 0.03, 1.4);
        // Center rib (runs front-to-back over canopy)
        mergeInto(this.cockpitFrame, strutGeo, this.structMat, [0, 0.62, 1.5], null, [1, 1, 1], false);
        // Side ribs
        const sideStrutGeo = new THREE.BoxGeometry(0.03, 0.45, 0.04);
        mergeInto(this.cockpitFrame, sideStrutGeo, this.structMat, [0.35, 0.4, 1.8], [0.2, 0, 0], null, false);
        mergeInto(this.cockpitFrame, sideStrutGeo, this.structMat, [-0.35, 0.4, 1.8], [-0.2, 0, 0], null, false);
        // Rear frame
        const rearFrameGeo = new THREE.BoxGeometry(0.9, 0.06, 0.04);
        mergeInto(this.cockpitFrame, rearFrameGeo, this.structMat, [0, 0.35, 0.8], null, null, false);
        this.group.add(this.cockpitFrame);

        // Cockpit interior glow strip (emissive line under the glass)
        const glowStripGeo = new THREE.BoxGeometry(0.5, 0.02, 0.8);
        mergeInto(this.group, glowStripGeo, this.emissiveMat, [0, 0.22, 1.6], null, null, false);
    }

    // ---- WINGS ----
    _buildWings() {
        // Swept delta wings with thickness — using ExtrudeGeometry for proper 3D
        const wingProfile = new THREE.Shape();
        wingProfile.moveTo(0, 0);
        wingProfile.lineTo(3.5, -0.15);   // Tip angled slightly down
        wingProfile.lineTo(3.2, -0.8);    // Trailing edge swept back
        wingProfile.lineTo(0.3, -1.6);    // Wing root trailing edge
        wingProfile.lineTo(0, -1.2);      // Connect back
        wingProfile.closePath();

        const wingExtrude = { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 1 };
        const wingGeo = new THREE.ExtrudeGeometry(wingProfile, wingExtrude);

        // Right wing
        const rWing = mergeInto(this.group, wingGeo, this.accentMat, [0.8, -0.12, 0.8], [0, 0, -0.03]);

        // Left wing (mirrored)
        const lWing = mergeInto(this.group, wingGeo, this.accentMat, [-0.8, -0.12, 0.8], [0, 0, 0.03], [-1, 1, 1]);

        // Wing surface panels (dark stripe for visual detail)
        const panelGeo = new THREE.BoxGeometry(2.2, 0.02, 0.4);
        mergeInto(this.group, panelGeo, this.panelMat, [2.0, -0.14, 0.2], [0, 0, -0.03], null, false);
        mergeInto(this.group, panelGeo, this.panelMat, [-2.0, -0.14, 0.2], [0, 0, 0.03], null, false);

        // Wing tip fins — small vertical stabilisers at wing ends
        const tipFinGeo = new THREE.BoxGeometry(0.06, 0.5, 0.45);
        // Reshape: taper top
        const tipPos = tipFinGeo.getAttribute('position');
        for (let i = 0; i < tipPos.count; i++) {
            if (tipPos.getY(i) > 0.1) {
                tipPos.setZ(i, tipPos.getZ(i) * 0.5);
            }
        }
        tipFinGeo.computeVertexNormals();

        mergeInto(this.group, tipFinGeo, this.hullMat, [4.1, 0.05, 0.2]);
        mergeInto(this.group, tipFinGeo, this.hullMat, [-4.1, 0.05, 0.2]);

        // Navigation lights on wing tips
        const navGeo = new THREE.SphereGeometry(0.05, 4, 4);
        mergeInto(this.group, navGeo, this.navGreenMat, [4.15, 0.05, 0.45], null, null, false);
        mergeInto(this.group, navGeo, this.navRedMat, [-4.15, 0.05, 0.45], null, null, false);
    }

    // ---- ENGINE NACELLES ----
    _buildEngineNacelles() {
        // Two engine pods, mounted behind and below the wings
        for (const side of [-1, 1]) {
            const nacelle = new THREE.Group();

            // Engine housing — tapered cylinder
            const housingGeo = new THREE.CylinderGeometry(0.25, 0.32, 1.6, 8);
            housingGeo.rotateX(Math.PI / 2);
            mergeInto(nacelle, housingGeo, this.hullMat, [0, 0, 0]);

            // Intake scoop — wide opening at front
            const intakeGeo = new THREE.CylinderGeometry(0.28, 0.2, 0.3, 8);
            intakeGeo.rotateX(Math.PI / 2);
            mergeInto(nacelle, intakeGeo, this.structMat, [0, 0, 0.9]);

            // Intake inner ring (dark)
            const innerGeo = new THREE.RingGeometry(0.08, 0.22, 8);
            const innerMesh = mergeInto(nacelle, innerGeo, this.structMat, [0, 0, 1.05], null, null, false);

            // Exhaust nozzle — wider at back
            const nozzleGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.3, 8);
            nozzleGeo.rotateX(Math.PI / 2);
            mergeInto(nacelle, nozzleGeo, this.structMat, [0, 0, -0.95]);

            // Engine glow disc (the main thruster glow)
            const glowGeo = new THREE.CircleGeometry(0.3, 10);
            const glow = new THREE.Mesh(glowGeo, this.engineMat.clone());
            glow.position.set(0, 0, -1.12);
            glow.rotation.y = Math.PI;
            nacelle.add(glow);
            this.engineGlows.push(glow);

            // Engine core (brighter inner glow)
            const coreGeo = new THREE.CircleGeometry(0.14, 8);
            const core = new THREE.Mesh(coreGeo, this.engineCoreMat.clone());
            core.position.set(0, 0, -1.11);
            core.rotation.y = Math.PI;
            nacelle.add(core);
            this.engineGlows.push(core); // Also pulsed

            // Pylon connecting nacelle to fuselage
            const pylonGeo = new THREE.BoxGeometry(0.5, 0.08, 0.6);
            mergeInto(nacelle, pylonGeo, this.panelMat, [side * -0.4, 0.15, 0]);

            // Position nacelle
            nacelle.position.set(side * 1.3, -0.2, -1.7);
            this.group.add(nacelle);
        }
    }

    // ---- DORSAL FIN ----
    _buildDorsalFin() {
        // Main tall fin on top
        const finShape = new THREE.Shape();
        finShape.moveTo(0, 0);
        finShape.lineTo(0.1, 0.9);      // Top front
        finShape.lineTo(-0.6, 0.7);     // Top rear (swept)
        finShape.lineTo(-0.8, 0);       // Bottom rear
        finShape.closePath();

        const finExtrude = { depth: 0.05, bevelEnabled: false };
        const finGeo = new THREE.ExtrudeGeometry(finShape, finExtrude);
        const fin = mergeInto(this.group, finGeo, this.accentMat, [0.025, 0.35, -0.8], [0, Math.PI / 2, 0]);

        // Accent stripe on fin
        const stripeGeo = new THREE.BoxGeometry(0.04, 0.55, 0.08);
        mergeInto(this.group, stripeGeo, this.emissiveMat, [0, 0.75, -1.0], null, null, false);
    }

    // ---- VENTRAL STABILISERS ----
    _buildVentralStabilisers() {
        // Two small angled fins under the rear fuselage
        const vFinGeo = new THREE.BoxGeometry(0.04, 0.35, 0.5);
        // Taper
        const vp = vFinGeo.getAttribute('position');
        for (let i = 0; i < vp.count; i++) {
            if (vp.getY(i) < -0.1) {
                vp.setZ(i, vp.getZ(i) * 0.6);
            }
        }
        vFinGeo.computeVertexNormals();

        mergeInto(this.group, vFinGeo, this.hullMat, [0.6, -0.45, -2.0], [0, 0, 0.3]);
        mergeInto(this.group, vFinGeo, this.hullMat, [-0.6, -0.45, -2.0], [0, 0, -0.3]);
    }

    // ---- HULL DETAILS (panel lines, greebles, vents) ----
    _buildHullDetails() {
        // Panel line grooves (thin dark strips)
        const lineGeo = new THREE.BoxGeometry(0.02, 0.02, 2.5);

        // Dorsal panel lines
        mergeInto(this.group, lineGeo, this.structMat, [0.5, 0.34, 0], null, null, false);
        mergeInto(this.group, lineGeo, this.structMat, [-0.5, 0.34, 0], null, null, false);

        // Side panel lines (horizontal)
        const sideLineGeo = new THREE.BoxGeometry(0.02, 0.02, 3.5);
        mergeInto(this.group, sideLineGeo, this.structMat, [0.95, 0.05, -0.3], null, null, false);
        mergeInto(this.group, sideLineGeo, this.structMat, [-0.95, 0.05, -0.3], null, null, false);

        // Thruster vents (small rectangular openings on top-rear)
        const ventGeo = new THREE.BoxGeometry(0.15, 0.04, 0.25);
        mergeInto(this.group, ventGeo, this.structMat, [0.3, 0.36, -1.5], null, null, false);
        mergeInto(this.group, ventGeo, this.structMat, [-0.3, 0.36, -1.5], null, null, false);

        // Antenna nub on nose
        const antennaGeo = new THREE.CylinderGeometry(0.01, 0.02, 0.25, 4);
        mergeInto(this.group, antennaGeo, this.structMat, [0, 0.2, 2.8], null, null, false);

        // Belly intake scoops
        const scoopGeo = new THREE.BoxGeometry(0.3, 0.08, 0.5);
        mergeInto(this.group, scoopGeo, this.structMat, [0.4, -0.32, 0.5]);
        mergeInto(this.group, scoopGeo, this.structMat, [-0.4, -0.32, 0.5]);

        // Rear tail light (white)
        const tailLightGeo = new THREE.SphereGeometry(0.04, 4, 4);
        const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        mergeInto(this.group, tailLightGeo, tailLightMat, [0, 0.35, -2.7], null, null, false);
    }

    // ---- LANDING GEAR ----
    _buildLandingGear() {
        this.landingGear = new THREE.Group();

        const legMat = this.structMat;
        const padGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.04, 8);
        const strutGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.65, 5);
        const shockGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.25, 5);

        // 3-point landing gear: 2 front, 1 rear
        const gearPositions = [
            { pos: [0.7, -0.55, 1.0], label: 'front-right' },
            { pos: [-0.7, -0.55, 1.0], label: 'front-left' },
            { pos: [0, -0.55, -1.8], label: 'rear-center' },
        ];

        for (const gear of gearPositions) {
            const [gx, gy, gz] = gear.pos;

            // Main strut
            const strut = new THREE.Mesh(strutGeo, legMat);
            strut.position.set(gx, gy, gz);
            strut.castShadow = true;
            this.landingGear.add(strut);

            // Shock absorber (wider cylinder overlapping strut top)
            const shock = new THREE.Mesh(shockGeo, legMat);
            shock.position.set(gx, gy + 0.25, gz);
            this.landingGear.add(shock);

            // Foot pad
            const pad = new THREE.Mesh(padGeo, legMat);
            pad.position.set(gx, gy - 0.34, gz);
            pad.castShadow = true;
            this.landingGear.add(pad);
        }

        this.group.add(this.landingGear);
    }

    // ========================================================
    // RUNTIME UPDATES
    // ========================================================

    /**
     * Update engine glow based on thrust.
     * @param {number} thrust - 0 to 1
     * @param {number} time - elapsed time for pulse
     */
    updateEngines(thrust, time) {
        for (let i = 0; i < this.engineGlows.length; i++) {
            const glow = this.engineGlows[i];
            const isCore = i % 2 === 1; // Every other entry is the bright core

            const pulse = 0.7 + Math.sin(time * 12 + i * 0.5) * 0.15;
            const intensity = thrust * pulse;

            if (isCore) {
                glow.material.opacity = 0.2 + intensity * 0.8;
                glow.scale.setScalar(0.6 + intensity * 0.6);
            } else {
                glow.material.opacity = 0.3 + intensity * 0.7;
                glow.scale.setScalar(0.8 + intensity * 0.4);
            }
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
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
}
