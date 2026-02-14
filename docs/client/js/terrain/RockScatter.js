/**
 * THE GALACTIC ORDER - Rock Scatter System
 *
 * NMS-style scattered rocks and boulders on planet surfaces.
 * Uses InstancedMesh with low-poly rock geometry for performance.
 *
 * Rocks are placed deterministically based on position hash (same rocks
 * every time you visit). Different biomes get different rock densities
 * and sizes — mountains get large boulders, deserts get scattered stones.
 *
 * Performance: ~50 rocks per chunk, 1 draw call per chunk.
 * Only chunks within rockRadius get rocks (typically 2-3 chunks).
 */

import * as THREE from 'three';
import { hashSeed } from '../generation/hashSeed.js';
import { TERRAIN_CONFIG } from './TerrainChunk.js';
import { createSupershapeGeometry, normalizeGeometry } from '../generation/superformula.js';
import { deriveShapeParams, deriveShapeColors } from '../generation/caShapeParams.js';

// ============================================================
// ROCK CONFIGURATION
// ============================================================

const ROCK_CONFIG = {
    rocksPerChunk: 40,
    rockRadius: 3,       // chunks around camera that get rocks
    minScale: 0.2,
    maxScale: 1.5,
    // Biome → density & scale multiplier
    biomeDensity: {
        2: 0.3,   // Beach — scattered shells/pebbles
        3: 0.5,   // Desert — scattered rocks
        4: 0.3,   // Savanna — occasional boulders
        5: 0.2,   // Grassland — sparse
        6: 0.3,   // Forest — mossy rocks
        7: 0.4,   // Dense Forest — scattered
        8: 0.2,   // Swamp — few
        9: 1.0,   // Mountain — lots of boulders
        10: 0.8,  // Snow Peak — rocky
        11: 0.5,  // Ice — ice rocks
    },
    biomeScaleBoost: {
        9: 2.0,   // Mountain rocks are bigger
        10: 1.5,  // Snow peak rocks medium
    },
};

// ============================================================
// LOW-POLY ROCK GEOMETRY
// ============================================================

function createRockGeometry() {
    // Higher subdivision for more jagged, natural shapes
    const geo = new THREE.IcosahedronGeometry(0.5, 2); // Subdiv 2 for finer detail
    const positions = geo.getAttribute('position');

    // 5-octave perturbation for weathered, craggy rock look + erosion patterns
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);

        // Squash Y (rocks are wider than tall)
        const squash = 0.5;

        // 5-octave noise cascade for natural rock fracture patterns
        // Octave 1: large-scale deformation (boulder shape)
        const o1 = Math.sin(x * 3.1 + z * 2.7) * 0.14 +
                   Math.cos(y * 2.3 + x * 1.9) * 0.12;
        // Octave 2: medium features (ridges, faces)
        const o2 = Math.sin(x * 7.7 + y * 5.3) * 0.10 +
                    Math.cos(z * 6.1 + x * 4.9) * 0.08;
        // Octave 3: small bumps and ledges
        const o3 = Math.sin(x * 15.3 + z * 13.1 + y * 9.7) * 0.06 +
                    Math.cos(y * 14.7 + x * 11.3) * 0.05;
        // Octave 4: fine cracks and surface roughness
        const o4 = Math.sin(x * 29.3 + z * 23.1 + y * 17.7) * 0.03 +
                    Math.cos(y * 31.7 + x * 27.3) * 0.025;
        // Octave 5: micro-detail (grain texture)
        const o5 = Math.sin(x * 53.7 + y * 47.3 + z * 41.1) * 0.015 +
                    Math.cos(z * 59.3 + x * 43.7) * 0.012;

        const noise = o1 + o2 + o3 + o4 + o5;

        // Erosion pattern: vertical striations (rain erosion on exposed faces)
        const erosionY = Math.sin(x * 8.3 + z * 6.7) * Math.max(0, y) * 0.06;

        // Sharpen edges — push vertices inward more than outward
        // This creates the angular, fractured look of real rocks
        const sharpNoise = noise > 0 ? noise * 0.6 : noise * 1.4;

        // Flat bottom for ground contact
        const flatBottom = y < -0.15 ? 0.3 : 1.0;

        positions.setXYZ(i,
            x * (1.0 + sharpNoise) + Math.sin(z * 7.7) * 0.015,
            y * squash * (1.0 + sharpNoise * 0.5 - erosionY) * flatBottom,
            z * (1.0 + sharpNoise) + Math.cos(x * 9.3) * 0.015
        );
    }

    geo.computeVertexNormals();
    return geo;
}

// ============================================================
// ROCK SCATTER SYSTEM
// ============================================================

export class RockScatter {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} options
     * @param {THREE.Color} options.rockColor - Base rock color
     * @param {THREE.Color} options.fogColor - Fog color
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        this.config = { ...ROCK_CONFIG };

        const planetRule = options.planetRule;
        const rockSeed = options.rockSeed;

        // Generate rock geometry from CA rule (if provided), else use classic
        if (planetRule !== undefined && rockSeed !== undefined) {
            // Supershape rock — unique to this planet's rule
            const rockParams = deriveShapeParams(planetRule, rockSeed, 'rock');
            const rockColors = deriveShapeColors(planetRule, rockSeed);
            try {
                // Use derived modifiers but force some rock-appropriate values
                const rockModifiers = {
                    ...(rockParams.modifiers || {}),
                    noiseAmount: Math.max(rockParams.modifiers?.noiseAmount || 0, 0.04),
                    noiseScale: 4.0, // Consistent rock-scale noise
                    twistAmount: 0,  // Rocks don't twist
                    spineAmount: 0,  // Rocks don't have spines
                };
                this.rockGeo = createSupershapeGeometry(
                    rockParams.params1, rockParams.params2, 14, rockModifiers
                );
                normalizeGeometry(this.rockGeo);
                // Squash Y for rock-like shape
                const pos = this.rockGeo.getAttribute('position');
                for (let i = 0; i < pos.count; i++) {
                    pos.setY(i, pos.getY(i) * 0.55);
                }
                this.rockGeo.computeVertexNormals();
            } catch (e) {
                this.rockGeo = createRockGeometry(); // Fallback
            }

            // Rock material — PBR Standard for realistic stone look
            this.material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(
                    rockColors.secondary[0],
                    rockColors.secondary[1],
                    rockColors.secondary[2]
                ),
                roughness: 0.85,
                metalness: rockColors.metalness > 0.3 ? 0.15 : 0.02,
                flatShading: true,
                vertexColors: true,
            });
        } else {
            // Fallback: classic rock
            this.rockGeo = createRockGeometry();
            this.material = new THREE.MeshStandardMaterial({
                color: options.rockColor || new THREE.Color(0x8a7d6b),
                roughness: 0.88,
                metalness: 0.02,
                flatShading: true,
            });
        }

        // Active rock chunks
        this.rockChunks = new Map();
        this.processedChunks = new Set();

        this._dummy = new THREE.Object3D();
    }

    update(terrainChunks, cameraPosition) {
        const rockRadius = this.config.rockRadius;
        const chunkWorldSize = TERRAIN_CONFIG.chunkWorldSize;

        const camChunkX = Math.floor(cameraPosition.x / chunkWorldSize);
        const camChunkZ = Math.floor(cameraPosition.z / chunkWorldSize);

        const desiredKeys = new Set();
        for (let dx = -rockRadius; dx <= rockRadius; dx++) {
            for (let dz = -rockRadius; dz <= rockRadius; dz++) {
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > rockRadius) continue;
                desiredKeys.add(`0:${camChunkX + dx}:${camChunkZ + dz}`);
            }
        }

        // Add rocks for chunks with terrain data
        for (const key of desiredKeys) {
            if (this.rockChunks.has(key) || this.processedChunks.has(key)) continue;
            const chunk = terrainChunks.get(key);
            if (!chunk || chunk.state !== 'ready') continue;
            this._generateRocksForChunk(chunk, key);
        }

        // Remove rocks for chunks out of range
        for (const [key, mesh] of this.rockChunks) {
            if (!desiredKeys.has(key)) {
                this.scene.remove(mesh);
                mesh.dispose();
                this.rockChunks.delete(key);
            }
        }

        for (const key of this.processedChunks) {
            if (!desiredKeys.has(key)) this.processedChunks.delete(key);
        }
    }

    _generateRocksForChunk(chunk, key) {
        this.processedChunks.add(key);
        if (!chunk.elevation || !chunk.biomeIds) return;

        const dataRes = Math.round(Math.sqrt(chunk.elevation.length));
        const worldSize = chunk.worldSize;
        const rocks = [];

        for (let i = 0; i < this.config.rocksPerChunk * 3; i++) {
            const seed = hashSeed(key, i, 'rock');
            const rx = (seed & 0xFFFF) / 0x10000;  // 0 to <1
            const rz = ((seed >> 16) & 0xFFFF) / 0x10000;  // 0 to <1

            const gx = Math.floor(rx * (dataRes - 1));
            const gz = Math.floor(rz * (dataRes - 1));
            const idx = gz * dataRes + gx;

            const biomeId = chunk.biomeIds[idx];
            const density = this.config.biomeDensity[biomeId] || 0;
            if (density <= 0) continue;

            const dSeed = hashSeed(seed, 'rdensity');
            if ((dSeed & 0xFF) / 255 > density) continue;

            // Height formula — MUST match TerrainChunk.buildMesh exactly
            const elevation = chunk.elevation[idx] || 0;
            const wl = TERRAIN_CONFIG.waterLevel;
            const hs = TERRAIN_CONFIG.heightScale;
            let height = 0;
            if (elevation > wl + 0.05) {
                const normalizedElev = (elevation - wl) / (1.0 - wl);
                height = Math.pow(normalizedElev, 1.4) * hs;
                if (elevation > 0.75) height += (elevation - 0.75) * hs * 0.6;
            } else if (elevation >= wl - 0.05) {
                const t = (elevation - (wl - 0.05)) / 0.10;
                const smoothT = t * t * (3 - 2 * t);
                height = smoothT * 0.3;
            } else {
                const depth = wl > 0 ? (wl - elevation) / wl : 0;
                height = -0.3 - depth * 0.5;
            }

            const scaleBoost = this.config.biomeScaleBoost[biomeId] || 1.0;
            const scaleSeed = hashSeed(seed, 'rscale');
            const scale = (this.config.minScale +
                ((scaleSeed & 0xFF) / 255) * (this.config.maxScale - this.config.minScale)) * scaleBoost;

            const worldX = chunk.worldX + (rx - 0.5) * worldSize;
            const worldZ = chunk.worldZ + (rz - 0.5) * worldSize;

            const rotSeed = hashSeed(seed, 'rrot');
            const rotY = ((rotSeed & 0xFFFF) / 0x10000) * Math.PI * 2;
            const rotX = ((rotSeed >> 8 & 0xFF) / 255 - 0.5) * 0.4;

            rocks.push({ worldX, worldZ, height, scale, rotX, rotY });
            if (rocks.length >= this.config.rocksPerChunk) break;
        }

        if (rocks.length === 0) return;

        const instancedMesh = new THREE.InstancedMesh(
            this.rockGeo, this.material, rocks.length
        );
        instancedMesh.frustumCulled = true;
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;

        // Per-instance colors for variation
        const colors = [];
        for (let i = 0; i < rocks.length; i++) {
            const r = rocks[i];
            this._dummy.position.set(r.worldX, r.height - r.scale * 0.2, r.worldZ);
            this._dummy.rotation.set(r.rotX, r.rotY, 0);
            this._dummy.scale.set(r.scale, r.scale * 0.7, r.scale);
            this._dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, this._dummy.matrix);

            // Color variation
            const cSeed = hashSeed(r.worldX | 0, r.worldZ | 0, 'rcol');
            const variation = ((cSeed & 0xFF) / 255 - 0.5) * 0.15;
            const baseColor = this.material.color;
            const c = new THREE.Color(
                Math.max(0, Math.min(1, baseColor.r + variation)),
                Math.max(0, Math.min(1, baseColor.g + variation * 0.8)),
                Math.max(0, Math.min(1, baseColor.b + variation * 0.6))
            );
            instancedMesh.setColorAt(i, c);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
        instancedMesh.computeBoundingSphere();

        this.scene.add(instancedMesh);
        this.rockChunks.set(key, instancedMesh);
    }

    dispose() {
        for (const [key, mesh] of this.rockChunks) {
            this.scene.remove(mesh);
            mesh.dispose();
        }
        this.rockChunks.clear();
        this.rockGeo.dispose();
        this.material.dispose();
    }
}
