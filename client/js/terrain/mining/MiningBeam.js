/**
 * THE GALACTIC ORDER - Mining Beam Visuals
 *
 * Handles mining beam geometry, materials, and visual effects:
 * outer dashed line, inner bright core, energy particles traveling
 * along the beam, and the impact point glow.
 */

import * as THREE from 'three';

export class MiningBeam {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     * @param {Object} config - Shared MINING_CONFIG reference
     */
    constructor(scene, camera, config) {
        this.scene = scene;
        this.camera = camera;
        this.config = config;

        // Outer dashed beam
        this._beamOuterMat = new THREE.LineDashedMaterial({
            color: this.config.beamColor,
            transparent: true,
            opacity: 0.6,
            dashSize: 0.3,
            gapSize: 0.1,
            linewidth: 1,
        });
        this._beamOuterGeo = new THREE.BufferGeometry();
        this._beamOuterGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        this._beamOuterLine = null;

        // Inner bright beam
        this._beamInnerMat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            linewidth: 1,
        });
        this._beamInnerGeo = new THREE.BufferGeometry();
        this._beamInnerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        this._beamInnerLine = null;

        // Energy particles traveling along beam (pooled)
        this._beamParticles = null;
        this._beamParticleGeo = null;
        this._beamParticleMat = null;
        this._beamParticlePhases = [];
        this._initBeamParticles();

        // Legacy reference kept for deactivate compatibility
        this._beamMesh = null;

        // Hit point light (glows at impact point)
        this._hitLight = new THREE.PointLight(this.config.beamColor, 0, 5);
        this.scene.add(this._hitLight);
    }

    // --------------------------------------------------------
    // BEAM PARTICLE POOL INIT
    // --------------------------------------------------------

    _initBeamParticles() {
        const count = this.config.beamParticleCount;
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        this._beamParticleGeo = new THREE.BufferGeometry();
        this._beamParticleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this._beamParticleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        this._beamParticleMat = new THREE.PointsMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            size: 0.08,
            sizeAttenuation: true,
        });

        this._beamParticles = new THREE.Points(this._beamParticleGeo, this._beamParticleMat);
        this._beamParticles.frustumCulled = true;
        this._beamParticles.visible = false;
        this.scene.add(this._beamParticles);

        // Initialize phases spread evenly along beam
        this._beamParticlePhases = [];
        for (let i = 0; i < count; i++) {
            this._beamParticlePhases.push(i / count);
        }
    }

    // --------------------------------------------------------
    // PUBLIC API
    // --------------------------------------------------------

    /**
     * Show beam from camera barrel to hitPoint.
     * @param {THREE.Vector3} origin - Unused (computed from camera); kept for API symmetry
     * @param {THREE.Vector3} target - World-space impact point
     */
    activate(origin, target) {
        this._showBeam(target);
    }

    /** Hide beam and reset impact glow. */
    deactivate() {
        if (this._beamOuterLine) {
            this._beamOuterLine.visible = false;
        }
        if (this._beamInnerLine) {
            this._beamInnerLine.visible = false;
        }
        if (this._beamParticles) {
            this._beamParticles.visible = false;
        }
        // Legacy compat
        if (this._beamMesh) {
            this._beamMesh.visible = false;
        }
        this._hitLight.intensity = 0;
    }

    /**
     * Per-frame update (currently a no-op; beam particles are updated in activate).
     * @param {number} dt
     */
    update(dt) {
        // Beam particle motion is handled inside _showBeam per-call.
    }

    /**
     * Adjust visual quality. Rebuilds beam particle pool.
     * @param {string} tier - 'POTATO' | 'LOW' | 'MEDIUM' | 'HIGH'
     */
    setQuality(tier) {
        // Rebuild beam particles pool with current config count
        if (this._beamParticles) {
            this.scene.remove(this._beamParticles);
            this._beamParticleGeo.dispose();
            this._beamParticleMat.dispose();
        }
        this._initBeamParticles();
    }

    /** Dispose all GPU resources. */
    dispose() {
        if (this._beamOuterLine) {
            this.scene.remove(this._beamOuterLine);
        }
        if (this._beamInnerLine) {
            this.scene.remove(this._beamInnerLine);
        }
        this._beamOuterGeo.dispose();
        this._beamInnerGeo.dispose();
        this._beamOuterMat.dispose();
        this._beamInnerMat.dispose();

        if (this._beamParticles) {
            this.scene.remove(this._beamParticles);
            this._beamParticleGeo.dispose();
            this._beamParticleMat.dispose();
        }

        // Legacy beam mesh
        if (this._beamMesh) {
            this.scene.remove(this._beamMesh);
            this._beamMesh.geometry.dispose();
            this._beamMesh.material.dispose();
        }

        this.scene.remove(this._hitLight);
    }

    // --------------------------------------------------------
    // INTERNAL
    // --------------------------------------------------------

    _showBeam(hitPoint) {
        // Beam start: slightly below and in front of camera (gun barrel position)
        const start = this.camera.position.clone();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        start.addScaledVector(forward, 0.5);
        start.addScaledVector(right, 0.2);
        start.y -= 0.15;

        const direction = new THREE.Vector3().subVectors(hitPoint, start);
        const length = direction.length();
        direction.normalize();

        // --- Outer dashed beam (scanning laser feel) ---
        const crackle = (Math.random() - 0.5) * 0.015;
        const up = new THREE.Vector3(0, 1, 0);
        const lateral = new THREE.Vector3().crossVectors(direction, up).normalize();

        const outerPosArr = this._beamOuterGeo.getAttribute('position').array;
        outerPosArr[0] = start.x + lateral.x * crackle;
        outerPosArr[1] = start.y + lateral.y * crackle;
        outerPosArr[2] = start.z + lateral.z * crackle;
        outerPosArr[3] = hitPoint.x + lateral.x * crackle * 0.5;
        outerPosArr[4] = hitPoint.y + lateral.y * crackle * 0.5;
        outerPosArr[5] = hitPoint.z + lateral.z * crackle * 0.5;
        this._beamOuterGeo.getAttribute('position').needsUpdate = true;
        this._beamOuterGeo.computeBoundingSphere();

        if (!this._beamOuterLine) {
            this._beamOuterLine = new THREE.Line(this._beamOuterGeo, this._beamOuterMat);
            this._beamOuterLine.computeLineDistances();
            this._beamOuterLine.frustumCulled = true;
            this.scene.add(this._beamOuterLine);
        }
        this._beamOuterLine.computeLineDistances();
        this._beamOuterLine.visible = true;
        this._beamOuterMat.opacity = 0.4 + Math.random() * 0.3;

        // --- Inner bright beam (thinner, brighter core) ---
        const innerPosArr = this._beamInnerGeo.getAttribute('position').array;
        innerPosArr[0] = start.x;
        innerPosArr[1] = start.y;
        innerPosArr[2] = start.z;
        innerPosArr[3] = hitPoint.x;
        innerPosArr[4] = hitPoint.y;
        innerPosArr[5] = hitPoint.z;
        this._beamInnerGeo.getAttribute('position').needsUpdate = true;
        this._beamInnerGeo.computeBoundingSphere();

        if (!this._beamInnerLine) {
            this._beamInnerLine = new THREE.Line(this._beamInnerGeo, this._beamInnerMat);
            this._beamInnerLine.frustumCulled = true;
            this.scene.add(this._beamInnerLine);
        }
        this._beamInnerLine.visible = true;
        this._beamInnerMat.opacity = 0.7 + Math.random() * 0.3;

        // --- Energy particles traveling along beam toward target ---
        if (this._beamParticles && this.config.beamParticleCount > 0) {
            const bpPosArr = this._beamParticleGeo.getAttribute('position').array;
            for (let i = 0; i < this._beamParticlePhases.length; i++) {
                this._beamParticlePhases[i] += 0.025;
                if (this._beamParticlePhases[i] > 1.0) {
                    this._beamParticlePhases[i] -= 1.0;
                }
                const t = this._beamParticlePhases[i];
                bpPosArr[i * 3]     = start.x + direction.x * length * t;
                bpPosArr[i * 3 + 1] = start.y + direction.y * length * t;
                bpPosArr[i * 3 + 2] = start.z + direction.z * length * t;
            }
            this._beamParticleGeo.getAttribute('position').needsUpdate = true;
            this._beamParticleGeo.computeBoundingSphere();
            this._beamParticles.visible = true;
        }

        // Hit light at impact point
        this._hitLight.position.copy(hitPoint);
        this._hitLight.intensity = 2 + Math.random();
    }
}
