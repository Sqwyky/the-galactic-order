/**
 * THE GALACTIC ORDER — Leviathan Builder (Frigate Class)
 *
 * 3-5 crew (pilot, gunner, navigator, engineer, captain).
 * Multi-deck, hangar bay, prominent sensor arrays, walkable bridge.
 * Inspired by Nebulon-B meets Star Citizen Constellation.
 */

import * as THREE from 'three';
import { ShipBuilder, _mesh, _taperBox } from './ShipBuilder.js';
import { CREW_ROLES } from '../ShipClassRegistry.js';

export class LeviathanBuilder extends ShipBuilder {
    constructor() {
        super();
        this.bounds = { x: 10.0, y: 5.0, z: 18.0 };
    }

    build(M) {
        this.hull.rotation.y = Math.PI;

        this._buildMainHull(M);
        this._buildBridge(M);
        this._buildForwardSection(M);
        this._buildEngineBoom(M);
        this._buildHangarBay(M);
        this._buildTurrets(M);
        this._buildSensorArrays(M);
        this._buildRunningLights(M);
        this._buildLandingGear(M);

        this.stationPositions = [
            { role: CREW_ROLES.PILOT, x: 0, y: 2.5, z: 3.0, lookDir: [0, 0, 1] },
            { role: CREW_ROLES.GUNNER, x: 0, y: 1.5, z: 1.0, lookDir: [0, 0, 1] },
            { role: CREW_ROLES.NAVIGATOR, x: 0.8, y: 2.3, z: 2.5, lookDir: [1, 0, 1] },
            { role: CREW_ROLES.ENGINEER, x: 0, y: 0, z: -5.0, lookDir: [0, 0, -1] },
            { role: CREW_ROLES.CAPTAIN, x: 0, y: 2.8, z: 2.0, lookDir: [0, 0, 1] },
        ];

        return this;
    }

    _buildMainHull(M) {
        // Wide central hull
        const coreGeo = _taperBox(
            new THREE.BoxGeometry(3.5, 2.0, 10.0, 1, 1, 4),
            1.5, 0.3, 0.2
        );
        this.hull.add(_mesh(coreGeo, M.hull, [0, 0, 0]));

        // Upper deck
        const upperGeo = new THREE.BoxGeometry(3.2, 0.12, 9.0);
        this.hull.add(_mesh(upperGeo, M.hullDark, [0, 1.05, -0.3]));

        // Lower armor
        const lowerGeo = new THREE.BoxGeometry(3.0, 0.1, 8.5);
        this.hull.add(_mesh(lowerGeo, M.hullDark, [0, -1.05, -0.5]));

        // Side armor plates
        for (const sign of [-1, 1]) {
            const sideGeo = new THREE.BoxGeometry(0.12, 1.8, 9.0);
            this.hull.add(_mesh(sideGeo, M.hullDark, [sign * 1.8, 0, -0.3]));

            const stripeGeo = new THREE.BoxGeometry(0.04, 0.2, 8.0);
            this.hull.add(_mesh(stripeGeo, M.accent, [sign * 1.83, 0.3, -0.3]));
        }

        // Spine ridge
        const spineGeo = new THREE.BoxGeometry(0.15, 0.15, 8.0);
        this.hull.add(_mesh(spineGeo, M.accent, [0, 1.12, -0.5]));
    }

    _buildBridge(M) {
        // Large raised bridge
        const towerGeo = _taperBox(
            new THREE.BoxGeometry(2.0, 1.5, 3.5, 1, 1, 2),
            0.5, 0.15, 0.1
        );
        this.hull.add(_mesh(towerGeo, M.hull, [0, 1.8, 2.0]));

        // Panoramic bridge windows
        const windowGeo = new THREE.BoxGeometry(2.05, 0.35, 0.05);
        this.hull.add(_mesh(windowGeo, M.glass, [0, 2.2, 3.75]));

        // Side bridge windows
        for (const sign of [-1, 1]) {
            const sideWin = new THREE.BoxGeometry(0.05, 0.3, 2.5);
            this.hull.add(_mesh(sideWin, M.glass, [sign * 1.02, 2.2, 2.0]));
        }

        // Bridge roof
        const roofGeo = new THREE.BoxGeometry(2.1, 0.08, 3.6);
        this.hull.add(_mesh(roofGeo, M.hullDark, [0, 2.58, 2.0]));

        // Command antenna cluster
        const antennaGeo = new THREE.CylinderGeometry(0.015, 0.025, 0.8, 4);
        this.hull.add(_mesh(antennaGeo, M.chrome, [0, 3.0, 2.0]));
        this.hull.add(_mesh(antennaGeo, M.chrome, [0.4, 2.95, 1.8]));
        this.hull.add(_mesh(antennaGeo, M.chrome, [-0.4, 2.95, 1.8]));
    }

    _buildForwardSection(M) {
        // Tapered nose
        const noseGeo = new THREE.ConeGeometry(1.0, 3.5, 8);
        noseGeo.rotateX(-Math.PI / 2);
        this.hull.add(_mesh(noseGeo, M.hull, [0, 0, 6.5]));

        // Nose accent
        const ringGeo = new THREE.TorusGeometry(0.9, 0.04, 4, 8);
        this.hull.add(_mesh(ringGeo, M.accent, [0, 0, 4.8], [Math.PI / 2, 0, 0]));

        // Forward weapon hardpoint
        const hardpointGeo = new THREE.BoxGeometry(0.3, 0.15, 0.8);
        this.hull.add(_mesh(hardpointGeo, M.trim, [0, -0.3, 7.0]));
    }

    _buildEngineBoom(M) {
        // Engine section — 4 large engines
        const engineX = [-1.2, -0.4, 0.4, 1.2];

        for (const ex of engineX) {
            const housingGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.8, 8);
            housingGeo.rotateX(Math.PI / 2);
            this.hull.add(_mesh(housingGeo, M.trim, [ex, 0, -5.2]));

            const nozzleGeo = new THREE.TorusGeometry(0.37, 0.04, 4, 8);
            this.hull.add(_mesh(nozzleGeo, M.chrome, [ex, 0, -5.62], [Math.PI / 2, 0, 0]));

            const glowGeo = new THREE.CircleGeometry(0.35, 10);
            const glow = _mesh(glowGeo, M.engine, [ex, 0, -5.64], [0, Math.PI, 0]);
            this.hull.add(glow);
            this.engineGlows.push(glow);

            const coreGeo = new THREE.CircleGeometry(0.18, 8);
            const core = _mesh(coreGeo, M.engineInner, [ex, 0, -5.65], [0, Math.PI, 0]);
            this.hull.add(core);
            this.engineGlows.push(core);

            this.enginePositions.push({ x: ex, y: 0, z: -5.64, radius: 0.35 });
        }

        // Engine connecting structure
        const connectGeo = new THREE.BoxGeometry(3.0, 0.6, 1.0);
        this.hull.add(_mesh(connectGeo, M.hullDark, [0, 0, -5.0]));
    }

    _buildHangarBay(M) {
        // Ventral hangar bay opening
        const hangarGeo = new THREE.BoxGeometry(2.0, 0.6, 2.5);
        this.hull.add(_mesh(hangarGeo, M.trim, [0, -0.8, -1.0]));

        // Hangar door frame
        const frameGeo = new THREE.BoxGeometry(2.1, 0.08, 2.6);
        this.hull.add(_mesh(frameGeo, M.accent, [0, -0.5, -1.0]));

        // Hangar interior hint
        const interiorGeo = new THREE.BoxGeometry(1.8, 0.4, 2.0);
        this.hull.add(_mesh(interiorGeo, M.glassDark, [0, -0.8, -1.0]));

        // Hangar lights
        for (const sign of [-1, 1]) {
            const lightGeo = new THREE.BoxGeometry(0.1, 0.05, 2.0);
            this.hull.add(_mesh(lightGeo, M.emissiveLine, [sign * 0.9, -0.55, -1.0]));
        }
    }

    _buildTurrets(M) {
        // 4 turret positions
        const turretPositions = [
            { x: 2.0, y: 0.8, z: 2 },   // Starboard dorsal
            { x: -2.0, y: 0.8, z: 2 },   // Port dorsal
            { x: 0, y: 1.5, z: -3 },      // Rear dorsal
            { x: 0, y: -1.0, z: 0 },      // Ventral
        ];

        for (const tp of turretPositions) {
            const baseGeo = new THREE.CylinderGeometry(0.2, 0.28, 0.15, 8);
            this.hull.add(_mesh(baseGeo, M.trim, [tp.x, tp.y, tp.z]));

            const domeGeo = new THREE.SphereGeometry(0.18, 6, 5);
            this.hull.add(_mesh(domeGeo, M.hullDark, [tp.x, tp.y + 0.12, tp.z]));

            const barrelGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 4);
            barrelGeo.rotateX(-Math.PI / 2);
            this.hull.add(_mesh(barrelGeo, M.chrome, [tp.x, tp.y + 0.12, tp.z + 0.25]));
        }
    }

    _buildSensorArrays(M) {
        // Large sensor dish on bridge
        const dishGeo = new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.4);
        this.hull.add(_mesh(dishGeo, M.chrome, [0.8, 2.7, 1.0], [Math.PI, 0, 0]));

        // Sensor booms
        for (const sign of [-1, 1]) {
            const boomGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.0, 4);
            boomGeo.rotateZ(Math.PI / 2);
            this.hull.add(_mesh(boomGeo, M.chrome, [sign * 2.5, 0.5, -2.0]));

            const tipGeo = new THREE.SphereGeometry(0.08, 6, 4);
            this.hull.add(_mesh(tipGeo, M.accent, [sign * 3.5, 0.5, -2.0]));
        }
    }

    _buildRunningLights(M) {
        const lightGeo = new THREE.SphereGeometry(0.05, 4, 4);

        const positions = [
            { pos: [-3.5, 0.5, -2.0], mat: M.lightRed },
            { pos: [3.5, 0.5, -2.0], mat: M.lightGreen },
            { pos: [0, 1.0, -5.2], mat: M.lightWhite },
            { pos: [0, 0.5, 8.0], mat: M.lightWhite },
        ];

        for (const p of positions) {
            const light = _mesh(lightGeo, p.mat, p.pos);
            this.hull.add(light);
            this.runningLights.push(light);
        }
    }

    _buildLandingGear(M) {
        this.landingGear = new THREE.Group();

        const positions = [
            { x: -1.2, z: 3.0 },
            { x: 1.2, z: 3.0 },
            { x: -1.2, z: -3.5 },
            { x: 1.2, z: -3.5 },
            { x: 0, z: -0.5 },
        ];

        for (const pos of positions) {
            const strutGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.8, 5);
            this.landingGear.add(_mesh(strutGeo, M.strut, [pos.x, -1.4, pos.z]));

            const padGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.06, 8);
            this.landingGear.add(_mesh(padGeo, M.pad, [pos.x, -1.82, pos.z]));
        }

        this.hull.add(this.landingGear);
    }
}
