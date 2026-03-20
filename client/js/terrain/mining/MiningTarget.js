/**
 * THE GALACTIC ORDER - Mining Target Detection & Damage
 *
 * Handles raycasting for target detection, per-instance integrity
 * tracking, damage application, and overheat logic.
 */

import * as THREE from 'three';
import { hashSeed } from '../../generation/hashSeed.js';
import { ELEMENTS, determineDrops, calculateMiningEfficiency } from '../../generation/HarmonicElements.js';

/**
 * Wraps a rock/flora InstancedMesh instance as a mineable target.
 * Tracks per-instance integrity so individual rocks/plants can be mined.
 */
class MineableTarget {
    /**
     * @param {THREE.InstancedMesh} mesh
     * @param {number} instanceId
     * @param {'rock'|'flora'} type
     * @param {number} integrity
     * @param {number} biomeId
     * @param {THREE.Vector3} position
     */
    constructor(mesh, instanceId, type, integrity, biomeId, position) {
        this.mesh = mesh;
        this.instanceId = instanceId;
        this.type = type;
        this.maxIntegrity = integrity;
        this.integrity = integrity;
        this.biomeId = biomeId;
        this.position = position.clone();
        this.isDead = false;
    }
}

export class MiningTarget {
    /**
     * @param {THREE.Camera} camera
     * @param {Object} config - Shared MINING_CONFIG reference
     * @param {Object} options
     * @param {number} options.planetRule
     * @param {number} options.planetSeed
     * @param {number} options.planetFrequency
     */
    constructor(camera, config, options = {}) {
        this.camera = camera;
        this.config = config;

        this.planetRule = options.planetRule || 30;
        this.planetSeed = options.planetSeed || 42;
        this.planetFrequency = options.planetFrequency || 7.83;

        // Tool state
        this.heat = 0;
        this.isOverheatedFlag = false;
        this.overheatTimer = 0;

        // Current target (exposed for HUD)
        this.currentTarget = null;

        // Raycaster
        this._raycaster = new THREE.Raycaster();
        this._raycaster.far = this.config.range;
        this._screenCenter = new THREE.Vector2(0, 0);

        // Tracked mineable meshes (set externally)
        this._mineableMeshes = [];

        // Integrity tracking per instance (keyed by mesh.uuid + instanceId)
        this._integrityMap = new Map();
    }

    /**
     * Register mineable meshes.
     * @param {THREE.InstancedMesh[]} rockMeshes
     * @param {THREE.InstancedMesh[]} floraMeshes
     */
    setMineableMeshes(rockMeshes, floraMeshes) {
        this._mineableMeshes = [];
        for (const mesh of rockMeshes) {
            mesh.userData.mineType = 'rock';
            this._mineableMeshes.push(mesh);
        }
        for (const mesh of floraMeshes) {
            mesh.userData.mineType = 'flora';
            this._mineableMeshes.push(mesh);
        }
    }

    /**
     * Raycast from screen center to detect a mineable target.
     * @returns {{ hit: Object, mesh: THREE.InstancedMesh, instanceId: number } | null}
     */
    detectTarget() {
        this._raycaster.setFromCamera(this._screenCenter, this.camera);
        const intersects = this._raycaster.intersectObjects(this._mineableMeshes, false);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const mesh = hit.object;
            const instanceId = hit.instanceId;

            if (instanceId !== undefined && mesh.userData.mineType) {
                return { hit, mesh, instanceId };
            }
        }
        return null;
    }

    /**
     * Apply mining damage to a hit target.
     * @param {{ hit: Object, mesh: THREE.InstancedMesh, instanceId: number }} detection
     * @param {number} dt
     * @returns {{ destroyed: boolean, target: MineableTarget, drops: Object, hitPoint: THREE.Vector3 } | null}
     *   null if target is already dead
     */
    applyDamage(detection, dt) {
        const { hit, mesh, instanceId } = detection;
        const key = `${mesh.uuid}:${instanceId}`;
        const type = mesh.userData.mineType;

        // Get or create integrity tracker
        if (!this._integrityMap.has(key)) {
            const maxHP = type === 'rock' ? this.config.rockIntegrity : this.config.floraIntegrity;

            const matrix = new THREE.Matrix4();
            mesh.getMatrixAt(instanceId, matrix);
            const position = new THREE.Vector3();
            position.setFromMatrixPosition(matrix);

            const biomeId = hashSeed(Math.floor(position.x), Math.floor(position.z), 'biome') % 12;

            this._integrityMap.set(key, new MineableTarget(
                mesh, instanceId, type, maxHP, biomeId, position
            ));
        }

        const target = this._integrityMap.get(key);
        if (target.isDead) {
            return null;
        }

        this.currentTarget = target;

        // Calculate mining efficiency based on frequency tuning
        const drops = determineDrops(type, target.biomeId, hashSeed(key), this.planetRule);
        const efficiency = calculateMiningEfficiency(this.planetFrequency, drops.element);

        // Apply damage
        const damage = this.config.damagePerSecond * efficiency.efficiency * dt;
        target.integrity -= damage;

        // Apply heat
        this.heat += this.config.heatPerSecond * efficiency.heatRate * dt;
        if (this.heat >= this.config.maxHeat) {
            this.isOverheatedFlag = true;
            this.overheatTimer = this.config.overheatCooldown;
            return null;
        }

        // Check if destroyed
        const destroyed = target.integrity <= 0;
        if (destroyed) {
            target.isDead = true;
        }

        return {
            destroyed,
            target,
            drops,
            hitPoint: hit.point,
        };
    }

    /** @returns {boolean} Whether tool is overheated. */
    isOverheated() {
        return this.isOverheatedFlag;
    }

    /** @returns {number} Heat as 0..1 fraction. */
    getHeatPct() {
        return this.heat / this.config.maxHeat;
    }

    /** Reset heat and overheat state. */
    reset() {
        this.heat = 0;
        this.isOverheatedFlag = false;
        this.overheatTimer = 0;
        this.currentTarget = null;
    }

    /**
     * Per-frame update: overheat cooldown, heat decay when idle.
     * @param {number} dt
     * @param {boolean} isFiring
     * @returns {{ overheated: boolean, cooledDown: boolean }}
     */
    update(dt, isFiring) {
        let cooledDown = false;

        // Overheat cooldown
        if (this.isOverheatedFlag) {
            this.overheatTimer -= dt;
            if (this.overheatTimer <= 0) {
                this.isOverheatedFlag = false;
                this.heat = 0;
                cooledDown = true;
            }
        }

        // Heat decay when not firing
        if (!isFiring && !this.isOverheatedFlag) {
            this.heat = Math.max(0, this.heat - this.config.heatCoolRate * dt);
        }

        return { overheated: this.isOverheatedFlag, cooledDown };
    }
}
