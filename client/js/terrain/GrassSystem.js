/**
 * THE GALACTIC ORDER - Grass System
 *
 * NMS-style instanced grass that populates terrain chunks near the camera.
 * Uses InstancedMesh with simple blade geometry (3 triangles per blade).
 *
 * Key design:
 * - Grass only spawns on Grassland, Savanna, Forest biomes (not ocean, beach, mountain, snow)
 * - Density varies by biome (dense forest = thick grass, desert = none)
 * - Blades sway with a wind animation (vertex shader sine wave)
 * - Grass fades out with distance via fog and alpha
 * - Chunked: each terrain chunk gets its own grass patch for frustum culling
 *
 * Performance budget:
 * - ~200 blades per chunk, 6 verts per blade = 1200 verts per chunk
 * - Only chunks within grassRadius get grass (not all 113 chunks)
 * - InstancedMesh = 1 draw call per chunk
 * - At radius 3 (about 28 chunks), that's ~5600 instances = very cheap
 */

import * as THREE from 'three';
import { hashSeed } from '../generation/hashSeed.js';
import { TERRAIN_CONFIG } from './TerrainChunk.js';

// ============================================================
// GRASS CONFIGURATION
// ============================================================

const GRASS_CONFIG = {
    bladesPerChunk: 300,     // max blades per terrain chunk
    grassRadius: 3,          // chunks around camera that get grass
    bladeWidth: 0.15,        // meters
    bladeMinHeight: 0.3,     // meters
    bladeMaxHeight: 0.8,     // meters
    windSpeed: 1.5,          // wind animation speed
    windStrength: 0.15,      // how far blades sway
    // Biomes that get grass (biome ID → density multiplier)
    biomeDensity: {
        3: 0.1,   // Desert — sparse
        4: 0.5,   // Savanna — moderate
        5: 1.0,   // Grassland — full
        6: 0.8,   // Forest — good
        7: 0.4,   // Dense Forest — undergrowth
        8: 0.3,   // Swamp — sparse
    },
};

// ============================================================
// GRASS BLADE GEOMETRY (shared across all instances)
// ============================================================

function createBladeGeometry() {
    // Cross-billboard: 2 quads at 90° to each other
    // Prevents grass from disappearing when viewed edge-on
    const positions = new Float32Array([
        // ---- Quad 1: Z-facing ----
        // Triangle 1: bottom
        -0.5, 0.0, 0.0,   0.5, 0.0, 0.0,   0.3, 0.5, 0.0,
        // Triangle 2: bottom other half
        -0.5, 0.0, 0.0,   0.3, 0.5, 0.0,  -0.3, 0.5, 0.0,
        // Triangle 3: top taper
        -0.3, 0.5, 0.0,   0.3, 0.5, 0.0,   0.0, 1.0, 0.0,

        // ---- Quad 2: X-facing (rotated 90°) ----
        // Triangle 4: bottom
        0.0, 0.0, -0.5,   0.0, 0.0, 0.5,   0.0, 0.5, 0.3,
        // Triangle 5: bottom other half
        0.0, 0.0, -0.5,   0.0, 0.5, 0.3,   0.0, 0.5, -0.3,
        // Triangle 6: top taper
        0.0, 0.5, -0.3,   0.0, 0.5, 0.3,   0.0, 1.0, 0.0,
    ]);

    // UVs for color gradient (y=0 at base, y=1 at tip)
    const uvs = new Float32Array([
        // Quad 1
        0.0, 0.0,  1.0, 0.0,  0.8, 0.5,
        0.0, 0.0,  0.8, 0.5,  0.2, 0.5,
        0.2, 0.5,  0.8, 0.5,  0.5, 1.0,
        // Quad 2
        0.0, 0.0,  1.0, 0.0,  0.8, 0.5,
        0.0, 0.0,  0.8, 0.5,  0.2, 0.5,
        0.2, 0.5,  0.8, 0.5,  0.5, 1.0,
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
}

// ============================================================
// GRASS SHADER MATERIAL
// ============================================================

function createGrassMaterial(baseColor, tipColor, fogColor, fogDensity) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uBaseColor: { value: baseColor || new THREE.Color(0x2a6e1e) },
            uTipColor: { value: tipColor || new THREE.Color(0x8eca60) },
            uWindSpeed: { value: GRASS_CONFIG.windSpeed },
            uWindStrength: { value: GRASS_CONFIG.windStrength },
            uFogColor: { value: fogColor || new THREE.Color(0x88aacc) },
            uFogDensity: { value: fogDensity || 0.0025 },
        },
        vertexShader: /* glsl */ `
            uniform float uTime;
            uniform float uWindSpeed;
            uniform float uWindStrength;

            varying vec2 vUv;
            varying float vFogDepth;

            void main() {
                vUv = uv;

                // Instance transform
                vec4 worldPos = instanceMatrix * vec4(position, 1.0);

                // Wind sway — only affects upper part of blade (uv.y > 0)
                float swayAmount = uv.y * uv.y; // Quadratic — tip sways most
                float windPhase = worldPos.x * 0.3 + worldPos.z * 0.2 + uTime * uWindSpeed;
                float windSway = sin(windPhase) * uWindStrength * swayAmount;
                float windSway2 = sin(windPhase * 0.7 + 1.3) * uWindStrength * 0.5 * swayAmount;

                worldPos.x += windSway;
                worldPos.z += windSway2;

                // Fog depth
                vec4 mvPosition = viewMatrix * worldPos;
                vFogDepth = length(mvPosition.xyz);

                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform vec3 uBaseColor;
            uniform vec3 uTipColor;
            uniform vec3 uFogColor;
            uniform float uFogDensity;

            varying vec2 vUv;
            varying float vFogDepth;

            void main() {
                // Color gradient: dark base → bright tip (fake AO)
                vec3 color = mix(uBaseColor, uTipColor, vUv.y);

                // Subtle brightness variation
                float brightness = 0.9 + vUv.y * 0.2;
                color *= brightness;

                // Fog
                float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
                fogFactor = clamp(fogFactor, 0.0, 1.0);
                color = mix(color, uFogColor, fogFactor);

                // Fade out far grass smoothly
                float distanceFade = smoothstep(180.0, 100.0, vFogDepth);
                if (distanceFade < 0.01) discard;

                gl_FragColor = vec4(color, distanceFade);
            }
        `,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        fog: false, // We handle fog manually in shader
    });
}

// ============================================================
// GRASS SYSTEM
// ============================================================

export class GrassSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} options
     * @param {THREE.Color} options.baseColor - Grass base color (dark)
     * @param {THREE.Color} options.tipColor - Grass tip color (bright)
     * @param {THREE.Color} options.fogColor - Fog color for blending
     * @param {number} options.fogDensity - Fog density
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        this.config = { ...GRASS_CONFIG };

        // Shared geometry (1 blade = 9 vertices, 3 triangles)
        this.bladeGeo = createBladeGeometry();

        // Shared material
        this.material = createGrassMaterial(
            options.baseColor,
            options.tipColor,
            options.fogColor,
            options.fogDensity
        );

        // Active grass chunks (key → InstancedMesh)
        this.grassChunks = new Map();

        // Track which terrain chunks have been processed
        this.processedChunks = new Set();

        // Dummy matrix for instance setup
        this._dummy = new THREE.Object3D();
    }

    /**
     * Update grass — add/remove grass patches based on camera position.
     * Call this after terrain chunks are updated.
     *
     * @param {Map} terrainChunks - The terrain manager's active chunks
     * @param {THREE.Vector3} cameraPosition
     * @param {number} time - Elapsed time for wind animation
     */
    update(terrainChunks, cameraPosition, time) {
        // Update wind animation
        this.material.uniforms.uTime.value = time;

        const grassRadius = this.config.grassRadius;
        const chunkWorldSize = TERRAIN_CONFIG.chunkWorldSize;

        // Camera chunk coordinates
        const camChunkX = Math.floor(cameraPosition.x / chunkWorldSize);
        const camChunkZ = Math.floor(cameraPosition.z / chunkWorldSize);

        // Determine which chunks should have grass
        const desiredKeys = new Set();
        for (let dx = -grassRadius; dx <= grassRadius; dx++) {
            for (let dz = -grassRadius; dz <= grassRadius; dz++) {
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > grassRadius) continue;
                const key = `0:${camChunkX + dx}:${camChunkZ + dz}`;
                desiredKeys.add(key);
            }
        }

        // Add grass for new chunks that have terrain data
        for (const key of desiredKeys) {
            if (this.grassChunks.has(key)) continue; // Already have grass
            if (this.processedChunks.has(key)) continue; // Already tried, no valid spots

            const terrainChunk = terrainChunks.get(key);
            if (!terrainChunk || terrainChunk.state !== 'ready') continue;

            this._generateGrassForChunk(terrainChunk, key);
        }

        // Remove grass for chunks out of range
        for (const [key, grassMesh] of this.grassChunks) {
            if (!desiredKeys.has(key)) {
                this.scene.remove(grassMesh);
                grassMesh.dispose();
                this.grassChunks.delete(key);
            }
        }

        // Clean processed set for chunks that are far away
        for (const key of this.processedChunks) {
            if (!desiredKeys.has(key)) {
                this.processedChunks.delete(key);
            }
        }
    }

    /**
     * Generate grass instances for a single terrain chunk.
     */
    _generateGrassForChunk(chunk, key) {
        this.processedChunks.add(key);

        if (!chunk.elevation || !chunk.biomeIds) return;

        const dataRes = Math.round(Math.sqrt(chunk.elevation.length));
        const worldSize = chunk.worldSize;
        const halfSize = worldSize / 2;

        // Collect valid grass positions
        const positions = [];

        for (let i = 0; i < this.config.bladesPerChunk * 3; i++) {
            // Random position within chunk
            const seed = hashSeed(key, i, 'grass');
            const rx = ((seed & 0xFFFF) / 0x10000); // 0 to <1
            const rz = (((seed >> 16) & 0xFFFF) / 0x10000); // 0 to <1

            // Grid position for biome lookup
            const gx = Math.floor(rx * (dataRes - 1));
            const gz = Math.floor(rz * (dataRes - 1));
            const idx = gz * dataRes + gx;

            const biomeId = chunk.biomeIds[idx];
            const density = this.config.biomeDensity[biomeId] || 0;
            if (density <= 0) continue;

            // Density check — random skip based on biome density
            const densitySeed = hashSeed(seed, 'density');
            if ((densitySeed & 0xFF) / 255 > density) continue;

            // World position
            const localX = (rx - 0.5) * worldSize;
            const localZ = (rz - 0.5) * worldSize;
            const worldX = chunk.worldX + localX;
            const worldZ = chunk.worldZ + localZ;

            // Get height from elevation data — MUST match TerrainChunk.buildMesh exactly
            const elevation = chunk.elevation[idx] || 0;
            const wl = TERRAIN_CONFIG.waterLevel;
            const hs = TERRAIN_CONFIG.heightScale;
            let height = 0;
            if (elevation > wl + 0.05) {
                // Above water: normalize against water level
                const normalizedElev = (elevation - wl) / (1.0 - wl);
                height = Math.pow(normalizedElev, 1.4) * hs;
                if (elevation > 0.75) {
                    height += (elevation - 0.75) * hs * 0.6;
                }
            } else if (elevation >= wl - 0.05) {
                // Beach/shoreline transition
                const t = (elevation - (wl - 0.05)) / 0.10;
                const smoothT = t * t * (3 - 2 * t);
                height = smoothT * 0.3;
            } else {
                // Below water
                const depth = wl > 0 ? (wl - elevation) / wl : 0;
                height = -0.3 - depth * 0.5;
            }

            // Blade variation
            const heightSeed = hashSeed(seed, 'h');
            const bladeHeight = this.config.bladeMinHeight +
                ((heightSeed & 0xFF) / 255) * (this.config.bladeMaxHeight - this.config.bladeMinHeight);

            const rotSeed = hashSeed(seed, 'r');
            const rotation = ((rotSeed & 0xFFFF) / 0x10000) * Math.PI; // Random Y rotation

            const tiltSeed = hashSeed(seed, 't');
            const tilt = ((tiltSeed & 0xFF) / 255 - 0.5) * 0.3; // Slight random tilt

            positions.push({ worldX, worldZ, height, bladeHeight, rotation, tilt });

            if (positions.length >= this.config.bladesPerChunk) break;
        }

        if (positions.length === 0) return;

        // Create instanced mesh
        const instancedMesh = new THREE.InstancedMesh(
            this.bladeGeo,
            this.material,
            positions.length
        );
        instancedMesh.frustumCulled = true;
        instancedMesh.castShadow = false;
        instancedMesh.receiveShadow = false;

        // Set instance matrices
        for (let i = 0; i < positions.length; i++) {
            const p = positions[i];
            this._dummy.position.set(p.worldX, p.height, p.worldZ);
            this._dummy.rotation.set(p.tilt, p.rotation, 0);
            this._dummy.scale.set(
                this.config.bladeWidth,
                p.bladeHeight,
                this.config.bladeWidth
            );
            this._dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, this._dummy.matrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;

        // Compute bounding sphere for frustum culling
        instancedMesh.computeBoundingSphere();

        this.scene.add(instancedMesh);
        this.grassChunks.set(key, instancedMesh);
    }

    dispose() {
        for (const [key, mesh] of this.grassChunks) {
            this.scene.remove(mesh);
            mesh.dispose();
        }
        this.grassChunks.clear();
        this.bladeGeo.dispose();
        this.material.dispose();
    }
}
