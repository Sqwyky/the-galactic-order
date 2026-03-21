/**
 * THE GALACTIC ORDER — Sovereign Builder (Capital Class)
 *
 * 4-6 crew (pilot, gunner, navigator, engineer, captain).
 * Massive wedge hull, multiple turret batteries, full interior.
 * Inspired by Star Destroyer wedge meets NMS Freighter.
 */

import * as THREE from 'three';
import { ShipBuilder, _mesh, _taperBox } from './ShipBuilder.js';
import { CREW_ROLES } from '../ShipClassRegistry.js';

export class SovereignBuilder extends ShipBuilder {
    constructor() {
        super();
        this.bounds = { x: 14.0, y: 6.0, z: 24.0 };
    }

    build(M) {
        this.hull.rotation.y = Math.PI;

        this._buildMainHull(M);
        this._buildBridge(M);
        this._buildWedgeNose(M);
        this._buildEngineBlock(M);
        this._buildTurretBatteries(M);
        this._buildHangarBays(M);
        this._buildSuperstructure(M);
        this._buildRunningLights(M);
        this._buildLandingGear(M);

        this.stationPositions = [
            { role: CREW_ROLES.PILOT, x: 0, y: 3.5, z: 4.0, lookDir: [0, 0, 1] },
            { role: CREW_ROLES.GUNNER, x: 0, y: 2.0, z: 1.0, lookDir: [0, 0, 1] },
            { role: CREW_ROLES.NAVIGATOR, x: 1.0, y: 3.2, z: 3.5, lookDir: [1, 0, 1] },
            { role: CREW_ROLES.ENGINEER, x: 0, y: 0, z: -7.0, lookDir: [0, 0, -1] },
            { role: CREW_ROLES.CAPTAIN, x: 0, y: 4.0, z: 3.0, lookDir: [0, 0, 1] },
        ];

        return this;
    }

    _buildMainHull(M) {
        // Massive wedge hull — Star Destroyer inspired
        const wedgeGeo = _taperBox(
            new THREE.BoxGeometry(5.0, 2.5, 14.0, 1, 1, 5),
            2.0, 0.5, 0.4
        );
        this.hull.add(_mesh(wedgeGeo, M.hull, [0, 0, 0]));

        // Upper deck plate
        const upperGeo = new THREE.BoxGeometry(4.5, 0.15, 12.0);
        this.hull.add(_mesh(upperGeo, M.hullDark, [0, 1.3, -0.5]));

        // Lower armor belt
        const lowerGeo = new THREE.BoxGeometry(4.2, 0.12, 11.0);
        this.hull.add(_mesh(lowerGeo, M.hullDark, [0, -1.3, -0.8]));

        // Side armor plates
        for (const sign of [-1, 1]) {
            const sideGeo = new THREE.BoxGeometry(0.15, 2.2, 12.0);
            this.hull.add(_mesh(sideGeo, M.hullDark, [sign * 2.55, 0, -0.5]));

            // Running accent stripes
            const stripeGeo = new THREE.BoxGeometry(0.05, 0.25, 10.0);
            this.hull.add(_mesh(stripeGeo, M.accent, [sign * 2.58, 0.4, -0.5]));
            this.hull.add(_mesh(stripeGeo, M.accent, [sign * 2.58, -0.4, -0.5]));
        }

        // Ventral keel
        const keelGeo = new THREE.BoxGeometry(0.8, 0.3, 10.0);
        this.hull.add(_mesh(keelGeo, M.trim, [0, -1.4, -1.0]));
    }

    _buildBridge(M) {
        // Tall command tower — distinctive capital ship feature
        const towerBase = new THREE.BoxGeometry(2.5, 1.0, 4.0);
        this.hull.add(_mesh(towerBase, M.hull, [0, 2.0, 2.0]));

        const towerUpper = _taperBox(
            new THREE.BoxGeometry(2.0, 1.5, 3.0, 1, 1, 2),
            0.4, 0.15, 0.1
        );
        this.hull.add(_mesh(towerUpper, M.hull, [0, 3.3, 2.5]));

        // Panoramic bridge windows
        const windowGeo = new THREE.BoxGeometry(2.05, 0.4, 0.06);
        this.hull.add(_mesh(windowGeo, M.glass, [0, 3.5, 4.0]));

        // Side windows
        for (const sign of [-1, 1]) {
            const sideWin = new THREE.BoxGeometry(0.06, 0.35, 2.5);
            this.hull.add(_mesh(sideWin, M.glass, [sign * 1.02, 3.5, 2.5]));
        }

        // Bridge roof / cap
        const roofGeo = new THREE.BoxGeometry(2.2, 0.1, 3.2);
        this.hull.add(_mesh(roofGeo, M.hullDark, [0, 4.1, 2.5]));

        // Command spire
        const spireGeo = new THREE.CylinderGeometry(0.02, 0.04, 1.5, 4);
        this.hull.add(_mesh(spireGeo, M.chrome, [0, 4.9, 2.5]));

        // Shield generator domes (flanking)
        for (const sign of [-1, 1]) {
            const genGeo = new THREE.SphereGeometry(0.3, 8, 6);
            this.hull.add(_mesh(genGeo, M.chrome, [sign * 0.8, 4.3, 2.0]));
        }
    }

    _buildWedgeNose(M) {
        // Extended wedge prow
        const noseGeo = _taperBox(
            new THREE.BoxGeometry(3.0, 1.5, 5.0, 1, 1, 4),
            0.5, 0.7, 0.6
        );
        this.hull.add(_mesh(noseGeo, M.hull, [0, 0, 9.0]));

        // Nose edge accent
        const edgeGeo = new THREE.BoxGeometry(0.08, 0.08, 4.0);
        this.hull.add(_mesh(edgeGeo, M.accent, [0, 0, 9.5]));

        // Forward sensor array
        const sensorGeo = new THREE.SphereGeometry(0.08, 6, 4);
        this.hull.add(_mesh(sensorGeo, M.chrome, [0, 0, 11.5]));

        // Nose detail panels
        for (const sign of [-1, 1]) {
            const panelGeo = new THREE.BoxGeometry(0.8, 0.08, 3.0);
            this.hull.add(_mesh(panelGeo, M.hullDark, [sign * 0.6, 0.5, 9.0]));
        }
    }

    _buildEngineBlock(M) {
        // 6 large engines in a rectangular array
        const configs = [
            { x: -1.8, y: 0.5 }, { x: 0, y: 0.5 }, { x: 1.8, y: 0.5 },
            { x: -1.8, y: -0.5 }, { x: 0, y: -0.5 }, { x: 1.8, y: -0.5 },
        ];

        // Engine block structure
        const blockGeo = new THREE.BoxGeometry(5.0, 2.0, 1.5);
        this.hull.add(_mesh(blockGeo, M.hullDark, [0, 0, -7.2]));

        for (const cfg of configs) {
            const housingGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.8, 8);
            housingGeo.rotateX(Math.PI / 2);
            this.hull.add(_mesh(housingGeo, M.trim, [cfg.x, cfg.y, -7.5]));

            const nozzleGeo = new THREE.TorusGeometry(0.42, 0.04, 4, 8);
            this.hull.add(_mesh(nozzleGeo, M.chrome,
                [cfg.x, cfg.y, -7.92], [Math.PI / 2, 0, 0]));

            const glowGeo = new THREE.CircleGeometry(0.40, 10);
            const glow = _mesh(glowGeo, M.engine,
                [cfg.x, cfg.y, -7.94], [0, Math.PI, 0]);
            this.hull.add(glow);
            this.engineGlows.push(glow);

            const coreGeo = new THREE.CircleGeometry(0.20, 8);
            const core = _mesh(coreGeo, M.engineInner,
                [cfg.x, cfg.y, -7.95], [0, Math.PI, 0]);
            this.hull.add(core);
            this.engineGlows.push(core);

            this.enginePositions.push({
                x: cfg.x, y: cfg.y, z: -7.94, radius: 0.40,
            });
        }
    }

    _buildTurretBatteries(M) {
        // 6 turret positions
        const turretPositions = [
            { x: 3.0, y: 1.2, z: 3 },    // Starboard forward
            { x: -3.0, y: 1.2, z: 3 },    // Port forward
            { x: 2.0, y: 1.5, z: -4 },    // Starboard aft
            { x: -2.0, y: 1.5, z: -4 },   // Port aft
            { x: 0, y: -1.2, z: 0 },      // Ventral
            { x: 0, y: 1.5, z: 0 },       // Dorsal midship
        ];

        for (const tp of turretPositions) {
            // Heavy turret base
            const baseGeo = new THREE.CylinderGeometry(0.25, 0.35, 0.2, 8);
            this.hull.add(_mesh(baseGeo, M.trim, [tp.x, tp.y, tp.z]));

            const domeGeo = new THREE.SphereGeometry(0.22, 8, 6);
            this.hull.add(_mesh(domeGeo, M.hullDark, [tp.x, tp.y + 0.15, tp.z]));

            // Twin barrels
            for (const bSign of [-1, 1]) {
                const barrelGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4);
                barrelGeo.rotateX(-Math.PI / 2);
                this.hull.add(_mesh(barrelGeo, M.chrome,
                    [tp.x + bSign * 0.08, tp.y + 0.15, tp.z + 0.35]));
            }
        }
    }

    _buildHangarBays(M) {
        // Two ventral hangar bays
        for (const sign of [-1, 1]) {
            const hangarGeo = new THREE.BoxGeometry(2.5, 0.8, 3.0);
            this.hull.add(_mesh(hangarGeo, M.trim, [sign * 1.2, -1.0, -2.0]));

            // Hangar door frame accent
            const frameGeo = new THREE.BoxGeometry(2.6, 0.1, 3.1);
            this.hull.add(_mesh(frameGeo, M.accent, [sign * 1.2, -0.6, -2.0]));

            // Interior hint
            const interiorGeo = new THREE.BoxGeometry(2.2, 0.5, 2.5);
            this.hull.add(_mesh(interiorGeo, M.glassDark, [sign * 1.2, -1.0, -2.0]));

            // Hangar guide lights
            const lightGeo = new THREE.BoxGeometry(0.1, 0.06, 2.5);
            this.hull.add(_mesh(lightGeo, M.emissiveLine, [sign * 1.2 + 1.1, -0.65, -2.0]));
            this.hull.add(_mesh(lightGeo, M.emissiveLine, [sign * 1.2 - 1.1, -0.65, -2.0]));
        }
    }

    _buildSuperstructure(M) {
        // Hull ribs / structural reinforcement
        for (let i = 0; i < 8; i++) {
            const z = 5.0 - i * 1.8;
            const ribGeo = new THREE.BoxGeometry(5.1, 0.06, 0.04);
            this.hull.add(_mesh(ribGeo, M.trim, [0, 1.28, z]));
        }

        // Large sensor array dish
        const dishGeo = new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.4);
        this.hull.add(_mesh(dishGeo, M.chrome, [1.5, 3.5, 1.0], [Math.PI, 0, 0]));

        // Communication masts
        for (const sign of [-1, 1]) {
            const mastGeo = new THREE.CylinderGeometry(0.02, 0.04, 1.2, 4);
            this.hull.add(_mesh(mastGeo, M.chrome, [sign * 1.0, 4.7, 2.0]));
        }

        // Ventral greebles
        for (let i = 0; i < 4; i++) {
            const z = 3.0 - i * 2.0;
            const greebleGeo = new THREE.BoxGeometry(0.8, 0.15, 0.4);
            this.hull.add(_mesh(greebleGeo, M.trim, [0, -1.38, z]));
        }
    }

    _buildRunningLights(M) {
        const lightGeo = new THREE.SphereGeometry(0.06, 4, 4);

        const positions = [
            { pos: [-3.0, 0.5, 3.0], mat: M.lightRed },
            { pos: [3.0, 0.5, 3.0], mat: M.lightGreen },
            { pos: [0, 1.5, -7.5], mat: M.lightWhite },
            { pos: [0, 0.5, 11.0], mat: M.lightWhite },
            { pos: [0, 4.5, 2.5], mat: M.lightWhite },
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
            { x: -1.5, z: 5.0 },
            { x: 1.5, z: 5.0 },
            { x: -2.0, z: -5.0 },
            { x: 2.0, z: -5.0 },
            { x: 0, z: 0 },
            { x: 0, z: -3.0 },
        ];

        for (const pos of positions) {
            const strutGeo = new THREE.CylinderGeometry(0.08, 0.07, 1.0, 5);
            this.landingGear.add(_mesh(strutGeo, M.strut, [pos.x, -1.8, pos.z]));

            const padGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.08, 8);
            this.landingGear.add(_mesh(padGeo, M.pad, [pos.x, -2.32, pos.z]));
        }

        this.hull.add(this.landingGear);
    }
}
