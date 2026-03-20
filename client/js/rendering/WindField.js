/**
 * THE GALACTIC ORDER - Wind Field System
 *
 * Generates a scrolling 2D wind vector texture that all vegetation
 * shaders sample for spatially coherent wind gusts.
 *
 * Without this: every grass blade and plant sways with a global sine
 * wave — wind is identical everywhere, feels mechanical.
 *
 * With this: wind gusts travel across the landscape as visible waves,
 * grass bends in clusters, and individual plants react to local gusts.
 *
 * Architecture:
 * 1. A 256x256 RGBA DataTexture encodes wind vectors (RG = direction XZ)
 * 2. Each frame, the texture scrolls and is perturbed by layered noise
 * 3. All vegetation shaders sample the wind texture at their world XZ
 * 4. The same texture is shared across grass, flora, and particles
 *
 * Performance: ~0.1ms per update (CPU-side noise generation).
 * The texture is uploaded once per frame via needsUpdate.
 */

import * as THREE from 'three';

const WIND_RESOLUTION = 128;
const WIND_WORLD_SIZE = 256; // Wind field covers 256m x 256m (tiles seamlessly)

export class WindField {
    /**
     * @param {Object} options
     * @param {number} [options.baseStrength=0.15] - Base wind strength
     * @param {number} [options.gustStrength=0.4] - Gust peak strength
     * @param {number} [options.gustFrequency=0.3] - How often gusts occur
     * @param {THREE.Vector2} [options.windDirection] - Dominant wind direction
     * @param {number} [options.scrollSpeed=5.0] - How fast wind moves across world
     */
    constructor(options = {}) {
        this.baseStrength = options.baseStrength || 0.15;
        this.gustStrength = options.gustStrength || 0.4;
        this.gustFrequency = options.gustFrequency || 0.3;
        this.windDirection = options.windDirection || new THREE.Vector2(0.7, 0.3).normalize();
        this.scrollSpeed = options.scrollSpeed || 5.0;

        // Create the wind texture (RG = wind direction, B = gust intensity, A = unused)
        const size = WIND_RESOLUTION;
        this._data = new Float32Array(size * size * 4);
        this._texture = new THREE.DataTexture(
            this._data,
            size, size,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        this._texture.wrapS = THREE.RepeatWrapping;
        this._texture.wrapT = THREE.RepeatWrapping;
        this._texture.minFilter = THREE.LinearFilter;
        this._texture.magFilter = THREE.LinearFilter;

        // Scroll offset
        this._scrollX = 0;
        this._scrollZ = 0;

        // Time accumulator for gust waves
        this._time = 0;

        // Generate initial wind field
        this._generate(0);
    }

    /** Get the wind texture for use in vegetation shaders */
    get texture() {
        return this._texture;
    }

    /** World size covered by the wind field (for UV computation in shaders) */
    get worldSize() {
        return WIND_WORLD_SIZE;
    }

    /**
     * Update the wind field each frame.
     * @param {number} dt - Delta time
     * @param {THREE.Vector3} cameraPosition - Camera world position (for centering)
     */
    update(dt, cameraPosition) {
        this._time += dt;

        // Scroll the wind field in the dominant direction
        this._scrollX += this.windDirection.x * this.scrollSpeed * dt;
        this._scrollZ += this.windDirection.y * this.scrollSpeed * dt;

        this._generate(this._time);
        this._texture.needsUpdate = true;
    }

    /**
     * Generate the wind field data.
     * Uses multi-octave noise + gust wave patterns.
     */
    _generate(time) {
        const size = WIND_RESOLUTION;
        const data = this._data;
        const baseX = this.windDirection.x * this.baseStrength;
        const baseZ = this.windDirection.y * this.baseStrength;

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;

                // World-space coordinates for this texel
                const wx = (x / size) * WIND_WORLD_SIZE + this._scrollX;
                const wz = (y / size) * WIND_WORLD_SIZE + this._scrollZ;

                // Base wind (constant direction)
                let windX = baseX;
                let windZ = baseZ;

                // Gust waves — large-scale turbulence that sweeps across landscape
                const gust1 = Math.sin(wx * 0.02 + time * 0.8) * Math.cos(wz * 0.015 + time * 0.5);
                const gust2 = Math.sin(wx * 0.05 + wz * 0.03 + time * 1.3) * 0.5;
                const gustIntensity = (gust1 + gust2) * 0.5 + 0.5; // 0-1 range

                // Gust direction (rotates slightly from base wind)
                const gustAngle = Math.sin(time * this.gustFrequency + wx * 0.01) * 0.5;
                const cosA = Math.cos(gustAngle);
                const sinA = Math.sin(gustAngle);
                const gustX = (this.windDirection.x * cosA - this.windDirection.y * sinA) * this.gustStrength;
                const gustZ = (this.windDirection.x * sinA + this.windDirection.y * cosA) * this.gustStrength;

                windX += gustX * gustIntensity;
                windZ += gustZ * gustIntensity;

                // Small-scale turbulence
                const turb = Math.sin(wx * 0.15 + time * 2.0) * Math.cos(wz * 0.12 + time * 1.7) * 0.05;
                windX += turb;
                windZ += turb * 0.7;

                // Store in texture
                data[idx] = windX;     // R: wind X
                data[idx + 1] = windZ; // G: wind Z
                data[idx + 2] = gustIntensity; // B: gust intensity (for visual effects)
                data[idx + 3] = 1.0;   // A: unused
            }
        }
    }

    dispose() {
        this._texture.dispose();
    }
}

/**
 * GLSL snippet for sampling the wind field in vegetation shaders.
 * Include this in your vertex shader's uniforms and use sampleWind().
 *
 * Required uniforms:
 *   uniform sampler2D uWindField;
 *   uniform float uWindFieldSize; // = WindField.worldSize (256.0)
 *   uniform vec2 uWindFieldOffset; // camera XZ for tiling
 *
 * Usage in vertex shader:
 *   vec2 wind = sampleWind(worldPosition.xz);
 *   pos.x += wind.x * heightFactor;
 *   pos.z += wind.y * heightFactor;
 */
export const WIND_FIELD_GLSL = /* glsl */ `
    uniform sampler2D uWindField;
    uniform float uWindFieldSize;

    vec2 sampleWind(vec2 worldXZ) {
        vec2 uv = worldXZ / uWindFieldSize;
        vec4 wind = texture2D(uWindField, uv);
        return wind.rg;
    }

    float sampleGustIntensity(vec2 worldXZ) {
        vec2 uv = worldXZ / uWindFieldSize;
        return texture2D(uWindField, uv).b;
    }
`;
