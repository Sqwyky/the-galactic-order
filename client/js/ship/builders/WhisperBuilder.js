/**
 * THE GALACTIC ORDER — Whisper Builder (Scout Class)
 *
 * 1 crew (pilot only). Fast sensor platform.
 * Slim profile, oversized sensor dish, solar fin arrays.
 * Inspired by TIE Interceptor meets NMS Solar ship.
 */

import * as THREE from 'three';
import { ShipBuilder, _mesh, _taperBox } from './ShipBuilder.js';
import { CREW_ROLES } from '../ShipClassRegistry.js';

export class WhisperBuilder extends ShipBuilder {
    constructor() {
        super();
        this.bounds = { x: 4.0, y: 2.5, z: 6.0 };
    }

    build(M) {
        this.hull.rotation.y = Math.PI;

        this._buildFuselage(M);
        this._buildNose(M);
        this._buildCockpit(M);
        this._buildSolarFins(M);
        this._buildSensorDish(M);
        this._buildEngines(M);
        this._buildRunningLights(M);
        this._buildLandingGear(M);

        this.stationPositions = [
            { role: CREW_ROLES.PILOT, x: 0, y: 0.15, z: 0.8, lookDir: [0, 0, 1] },
        ];

        return this;
    }

    _buildFuselage(M) {
        // Slim, elongated fuselage
        const coreGeo = _taperBox(
            new THREE.BoxGeometry(0.8, 0.5, 4.5, 1, 1, 4),
            0.6, 0.5, 0.4
        );
        this.hull.add(_mesh(coreGeo, M.hull, [0, 0, 0]));

        // Upper spine plate
        const spineGeo = new THREE.BoxGeometry(0.6, 0.06, 3.8);
        this.hull.add(_mesh(spineGeo, M.hullDark, [0, 0.28, -0.2]));

        // Lower belly plate
        const bellyGeo = new THREE.BoxGeometry(0.7, 0.05, 3.5);
        this.hull.add(_mesh(bellyGeo, M.hullDark, [0, -0.27, -0.1]));

        // Side accent stripes
        for (const sign of [-1, 1]) {
            const stripeGeo = new THREE.BoxGeometry(0.03, 0.08, 3.2);
            this.hull.add(_mesh(stripeGeo, M.accent, [sign * 0.42, 0.1, -0.2]));
        }
    }

    _buildNose(M) {
        // Long pointed nose
        const noseGeo = new THREE.ConeGeometry(0.22, 1.8, 6);
        noseGeo.rotateX(-Math.PI / 2);
        this.hull.add(_mesh(noseGeo, M.hull, [0, 0, 3.0]));

        // Sensor tip
        const tipGeo = new THREE.SphereGeometry(0.04, 6, 4);
        this.hull.add(_mesh(tipGeo, M.chrome, [0, 0, 3.95]));

        // Nose accent ring
        const ringGeo = new THREE.TorusGeometry(0.2, 0.02, 4, 8);
        this.hull.add(_mesh(ringGeo, M.accent, [0, 0, 2.1], [Math.PI / 2, 0, 0]));
    }

    _buildCockpit(M) {
        // Small bubble canopy
        const canopyGeo = new THREE.SphereGeometry(0.35, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
        this.hull.add(_mesh(canopyGeo, M.glass, [0, 0.2, 0.8], null, [1.0, 0.6, 1.2]));

        // Frame ribs
        const ribGeo = new THREE.TorusGeometry(0.33, 0.018, 4, 10, Math.PI);
        for (let i = 0; i < 2; i++) {
            const rib = _mesh(ribGeo, M.chrome, [0, 0.2, 0.8 + i * 0.15],
                              [0, -0.3 + i * 0.6, 0], [1.0, 0.6, 0.6]);
            this.hull.add(rib);
        }
    }

    _buildSolarFins(M) {
        // Tall vertical solar fin arrays (TIE-inspired but asymmetric)
        for (const sign of [-1, 1]) {
            // Main fin — tall, thin, swept
            const finShape = new THREE.Shape();
            finShape.moveTo(0, -0.3);
            finShape.lineTo(0, 1.2);
            finShape.lineTo(-0.8, 0.8);
            finShape.lineTo(-1.2, -0.3);
            finShape.closePath();

            const finGeo = new THREE.ExtrudeGeometry(finShape, {
                depth: 0.04, bevelEnabled: false,
            });
            this.hull.add(_mesh(finGeo, M.hullDark, [sign * 0.5, 0, -0.3],
                [0, Math.PI / 2, 0], [sign, 1, 1]));

            // Solar panel surface (emissive accent)
            const panelShape = new THREE.Shape();
            panelShape.moveTo(0.05, -0.2);
            panelShape.lineTo(0.05, 1.05);
            panelShape.lineTo(-0.65, 0.7);
            panelShape.lineTo(-1.0, -0.2);
            panelShape.closePath();

            const panelGeo = new THREE.ExtrudeGeometry(panelShape, {
                depth: 0.02, bevelEnabled: false,
            });
            this.hull.add(_mesh(panelGeo, M.accent, [sign * 0.52, 0, -0.28],
                [0, Math.PI / 2, 0], [sign, 1, 1]));

            // Fin support strut
            const strutGeo = new THREE.BoxGeometry(0.04, 0.15, 0.8);
            this.hull.add(_mesh(strutGeo, M.trim, [sign * 0.45, 0.0, -0.3]));
        }
    }

    _buildSensorDish(M) {
        // Oversized sensor dish on top
        const dishGeo = new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.4);
        const dish = _mesh(dishGeo, M.chrome, [0, 0.45, -0.5], [Math.PI, 0, 0]);
        this.hull.add(dish);

        // Dish mount
        const mountGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.15, 6);
        this.hull.add(_mesh(mountGeo, M.trim, [0, 0.35, -0.5]));

        // Receiver element at dish center
        const recvGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 4);
        this.hull.add(_mesh(recvGeo, M.accent, [0, 0.55, -0.5]));
    }

    _buildEngines(M) {
        // Single rear engine
        const housingGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.5, 8);
        housingGeo.rotateX(Math.PI / 2);
        this.hull.add(_mesh(housingGeo, M.trim, [0, 0, -2.5]));

        const nozzleGeo = new THREE.TorusGeometry(0.22, 0.025, 4, 8);
        this.hull.add(_mesh(nozzleGeo, M.chrome, [0, 0, -2.78], [Math.PI / 2, 0, 0]));

        // Engine glow
        const glowGeo = new THREE.CircleGeometry(0.20, 10);
        const glow = _mesh(glowGeo, M.engine, [0, 0, -2.80], [0, Math.PI, 0]);
        this.hull.add(glow);
        this.engineGlows.push(glow);

        const coreGeo = new THREE.CircleGeometry(0.10, 8);
        const core = _mesh(coreGeo, M.engineInner, [0, 0, -2.81], [0, Math.PI, 0]);
        this.hull.add(core);
        this.engineGlows.push(core);

        this.enginePositions.push({ x: 0, y: 0, z: -2.80, radius: 0.20 });
    }

    _buildRunningLights(M) {
        const lightGeo = new THREE.SphereGeometry(0.025, 4, 4);

        this.hull.add(_mesh(lightGeo, M.lightRed, [-0.52, 0.3, -0.1]));
        this.runningLights.push(this.hull.children[this.hull.children.length - 1]);

        this.hull.add(_mesh(lightGeo, M.lightGreen, [0.52, 0.3, -0.1]));
        this.runningLights.push(this.hull.children[this.hull.children.length - 1]);

        this.hull.add(_mesh(lightGeo, M.lightWhite, [0, 0.1, 3.9]));
        this.runningLights.push(this.hull.children[this.hull.children.length - 1]);
    }

    _buildLandingGear(M) {
        this.landingGear = new THREE.Group();

        const positions = [
            { x: 0.4, z: 0.8 },
            { x: -0.4, z: 0.8 },
            { x: 0, z: -1.8 },
        ];

        for (const pos of positions) {
            const strutGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.3, 4);
            this.landingGear.add(_mesh(strutGeo, M.strut, [pos.x, -0.4, pos.z]));

            const padGeo = new THREE.CylinderGeometry(0.08, 0.10, 0.03, 6);
            this.landingGear.add(_mesh(padGeo, M.pad, [pos.x, -0.57, pos.z]));
        }

        this.hull.add(this.landingGear);
    }
}
