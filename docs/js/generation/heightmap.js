/**
 * THE GALACTIC ORDER - Heightmap Generator
 *
 * Converts raw CA grids (binary 0/1) into smooth terrain heightmaps (float 0-1).
 *
 * The pipeline:
 * 1. Run CA rule → binary grid
 * 2. Overlay multiple runs with different start positions → density grid
 * 3. Multi-scale smoothing (6 octaves) → smooth heightmap
 * 4. Optional: normalize, clamp, terrace
 *
 * This is where the math becomes mountains.
 */

import { generateDensityGrid } from './cellularAutomata.js';

// ============================================================
// CORE: Density smoothing
// ============================================================

/**
 * Apply a box blur (average filter) to a flat grid.
 * Simple but effective - multiple passes of small kernels
 * approximate a Gaussian blur.
 *
 * @param {Float32Array} grid - Input grid (flat, row-major)
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @param {number} radius - Blur radius in cells
 * @returns {Float32Array} Smoothed grid (new array)
 */
function boxBlur(grid, width, height, radius) {
    const output = new Float32Array(width * height);
    const diameter = radius * 2 + 1;
    const area = diameter * diameter;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let count = 0;

            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;

                    // Wrap edges (tileable terrain)
                    const wx = ((nx % width) + width) % width;
                    const wy = ((ny % height) + height) % height;

                    sum += grid[wy * width + wx];
                    count++;
                }
            }

            output[y * width + x] = sum / count;
        }
    }

    return output;
}

/**
 * Separable box blur for better performance on large grids.
 * Horizontal pass then vertical pass. O(n*r) instead of O(n*r^2).
 *
 * @param {Float32Array} grid - Input grid
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @param {number} radius - Blur radius
 * @returns {Float32Array} Smoothed grid
 */
function separableBlur(grid, width, height, radius) {
    const temp = new Float32Array(width * height);
    const output = new Float32Array(width * height);

    // Horizontal pass
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let count = 0;
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = ((x + dx) % width + width) % width;
                sum += grid[y * width + nx];
                count++;
            }
            temp[y * width + x] = sum / count;
        }
    }

    // Vertical pass
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;
            let count = 0;
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

// ============================================================
// MULTI-OCTAVE SMOOTHING
// ============================================================

/**
 * Multi-scale density smoothing.
 *
 * The key insight: we blur the same CA grid at 6 different scales
 * and blend them together. This creates terrain with:
 * - Large features (continents) from big blur
 * - Medium features (mountain ranges) from medium blur
 * - Small features (hills, valleys) from small blur
 *
 * @param {Float32Array} densityGrid - Raw density grid from CA
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @param {Object} [options] - Smoothing parameters
 * @param {number[]} [options.scales] - Blur radii for each octave
 * @param {number[]} [options.weights] - Weight for each octave (should sum to 1)
 * @returns {Float32Array} Smoothed heightmap, values in [0, 1]
 */
export function multiOctaveSmooth(densityGrid, width, height, options = {}) {
    const {
        scales = [1, 2, 4, 8, 16, 32],
        weights = [0.05, 0.10, 0.15, 0.20, 0.25, 0.25]
    } = options;

    const result = new Float32Array(width * height);

    for (let octave = 0; octave < scales.length; octave++) {
        const radius = scales[octave];
        const weight = weights[octave];

        // Use separable blur for larger radii (much faster)
        const smoothed = radius > 4
            ? separableBlur(densityGrid, width, height, radius)
            : boxBlur(densityGrid, width, height, radius);

        // Accumulate weighted result
        for (let i = 0; i < result.length; i++) {
            result[i] += smoothed[i] * weight;
        }
    }

    // Normalize to [0, 1]
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < result.length; i++) {
        if (result[i] < min) min = result[i];
        if (result[i] > max) max = result[i];
    }

    const range = max - min || 1; // Prevent division by zero
    for (let i = 0; i < result.length; i++) {
        result[i] = (result[i] - min) / range;
    }

    return result;
}

// ============================================================
// MAIN API: Generate a heightmap from a CA rule
// ============================================================

// ============================================================
// PROCEDURAL MICRO-DETAIL NOISE
// ============================================================

/**
 * Simple hash for deterministic noise.
 */
function _heightHash(x, y) {
    let h = x * 127.1 + y * 311.7;
    h = Math.sin(h) * 43758.5453123;
    return h - Math.floor(h);
}

/**
 * 2D value noise with smooth interpolation.
 */
function _valueNoise2D(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);

    const n00 = _heightHash(ix, iy);
    const n10 = _heightHash(ix + 1, iy);
    const n01 = _heightHash(ix, iy + 1);
    const n11 = _heightHash(ix + 1, iy + 1);

    const nx0 = n00 + (n10 - n00) * ux;
    const nx1 = n01 + (n11 - n01) * ux;
    return nx0 + (nx1 - nx0) * uy;
}

/**
 * FBM (Fractal Brownian Motion) noise for terrain micro-detail.
 * Adds natural-looking variation that the CA grid can't produce.
 *
 * @param {number} x - World X coordinate
 * @param {number} y - World Y coordinate
 * @param {number} octaves - Number of noise octaves (3-6)
 * @param {number} lacunarity - Frequency multiplier per octave
 * @param {number} persistence - Amplitude multiplier per octave
 * @param {number} seedOffset - Seed offset for variation per planet
 * @returns {number} Noise value roughly in [-0.5, 0.5]
 */
function fbmNoise2D(x, y, octaves = 4, lacunarity = 2.13, persistence = 0.45, seedOffset = 0) {
    let value = 0, amplitude = 0.5, frequency = 1.0;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * (_valueNoise2D(
            x * frequency + seedOffset + i * 17.3,
            y * frequency + seedOffset + i * 31.7
        ) - 0.5);
        frequency *= lacunarity;
        amplitude *= persistence;
    }
    return value;
}

// ============================================================
// MAIN API: Generate a heightmap from a CA rule
// ============================================================

/**
 * Generate a terrain heightmap from a cellular automaton rule.
 *
 * This is the main entry point. Give it a rule number and a seed,
 * get back a smooth heightmap ready to displace vertices.
 *
 * Now includes an FBM micro-detail noise pass that adds natural-looking
 * variation on top of the CA-derived macro features.
 *
 * @param {number} ruleNumber - CA rule (0-255)
 * @param {number} width - Heightmap width (power of 2 recommended: 128, 256, 512)
 * @param {number} height - Heightmap height
 * @param {number} seed - Deterministic seed
 * @param {Object} [options] - Generation options
 * @param {number} [options.numRuns=8] - CA overlay runs (more = smoother)
 * @param {number[]} [options.scales] - Smoothing radii
 * @param {number[]} [options.weights] - Smoothing weights
 * @param {number} [options.microDetailAmount=0.08] - FBM noise blend (0=none, 0.15=heavy)
 * @param {number} [options.microDetailOctaves=4] - FBM noise octaves
 * @param {number} [options.microDetailScale=0.15] - FBM noise spatial frequency
 * @returns {Float32Array} Heightmap values in [0, 1], flat row-major array
 */
export function generateHeightmap(ruleNumber, width, height, seed, options = {}) {
    const {
        numRuns = 8,
        scales,
        weights,
        microDetailAmount = 0.08,
        microDetailOctaves = 4,
        microDetailScale = 0.15,
    } = options;

    // Step 1: Generate density grid from CA
    const density = generateDensityGrid(ruleNumber, width, height, seed, numRuns);

    // Step 2: Multi-octave smoothing
    const heightmap = multiOctaveSmooth(density, width, height, { scales, weights });

    // Step 3: FBM micro-detail noise overlay
    // This adds natural-looking hills, ridges, and valleys that the
    // binary CA can't produce. The amount is small enough to preserve
    // the CA's macro structure while adding "geological" detail.
    if (microDetailAmount > 0) {
        const seedOffset = (seed * 13.37 + ruleNumber * 7.91) % 10000;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const baseH = heightmap[idx];

                // Scale coordinates for noise sampling
                const nx = x * microDetailScale;
                const ny = y * microDetailScale;

                // Multi-scale detail:
                // Medium features (ridges, valleys)
                const medium = fbmNoise2D(nx, ny, microDetailOctaves, 2.13, 0.45, seedOffset);
                // Fine features (small bumps, texture)
                const fine = fbmNoise2D(nx * 3.7, ny * 3.7, 3, 2.3, 0.4, seedOffset + 500);

                // Blend: more detail in mid-elevation (less at extremes for clean coasts/peaks)
                const elevBlend = 1.0 - Math.pow(2.0 * baseH - 1.0, 2);
                const detail = (medium * 0.7 + fine * 0.3) * microDetailAmount * elevBlend;

                heightmap[idx] = Math.max(0, Math.min(1, baseH + detail));
            }
        }
    }

    return heightmap;
}

/**
 * Apply terracing to a heightmap (optional post-process).
 * Creates stair-step plateaus — good for alien-looking terrain.
 *
 * @param {Float32Array} heightmap - Input heightmap [0, 1]
 * @param {number} levels - Number of terrace levels (4-16 typical)
 * @param {number} sharpness - How sharp the terrace edges are (0 = smooth, 1 = hard steps)
 * @returns {Float32Array} Terraced heightmap
 */
export function terraceHeightmap(heightmap, levels = 8, sharpness = 0.5) {
    const result = new Float32Array(heightmap.length);

    for (let i = 0; i < heightmap.length; i++) {
        const h = heightmap[i];

        // Quantize to terrace levels
        const terraced = Math.round(h * levels) / levels;

        // Blend between smooth and terraced
        result[i] = h * (1 - sharpness) + terraced * sharpness;
    }

    return result;
}

/**
 * Get heightmap statistics (useful for biome thresholds).
 *
 * @param {Float32Array} heightmap - The heightmap
 * @returns {{ min: number, max: number, mean: number, stddev: number }}
 */
export function heightmapStats(heightmap) {
    let min = Infinity, max = -Infinity, sum = 0;

    for (let i = 0; i < heightmap.length; i++) {
        const v = heightmap[i];
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;
    }

    const mean = sum / heightmap.length;

    let variance = 0;
    for (let i = 0; i < heightmap.length; i++) {
        const diff = heightmap[i] - mean;
        variance += diff * diff;
    }
    variance /= heightmap.length;

    return { min, max, mean, stddev: Math.sqrt(variance) };
}
