/**
 * THE GALACTIC ORDER - Cascade Shadow Manager
 *
 * Implements cascade shadow maps (CSM) using multiple DirectionalLights
 * with different shadow camera frustum sizes. This approach works with
 * any material (including custom ShaderMaterials like triplanar terrain)
 * without requiring material patching.
 *
 * Each cascade covers a progressively larger area at lower resolution:
 *   - Cascade 0 (near):  small frustum, sharp shadows for nearby geometry
 *   - Cascade 1 (mid):   medium frustum, decent shadows at mid range
 *   - Cascade 2 (far):   large frustum, soft shadows in the distance
 *
 * Quality tiers control the number of cascades and shadow map resolution:
 *   ULTRA:  3 cascades, 2048px each
 *   HIGH:   3 cascades, 1024px each
 *   MEDIUM: 2 cascades, 512px each
 *   LOW:    disabled (falls back to single shadow map on main sun)
 *   POTATO: disabled
 *
 * Usage:
 *   const csmManager = new CascadeShadowManager(scene, sunLight);
 *   // In game loop:
 *   csmManager.update(camera);
 *   // On quality change:
 *   csmManager.setQuality('HIGH');
 *   // Cleanup:
 *   csmManager.dispose();
 */

import * as THREE from 'three';

// ============================================================
// CASCADE CONFIGURATIONS PER QUALITY TIER
// ============================================================

const CASCADE_CONFIGS = {
    ULTRA: {
        enabled: true,
        cascades: [
            { frustumSize: 20,  mapSize: 2048, near: 0.5, far: 40,  bias: -0.0003, normalBias: 0.01 },
            { frustumSize: 60,  mapSize: 2048, near: 0.5, far: 120, bias: -0.0005, normalBias: 0.02 },
            { frustumSize: 150, mapSize: 2048, near: 0.5, far: 300, bias: -0.001,  normalBias: 0.04 },
        ],
    },
    HIGH: {
        enabled: true,
        cascades: [
            { frustumSize: 20,  mapSize: 1024, near: 0.5, far: 40,  bias: -0.0003, normalBias: 0.01 },
            { frustumSize: 60,  mapSize: 1024, near: 0.5, far: 120, bias: -0.0005, normalBias: 0.02 },
            { frustumSize: 150, mapSize: 1024, near: 0.5, far: 300, bias: -0.001,  normalBias: 0.04 },
        ],
    },
    MEDIUM: {
        enabled: true,
        cascades: [
            { frustumSize: 30,  mapSize: 512, near: 0.5, far: 60,  bias: -0.0005, normalBias: 0.02 },
            { frustumSize: 120, mapSize: 512, near: 0.5, far: 200, bias: -0.001,  normalBias: 0.04 },
        ],
    },
    LOW: {
        enabled: false,
        cascades: [],
    },
    POTATO: {
        enabled: false,
        cascades: [],
    },
};

// ============================================================
// CASCADE SHADOW MANAGER
// ============================================================

export class CascadeShadowManager {
    /**
     * @param {THREE.Scene} scene - The Three.js scene
     * @param {THREE.DirectionalLight} mainSunLight - The existing sun DirectionalLight
     */
    constructor(scene, mainSunLight) {
        /** @type {THREE.Scene} */
        this._scene = scene;

        /** @type {THREE.DirectionalLight} */
        this._mainSun = mainSunLight;

        /** @type {THREE.DirectionalLight[]} */
        this._cascadeLights = [];

        /** @type {THREE.Vector3} Sun direction (normalized, pointing FROM sun TO scene) */
        this._sunDirection = new THREE.Vector3(-100, -80, -60).normalize();

        /** @type {string} Current quality tier name */
        this._currentTier = 'ULTRA';

        /** @type {boolean} Whether CSM is currently active */
        this._enabled = false;

        /** @type {number} Distance from target to place shadow lights */
        this._sunDistance = 120;

        // Reusable vectors to avoid per-frame allocations
        this._targetPos = new THREE.Vector3();
        this._lightOffset = new THREE.Vector3();
    }

    // ================================================================
    // PUBLIC API
    // ================================================================

    /**
     * Set the quality tier. Creates/removes cascade lights as needed.
     * @param {string} tierName - 'ULTRA' | 'HIGH' | 'MEDIUM' | 'LOW' | 'POTATO'
     */
    setQuality(tierName) {
        const tier = tierName.toUpperCase();
        if (tier === this._currentTier) return;

        this._currentTier = tier;
        const config = CASCADE_CONFIGS[tier] || CASCADE_CONFIGS.LOW;

        // Remove existing cascade lights
        this._disposeCascadeLights();

        if (config.enabled) {
            this._enabled = true;

            // Disable shadows on main sun — cascades handle it
            this._mainSun.castShadow = false;

            // Create cascade lights
            for (let i = 0; i < config.cascades.length; i++) {
                const cfg = config.cascades[i];
                const light = this._createCascadeLight(cfg, i);
                this._cascadeLights.push(light);
                this._scene.add(light);
                this._scene.add(light.target);
            }

            console.log(
                `[TGO CSM] Enabled: ${config.cascades.length} cascades at ${tier} quality`
            );
        } else {
            this._enabled = false;

            // Re-enable shadows on main sun as fallback
            this._mainSun.castShadow = true;
            this._mainSun.shadow.mapSize.width = 1024;
            this._mainSun.shadow.mapSize.height = 1024;
            this._mainSun.shadow.camera.left = -80;
            this._mainSun.shadow.camera.right = 80;
            this._mainSun.shadow.camera.top = 80;
            this._mainSun.shadow.camera.bottom = -80;
            this._mainSun.shadow.camera.near = 0.5;
            this._mainSun.shadow.camera.far = 300;
            this._mainSun.shadow.bias = -0.0005;
            this._mainSun.shadow.normalBias = 0.02;
            // Force shadow map re-creation on next render
            if (this._mainSun.shadow.map) {
                this._mainSun.shadow.map.dispose();
                this._mainSun.shadow.map = null;
            }
            this._mainSun.shadow.camera.updateProjectionMatrix();

            console.log(`[TGO CSM] Disabled at ${tier} — using single shadow map fallback`);
        }
    }

    /**
     * Set the sun direction vector. Should be the direction FROM the sun
     * TO the scene center (i.e. the light's look direction).
     *
     * @param {THREE.Vector3} direction - Normalized direction vector
     */
    setSunDirection(direction) {
        this._sunDirection.copy(direction).normalize();
    }

    /**
     * Update cascade light positions to track the camera/player.
     * Call once per frame in the game loop.
     *
     * @param {THREE.Camera} camera - The active camera
     */
    update(camera) {
        if (!this._enabled || this._cascadeLights.length === 0) return;

        // Target position: where the camera is looking (at ground level)
        this._targetPos.set(camera.position.x, 0, camera.position.z);

        // Light offset: sun direction * distance (lights positioned "behind" the sun)
        this._lightOffset.copy(this._sunDirection).multiplyScalar(-this._sunDistance);

        for (const light of this._cascadeLights) {
            // Each cascade light tracks the same target but covers a different frustum size
            light.position.set(
                this._targetPos.x + this._lightOffset.x,
                this._lightOffset.y,   // Sun height is from direction * distance
                this._targetPos.z + this._lightOffset.z
            );
            light.target.position.copy(this._targetPos);
            light.target.updateMatrixWorld();
        }
    }

    /**
     * Clean up all cascade lights and shadow maps.
     */
    dispose() {
        this._disposeCascadeLights();

        // Restore main sun shadows
        this._mainSun.castShadow = true;
        this._enabled = false;

        console.log('[TGO CSM] Disposed');
    }

    /**
     * Whether CSM is currently active.
     * @returns {boolean}
     */
    get enabled() {
        return this._enabled;
    }

    /**
     * Get the number of active cascades.
     * @returns {number}
     */
    get cascadeCount() {
        return this._cascadeLights.length;
    }

    // ================================================================
    // INTERNAL
    // ================================================================

    /**
     * Create a single cascade DirectionalLight with configured shadow params.
     *
     * @param {Object} cfg - Cascade configuration
     * @param {number} index - Cascade index (for debug naming)
     * @returns {THREE.DirectionalLight}
     */
    _createCascadeLight(cfg, index) {
        // Cascade lights use very low intensity — they exist only for shadow casting.
        // The main sunLight provides actual illumination.
        // We use a tiny non-zero intensity so the light is considered active by the renderer.
        const light = new THREE.DirectionalLight(0xffffff, 0.001);
        light.name = `csm_cascade_${index}`;
        light.castShadow = true;

        // Shadow map resolution
        light.shadow.mapSize.width = cfg.mapSize;
        light.shadow.mapSize.height = cfg.mapSize;

        // Orthographic frustum for this cascade
        const half = cfg.frustumSize;
        light.shadow.camera.left = -half;
        light.shadow.camera.right = half;
        light.shadow.camera.top = half;
        light.shadow.camera.bottom = -half;
        light.shadow.camera.near = cfg.near;
        light.shadow.camera.far = cfg.far;

        // Shadow bias tuning per cascade (larger cascades need more bias)
        light.shadow.bias = cfg.bias;
        light.shadow.normalBias = cfg.normalBias;

        light.shadow.camera.updateProjectionMatrix();

        return light;
    }

    /**
     * Remove and dispose all cascade lights from the scene.
     */
    _disposeCascadeLights() {
        for (const light of this._cascadeLights) {
            if (light.shadow.map) {
                light.shadow.map.dispose();
            }
            this._scene.remove(light.target);
            this._scene.remove(light);
        }
        this._cascadeLights = [];
    }
}
