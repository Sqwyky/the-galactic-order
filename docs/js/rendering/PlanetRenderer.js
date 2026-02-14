/**
 * THE GALACTIC ORDER - Planet Renderer
 *
 * Modular planet builder that takes a Ghost Planet descriptor
 * and builds its full 3D mesh: terrain, ocean, atmosphere, clouds, rings.
 *
 * Separated from the HTML page so it can be used in:
 * - system.html (star system view — small distant planets)
 * - planet.html (single planet close-up)
 * - surface.html (on-planet ground view)
 *
 * LOD Levels:
 *   0 — Icon (system map, just a colored sphere)
 *   1 — Space view (low-res heightmap, atmosphere glow)
 *   2 — Orbit view (full heightmap, ocean, clouds)
 *   3 — Approach (high-res, biome blending, animated ocean)
 */

import * as THREE from 'three';
import { generateDensityGrid, classifyRule } from '../generation/cellularAutomata.js';
import { hashSeed, seededRandom } from '../generation/hashSeed.js';
import { generateHeightmap } from '../generation/heightmap.js';
import { generateBiomeMap, getBiomeColor, biomeDistribution, BIOME_BY_ID } from '../generation/biomeMap.js';
import { createAtmosphere } from './AtmosphereShader.js';
import { createOcean } from './OceanShader.js';

// ============================================================
// NMS-STYLE BIOME COLORS (vivid, saturated)
// ============================================================

const NMS_COLORS = {
    0:  [10, 25, 80],      // Deep Ocean
    1:  [20, 60, 140],     // Ocean
    2:  [220, 200, 140],   // Beach
    3:  [230, 180, 80],    // Desert
    4:  [180, 200, 60],    // Savanna
    5:  [60, 180, 50],     // Grassland
    6:  [25, 140, 40],     // Forest
    7:  [15, 90, 30],      // Dense Forest
    8:  [60, 100, 50],     // Swamp
    9:  [160, 140, 120],   // Mountain
    10: [240, 245, 255],   // Snow Peak
    11: [200, 230, 250],   // Ice
};

// Per-archetype color theme overrides (makes each planet feel unique)
const ARCHETYPE_COLOR_MODS = {
    0: { sat: 0.5,  bright: 0.7  }, // Barren — washed out
    1: { sat: 1.2,  bright: 1.1  }, // Desert — warm boost
    2: { sat: 1.0,  bright: 1.0  }, // Oceanic — normal
    3: { sat: 1.1,  bright: 1.05 }, // Temperate — slight boost
    4: { sat: 0.7,  bright: 1.3  }, // Frozen — pale but bright
    5: { sat: 1.3,  bright: 0.9  }, // Volcanic — intense
    6: { sat: 1.4,  bright: 1.1  }, // Exotic — super vivid
    7: { sat: 1.2,  bright: 1.15 }, // Lush — rich
};

function getNMSColor(biomeId) {
    return NMS_COLORS[biomeId] || [255, 0, 255];
}

// ============================================================
// LOD CONFIGURATIONS
// ============================================================

const LOD_CONFIG = {
    0: { resolution: 32,  subdivisions: 4, hasOcean: false, hasClouds: false, hasAtmosphere: false },
    1: { resolution: 64,  subdivisions: 5, hasOcean: false, hasClouds: false, hasAtmosphere: true  },
    2: { resolution: 128, subdivisions: 6, hasOcean: true,  hasClouds: true,  hasAtmosphere: true  },
    3: { resolution: 256, subdivisions: 7, hasOcean: true,  hasClouds: true,  hasAtmosphere: true  },
};

// ============================================================
// PLANET RENDERER
// ============================================================

/**
 * Build a 3D planet from a ghost planet descriptor.
 *
 * @param {Object} ghostPlanet - Ghost planet from UniverseManager
 * @param {Object} options
 * @param {number} [options.lod=2] - Level of detail (0-3)
 * @param {THREE.Vector3} [options.sunDirection] - Sun direction vector
 * @param {Function} [options.onProgress] - Progress callback (0-100)
 * @returns {Object} Planet object with group, update(), dispose()
 */
export function buildPlanet(ghostPlanet, options = {}) {
    const {
        lod = 2,
        sunDirection = new THREE.Vector3(1, 0.3, 0.5).normalize(),
        onProgress = () => {},
    } = options;

    const config = LOD_CONFIG[Math.min(lod, 3)];
    const group = new THREE.Group();

    // Apply planet's axial tilt
    group.rotation.x = ghostPlanet.axialTilt || 0.15;
    group.rotation.z = (ghostPlanet.axialTilt || 0.15) * 0.4;

    const planetRadius = ghostPlanet.size || 1;
    const rule = ghostPlanet.rule;
    const seed = ghostPlanet.seed;

    let ocean = null;
    let atmosphere = null;
    let cloudMesh = null;
    let biomeData = null;

    onProgress(10);

    // ---- TERRAIN GENERATION ----
    const planetSeed = hashSeed(seed, 'planet', 0);
    biomeData = generateBiomeMap(planetSeed, config.resolution, config.resolution, {
        elevationRule: rule,
    });

    onProgress(40);

    // ---- TERRAIN MESH ----
    const terrainGeo = new THREE.IcosahedronGeometry(planetRadius, config.subdivisions);
    const pos = terrainGeo.getAttribute('position');
    const vertCount = pos.count;
    const colors = new Float32Array(vertCount * 3);

    const heightScale = 0.08 * planetRadius;
    const waterLevel = ghostPlanet.archetype?.hasOcean !== false ? 0.15 : 0.05;
    const res = config.resolution;

    // Get archetype color modifiers
    const colorMod = ARCHETYPE_COLOR_MODS[ghostPlanet.archetype?.id ?? 3] || { sat: 1.0, bright: 1.0 };

    for (let i = 0; i < vertCount; i++) {
        let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const len = Math.sqrt(x * x + y * y + z * z);
        const nx = x / len, ny = y / len, nz = z / len;

        // Spherical UV
        let u = 0.5 + Math.atan2(nz, nx) / (2 * Math.PI);
        let v = 0.5 - Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI;

        // Bilinear sampling for smooth terrain
        const fu = u * (res - 1);
        const fv = v * (res - 1);
        const px = Math.min(Math.floor(fu), res - 2);
        const py = Math.min(Math.floor(fv), res - 2);
        const fx = fu - px;
        const fy = fv - py;

        const i00 = py * res + px;
        const i10 = py * res + px + 1;
        const i01 = (py + 1) * res + px;
        const i11 = (py + 1) * res + px + 1;

        const e00 = biomeData.elevation[i00] || 0;
        const e10 = biomeData.elevation[i10] || 0;
        const e01 = biomeData.elevation[i01] || 0;
        const e11 = biomeData.elevation[i11] || 0;
        const elevation = e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy;

        // Biome with noise-based dithering for smooth transitions
        const biomeU = Math.round(fv) * res + Math.round(fu);
        const biomeId = biomeData.biomeIds[biomeU] || 0;

        // Neighbor biome for blending
        const neighborU = Math.min(biomeU + 1, biomeData.biomeIds.length - 1);
        const neighborV = Math.min(biomeU + res, biomeData.biomeIds.length - 1);
        const neighborBiomeH = biomeData.biomeIds[neighborU] || biomeId;
        const neighborBiomeV = biomeData.biomeIds[neighborV] || biomeId;

        // Displacement
        let displacement = 0;
        if (elevation > waterLevel) {
            displacement = (elevation - waterLevel) * heightScale;
            if (elevation > 0.7) {
                displacement += (elevation - 0.7) * heightScale * 2.5;
            }
        } else {
            displacement = -0.003 * planetRadius;
        }

        pos.setX(i, nx * (planetRadius + displacement));
        pos.setY(i, ny * (planetRadius + displacement));
        pos.setZ(i, nz * (planetRadius + displacement));

        // ---- BIOME BLENDING (noise dither) ----
        let r, g, b;
        if (elevation <= waterLevel) {
            const depth = 1.0 - (elevation / waterLevel);
            r = (10 + depth * 5) / 255;
            g = (40 + depth * 10) / 255;
            b = (120 + depth * 40) / 255;
        } else {
            // Primary biome color
            const col = getNMSColor(biomeId);

            // Blend with neighbors for smoother transitions
            let blendR = col[0], blendG = col[1], blendB = col[2];
            if (biomeId !== neighborBiomeH || biomeId !== neighborBiomeV) {
                const nColH = getNMSColor(neighborBiomeH);
                const nColV = getNMSColor(neighborBiomeV);
                const edgeFx = fx;
                const edgeFy = fy;
                // Smooth blend factor at biome edges
                const blendH = smoothstep(0.3, 0.7, edgeFx);
                const blendV = smoothstep(0.3, 0.7, edgeFy);

                if (biomeId !== neighborBiomeH) {
                    blendR = col[0] * (1 - blendH) + nColH[0] * blendH;
                    blendG = col[1] * (1 - blendH) + nColH[1] * blendH;
                    blendB = col[2] * (1 - blendH) + nColH[2] * blendH;
                }
                if (biomeId !== neighborBiomeV) {
                    blendR = blendR * (1 - blendV) + nColV[0] * blendV;
                    blendG = blendG * (1 - blendV) + nColV[1] * blendV;
                    blendB = blendB * (1 - blendV) + nColV[2] * blendV;
                }
            }

            // Elevation-based color variation
            const elevFactor = 0.7 + elevation * 0.3;

            // Seed-based micro variation (dithering)
            const uSeed = hashSeed(Math.round(fu * 10), Math.round(fv * 10));
            const variation = ((uSeed & 0xFF) / 255 - 0.5) * 0.06;

            r = Math.max(0, Math.min(1, (blendR / 255) * elevFactor * colorMod.bright + variation));
            g = Math.max(0, Math.min(1, (blendG / 255) * elevFactor * colorMod.bright + variation));
            b = Math.max(0, Math.min(1, (blendB / 255) * elevFactor * colorMod.bright + variation));
        }

        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
    }

    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        metalness: 0.02,
        flatShading: false,
    });
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    group.add(terrainMesh);

    onProgress(60);

    // ---- OCEAN ----
    if (config.hasOcean && ghostPlanet.archetype?.hasOcean !== false) {
        ocean = createOcean({
            radius: planetRadius * 0.998,
            sunDirection,
            waveHeight: lod >= 3 ? 0.002 : 0.001,
            waveFrequency: 8.0,
        });
        group.add(ocean.mesh);
    }

    onProgress(70);

    // ---- ATMOSPHERE ----
    if (config.hasAtmosphere && ghostPlanet.archetype?.hasAtmosphere !== false) {
        atmosphere = createAtmosphere({
            color: ghostPlanet.atmosColor || [0.3, 0.55, 0.9],
            sunDirection,
            planetRadius,
            intensity: 1.2,
            hazeStrength: 0.6,
        });
        group.add(atmosphere.outerMesh);
        group.add(atmosphere.innerMesh);
    }

    onProgress(85);

    // ---- CLOUDS ----
    if (config.hasClouds) {
        const cloudGeo = new THREE.SphereGeometry(planetRadius * 1.02, 48, 48);
        const cloudDensity = generateDensityGrid(
            (rule + 73) & 0xFF, 64, 64,
            hashSeed(seed, 'cloud'), 4
        );

        // Build cloud alpha from density
        const cloudPos = cloudGeo.getAttribute('position');
        const cloudAlphas = new Float32Array(cloudPos.count);

        for (let i = 0; i < cloudPos.count; i++) {
            let cx = cloudPos.getX(i), cy = cloudPos.getY(i), cz = cloudPos.getZ(i);
            const cl = Math.sqrt(cx * cx + cy * cy + cz * cz);
            let cu = 0.5 + Math.atan2(cz / cl, cx / cl) / (2 * Math.PI);
            let cv = 0.5 - Math.asin(cy / cl) / Math.PI;
            const cpx = Math.floor(cu * 63);
            const cpy = Math.floor(cv * 63);
            const cd = cloudDensity[cpy * 64 + cpx] || 0;
            cloudAlphas[i] = cd > 0.45 ? (cd - 0.45) * 1.5 : 0;
        }

        cloudGeo.setAttribute('alpha', new THREE.BufferAttribute(cloudAlphas, 1));

        const cloudMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.12,
            roughness: 1,
            metalness: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        group.add(cloudMesh);
    }

    // ---- RINGS (if applicable) ----
    if (ghostPlanet.hasRings) {
        const ringGeo = new THREE.RingGeometry(
            planetRadius * 1.4,
            planetRadius * 2.2,
            64
        );
        const rng = seededRandom(seed, 'ring_color');
        const ringColor = new THREE.Color(
            0.6 + rng() * 0.3,
            0.5 + rng() * 0.3,
            0.4 + rng() * 0.3
        );
        const ringMat = new THREE.MeshStandardMaterial({
            color: ringColor,
            transparent: true,
            opacity: 0.35,
            roughness: 0.9,
            metalness: 0.1,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2 + (ghostPlanet.axialTilt || 0.15);
        group.add(ringMesh);
    }

    onProgress(100);

    // Mark as generated
    ghostPlanet.meshGenerated = true;
    ghostPlanet.mesh = group;

    // ---- RETURN PLANET OBJECT ----
    return {
        group,
        biomeData,
        terrainMesh,
        ocean,
        atmosphere,
        cloudMesh,

        /**
         * Call every frame to animate ocean + clouds.
         */
        update(deltaTime) {
            if (ocean) ocean.update(deltaTime);
            if (cloudMesh) cloudMesh.rotation.y += deltaTime * 0.008;
        },

        /**
         * Update sun direction for all shaders.
         */
        setSunDirection(dir) {
            if (ocean) ocean.setSunDirection(dir);
            if (atmosphere) atmosphere.setSunDirection(dir);
        },

        /**
         * Get biome distribution for UI.
         */
        getBiomeDistribution() {
            return biomeData ? biomeDistribution(biomeData.biomeIds) : [];
        },

        /**
         * Clean up all GPU resources.
         */
        dispose() {
            group.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            if (ocean) ocean.dispose();
            if (atmosphere) atmosphere.dispose();
        },
    };
}

// ============================================================
// LOD 0 — Simple colored sphere (for system map distant view)
// ============================================================

/**
 * Build a simple colored sphere for distant planet representation.
 */
export function buildPlanetIcon(ghostPlanet) {
    const radius = ghostPlanet.size * 0.3; // Smaller for system view
    const geo = new THREE.SphereGeometry(radius, 16, 16);

    // Archetype-based base color
    const rng = seededRandom(ghostPlanet.seed, 'icon_color');
    let baseColor;
    switch (ghostPlanet.archetype?.id ?? 3) {
        case 0: baseColor = [0.5, 0.45, 0.4];  break; // Barren
        case 1: baseColor = [0.8, 0.6, 0.3];   break; // Desert
        case 2: baseColor = [0.15, 0.3, 0.7];   break; // Oceanic
        case 3: baseColor = [0.2, 0.5, 0.3];    break; // Temperate
        case 4: baseColor = [0.7, 0.8, 0.9];    break; // Frozen
        case 5: baseColor = [0.7, 0.25, 0.1];   break; // Volcanic
        case 6: baseColor = [0.5, 0.2, 0.7];    break; // Exotic
        case 7: baseColor = [0.15, 0.55, 0.2];  break; // Lush
        default: baseColor = [0.4, 0.4, 0.4];
    }

    // Add seed-based color variation
    const color = new THREE.Color(
        baseColor[0] + (rng() - 0.5) * 0.15,
        baseColor[1] + (rng() - 0.5) * 0.15,
        baseColor[2] + (rng() - 0.5) * 0.15,
    );

    const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0.1,
    });

    const mesh = new THREE.Mesh(geo, mat);

    // Add tiny atmosphere glow
    if (ghostPlanet.archetype?.hasAtmosphere !== false) {
        const glowGeo = new THREE.SphereGeometry(radius * 1.15, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(...(ghostPlanet.atmosColor || [0.3, 0.55, 0.9])),
            transparent: true,
            opacity: 0.15,
            side: THREE.BackSide,
            depthWrite: false,
        });
        mesh.add(new THREE.Mesh(glowGeo, glowMat));
    }

    return {
        mesh,
        dispose() {
            geo.dispose();
            mat.dispose();
        },
    };
}

// ============================================================
// UTILITY
// ============================================================

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
