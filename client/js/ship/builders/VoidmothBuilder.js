/**
 * THE GALACTIC ORDER — Voidmoth Mk-II Builder
 *
 * Fighter class. 1-2 crew (pilot + gunner).
 * Swept delta wings, twin nacelles on pylons, bubble cockpit,
 * tall dorsal fin, pointed nose with sensor array.
 *
 * Extracted from the original ShipModel._build() monolith,
 * now using PBR materials and the builder pattern.
 */

import * as THREE from 'three';
import { ShipBuilder, _mesh, _taperBox } from './ShipBuilder.js';
import { CREW_ROLES } from '../ShipClassRegistry.js';

export class VoidmothBuilder extends ShipBuilder {
    constructor() {
        super();
        this.bounds = { x: 7.5, y: 1.8, z: 8.5 };
    }

    build(M) {
        // Inner hull group rotated 180° so nose faces -Z (Three.js forward)
        this.hull.rotation.y = Math.PI;

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

        // Station positions (ship-local coords)
        this.stationPositions = [
            { role: CREW_ROLES.PILOT, x: 0, y: 0.2, z: 1.3, lookDir: [0, 0, 1] },
            { role: CREW_ROLES.GUNNER, x: 0, y: 0.5, z: -1.0, lookDir: [0, 0, -1] },
        ];

        return this;
    }

    // --------------------------------------------------------
    // FUSELAGE — multi-layered hull
    // --------------------------------------------------------
    _buildFuselage(M) {
        const coreGeo = _taperBox(
            new THREE.BoxGeometry(1.5, 0.65, 5.2, 1, 1, 4),
            0.6, 0.45, 0.35
        );
        this.hull.add(_mesh(coreGeo, M.hull, [0, 0, 0]));

        const upperGeo = _taperBox(
            new THREE.BoxGeometry(1.35, 0.12, 4.4, 1, 1, 3),
            0.4, 0.5, 0.0
        );
        this.hull.add(_mesh(upperGeo, M.hullDark, [0, 0.35, -0.2]));

        const lowerGeo = new THREE.BoxGeometry(1.3, 0.08, 4.0);
        this.hull.add(_mesh(lowerGeo, M.hullDark, [0, -0.35, -0.3]));

        const spineGeo = new THREE.BoxGeometry(0.12, 0.08, 3.6);
        this.hull.add(_mesh(spineGeo, M.accent, [0, 0.42, -0.5]));

        for (const sign of [-1, 1]) {
            const sideGeo = new THREE.BoxGeometry(0.08, 0.45, 4.2);
            this.hull.add(_mesh(sideGeo, M.hullDark, [sign * 0.78, 0.0, -0.2]));

            const stripeGeo = new THREE.BoxGeometry(0.03, 0.10, 3.6);
            this.hull.add(_mesh(stripeGeo, M.accent, [sign * 0.82, 0.12, -0.3]));
        }

        const rearGeo = new THREE.BoxGeometry(1.5, 0.6, 0.15);
        this.hull.add(_mesh(rearGeo, M.trim, [0, 0, -2.65]));
    }

    // --------------------------------------------------------
    // NOSE CONE
    // --------------------------------------------------------
    _buildNose(M) {
        const noseGeo = new THREE.ConeGeometry(0.35, 1.4, 6);
        noseGeo.rotateX(-Math.PI / 2);
        this.hull.add(_mesh(noseGeo, M.hull, [0, 0.0, 3.3]));

        const shroudGeo = new THREE.ConeGeometry(0.45, 0.8, 6);
        shroudGeo.rotateX(-Math.PI / 2);
        this.hull.add(_mesh(shroudGeo, M.hullDark, [0, -0.02, 2.8]));

        const sensorGeo = new THREE.SphereGeometry(0.06, 6, 4);
        this.hull.add(_mesh(sensorGeo, M.chrome, [0, 0, 4.05]));

        const ringGeo = new THREE.TorusGeometry(0.32, 0.03, 4, 8);
        this.hull.add(_mesh(ringGeo, M.accent, [0, 0, 2.55], [Math.PI / 2, 0, 0]));

        for (const sign of [-1, 1]) {
            const intakeGeo = new THREE.BoxGeometry(0.06, 0.15, 0.6);
            this.hull.add(_mesh(intakeGeo, M.trim, [sign * 0.42, 0.0, 2.2]));
            const innerGeo = new THREE.BoxGeometry(0.03, 0.08, 0.5);
            this.hull.add(_mesh(innerGeo, M.engine, [sign * 0.42, 0.0, 2.2]));
        }
    }

    // --------------------------------------------------------
    // COCKPIT — bubble canopy with frame ribs
    // --------------------------------------------------------
    _buildCockpit(M) {
        const canopyGeo = new THREE.SphereGeometry(0.52, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
        const canopy = _mesh(canopyGeo, M.glass, [0, 0.28, 1.3], null, [1.0, 0.7, 1.35]);
        this.hull.add(canopy);

        const ribGeo = new THREE.TorusGeometry(0.50, 0.025, 4, 12, Math.PI);
        for (let i = 0; i < 3; i++) {
            const angle = -0.4 + i * 0.4;
            const rib = _mesh(ribGeo, M.chrome, [0, 0.28, 1.3 + i * 0.18],
                              [0, angle, 0], [1.0, 0.7, 0.7]);
            this.hull.add(rib);
        }

        const baseRingGeo = new THREE.TorusGeometry(0.50, 0.035, 4, 12);
        const baseRing = _mesh(baseRingGeo, M.trim, [0, 0.28, 1.3],
                               [Math.PI / 2, 0, 0], [1.0, 1.35, 1.0]);
        this.hull.add(baseRing);

        const interiorGeo = new THREE.BoxGeometry(0.5, 0.15, 0.6);
        this.hull.add(_mesh(interiorGeo, M.glassDark, [0, 0.18, 1.3]));

        const seatGeo = new THREE.BoxGeometry(0.25, 0.25, 0.12);
        this.hull.add(_mesh(seatGeo, M.trim, [0, 0.22, 0.85]));
    }

    // --------------------------------------------------------
    // WINGS — swept delta with leading-edge accents
    // --------------------------------------------------------
    _buildWings(M) {
        for (const sign of [-1, 1]) {
            const shape = new THREE.Shape();
            shape.moveTo(0, 0);
            shape.lineTo(3.2, -0.15);
            shape.lineTo(3.0, -0.35);
            shape.lineTo(2.5, -1.3);
            shape.lineTo(0, -0.9);
            shape.closePath();

            const wingGeo = new THREE.ExtrudeGeometry(shape, {
                depth: 0.10, bevelEnabled: false,
            });
            const wing = _mesh(wingGeo, M.hull, [sign * 0.65, -0.08, 0.7]);
            wing.scale.x = sign;
            this.hull.add(wing);

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
            this.hull.add(panel);

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
            this.hull.add(le);

            const fairingGeo = new THREE.CylinderGeometry(0.18, 0.3, 0.9, 6);
            fairingGeo.rotateZ(Math.PI / 2);
            const fairing = _mesh(fairingGeo, M.hull,
                [sign * 0.55, -0.12, 0.1]);
            fairing.scale.x = sign;
            this.hull.add(fairing);

            const tipFinGeo = new THREE.BoxGeometry(0.05, 0.45, 0.5);
            this.hull.add(_mesh(tipFinGeo, M.hullDark,
                [sign * 3.75, 0.05, 0.25]));

            const capGeo = new THREE.BoxGeometry(0.06, 0.06, 0.5);
            this.hull.add(_mesh(capGeo, M.accent,
                [sign * 3.75, 0.28, 0.25]));

            const hardpointGeo = new THREE.BoxGeometry(0.12, 0.08, 0.4);
            this.hull.add(_mesh(hardpointGeo, M.trim,
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

            const pylonGeo = new THREE.BoxGeometry(0.08, 0.28, 0.7);
            this.hull.add(_mesh(pylonGeo, M.hull, [nx, ny + 0.1, nz + 0.1]));

            const bodyGeo = new THREE.CylinderGeometry(0.22, 0.26, 1.5, 8);
            bodyGeo.rotateX(Math.PI / 2);
            this.hull.add(_mesh(bodyGeo, M.hull, [nx, ny, nz]));

            const intakeGeo = new THREE.ConeGeometry(0.20, 0.4, 8);
            intakeGeo.rotateX(-Math.PI / 2);
            this.hull.add(_mesh(intakeGeo, M.trim, [nx, ny, nz + 1.0]));

            const iRingGeo = new THREE.TorusGeometry(0.22, 0.025, 4, 8);
            this.hull.add(_mesh(iRingGeo, M.chrome,
                [nx, ny, nz + 0.75], [Math.PI / 2, 0, 0]));

            const rearGeo = new THREE.CylinderGeometry(0.28, 0.24, 0.3, 8);
            rearGeo.rotateX(Math.PI / 2);
            this.hull.add(_mesh(rearGeo, M.hullDark, [nx, ny, nz - 0.85]));

            const nozzleGeo = new THREE.TorusGeometry(0.25, 0.03, 4, 8);
            this.hull.add(_mesh(nozzleGeo, M.trim,
                [nx, ny, nz - 1.0], [Math.PI / 2, 0, 0]));

            // Engine glow discs (kept for legacy compat + EngineEffects fallback)
            const glowGeo = new THREE.CircleGeometry(0.24, 10);
            const glow = _mesh(glowGeo, M.engine, [nx, ny, nz - 1.02],
                               [0, Math.PI, 0]);
            this.hull.add(glow);
            this.engineGlows.push(glow);

            const coreGeo = new THREE.CircleGeometry(0.12, 8);
            const core = _mesh(coreGeo, M.engineInner, [nx, ny, nz - 1.03],
                               [0, Math.PI, 0]);
            this.hull.add(core);
            this.engineGlows.push(core);

            // Register engine position for EngineEffects
            this.enginePositions.push({ x: nx, y: ny, z: nz - 1.0, radius: 0.24 });

            for (let f = 0; f < 3; f++) {
                const angle = (f / 3) * Math.PI * 2;
                const finGeo = new THREE.BoxGeometry(0.03, 0.08, 0.25);
                const fin = _mesh(finGeo, M.accent,
                    [nx + Math.cos(angle) * 0.28, ny + Math.sin(angle) * 0.28, nz - 0.6]);
                fin.rotation.z = angle;
                this.hull.add(fin);
            }

            const stripeGeo = new THREE.BoxGeometry(0.03, 0.04, 1.2);
            this.hull.add(_mesh(stripeGeo, M.accent, [nx, ny + 0.26, nz]));
        }
    }

    // --------------------------------------------------------
    // DORSAL FIN
    // --------------------------------------------------------
    _buildDorsalFin(M) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0, 1.1);
        shape.lineTo(-0.7, 0.6);
        shape.lineTo(-1.0, 0);
        shape.closePath();

        const finGeo = new THREE.ExtrudeGeometry(shape, {
            depth: 0.06, bevelEnabled: false,
        });
        this.hull.add(_mesh(finGeo, M.hull, [0, 0.3, -0.8],
            [0, Math.PI / 2, 0], [1, 1, 1]));

        const leShape = new THREE.Shape();
        leShape.moveTo(0, 0);
        leShape.lineTo(0, 1.05);
        leShape.lineTo(0, 0.95);
        leShape.lineTo(-0.15, 0);
        leShape.closePath();

        const leGeo = new THREE.ExtrudeGeometry(leShape, {
            depth: 0.07, bevelEnabled: false,
        });
        this.hull.add(_mesh(leGeo, M.accent, [0, 0.32, -0.78],
            [0, Math.PI / 2, 0]));

        const capGeo = new THREE.SphereGeometry(0.05, 4, 4);
        this.hull.add(_mesh(capGeo, M.chrome, [0, 1.42, -0.8]));

        const antennaGeo = new THREE.CylinderGeometry(0.01, 0.015, 0.35, 4);
        this.hull.add(_mesh(antennaGeo, M.chrome, [0, 1.6, -0.8]));
    }

    // --------------------------------------------------------
    // VENTRAL STRAKE
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
        this.hull.add(_mesh(geo, M.hullDark, [0, -0.32, -0.6],
            [0, Math.PI / 2, 0]));
    }

    // --------------------------------------------------------
    // REAR SECTION — central exhaust
    // --------------------------------------------------------
    _buildRearSection(M) {
        const housingGeo = new THREE.CylinderGeometry(0.30, 0.35, 0.6, 8);
        housingGeo.rotateX(Math.PI / 2);
        this.hull.add(_mesh(housingGeo, M.trim, [0, 0, -2.5]));

        const nozzleGeo = new THREE.TorusGeometry(0.32, 0.035, 4, 10);
        this.hull.add(_mesh(nozzleGeo, M.chrome,
            [0, 0, -2.82], [Math.PI / 2, 0, 0]));

        const glowGeo = new THREE.CircleGeometry(0.30, 10);
        const glow = _mesh(glowGeo, M.engine, [0, 0, -2.84],
                           [0, Math.PI, 0]);
        this.hull.add(glow);
        this.engineGlows.push(glow);

        const coreGeo = new THREE.CircleGeometry(0.15, 8);
        const core = _mesh(coreGeo, M.engineInner, [0, 0, -2.85],
                           [0, Math.PI, 0]);
        this.hull.add(core);
        this.engineGlows.push(core);

        // Register central engine
        this.enginePositions.push({ x: 0, y: 0, z: -2.84, radius: 0.30 });

        for (const sign of [-1, 1]) {
            const braceGeo = new THREE.BoxGeometry(0.6, 0.06, 0.08);
            this.hull.add(_mesh(braceGeo, M.trim,
                [sign * 0.4, 0.15, -2.4]));
            this.hull.add(_mesh(braceGeo, M.trim,
                [sign * 0.4, -0.15, -2.4]));
        }

        for (const sign of [-1, 1]) {
            const plateGeo = new THREE.BoxGeometry(0.1, 0.5, 0.8);
            this.hull.add(_mesh(plateGeo, M.hullDark,
                [sign * 0.6, 0, -2.3]));
        }
    }

    // --------------------------------------------------------
    // HULL DETAIL — panel lines, greebles
    // --------------------------------------------------------
    _buildHullDetail(M) {
        for (let i = 0; i < 5; i++) {
            const z = 1.8 - i * 0.9;
            const ribGeo = new THREE.BoxGeometry(1.55, 0.04, 0.03);
            this.hull.add(_mesh(ribGeo, M.trim, [0, 0.33, z]));
        }

        for (const sign of [-1, 1]) {
            const ventGeo = new THREE.BoxGeometry(0.04, 0.12, 0.35);
            this.hull.add(_mesh(ventGeo, M.trim,
                [sign * 0.80, 0.0, 1.6]));

            const greeble1 = new THREE.BoxGeometry(0.06, 0.10, 0.20);
            this.hull.add(_mesh(greeble1, M.chrome,
                [sign * 0.82, -0.10, 0.5]));

            const greeble2 = new THREE.BoxGeometry(0.04, 0.08, 0.30);
            this.hull.add(_mesh(greeble2, M.trim,
                [sign * 0.80, 0.0, -1.2]));

            for (let p = 0; p < 3; p++) {
                const pz = 1.0 - p * 0.8;
                const techGeo = new THREE.BoxGeometry(0.35, 0.03, 0.25);
                this.hull.add(_mesh(techGeo, M.trim,
                    [sign * 0.35, -0.36, pz]));
            }
        }

        const blisterGeo = new THREE.SphereGeometry(0.12, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        this.hull.add(_mesh(blisterGeo, M.chrome, [0, 0.42, 0.4]));

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
        this.hull.add(_mesh(chevronGeo, M.accent, [0, 0.42, 1.7],
            [Math.PI / 2, 0, 0]));
    }

    // --------------------------------------------------------
    // RUNNING LIGHTS
    // --------------------------------------------------------
    _buildRunningLights(M) {
        const lightGeo = new THREE.SphereGeometry(0.035, 4, 4);

        const portLight = _mesh(lightGeo, M.lightRed, [-3.75, 0.30, 0.25]);
        this.hull.add(portLight);
        this.runningLights.push(portLight);

        const stbdLight = _mesh(lightGeo, M.lightGreen, [3.75, 0.30, 0.25]);
        this.hull.add(stbdLight);
        this.runningLights.push(stbdLight);

        const tailLight = _mesh(lightGeo, M.lightWhite, [0, 0.55, -2.3]);
        this.hull.add(tailLight);
        this.runningLights.push(tailLight);

        const noseLight = _mesh(lightGeo, M.lightWhite, [0, 0.08, 3.95]);
        this.hull.add(noseLight);
        this.runningLights.push(noseLight);
    }

    // --------------------------------------------------------
    // LANDING GEAR
    // --------------------------------------------------------
    _buildLandingGear(M) {
        this.landingGear = new THREE.Group();

        const positions = [
            { x:  0.7, z:  1.2 },
            { x: -0.7, z:  1.2 },
            { x:  0,   z: -2.0 },
        ];

        for (const pos of positions) {
            const upperGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.35, 5);
            this.landingGear.add(_mesh(upperGeo, M.strut, [pos.x, -0.5, pos.z]));

            const pistonGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.25, 4);
            this.landingGear.add(_mesh(pistonGeo, M.piston, [pos.x, -0.75, pos.z]));

            const lowerGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.2, 5);
            this.landingGear.add(_mesh(lowerGeo, M.strut, [pos.x, -0.92, pos.z]));

            const padGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.04, 8);
            this.landingGear.add(_mesh(padGeo, M.pad, [pos.x, -1.04, pos.z]));

            const bracketGeo = new THREE.BoxGeometry(0.15, 0.08, 0.15);
            this.landingGear.add(_mesh(bracketGeo, M.strut, [pos.x, -0.34, pos.z]));
        }

        this.hull.add(this.landingGear);
    }
}
