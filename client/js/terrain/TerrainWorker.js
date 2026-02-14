/**
 * THE GALACTIC ORDER - Terrain Web Worker
 *
 * Runs heightmap generation OFF the main thread so we maintain 60FPS.
 * The main thread sends a chunk request (position, size, LOD),
 * this worker generates the CA heightmap + biome data and sends it back.
 *
 * This is the key to seamless planetary landing — generate terrain
 * for just the area under the camera, not the whole planet.
 *
 * Communication protocol:
 *   Main → Worker: { type: 'generateChunk', chunkX, chunkY, chunkSize, lod, rule, seed }
 *   Worker → Main: { type: 'chunkReady', chunkX, chunkY, heightmap, biomeIds, elevation, moisture }
 */

// We inline the generation functions here since Workers can't use ES module imports
// in all browsers. This is a self-contained computation unit.

// ============================================================
// CA ENGINE (inlined from cellularAutomata.js)
// ============================================================

function applyRule(ruleNumber, left, center, right) {
    const pattern = (left << 2) | (center << 1) | right;
    return (ruleNumber >> pattern) & 1;
}

function runCA1D(ruleNumber, width, generations, initialCells = null) {
    const grid = [];
    let row = new Uint8Array(width);
    if (initialCells !== null && initialCells.length > 0) {
        for (const pos of initialCells) {
            if (pos >= 0 && pos < width) row[pos] = 1;
        }
    } else {
        row[Math.floor(width / 2)] = 1;
    }
    for (let gen = 0; gen < generations; gen++) {
        grid.push(row.slice());
        const next = new Uint8Array(width);
        for (let i = 1; i < width - 1; i++) {
            next[i] = applyRule(ruleNumber, row[i - 1], row[i], row[i + 1]);
        }
        row = next;
    }
    return grid;
}

function generateDensityGrid(ruleNumber, width, height, seed, numRuns = 8) {
    const density = new Float32Array(width * height);
    for (let run = 0; run < numRuns; run++) {
        const startPos = ((seed * 2654435761 + run * 340573321) >>> 0) % width;
        const grid = runCA1D(ruleNumber, width, height, [startPos]);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                density[y * width + x] += grid[y][x];
            }
        }
    }
    const max = numRuns;
    for (let i = 0; i < density.length; i++) density[i] /= max;
    return density;
}

// ============================================================
// HASH SEED (inlined from hashSeed.js)
// ============================================================

function hashSeed(...args) {
    let hash = 0x811c9dc5;
    for (const arg of args) {
        const str = String(arg);
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
    }
    return hash >>> 0;
}

// ============================================================
// SMOOTHING (inlined from heightmap.js)
// ============================================================

function separableBlur(grid, width, height, radius) {
    const temp = new Float32Array(width * height);
    const output = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0, count = 0;
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = ((x + dx) % width + width) % width;
                sum += grid[y * width + nx];
                count++;
            }
            temp[y * width + x] = sum / count;
        }
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0, count = 0;
            for (let dy = -radius; dy <= radius; dy++) {
                const ny = ((y + dy) % height + height) % height;
                sum += temp[ny * width + x];
                count++;
            }
            output[y * width + x] = sum / count;
        }
    }
    return output;
}

function boxBlur(grid, width, height, radius) {
    const output = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0, count = 0;
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const wx = ((x + dx) % width + width) % width;
                    const wy = ((y + dy) % height + height) % height;
                    sum += grid[wy * width + wx];
                    count++;
                }
            }
            output[y * width + x] = sum / count;
        }
    }
    return output;
}

function generateHeightmap(ruleNumber, width, height, seed) {
    const density = generateDensityGrid(ruleNumber, width, height, seed, 8);
    const scales = [1, 2, 4, 8, 16, 32];
    const weights = [0.05, 0.10, 0.15, 0.20, 0.25, 0.25];
    const result = new Float32Array(width * height);

    for (let octave = 0; octave < scales.length; octave++) {
        const radius = scales[octave];
        const weight = weights[octave];
        const smoothed = radius > 4
            ? separableBlur(density, width, height, radius)
            : boxBlur(density, width, height, radius);
        for (let i = 0; i < result.length; i++) {
            result[i] += smoothed[i] * weight;
        }
    }

    let min = Infinity, max = -Infinity;
    for (let i = 0; i < result.length; i++) {
        if (result[i] < min) min = result[i];
        if (result[i] > max) max = result[i];
    }
    const range = max - min || 1;
    for (let i = 0; i < result.length; i++) {
        result[i] = (result[i] - min) / range;
    }
    return result;
}

// ============================================================
// BIOME CLASSIFICATION (inlined from biomeMap.js)
// ============================================================

const BIOME_IDS = {
    DEEP_OCEAN: 0, OCEAN: 1, BEACH: 2, DESERT: 3,
    SAVANNA: 4, GRASSLAND: 5, FOREST: 6, DENSE_FOREST: 7,
    SWAMP: 8, MOUNTAIN: 9, SNOW_PEAK: 10, ICE: 11,
};

function classifyBiome(elevation, moisture) {
    if (elevation < 0.20) return BIOME_IDS.DEEP_OCEAN;
    if (elevation < 0.30) return BIOME_IDS.OCEAN;
    if (elevation < 0.33) return BIOME_IDS.BEACH;
    if (elevation > 0.85) return moisture > 0.5 ? BIOME_IDS.ICE : BIOME_IDS.SNOW_PEAK;
    if (elevation > 0.70) return moisture > 0.7 ? BIOME_IDS.DENSE_FOREST : BIOME_IDS.MOUNTAIN;
    if (elevation > 0.50) {
        if (moisture < 0.25) return BIOME_IDS.DESERT;
        if (moisture < 0.50) return BIOME_IDS.GRASSLAND;
        if (moisture < 0.75) return BIOME_IDS.FOREST;
        return BIOME_IDS.DENSE_FOREST;
    }
    if (moisture < 0.30) return BIOME_IDS.SAVANNA;
    if (moisture < 0.60) return BIOME_IDS.SAVANNA;
    return BIOME_IDS.SWAMP;
}

// ============================================================
// CHUNK GENERATION
// ============================================================

/**
 * Generate terrain data for a specific chunk of the planet surface.
 *
 * KEY INSIGHT: All chunks sample from the same coherent noise field.
 * We use global coordinates (chunkX * chunkSize + localX) as input
 * to a hash-based noise function, ensuring seamless chunk borders.
 *
 * This replaces the old per-chunk CA approach which produced
 * independent heightmaps per chunk (causing visible seams).
 */

// ============================================================
// GRADIENT NOISE (Perlin-style, seamless across chunks)
// ============================================================

// Hash function that produces a pseudo-random gradient vector
function gradHash(ix, iy, seed) {
    let h = hashSeed(seed, ix, iy);
    // Use hash to pick a gradient direction (8 directions)
    const angle = (h & 0xFF) / 255.0 * Math.PI * 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
}

// Dot product of gradient and distance vector
function gradDot(ix, iy, fx, fy, seed) {
    const g = gradHash(ix, iy, seed);
    return g.x * fx + g.y * fy;
}

// Quintic interpolation (Ken Perlin's improved curve — C2 continuous)
function quintic(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function perlinNoise2D(x, y, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    // Quintic fade curves (smoother than Hermite)
    const sx = quintic(fx);
    const sy = quintic(fy);

    // Gradient dot products at four corners
    const n00 = gradDot(ix, iy, fx, fy, seed);
    const n10 = gradDot(ix + 1, iy, fx - 1, fy, seed);
    const n01 = gradDot(ix, iy + 1, fx, fy - 1, seed);
    const n11 = gradDot(ix + 1, iy + 1, fx - 1, fy - 1, seed);

    // Bilinear interpolation with quintic fade
    const nx0 = n00 * (1 - sx) + n10 * sx;
    const nx1 = n01 * (1 - sx) + n11 * sx;
    const result = nx0 * (1 - sy) + nx1 * sy;

    // Normalize from [-0.7, 0.7] to [0, 1]
    return result * 0.7 + 0.5;
}

function fbmNoise2D(x, y, seed, octaves) {
    let value = 0;
    let amplitude = 0.5;
    let frequency = 1.0;
    let totalAmp = 0;

    for (let i = 0; i < octaves; i++) {
        value += perlinNoise2D(x * frequency, y * frequency, seed + i * 31337) * amplitude;
        totalAmp += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }

    return value / totalAmp;
}

function generateChunk(params) {
    const {
        chunkX, chunkY,
        chunkSize,      // cells per chunk edge (e.g., 32)
        rule,
        seed,
        moistureRule,
    } = params;

    // Generate chunkSize+1 data points per edge for seamless stitching.
    // The last point of chunk N equals the first point of chunk N+1.
    const dataSize = chunkSize + 1;
    const finalElev = new Float32Array(dataSize * dataSize);
    const finalMoist = new Float32Array(dataSize * dataSize);
    const biomeIds = new Uint8Array(dataSize * dataSize);

    // Use the rule number to vary noise character
    const elevSeed = hashSeed(seed, 'elev', rule);
    const moistSeed = hashSeed(seed, 'moist', moistureRule || ((rule + 73) & 0xFF));

    // Scale factor: controls feature size (lower = larger, smoother features)
    // NMS-style: large rolling hills, not sharp noise
    const ruleClass = classifyRuleClass(rule);
    const featureScale = ruleClass === 1 ? 0.006 :
                         ruleClass === 2 ? 0.008 :
                         ruleClass === 3 ? 0.01 :
                         0.012; // Class 4 = most complex

    const octaves = 5;

    for (let ly = 0; ly < dataSize; ly++) {
        for (let lx = 0; lx < dataSize; lx++) {
            // Global coordinates (continuous across chunks)
            const gx = chunkX * chunkSize + lx;
            const gy = chunkY * chunkSize + ly;

            // FBM noise for elevation and moisture
            const elev = fbmNoise2D(gx * featureScale, gy * featureScale, elevSeed, octaves);
            const moist = fbmNoise2D(gx * featureScale * 0.7, gy * featureScale * 0.7, moistSeed, octaves);

            // Add subtle CA-based detail overlay (rule-specific terrain texture)
            const caDetail = getCaDetail(gx, gy, rule, seed, featureScale);
            const finalE = elev * 0.92 + caDetail * 0.08;

            const idx = ly * dataSize + lx;
            finalElev[idx] = Math.max(0, Math.min(1, finalE));
            finalMoist[idx] = Math.max(0, Math.min(1, moist));
            biomeIds[idx] = classifyBiome(finalElev[idx], finalMoist[idx]);
        }
    }

    return {
        chunkX,
        chunkY,
        chunkSize: dataSize, // Return actual data dimensions (chunkSize + 1)
        elevation: finalElev,
        moisture: finalMoist,
        biomeIds,
    };
}

// Classify CA rule into Wolfram class (simplified)
function classifyRuleClass(rule) {
    const class1 = [0, 8, 32, 40, 64, 96, 128, 136, 160, 168, 192, 224, 234, 235, 238, 239, 248, 249, 252, 253, 254, 255];
    const class4 = [54, 106, 110, 120, 124, 137, 193];
    if (class1.includes(rule)) return 1;
    if (class4.includes(rule)) return 4;
    // Class 2 vs 3: rules with balanced bit count tend to be class 3
    let bits = 0;
    for (let i = 0; i < 8; i++) bits += (rule >> i) & 1;
    return bits >= 3 && bits <= 5 ? 3 : 2;
}

// Add CA-flavored detail: use the rule to create unique terrain texture
function getCaDetail(gx, gy, rule, seed, scale) {
    // Simple 1D CA step for texture flavoring
    const h0 = hashSeed(seed, gx - 1, gy);
    const h1 = hashSeed(seed, gx, gy);
    const h2 = hashSeed(seed, gx + 1, gy);
    const left = (h0 & 1);
    const center = (h1 & 1);
    const right = (h2 & 1);
    const pattern = (left << 2) | (center << 1) | right;
    const caBit = (rule >> pattern) & 1;

    // Blend with smooth noise for less harsh transitions
    const smooth = perlinNoise2D(gx * scale * 3, gy * scale * 3, seed + 777);
    return caBit * 0.4 + smooth * 0.6;
}

// ============================================================
// WORKER MESSAGE HANDLER
// ============================================================

self.onmessage = function(e) {
    const msg = e.data;

    if (msg.type === 'generateChunk') {
        const t0 = performance.now();

        const result = generateChunk(msg);

        const elapsed = performance.now() - t0;

        // Transfer the typed arrays (zero-copy) for performance
        self.postMessage({
            type: 'chunkReady',
            ...result,
            generationTime: elapsed,
        }, [
            result.elevation.buffer,
            result.moisture.buffer,
            result.biomeIds.buffer,
        ]);
    }

    if (msg.type === 'ping') {
        self.postMessage({ type: 'pong' });
    }
};
