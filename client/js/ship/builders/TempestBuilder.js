/**
 * THE GALACTIC ORDER — Tempest Builder (Corvette Class)
 *
 * 2-4 crew (pilot, gunner, navigator, engineer).
 * Elongated hull, turret hardpoints, command bridge tower.
 * Inspired by CR90 Corvette meets NMS Corvette.
 */

import * as THREE from 'three';
import { ShipBuilder, _mesh, _taperBox } from './ShipBuilder.js';
import { CREW_ROLES } from '../ShipClassRegistry.js';

export class TempestBuilder extends ShipBuilder {
    constructor() {
        super();
        this.bounds = { x: 6.0, y: 3.5, z: 14.0 };
    }

    build(M) {
        this.hull.rotation.y = Math.PI;

        this._buildMainHull(M);
        this._buildBridge(M);
        this._buildWings(M);
        this._buildEngines(M);
        this._buildTurrets(M);
        this._buildNose(M);
        this._buildDetails(M);
        this._buildRunningLights(M);
        this._buildLandingGear(M);

        this.stationPositions = [
            { role: CREW_ROLES.PILOT, x: 0, y: 1.5, z: 1.5, lookDir: [0, 0, 1] },
            { role: CREW_ROLES.GUNNER, x: 0, y: 0.5, z: 0, lookDir: [0, 0, 1] },
            { role: CREW_ROLES.NAVIGATOR, x: 0.5, y: 1.3, z: 1.0, lookDir: [1, 0, 1] },
            { role: CREW_ROLES.ENGINEER, x: 0, y: 0, z: -3.0, lookDir: [0, 0, -1] },
        ];

        return this;
    }

    _buildMainHull(M) {
        // Long, narrow main hull
        const coreGeo = _taperBox(
            new THREE.BoxGeometry(2.0, 1.2, 8.0, 1, 1, 4),
            1.0, 0.35, 0.25
        );
        this.hull.add(_mesh(coreGeo, M.hull, [0, 0, 0]));

        // Upper deck
        const upperGeo = new THREE.BoxGeometry(1.8, 0.1, 7.0);
        this.hull.add(_mesh(upperGeo, M.hullDark, [0, 0.65, -0.3]));

        // Lower armor
        const lowerGeo = new THREE.BoxGeometry(1.6, 0.08, 6.5);
        this.hull.add(_mesh(lowerGeo, M.hullDark, [0, -0.64, -0.5]));

        // Side armor plates
        for (const sign of [-1, 1]) {
            const sideGeo = new THREE.BoxGeometry(0.1, 1.0, 7.0);
            this.hull.add(_mesh(sideGeo, M.hullDark, [sign * 1.05, 0, -0.3]));

            // Side accent stripe
            const stripeGeo = new THREE.BoxGeometry(0.04, 0.15, 6.0);
            this.hull.add(_mesh(stripeGeo, M.accent, [sign * 1.08, 0.2, -0.3]));
        }

        // Rear bulkhead
        const rearGeo = new THREE.BoxGeometry(2.0, 1.1, 0.2);
        this.hull.add(_mesh(rearGeo, M.trim, [0, 0, -4.1]));
    }

    _buildBridge(M) {
        // Raised command bridge tower
        const towerGeo = new THREE.BoxGeometry(1.2, 0.8, 2.0);
        this.hull.add(_mesh(towerGeo, M.hull, [0, 1.1, 1.0]));

        // Bridge windows — wide band
        const windowGeo = new THREE.BoxGeometry(1.25, 0.2, 0.05);
        this.hull.add(_mesh(windowGeo, M.glass, [0, 1.3, 2.0]));

        // Side bridge windows
        for (const sign of [-1, 1]) {
            const sideWin = new THREE.BoxGeometry(0.05, 0.2, 1.5);
            this.hull.add(_mesh(sideWin, M.glass, [sign * 0.62, 1.3, 1.0]));
        }

        // Bridge roof
        const roofGeo = new THREE.BoxGeometry(1.3, 0.06, 2.1);
        this.hull.add(_mesh(roofGeo, M.hullDark, [0, 1.52, 1.0]));

        // Antenna array on bridge
        const antennaGeo = new THREE.CylinderGeometry(0.01, 0.02, 0.6, 4);
        this.hull.add(_mesh(antennaGeo, M.chrome, [0.3, 1.85, 0.8]));
        this.hull.add(_mesh(antennaGeo, M.chrome, [-0.3, 1.85, 0.8]));

        // Sensor dome
        const domeGeo = new THREE.SphereGeometry(0.12, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        this.hull.add(_mesh(domeGeo, M.chrome, [0, 1.55, 1.5]));
    }

    _buildWings(M) {
        // Short, angular wings / weapon pylons
        for (const sign of [-1, 1]) {
            const wingShape = new THREE.Shape();
            wingShape.moveTo(0, 0);
            wingShape.lineTo(1.8, -0.1);
            wingShape.lineTo(1.5, -0.5);
            wingShape.lineTo(0, -0.4);
            wingShape.closePath();

            const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
                depth: 0.08, bevelEnabled: false,
            });
            const wing = _mesh(wingGeo, M.hull, [sign * 1.0, -0.1, 0]);
            wing.scale.x = sign;
            this.hull.add(wing);

            // Wing accent
            const accentShape = new THREE.Shape();
            accentShape.moveTo(0.1, 0.02);
            accentShape.lineTo(1.6, -0.08);
            accentShape.lineTo(1.5, -0.14);
            accentShape.lineTo(0.1, -0.02);
            accentShape.closePath();

            const accentGeo = new THREE.ExtrudeGeometry(accentShape, {
                depth: 0.03, bevelEnabled: false,
            });
            const acc = _mesh(accentGeo, M.accent, [sign * 1.0, -0.08, 0.02]);
            acc.scale.x = sign;
            this.hull.add(acc);
        }
    }

    _buildEngines(M) {
        // 3 main engines
        const engineX = [-0.7, 0, 0.7];

        for (const ex of engineX) {
            const housingGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.6, 8);
            housingGeo.rotateX(Math.PI / 2);
            this.hull.add(_mesh(housingGeo, M.trim, [ex, 0, -4.0]));

            const nozzleGeo = new THREE.TorusGeometry(0.32, 0.03, 4, 8);
            this.hull.add(_mesh(nozzleGeo, M.chrome, [ex, 0, -4.32], [Math.PI / 2, 0, 0]));

            const glowGeo = new THREE.CircleGeometry(0.30, 10);
            const glow = _mesh(glowGeo, M.engine, [ex, 0, -4.34], [0, Math.PI, 0]);
            this.hull.add(glow);
            this.engineGlows.push(glow);

            const coreGeo = new THREE.CircleGeometry(0.15, 8);
            const core = _mesh(coreGeo, M.engineInner, [ex, 0, -4.35], [0, Math.PI, 0]);
            this.hull.add(core);
            this.engineGlows.push(core);

            this.enginePositions.push({ x: ex, y: 0, z: -4.34, radius: 0.30 });
        }
    }

    _buildTurrets(M) {
        // Wing-mounted turret platforms
        for (const sign of [-1, 1]) {
            const baseGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.15, 8);
            this.hull.add(_mesh(baseGeo, M.trim, [sign * 2.2, 0.1, 0]));

            const turretGeo = new THREE.SphereGeometry(0.15, 6, 5);
            this.hull.add(_mesh(turretGeo, M.hullDark, [sign * 2.2, 0.22, 0]));

            // Barrel
            const barrelGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 4);
            barrelGeo.rotateX(-Math.PI / 2);
            this.hull.add(_mesh(barrelGeo, M.chrome, [sign * 2.2, 0.22, 0.25]));
        }
    }

    _buildNose(M) {
        // Tapered nose section
        const noseGeo = new THREE.ConeGeometry(0.6, 2.5, 8);
        noseGeo.rotateX(-Math.PI / 2);
        this.hull.add(_mesh(noseGeo, M.hull, [0, 0, 5.0]));

        // Nose accent ring
        const ringGeo = new THREE.TorusGeometry(0.55, 0.03, 4, 8);
        this.hull.add(_mesh(ringGeo, M.accent, [0, 0, 3.8], [Math.PI / 2, 0, 0]));

        // Sensor tip
        const tipGeo = new THREE.SphereGeometry(0.06, 6, 4);
        this.hull.add(_mesh(tipGeo, M.chrome, [0, 0, 6.3]));
    }

    _buildDetails(M) {
        // Hull ribs
        for (let i = 0; i < 6; i++) {
            const z = 3.0 - i * 1.2;
            const ribGeo = new THREE.BoxGeometry(2.05, 0.05, 0.03);
            this.hull.add(_mesh(ribGeo, M.trim, [0, 0.62, z]));
        }

        // Spine greebles
        const blisterGeo = new THREE.SphereGeometry(0.1, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
        this.hull.add(_mesh(blisterGeo, M.chrome, [0, 0.68, -1.5]));
    }

    _buildRunningLights(M) {
        const lightGeo = new THREE.SphereGeometry(0.04, 4, 4);

        this.hull.add(_mesh(lightGeo, M.lightRed, [-2.5, 0.1, 0]));
        this.runningLights.push(this.hull.children[this.hull.children.length - 1]);

        this.hull.add(_mesh(lightGeo, M.lightGreen, [2.5, 0.1, 0]));
        this.runningLights.push(this.hull.children[this.hull.children.length - 1]);

        this.hull.add(_mesh(lightGeo, M.lightWhite, [0, 0.5, -3.8]));
        this.runningLights.push(this.hull.children[this.hull.children.length - 1]);

        this.hull.add(_mesh(lightGeo, M.lightWhite, [0, 0.1, 6.2]));
        this.runningLights.push(this.hull.children[this.hull.children.length - 1]);
    }

    _buildLandingGear(M) {
        this.landingGear = new THREE.Group();

        const positions = [
            { x: -0.8, z: 2.0 },
            { x: 0.8, z: 2.0 },
            { x: -0.8, z: -3.0 },
            { x: 0.8, z: -3.0 },
        ];

        for (const pos of positions) {
            const strutGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.5, 5);
            this.landingGear.add(_mesh(strutGeo, M.strut, [pos.x, -0.85, pos.z]));

            const padGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.05, 8);
            this.landingGear.add(_mesh(padGeo, M.pad, [pos.x, -1.12, pos.z]));
        }

        this.hull.add(this.landingGear);
    }
}
