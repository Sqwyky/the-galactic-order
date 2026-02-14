/**
 * THE GALACTIC ORDER - Biome Classification
 *
 * Dual-heightmap biome system:
 * - Heightmap 1 (from one CA rule): ELEVATION
 * - Heightmap 2 (from a different CA rule): MOISTURE
 *
 * The combination determines the biome at each point.
 * This is how we get deserts, forests, oceans, and ice caps
 * all from cellular automata rules.
 *
 * Inspired by the Whittaker biome diagram (real-world ecology).
 */

import { generateHeightmap } from './heightmap.js';
import { hashSeed } from './hashSeed.js';

// ============================================================
// BIOME DEFINITIONS
// ============================================================

/**
 * All biome types with their properties.
 * Used for terrain coloring, resource distribution, and creature spawning.
 */
export const BIOMES = {
    DEEP_OCEAN:     { id: 0,  name: 'Deep Ocean',     color: [15, 30, 80],    traversable: false, hazard: 0.0 },
    OCEAN:          { id: 1,  name: 'Ocean',           color: [25, 55, 120],   traversable: false, hazard: 0.0 },
    BEACH:          { id: 2,  name: 'Beach',           color: [194, 178, 128], traversable: true,  hazard: 0.0 },
    DESERT:         { id: 3,  name: 'Desert',          color: [210, 180, 100], traversable: true,  hazard: 0.4 },
    SAVANNA:        { id: 4,  name: 'Savanna',         color: [160, 170, 60],  traversable: true,  hazard: 0.1 },
    GRASSLAND:      { id: 5,  name: 'Grassland',       color: [80, 160, 50],   traversable: true,  hazard: 0.0 },
    FOREST:         { id: 6,  name: 'Forest',          color: [30, 110, 40],   traversable: true,  hazard: 0.1 },
    DENSE_FOREST:   { id: 7,  name: 'Dense Forest',    color: [15, 75, 25],    traversable: true,  hazard: 0.2 },
    SWAMP:          { id: 8,  name: 'Swamp',           color: [50, 80, 40],    traversable: true,  hazard: 0.3 },
    MOUNTAIN:       { id: 9,  name: 'Mountain',        color: [130, 120, 110], traversable: true,  hazard: 0.2 },
    SNOW_PEAK:      { id: 10, name: 'Snow Peak',       color: [230, 235, 240], traversable: true,  hazard: 0.5 },
    ICE:            { id: 11, name: 'Ice',             color: [200, 220, 240], traversable: true,  hazard: 0.6 },
};

/**
 * Biome lookup array indexed by ID for fast access.
 */
export const BIOME_BY_ID = Object.values(BIOMES);

// ============================================================
// BIOME CLASSIFICATION
// ============================================================

/**
 * Classify a single point into a biome based on elevation and moisture.
 *
 * Uses a Whittaker-style diagram:
 *
 *  Moisture →   DRY          MEDIUM       WET
 *  ───────────────────────────────────────────
 *  HIGH  elev   Snow Peak    Snow Peak    Ice
 *  MED-HI       Mountain     Mountain     Dense Forest
 *  MEDIUM       Desert       Grassland    Forest
 *  MED-LO       Savanna      Savanna      Swamp
 *  LOW          Beach        Beach        Beach
 *  WATER        Ocean        Ocean        Deep Ocean
 *
 * @param {number} elevation - Elevation value [0, 1]
 * @param {number} moisture - Moisture value [0, 1]
 * @returns {Object} Biome object from BIOMES
 */
export function classifyBiome(elevation, moisture) {
    // Water level
    if (elevation < 0.20) return BIOMES.DEEP_OCEAN;
    if (elevation < 0.30) return BIOMES.OCEAN;
    if (elevation < 0.33) return BIOMES.BEACH;

    // Land biomes (elevation 0.33 - 1.0)
    if (elevation > 0.85) {
        // High altitude
        return moisture > 0.5 ? BIOMES.ICE : BIOMES.SNOW_PEAK;
    }

    if (elevation > 0.70) {
        // Mountain range
        if (moisture > 0.7) return BIOMES.DENSE_FOREST;
        return BIOMES.MOUNTAIN;
    }

    if (elevation > 0.50) {
        // Mid elevation
        if (moisture < 0.25) return BIOMES.DESERT;
        if (moisture < 0.50) return BIOMES.GRASSLAND;
        if (moisture < 0.75) return BIOMES.FOREST;
        return BIOMES.DENSE_FOREST;
    }

    // Low elevation (0.33 - 0.50)
    if (moisture < 0.30) return BIOMES.SAVANNA;
    if (moisture < 0.60) return BIOMES.SAVANNA;
    return BIOMES.SWAMP;
}

// ============================================================
// FULL BIOME MAP GENERATION
// ============================================================

/**
 * Generate a complete biome map for a planet.
 *
 * Uses two different CA rules to create two independent heightmaps:
 * - Rule A → elevation map
 * - Rule B → moisture map
 * Then classifies each point by looking up both values.
 *
 * @param {number} planetSeed - The planet's seed (from seed chain)
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @param {Object} [options] - Generation options
 * @param {number} [options.elevationRule] - Override elevation CA rule
 * @param {number} [options.moistureRule] - Override moisture CA rule
 * @returns {{
 *   biomeIds: Uint8Array,
 *   elevation: Float32Array,
 *   moisture: Float32Array,
 *   elevationRule: number,
 *   moistureRule: number
 * }}
 */
export function generateBiomeMap(planetSeed, width, height, options = {}) {
    // Derive two different rules from the planet seed
    const elevationRule = options.elevationRule ?? (hashSeed(planetSeed, 'elevation') & 0xFF);
    const moistureRule = options.moistureRule ?? (hashSeed(planetSeed, 'moisture') & 0xFF);

    // Generate two independent heightmaps
    const elevationSeed = hashSeed(planetSeed, 'elev_seed');
    const moistureSeed = hashSeed(planetSeed, 'moist_seed');

    const elevation = generateHeightmap(elevationRule, width, height, elevationSeed);
    const moisture = generateHeightmap(moistureRule, width, height, moistureSeed);

    // Classify each point
    const biomeIds = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
        const biome = classifyBiome(elevation[i], moisture[i]);
        biomeIds[i] = biome.id;
    }

    return {
        biomeIds,
        elevation,
        moisture,
        elevationRule,
        moistureRule
    };
}

/**
 * Get the color for a given biome ID.
 * Returns RGB array [0-255, 0-255, 0-255].
 *
 * @param {number} biomeId - Biome ID (0-11)
 * @returns {number[]} RGB color array
 */
export function getBiomeColor(biomeId) {
    if (biomeId >= 0 && biomeId < BIOME_BY_ID.length) {
        return BIOME_BY_ID[biomeId].color;
    }
    return [255, 0, 255]; // Magenta = error/missing biome
}

/**
 * Get biome distribution statistics for a biome map.
 *
 * @param {Uint8Array} biomeIds - Biome ID array
 * @returns {Object[]} Array of { biome, count, percentage } sorted by count
 */
export function biomeDistribution(biomeIds) {
    const counts = new Map();

    for (let i = 0; i < biomeIds.length; i++) {
        const id = biomeIds[i];
        counts.set(id, (counts.get(id) || 0) + 1);
    }

    const total = biomeIds.length;
    const distribution = [];

    for (const [id, count] of counts) {
        distribution.push({
            biome: BIOME_BY_ID[id],
            count,
            percentage: ((count / total) * 100).toFixed(1)
        });
    }

    distribution.sort((a, b) => b.count - a.count);
    return distribution;
}
