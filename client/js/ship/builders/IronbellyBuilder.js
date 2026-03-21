/**
 * THE GALACTIC ORDER — Ironbelly Builder (Hauler Class)
 *
 * 1-3 crew (pilot, gunner, engineer). Heavy cargo transport.
 * Wide, bulky hull with asymmetric cargo pods, offset cockpit.
 * Inspired by Millennium Falcon meets industrial hauler.
 */

import * as THREE from 'three';
import { ShipBuilder, _mesh, _taperBox } from './ShipBuilder.js';
import { CREW_ROLES } from '../ShipClassRegistry.js';

export class IronbellyBuilder extends ShipBuilder {
    constructor() {
        super();
        this.bounds = { x: 8.0, y: 3.0, z: 10.0 };
    }

    build(M) {
        this.hull.rotation.y = Math.PI;

        this._buildMainHull(M);
        this._buildCockpit(M);
        this._buildCargoPods(M);
        this._buildEngines(M);
        this._buildTurrets(M);
        this._buildDetails(M);
        this._buildRunningLights(M);
        this._buildLandingGear(M);

        this.stationPositions = [
            { role: CREW_ROLES.PILOT, x: -1.2, y: 0.3, z: 2.5, lookDir: [0, 0, 1] },
            { role: CREW_ROLES.GUNNER, x: 0, y: 1.2, z: 0, lookDir: [0, 1, 0] },
            { role: CREW_ROLES.ENGINEER, x: 0.5, y: 0, z: -2.0, lookDir: [0, 0, -1] },
        ];

        return this;
    }

    _buildMainHull(M) {
        // Wide, flat main hull — saucer-like with flat top
        const mainGeo = _taperBox(
            new THREE.BoxGeometry(3.5, 1.0, 6.0, 1, 1, 3),
            0.8, 0.25, 0.2
        );
        this.hull.add(_mesh(mainGeo, M.hull, [0, 0, 0]));

        // Upper deck plate
        const upperGeo = new THREE.BoxGeometry(3.2, 0.1, 5.5);
        this.hull.add(_mesh(upperGeo, M.hullDark, [0, 0.55, -0.1]));

        // Lower armor plate
        const lowerGeo = new THREE.BoxGeometry(3.0, 0.08, 5.0);
        this.hull.add(_mesh(lowerGeo, M.hullDark, [0, -0.54, -0.2]));

        // Central spine
        const spineGeo = new THREE.BoxGeometry(0.15, 0.12, 5.0);
        this.hull.add(_mesh(spineGeo, M.accent, [0, 0.62, -0.2]));

        // Rear wall
        const rearGeo = new THREE.BoxGeometry(3.5, 0.9, 0.2);
        this.hull.add(_mesh(rearGeo, M.trim, [0, 0, -3.1]));
    }

    _buildCockpit(M) {
        // Offset cockpit (Falcon-style, on the right side)
        const cockpitGeo = _taperBox(
            new THREE.BoxGeometry(1.0, 0.6, 2.0, 1, 1, 2),
            0.3, 0.3, 0.2
        );
        this.hull.add(_mesh(cockpitGeo, M.hull, [-1.2, 0.3, 2.5]));

        // Windscreen
        const windowGeo = new THREE.BoxGeometry(0.8, 0.3, 0.05);
        this.hull.add(_mesh(windowGeo, M.glass, [-1.2, 0.45, 3.5]));

        // Side windows
        for (const sign of [-1, 1]) {
            const sideWin = new THREE.BoxGeometry(0.05, 0.25, 0.6);
            this.hull.add(_mesh(sideWin, M.glass, [-1.2 + sign * 0.52, 0.4, 3.0]));
        }

        // Cockpit frame
        const frameGeo = new THREE.BoxGeometry(1.05, 0.04, 0.04);
        this.hull.add(_mesh(frameGeo, M.chrome, [-1.2, 0.62, 3.5]));
    }

    _buildCargoPods(M) {
        // Asymmetric cargo pods — larger on the right
        const configs = [
            { x: 2.0, z: -0.5, w: 1.2, h: 0.8, d: 3.0 },   // Right pod (large)
            { x: -2.2, z: 0.0, w: 0.8, h: 0.6, d: 2.0 },    // Left pod (small)
        ];

        for (const cfg of configs) {
            // Pod body
            const podGeo = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
            this.hull.add(_mesh(podGeo, M.hullDark, [cfg.x, -0.1, cfg.z]));

            // Pod frame rails
            const railGeo = new THREE.BoxGeometry(cfg.w + 0.1, 0.04, cfg.d + 0.1);
            this.hull.add(_mesh(railGeo, M.trim, [cfg.x, cfg.h / 2 - 0.1, cfg.z]));
            this.hull.add(_mesh(railGeo, M.trim, [cfg.x, -cfg.h / 2 + 0.1, cfg.z]));

            // Connecting struts to main hull
            const strutGeo = new THREE.BoxGeometry(0.5, 0.15, 0.1);
            this.hull.add(_mesh(strutGeo, M.trim, [cfg.x > 0 ? cfg.x - 0.8 : cfg.x + 0.6, 0, cfg.z]));
            this.hull.add(_mesh(strutGeo, M.trim, [cfg.x > 0 ? cfg.x - 0.8 : cfg.x + 0.6, 0, cfg.z - 0.8]));

            // Cargo door accent
            const doorGeo = new THREE.BoxGeometry(cfg.w * 0.6, cfg.h * 0.7, 0.03);
            this.hull.add(_mesh(doorGeo, M.accent, [cfg.x, -0.1, cfg.z + cfg.d / 2]));
        }
    }

    _buildEngines(M) {
        // 4 engines in a wide rear array
        const engineX = [-1.3, -0.5, 0.5, 1.3];

        for (const ex of engineX) {
            const housingGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.5, 8);
            housingGeo.rotateX(Math.PI / 2);
            this.hull.add(_mesh(housingGeo, M.trim, [ex, 0, -3.2]));

            const nozzleGeo = new THREE.TorusGeometry(0.27, 0.03, 4, 8);
            this.hull.add(_mesh(nozzleGeo, M.chrome, [ex, 0, -3.48], [Math.PI / 2, 0, 0]));

            const glowGeo = new THREE.CircleGeometry(0.25, 10);
            const glow = _mesh(glowGeo, M.engine, [ex, 0, -3.50], [0, Math.PI, 0]);
            this.hull.add(glow);
            this.engineGlows.push(glow);

            const coreGeo = new THREE.CircleGeometry(0.12, 8);
            const core = _mesh(coreGeo, M.engineInner, [ex, 0, -3.51], [0, Math.PI, 0]);
            this.hull.add(core);
            this.engineGlows.push(core);

            this.enginePositions.push({ x: ex, y: 0, z: -3.50, radius: 0.25 });
        }
    }

    _buildTurrets(M) {
        // Dorsal turret mount
        const baseGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.2, 8);
        this.hull.add(_mesh(baseGeo, M.trim, [0, 0.7, 0]));

        const turretGeo = new THREE.SphereGeometry(0.2, 8, 6);
        this.hull.add(_mesh(turretGeo, M.hullDark, [0, 0.85, 0]));

        // Turret barrels
        for (const sign of [-1, 1]) {
            const barrelGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4);
            barrelGeo.rotateX(-Math.PI / 2);
            this.hull.add(_mesh(barrelGeo, M.chrome, [sign * 0.1, 0.85, 0.3]));
        }

        // Ventral turret
        const vBaseGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.15, 8);
        this.hull.add(_mesh(vBaseGeo, M.trim, [0, -0.65, -1.5]));

        const vTurretGeo = new THREE.SphereGeometry(0.15, 6, 5);
        this.hull.add(_mesh(vTurretGeo, M.hullDark, [0, -0.78, -1.5]));
    }

    _buildDetails(M) {
        // Panel lines
        for (let i = 0; i < 4; i++) {
            const z = 2.0 - i * 1.2;
            const ribGeo = new THREE.BoxGeometry(3.5, 0.04, 0.03);
            this.hull.add(_mesh(ribGeo, M.trim, [0, 0.52, z]));
        }

        // Side vents
        for (const sign of [-1, 1]) {
            const ventGeo = new THREE.BoxGeometry(0.04, 0.2, 0.5);
            this.hull.add(_mesh(ventGeo, M.trim, [sign * 1.78, 0, 1.0]));
        }

        // Antenna
        const antennaGeo = new THREE.CylinderGeometry(0.01, 0.02, 0.5, 4);
        this.hull.add(_mesh(antennaGeo, M.chrome, [1.0, 0.85, -1.0]));
    }

    _buildRunningLights(M) {
        const lightGeo = new THREE.SphereGeometry(0.04, 4, 4);

        this.hull.add(_mesh(lightGeo, M.lightRed, [-2.6, 0, 0.5]));
        this.runningLights.push(this.hull.children[this.hull.children.length - 1]);

        this.hull.add(_mesh(lightGeo, M.lightGreen, [2.6, 0, 0.5]));
        this.runningLights.push(this.hull.children[this.hull.children.length - 1]);

        this.hull.add(_mesh(lightGeo, M.lightWhite, [0, 0.3, -3.0]));
        this.runningLights.push(this.hull.children[this.hull.children.length - 1]);

        this.hull.add(_mesh(lightGeo, M.lightWhite, [-1.2, 0.3, 3.5]));
        this.runningLights.push(this.hull.children[this.hull.children.length - 1]);
    }

    _buildLandingGear(M) {
        this.landingGear = new THREE.Group();

        const positions = [
            { x: -1.0, z: 1.5 },
            { x: 1.0, z: 1.5 },
            { x: -1.0, z: -2.0 },
            { x: 1.0, z: -2.0 },
        ];

        for (const pos of positions) {
            const strutGeo = new THREE.CylinderGeometry(0.05, 0.04, 0.5, 5);
            this.landingGear.add(_mesh(strutGeo, M.strut, [pos.x, -0.75, pos.z]));

            const padGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.05, 8);
            this.landingGear.add(_mesh(padGeo, M.pad, [pos.x, -1.02, pos.z]));
        }

        this.hull.add(this.landingGear);
    }
}
