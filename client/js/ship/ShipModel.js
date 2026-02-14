/**
 * THE GALACTIC ORDER — "Voidmoth" Mk-I Starter Ship
 *
 * Professional-grade, multi-layered NMS-style fighter/explorer spacecraft
 * built entirely from Three.js primitives.  No external assets required.
 *
 * Design language:
 *   - Layered hull plating with visible panel seams
 *   - Pointed nose with sensor array
 *   - Bubble cockpit with structural frame ribs
 *   - Swept delta wings with leading-edge accents
 *   - Wing-mounted engine nacelles on short pylons
 *   - Tall dorsal stabiliser fin + ventral strake
 *   - Multiple engine glow rings & running lights
 *   - Detailed landing gear with struts and pads
 */

import * as THREE from 'three';

// ============================================================
// HELPERS
// ============================================================

/** Convenience — create a mesh, position it, optionally rotate & scale. */
function _mesh(geo, mat, pos, rot, scl) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) {
        if (typeof scl === 'number') m.scale.setScalar(scl);
        else m.scale.set(scl[0], scl[1], scl[2]);
    }
    return m;
}

/** Taper a BoxGeometry along +Z (front) by a given ratio. */
function _taperBox(geo, zThreshold, xTaper, yTaper) {
    const pos = geo.getAttribute('position');
    const halfDepth = geo.parameters.depth / 2;
    for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        if (z > zThreshold) {
            const t = (z - zThreshold) / (halfDepth - zThreshold);
            pos.setX(i, pos.getX(i) * (1 - t * xTaper));
            pos.setY(i, pos.getY(i) * (1 - t * yTaper));
        }
    }
    geo.computeVertexNormals();
    return geo;
}

// ============================================================
// SHIP MODEL
// ============================================================

export class ShipModel {
    /**
     * @param {Object} opts
     * @param {THREE.Color|number} opts.hullColor    Main hull plating
     * @param {THREE.Color|number} opts.accentColor  Wing / trim accents
     * @param {THREE.Color|number} opts.engineColor  Engine glow tint
     */
    constructor(opts = {}) {
        this.hullColor   = new THREE.Color(opts.hullColor   ?? 0x5a6577);
        this.accentColor = new THREE.Color(opts.accentColor ?? 0xb83232);
        this.engineColor = new THREE.Color(opts.engineColor ?? 0x33ddff);

        this.group        = new THREE.Group();
        this.engineGlows  = [];
        this.runningLights = [];
        this.landingGear  = null;

        this._build();
    }

    // --------------------------------------------------------
    // MATERIALS
    // --------------------------------------------------------
    _mats() {
        const hull = new THREE.MeshLambertMaterial({ color: this.hullColor, flatShading: true });
        const hullDark = new THREE.MeshLambertMaterial({
            color: new THREE.Color(this.hullColor).multiplyScalar(0.6),
            flatShading: true,
        });
        const accent = new THREE.MeshLambertMaterial({ color: this.accentColor, flatShading: true });
        const trim = new THREE.MeshLambertMaterial({ color: 0x2a2f38, flatShading: true });
        const chrome = new THREE.MeshLambertMaterial({ color: 0x8899aa, flatShading: true });
        const glass = new THREE.MeshLambertMaterial({
            color: 0x88ccff, transparent: true, opacity: 0.35,
        });
        const glassDark = new THREE.MeshLambertMaterial({
            color: 0x223344, transparent: true, opacity: 0.6,
        });
        const engine = new THREE.MeshBasicMaterial({
            color: this.engineColor, transparent: true, opacity: 0.85,
        });
        const engineInner = new THREE.MeshBasicMaterial({
            color: 0xffffff, transparent: true, opacity: 0.9,
        });
        const lightRed = new THREE.MeshBasicMaterial({ color: 0xff2222 });
        const lightGreen = new THREE.MeshBasicMaterial({ color: 0x22ff44 });
        const lightWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
        return { hull, hullDark, accent, trim, chrome, glass, glassDark,
                 engine, engineInner, lightRed, lightGreen, lightWhite };
    }

    // --------------------------------------------------------
    // BUILD
    // --------------------------------------------------------
    _build() {
        const M = this._mats();

        // Inner hull group rotated 180° so the nose faces -Z (Three.js forward).
        // The flight controller uses getWorldDirection() which returns -Z,
        // so the visual model must point that way too.
        this._hull = new THREE.Group();
        this._hull.rotation.y = Math.PI;

        this._buildFuselage(M);
        this._buildNose(M);
        this._buildCockpit(M);
        this._buildWings(M);
        this._buildNacelles(M);
        this._buildDorsalFin(M);
        this._buildVentralStrake(M);
        this._buildRearSection(M);
        this._buildHullDetail(M);
        this._buildRunningLights(M);
        this._buildLandingGear(M);

        this.group.add(this._hull);

        // Scale the whole ship
        this.group.scale.setScalar(1.5);
    }

    // --------------------------------------------------------
    // FUSELAGE — multi-layered hull
    // --------------------------------------------------------
    _buildFuselage(M) {
        // Core fuselage — elongated, tapered front
        const coreGeo = _taperBox(
            new THREE.BoxGeometry(1.5, 0.65, 5.2, 1, 1, 4),
            0.6, 0.45, 0.35
        );
        this._hull.add(_mesh(coreGeo, M.hull, [0, 0, 0]));

        // Upper hull plate — sits slightly above core, shorter
        const upperGeo = _taperBox(
            new THREE.BoxGeometry(1.35, 0.12, 4.4, 1, 1, 3),
            0.4, 0.5, 0.0
        );
        this._hull.add(_mesh(upperGeo, M.hullDark, [0, 0.35, -0.2]));

        // Lower hull plate — flat belly panel
        const lowerGeo = new THREE.BoxGeometry(1.3, 0.08, 4.0);
        this._hull.add(_mesh(lowerGeo, M.hullDark, [0, -0.35, -0.3]));

        // Spine ridge — thin raised strip along centerline
        const spineGeo = new THREE.BoxGeometry(0.12, 0.08, 3.6);
        this._hull.add(_mesh(spineGeo, M.accent, [0, 0.42, -0.5]));

        // Side hull panels — left & right
        for (const sign of [-1, 1]) {
            const sideGeo = new THREE.BoxGeometry(0.08, 0.45, 4.2);
            this._hull.add(_mesh(sideGeo, M.hullDark, [sign * 0.78, 0.0, -0.2]));

            // Side accent stripe
            const stripeGeo = new THREE.BoxGeometry(0.03, 0.10, 3.6);
            this._hull.add(_mesh(stripeGeo, M.accent, [sign * 0.82, 0.12, -0.3]));
        }

        // Rear wall / engine bay housing
        const rearGeo = new THREE.BoxGeometry(1.5, 0.6, 0.15);
        this._hull.add(_mesh(rearGeo, M.trim, [0, 0, -2.65]));
    }

    // --------------------------------------------------------
    // NOSE CONE — pointed, with sensor tip
    // --------------------------------------------------------
    _buildNose(M) {
        // Primary nose cone
        const noseGeo = new THREE.ConeGeometry(0.35, 1.4, 6);
        noseGeo.rotateX(-Math.PI / 2);
        this._hull.add(_mesh(noseGeo, M.hull, [0, 0.0, 3.3]));

        // Secondary nose shroud — slightly wider, shorter, for layered look
        const shroudGeo = new THREE.ConeGeometry(0.45, 0.8, 6);
        shroudGeo.rotateX(-Math.PI / 2);
        this._hull.add(_mesh(shroudGeo, M.hullDark, [0, -0.02, 2.8]));

        // Sensor dish at tip
        const sensorGeo = new THREE.SphereGeometry(0.06, 6, 4);
        this._hull.add(_mesh(sensorGeo, M.chrome, [0, 0, 4.05]));

        // Nose accent ring
        const ringGeo = new THREE.TorusGeometry(0.32, 0.03, 4, 8);
        this._hull.add(_mesh(ringGeo, M.accent, [0, 0, 2.55], [Math.PI / 2, 0, 0]));

        // Side intake slits
        for (const sign of [-1, 1]) {
            const intakeGeo = new THREE.BoxGeometry(0.06, 0.15, 0.6);
            this._hull.add(_mesh(intakeGeo, M.trim, [sign * 0.42, 0.0, 2.2]));
            // Intake inner glow hint
            const innerGeo = new THREE.BoxGeometry(0.03, 0.08, 0.5);
            this._hull.add(_mesh(innerGeo, M.engine, [sign * 0.42, 0.0, 2.2]));
        }
    }

    // --------------------------------------------------------
    // COCKPIT — bubble canopy with frame ribs
    // --------------------------------------------------------
    _buildCockpit(M) {
        // Main canopy — hemisphere, stretched
        const canopyGeo = new THREE.SphereGeometry(0.52, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
        const canopy = _mesh(canopyGeo, M.glass, [0, 0.28, 1.3], null, [1.0, 0.7, 1.35]);
        this._hull.add(canopy);

        // Canopy frame ribs — 3 arcs over the bubble
        const ribGeo = new THREE.TorusGeometry(0.50, 0.025, 4, 12, Math.PI);
        for (let i = 0; i < 3; i++) {
            const angle = -0.4 + i * 0.4;
            const rib = _mesh(ribGeo, M.chrome, [0, 0.28, 1.3 + i * 0.18],
                              [0, angle, 0], [1.0, 0.7, 0.7]);
            this._hull.add(rib);
        }

        // Canopy base ring
        const baseRingGeo = new THREE.TorusGeometry(0.50, 0.035, 4, 12);
        const baseRing = _mesh(baseRingGeo, M.trim, [0, 0.28, 1.3],
                               [Math.PI / 2, 0, 0], [1.0, 1.35, 1.0]);
        this._hull.add(baseRing);

        // Interior hint — dark volume inside cockpit
        const interiorGeo = new THREE.BoxGeometry(0.5, 0.15, 0.6);
        this._hull.add(_mesh(interiorGeo, M.glassDark, [0, 0.18, 1.3]));

        // Headrest / seat back visible through glass
        const seatGeo = new THREE.BoxGeometry(0.25, 0.25, 0.12);
        this._hull.add(_mesh(seatGeo, M.trim, [0, 0.22, 0.85]));
    }

    // --------------------------------------------------------
    // WINGS — swept delta with leading-edge accents
    // --------------------------------------------------------
    _buildWings(M) {
        for (const sign of [-1, 1]) {
            // Main wing surface — extruded shape
            const shape = new THREE.Shape();
            shape.moveTo(0, 0);
            shape.lineTo(3.2, -0.15);   // Tip leading edge
            shape.lineTo(3.0, -0.35);   // Tip trailing edge
            shape.lineTo(2.5, -1.3);    // Swept trailing edge
            shape.lineTo(0, -0.9);      // Root trailing edge
            shape.closePath();

            const wingGeo = new THREE.ExtrudeGeometry(shape, {
                depth: 0.10, bevelEnabled: false,
            });
            const wing = _mesh(wingGeo, M.hull, [sign * 0.65, -0.08, 0.7]);
            wing.scale.x = sign;
            this._hull.add(wing);

            // Wing upper panel — thin plate for layered look
            const panelShape = new THREE.Shape();
            panelShape.moveTo(0.2, -0.15);
            panelShape.lineTo(2.6, -0.20);
            panelShape.lineTo(2.2, -0.95);
            panelShape.lineTo(0.2, -0.60);
            panelShape.closePath();

            const panelGeo = new THREE.ExtrudeGeometry(panelShape, {
                depth: 0.04, bevelEnabled: false,
            });
            const panel = _mesh(panelGeo, M.hullDark, [sign * 0.65, -0.02, 0.6]);
            panel.scale.x = sign;
            this._hull.add(panel);

            // Leading edge accent strip
            const leShape = new THREE.Shape();
            leShape.moveTo(0, 0.02);
            leShape.lineTo(3.1, -0.12);
            leShape.lineTo(3.2, -0.18);
            leShape.lineTo(0, -0.04);
            leShape.closePath();

            const leGeo = new THREE.ExtrudeGeometry(leShape, {
                depth: 0.04, bevelEnabled: false,
            });
            const le = _mesh(leGeo, M.accent, [sign * 0.65, -0.06, 0.72]);
            le.scale.x = sign;
            this._hull.add(le);

            // Wing root fairing — smooth blend to fuselage
            const fairingGeo = new THREE.CylinderGeometry(0.18, 0.3, 0.9, 6);
            fairingGeo.rotateZ(Math.PI / 2);
            const fairing = _mesh(fairingGeo, M.hull,
                [sign * 0.55, -0.12, 0.1]);
            fairing.scale.x = sign;
            this._hull.add(fairing);

            // Wing tip fin — small vertical stabiliser
            const tipFinGeo = new THREE.BoxGeometry(0.05, 0.45, 0.5);
            this._hull.add(_mesh(tipFinGeo, M.hullDark,
                [sign * 3.75, 0.05, 0.25]));

            // Wing tip fin accent cap
            const capGeo = new THREE.BoxGeometry(0.06, 0.06, 0.5);
            this._hull.add(_mesh(capGeo, M.accent,
                [sign * 3.75, 0.28, 0.25]));

            // Under-wing weapon hardpoint
            const hardpointGeo = new THREE.BoxGeometry(0.12, 0.08, 0.4);
            this._hull.add(_mesh(hardpointGeo, M.trim,
                [sign * 1.6, -0.28, 0.1]));
        }
    }

    // --------------------------------------------------------
    // ENGINE NACELLES — wing-mounted pods on pylons
    // --------------------------------------------------------
    _buildNacelles(M) {
        for (const sign of [-1, 1]) {
            const nx = sign * 2.3;
            const ny = -0.12;
            const nz = -0.5;

            // Pylon connecting nacelle to wing
            const pylonGeo = new THREE.BoxGeometry(0.08, 0.28, 0.7);
            this._hull.add(_mesh(pylonGeo, M.hull, [nx, ny + 0.1, nz + 0.1]));

            // Main nacelle body
            const bodyGeo = new THREE.CylinderGeometry(0.22, 0.26, 1.5, 8);
            bodyGeo.rotateX(Math.PI / 2);
            this._hull.add(_mesh(bodyGeo, M.hull, [nx, ny, nz]));

            // Nacelle front intake cone
            const intakeGeo = new THREE.ConeGeometry(0.20, 0.4, 8);
            intakeGeo.rotateX(-Math.PI / 2);
            this._hull.add(_mesh(intakeGeo, M.trim, [nx, ny, nz + 1.0]));

            // Intake ring
            const iRingGeo = new THREE.TorusGeometry(0.22, 0.025, 4, 8);
            this._hull.add(_mesh(iRingGeo, M.chrome,
                [nx, ny, nz + 0.75], [Math.PI / 2, 0, 0]));

            // Nacelle rear housing — wider, for exhaust
            const rearGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.3, 8);
            rearGeo.rotateX(Math.PI / 2);
            this._hull.add(_mesh(rearGeo, M.hullDark, [nx, ny, nz - 0.85]));

            // Exhaust nozzle ring
            const nozzleGeo = new THREE.TorusGeometry(0.25, 0.03, 4, 8);
            this._hull.add(_mesh(nozzleGeo, M.trim,
                [nx, ny, nz - 1.0], [Math.PI / 2, 0, 0]));

            // Engine glow disc — outer
            const glowGeo = new THREE.CircleGeometry(0.24, 10);
            const glow = _mesh(glowGeo, M.engine, [nx, ny, nz - 1.02],
                               [0, Math.PI, 0]);
            this._hull.add(glow);
            this.engineGlows.push(glow);

            // Engine glow disc — inner bright core
            const coreGeo = new THREE.CircleGeometry(0.12, 8);
            const core = _mesh(coreGeo, M.engineInner, [nx, ny, nz - 1.03],
                               [0, Math.PI, 0]);
            this._hull.add(core);
            this.engineGlows.push(core);

            // Heat dissipation fins (3 per nacelle)
            for (let f = 0; f < 3; f++) {
                const angle = (f / 3) * Math.PI * 2;
                const finGeo = new THREE.BoxGeometry(0.03, 0.08, 0.25);
                const fin = _mesh(finGeo, M.accent,
                    [nx + Math.cos(angle) * 0.28, ny + Math.sin(angle) * 0.28, nz - 0.6]);
                fin.rotation.z = angle;
                this._hull.add(fin);
            }

            // Nacelle accent stripe
            const stripeGeo = new THREE.BoxGeometry(0.03, 0.04, 1.2);
            this._hull.add(_mesh(stripeGeo, M.accent, [nx, ny + 0.26, nz]));
        }
    }

    // --------------------------------------------------------
    // DORSAL FIN — tall swept stabiliser
    // --------------------------------------------------------
    _buildDorsalFin(M) {
        // Main fin body — extruded shape
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, 1.1);       // Top
        shape.lineTo(-0.7, 0.6);    // Swept tip
        shape.lineTo(-1.0, 0);      // Trailing edge
        shape.closePath();

        const finGeo = new THREE.ExtrudeGeometry(shape, {
            depth: 0.06, bevelEnabled: false,
        });
        this._hull.add(_mesh(finGeo, M.hull, [0, 0.3, -0.8],
            [0, Math.PI / 2, 0], [1, 1, 1]));

        // Fin leading edge accent
        const leShape = new THREE.Shape();
        leShape.moveTo(0, 0);
        leShape.lineTo(0, 1.05);
        leShape.lineTo(0, 0.95);
        leShape.lineTo(-0.15, 0);
        leShape.closePath();

        const leGeo = new THREE.ExtrudeGeometry(leShape, {
            depth: 0.07, bevelEnabled: false,
        });
        this._hull.add(_mesh(leGeo, M.accent, [0, 0.32, -0.78],
            [0, Math.PI / 2, 0]));

        // Fin tip cap
        const capGeo = new THREE.SphereGeometry(0.05, 4, 4);
        this._hull.add(_mesh(capGeo, M.chrome, [0, 1.42, -0.8]));

        // Antenna mast on top
        const antennaGeo = new THREE.CylinderGeometry(0.01, 0.015, 0.35, 4);
        this._hull.add(_mesh(antennaGeo, M.chrome, [0, 1.6, -0.8]));
    }

    // --------------------------------------------------------
    // VENTRAL STRAKE — small belly fin
    // --------------------------------------------------------
    _buildVentralStrake(M) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, -0.35);
        shape.lineTo(-0.5, -0.1);
        shape.lineTo(-0.6, 0);
        shape.closePath();

        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: 0.05, bevelEnabled: false,
        });
        this._hull.add(_mesh(geo, M.hullDark, [0, -0.32, -0.6],
            [0, Math.PI / 2, 0]));
    }

    // --------------------------------------------------------
    // REAR SECTION — central exhaust + structural detail
    // --------------------------------------------------------
    _buildRearSection(M) {
        // Central thruster housing
        const housingGeo = new THREE.CylinderGeometry(0.30, 0.35, 0.6, 8);
        housingGeo.rotateX(Math.PI / 2);
        this._hull.add(_mesh(housingGeo, M.trim, [0, 0, -2.5]));

        // Central exhaust nozzle ring
        const nozzleGeo = new THREE.TorusGeometry(0.32, 0.035, 4, 10);
        this._hull.add(_mesh(nozzleGeo, M.chrome,
            [0, 0, -2.82], [Math.PI / 2, 0, 0]));

        // Central engine glow
        const glowGeo = new THREE.CircleGeometry(0.30, 10);
        const glow = _mesh(glowGeo, M.engine, [0, 0, -2.84],
                           [0, Math.PI, 0]);
        this._hull.add(glow);
        this.engineGlows.push(glow);

        const coreGeo = new THREE.CircleGeometry(0.15, 8);
        const core = _mesh(coreGeo, M.engineInner, [0, 0, -2.85],
                           [0, Math.PI, 0]);
        this._hull.add(core);
        this.engineGlows.push(core);

        // Rear cross-braces
        for (const sign of [-1, 1]) {
            const braceGeo = new THREE.BoxGeometry(0.6, 0.06, 0.08);
            this._hull.add(_mesh(braceGeo, M.trim,
                [sign * 0.4, 0.15, -2.4]));
            this._hull.add(_mesh(braceGeo, M.trim,
                [sign * 0.4, -0.15, -2.4]));
        }

        // Rear hull taper plates
        for (const sign of [-1, 1]) {
            const plateGeo = new THREE.BoxGeometry(0.1, 0.5, 0.8);
            this._hull.add(_mesh(plateGeo, M.hullDark,
                [sign * 0.6, 0, -2.3]));
        }
    }

    // --------------------------------------------------------
    // HULL DETAIL — panel lines, greebles, structural ribs
    // --------------------------------------------------------
    _buildHullDetail(M) {
        // Cross-fuselage panel lines (ribs)
        for (let i = 0; i < 5; i++) {
            const z = 1.8 - i * 0.9;
            const ribGeo = new THREE.BoxGeometry(1.55, 0.04, 0.03);
            this._hull.add(_mesh(ribGeo, M.trim, [0, 0.33, z]));
        }

        // Side vent greebles
        for (const sign of [-1, 1]) {
            // Forward vent
            const ventGeo = new THREE.BoxGeometry(0.04, 0.12, 0.35);
            this._hull.add(_mesh(ventGeo, M.trim,
                [sign * 0.80, 0.0, 1.6]));

            // Mid greeble box
            const greeble1 = new THREE.BoxGeometry(0.06, 0.10, 0.20);
            this._hull.add(_mesh(greeble1, M.chrome,
                [sign * 0.82, -0.10, 0.5]));

            // Rear vent
            const greeble2 = new THREE.BoxGeometry(0.04, 0.08, 0.30);
            this._hull.add(_mesh(greeble2, M.trim,
                [sign * 0.80, 0.0, -1.2]));

            // Lower hull tech panels
            for (let p = 0; p < 3; p++) {
                const pz = 1.0 - p * 0.8;
                const techGeo = new THREE.BoxGeometry(0.35, 0.03, 0.25);
                this._hull.add(_mesh(techGeo, M.trim,
                    [sign * 0.35, -0.36, pz]));
            }
        }

        // Top sensor blister
        const blisterGeo = new THREE.SphereGeometry(0.12, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        this._hull.add(_mesh(blisterGeo, M.chrome, [0, 0.42, 0.4]));

        // Forward accent chevron on upper hull
        const chevronShape = new THREE.Shape();
        chevronShape.moveTo(0, 0);
        chevronShape.lineTo(0.45, -0.25);
        chevronShape.lineTo(0.40, -0.25);
        chevronShape.lineTo(0, -0.04);
        chevronShape.lineTo(-0.40, -0.25);
        chevronShape.lineTo(-0.45, -0.25);
        chevronShape.closePath();

        const chevronGeo = new THREE.ExtrudeGeometry(chevronShape, {
            depth: 0.02, bevelEnabled: false,
        });
        this._hull.add(_mesh(chevronGeo, M.accent, [0, 0.42, 1.7],
            [Math.PI / 2, 0, 0]));
    }

    // --------------------------------------------------------
    // RUNNING LIGHTS — red port, green starboard, white tail
    // --------------------------------------------------------
    _buildRunningLights(M) {
        const lightGeo = new THREE.SphereGeometry(0.035, 4, 4);

        // Port (left) — red
        const portLight = _mesh(lightGeo, M.lightRed, [-3.75, 0.30, 0.25]);
        this._hull.add(portLight);
        this.runningLights.push(portLight);

        // Starboard (right) — green
        const stbdLight = _mesh(lightGeo, M.lightGreen, [3.75, 0.30, 0.25]);
        this._hull.add(stbdLight);
        this.runningLights.push(stbdLight);

        // Tail — white
        const tailLight = _mesh(lightGeo, M.lightWhite, [0, 0.55, -2.3]);
        this._hull.add(tailLight);
        this.runningLights.push(tailLight);

        // Nose tip light — white
        const noseLight = _mesh(lightGeo, M.lightWhite, [0, 0.08, 3.95]);
        this._hull.add(noseLight);
        this.runningLights.push(noseLight);
    }

    // --------------------------------------------------------
    // LANDING GEAR — 3 articulated struts with pads
    // --------------------------------------------------------
    _buildLandingGear(M) {
        this.landingGear = new THREE.Group();

        const strutMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a });
        const padMat   = new THREE.MeshLambertMaterial({ color: 0x555555 });
        const pistonMat = new THREE.MeshLambertMaterial({ color: 0x888888 });

        const positions = [
            { x:  0.7, z:  1.2, name: 'front-right' },
            { x: -0.7, z:  1.2, name: 'front-left'  },
            { x:  0,   z: -2.0, name: 'rear-center'  },
        ];

        for (const pos of positions) {
            // Upper strut
            const upperGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.35, 5);
            const upper = _mesh(upperGeo, strutMat, [pos.x, -0.5, pos.z]);
            this.landingGear.add(upper);

            // Hydraulic piston (inner)
            const pistonGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.25, 4);
            const piston = _mesh(pistonGeo, pistonMat, [pos.x, -0.75, pos.z]);
            this.landingGear.add(piston);

            // Lower strut
            const lowerGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.2, 5);
            const lower = _mesh(lowerGeo, strutMat, [pos.x, -0.92, pos.z]);
            this.landingGear.add(lower);

            // Foot pad
            const padGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.04, 8);
            const pad = _mesh(padGeo, padMat, [pos.x, -1.04, pos.z]);
            this.landingGear.add(pad);

            // Mounting bracket at hull
            const bracketGeo = new THREE.BoxGeometry(0.15, 0.08, 0.15);
            const bracket = _mesh(bracketGeo, strutMat, [pos.x, -0.34, pos.z]);
            this.landingGear.add(bracket);
        }

        this._hull.add(this.landingGear);
    }

    // ============================================================
    // PUBLIC API (unchanged contract)
    // ============================================================

    /**
     * Animate engine glow based on thrust level.
     * @param {number} thrust 0–1
     * @param {number} time   elapsed seconds (for pulse)
     */
    updateEngines(thrust, time) {
        for (let i = 0; i < this.engineGlows.length; i++) {
            const glow = this.engineGlows[i];
            const isCore = i % 2 === 1; // every other glow is an inner core
            const pulse = 0.7 + Math.sin(time * 12 + i * 0.5) * 0.15;
            const intensity = thrust * pulse;
            glow.material.opacity = (isCore ? 0.4 : 0.25) + intensity * 0.6;
            glow.scale.setScalar((isCore ? 0.6 : 0.8) + intensity * 0.5);
        }
    }

    /** Show / hide landing gear. */
    setLandingGear(deployed) {
        if (this.landingGear) this.landingGear.visible = deployed;
    }

    /** Add ship group to a Three.js scene. */
    addToScene(scene) { scene.add(this.group); }

    /** Remove ship group from scene. */
    removeFromScene(scene) { scene.remove(this.group); }

    /** Dispose all geometry and materials. */
    dispose() {
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
}
