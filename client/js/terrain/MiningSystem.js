/**
 * THE GALACTIC ORDER - Mining System (Molecular Deconstructor)
 *
 * Thin orchestrator that coordinates the four mining sub-modules:
 *   - MiningBeam: beam geometry, materials, visual effects
 *   - MiningTarget: raycasting, integrity, damage, overheat
 *   - DeconstructionEffect: CA-pattern particle effect on destruction
 *   - ResourceCrystal: crystal spawning, magnetism pickup
 *
 * The public API is unchanged from the monolithic version so that
 * landing.html needs zero modifications.
 */

import * as THREE from 'three';
import { MINING_CONFIG } from './mining/MiningConfig.js';
import { MiningBeam } from './mining/MiningBeam.js';
import { MiningTarget } from './mining/MiningTarget.js';
import { DeconstructionEffect } from './mining/DeconstructionEffect.js';
import { ResourceCrystal } from './mining/ResourceCrystal.js';

export class MiningSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     * @param {Object} options
     * @param {number} options.planetRule - CA rule number
     * @param {number} options.planetSeed - Planet seed
     * @param {number} options.planetFrequency - Planet's resonant frequency (Hz)
     * @param {import('../ui/InventoryManager.js').InventoryManager} options.inventory
     * @param {Function} options.onResourceCollected - Callback(element, quantity, bonus)
     */
    constructor(scene, camera, options = {}) {
        this.scene = scene;
        this.camera = camera;
        this.config = { ...MINING_CONFIG };

        this.inventory = options.inventory || null;
        this.onResourceCollected = options.onResourceCollected || null;

        // Tool state
        this.enabled = false;
        this.isFiring = false;

        // Sub-modules
        this._beam = new MiningBeam(scene, camera, this.config);
        this._target = new MiningTarget(camera, this.config, {
            planetRule: options.planetRule,
            planetSeed: options.planetSeed,
            planetFrequency: options.planetFrequency,
        });
        this._deconstruction = new DeconstructionEffect(scene, this.config);
        this._crystal = new ResourceCrystal(scene, this.inventory, this.config);

        // Expose heat/overheat via target module for getHUDInfo
        // (currentTarget is tracked inside MiningTarget)

        // Input handlers
        this._mouseDown = false;
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
    }

    // ============================================================
    // ENABLE / DISABLE
    // ============================================================

    enable() {
        this.enabled = true;
        this._target.reset();
        document.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    disable() {
        this.enabled = false;
        this._mouseDown = false;
        this.isFiring = false;
        this._beam.deactivate();
        document.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('mouseup', this._onMouseUp);
    }

    /**
     * Register mineable meshes (InstancedMesh arrays from RockScatter / AlienFlora).
     * @param {THREE.InstancedMesh[]} rockMeshes
     * @param {THREE.InstancedMesh[]} floraMeshes
     */
    setMineableMeshes(rockMeshes, floraMeshes) {
        this._target.setMineableMeshes(rockMeshes, floraMeshes);
    }

    // ============================================================
    // INPUT
    // ============================================================

    _onMouseDown(e) {
        if (e.button === 0 && document.pointerLockElement) {
            this._mouseDown = true;
        }
    }

    _onMouseUp(e) {
        if (e.button === 0) {
            this._mouseDown = false;
        }
    }

    // ============================================================
    // UPDATE (call every frame)
    // ============================================================

    update(dt) {
        if (!this.enabled) return;

        dt = Math.min(dt, 0.1);

        // Update target heat/overheat state
        const { overheated } = this._target.update(dt, this._mouseDown && this.isFiring);

        // Overheat cooldown
        if (overheated) {
            this.isFiring = false;
            this._beam.deactivate();
            this._deconstruction.update(dt);
            this._crystal.update(dt, this.camera.position);
            return;
        }

        // Heat decay when not firing
        if (!this._mouseDown) {
            this.isFiring = false;
            this._beam.deactivate();
            this._deconstruction.update(dt);
            this._crystal.update(dt, this.camera.position);
            return;
        }

        // Firing -- raycast from screen center
        const detection = this._target.detectTarget();

        if (detection) {
            this.isFiring = true;
            const result = this._target.applyDamage(detection, dt);

            if (result === null) {
                // Target is dead or overheat triggered
                this._beam.deactivate();
            } else {
                // Show beam
                this._beam.activate(null, result.hitPoint);

                // Check if destroyed
                if (result.destroyed) {
                    this._destroyTarget(result.target, result.drops);
                }
            }
        } else {
            this.isFiring = false;
            this._beam.deactivate();
        }

        // Update particles and crystals
        this._deconstruction.update(dt);
        this._crystal.update(dt, this.camera.position);
    }

    // ============================================================
    // DESTRUCTION
    // ============================================================

    _destroyTarget(target, drops) {
        // 1. Hide the instance (scale to zero)
        const matrix = new THREE.Matrix4();
        matrix.makeScale(0, 0, 0);
        target.mesh.setMatrixAt(target.instanceId, matrix);
        target.mesh.instanceMatrix.needsUpdate = true;

        // 2. Spawn deconstruction particles (CA glitch effect)
        this._deconstruction.trigger(target.position, drops.element);

        // 3. Spawn resource crystal
        this._crystal.spawn(target.position, drops.element, drops.quantity, drops);

        // 4. Add to inventory
        if (this.inventory) {
            const added = this.inventory.add(drops.element, drops.quantity);
            if (this.onResourceCollected) {
                this.onResourceCollected(drops.element, added, drops.bonus);
            }
        }

        // Hide beam
        this._beam.deactivate();
    }

    // ============================================================
    // QUALITY SETTINGS (from PerformanceManager)
    // ============================================================

    /**
     * Adjust visual quality based on performance settings.
     * @param {Object} settings - Performance settings
     */
    setQuality(settings) {
        // Update shared config (all sub-modules reference it)
        this.config.particleCount = settings.miningParticleCount || 40;
        this.config.maxParticleSystems = settings.miningMaxParticleSystems || 3;
        this.config.maxCrystals = settings.miningMaxCrystals || 8;

        if (settings.quality === 'POTATO') {
            this.config.beamParticleCount = 2;
            this.config.crystalTrailEnabled = false;
            this.config.crystalTrailCount = 0;
            this.config.particleCount = Math.min(this.config.particleCount, 15);
            this.config.maxParticleSystems = 2;
            this.config.maxCrystals = 4;
        } else if (settings.quality === 'LOW') {
            this.config.beamParticleCount = 2;
            this.config.crystalTrailEnabled = true;
            this.config.crystalTrailCount = 3;
            this.config.particleCount = Math.min(this.config.particleCount, 20);
            this.config.maxParticleSystems = 2;
            this.config.maxCrystals = 6;
        } else if (settings.quality === 'MEDIUM') {
            this.config.beamParticleCount = 3;
            this.config.crystalTrailEnabled = true;
            this.config.crystalTrailCount = 4;
            this.config.maxParticleSystems = 3;
            this.config.maxCrystals = 6;
        } else {
            this.config.beamParticleCount = 3;
            this.config.crystalTrailEnabled = true;
            this.config.crystalTrailCount = 6;
            this.config.maxParticleSystems = 3;
            this.config.maxCrystals = 8;
        }

        // Rebuild beam particles pool with new count
        this._beam.setQuality(settings.quality);
    }

    // ============================================================
    // HUD INFO
    // ============================================================

    getHUDInfo() {
        return {
            heat: this._target.heat,
            maxHeat: this.config.maxHeat,
            heatPct: this._target.getHeatPct(),
            isOverheated: this._target.isOverheated(),
            isFiring: this.isFiring,
            hasTarget: this._target.currentTarget !== null && !this._target.currentTarget.isDead,
        };
    }

    // ============================================================
    // CLEANUP
    // ============================================================

    dispose() {
        this.disable();
        this._beam.dispose();
        this._deconstruction.dispose();
        this._crystal.dispose();
    }
}
