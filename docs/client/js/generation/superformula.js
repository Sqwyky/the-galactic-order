/**
 * THE GALACTIC ORDER - Superformula 3D Shape Generator (Enhanced)
 *
 * The Superformula (Gielis, 2003) is a single mathematical equation that
 * generates an extraordinary variety of organic 3D shapes — from perfect
 * spheres to starfish, crystals, flowers, alien blobs, and sea urchins.
 *
 * 2D polar form:
 *   r(φ) = ( |cos(mφ/4)/a|^n2 + |sin(mφ/4)/b|^n3 )^(-1/n1)
 *
 * 3D extension: spherical product of two 2D superformulas:
 *   x = r1(θ) · cos(θ) · r2(φ) · cos(φ)
 *   y = r1(θ) · sin(θ) · r2(φ) · cos(φ)
 *   z = r2(φ) · sin(φ)
 *
 * where θ ∈ [-π, π] (longitude) and φ ∈ [-π/2, π/2] (latitude)
 *
 * Enhanced features:
 *   - Multi-octave detail noise displacement (organic surface texture)
 *   - Twist/spiral deformation along Y axis
 *   - Spine extrusion at lobe peaks
 *   - Analytical normals from finite differences (smoother lighting)
 *   - Vertex color attribute for per-vertex variation
 *
 * Parameters:
 *   m  — rotational symmetry (# of lobes/points). 0=circle, 3=triangle, 5=star, etc.
 *   n1 — overall shape curvature (small = pinched, large = rounded)
 *   n2 — cosine term exponent (controls edge sharpness)
 *   n3 — sine term exponent (controls lobe shape)
 *   a, b — scale factors (usually 1)
 *
 * The patent expired in 2020. Fully open for use.
 *
 * Performance notes:
 *   32×16 resolution = ~1024 tris (good for instanced scenery)
 *   64×32 resolution = ~4096 tris (close-up hero objects)
 *   16×8  resolution = ~256 tris  (distant LOD)
 */

import * as THREE from 'three';

// ============================================================
// CORE: 2D Superformula evaluation
// ============================================================

/**
 * Evaluate the 2D superformula at angle phi.
 * @param {number} phi - Angle in radians
 * @param {number} m - Rotational symmetry
 * @param {number} n1 - Overall curvature
 * @param {number} n2 - Cosine exponent
 * @param {number} n3 - Sine exponent
 * @param {number} [a=1] - Scale X
 * @param {number} [b=1] - Scale Y
 * @returns {number} Radius at this angle
 */
export function superformulaR(phi, m, n1, n2, n3, a = 1, b = 1) {
    const mPhi4 = m * phi / 4;
    const t1 = Math.abs(Math.cos(mPhi4) / a);
    const t2 = Math.abs(Math.sin(mPhi4) / b);

    // Avoid division by zero / infinity
    const sum = Math.pow(t1, n2) + Math.pow(t2, n3);
    if (sum === 0 || !isFinite(sum) || n1 === 0) return 1;

    const r = Math.pow(sum, -1 / n1);
    return isFinite(r) ? r : 0;
}

// ============================================================
// PROCEDURAL NOISE (deterministic, no textures)
// ============================================================

function _hash3(x, y, z) {
    let h = x * 127.1 + y * 311.7 + z * 74.7;
    h = Math.sin(h) * 43758.5453123;
    return h - Math.floor(h);
}

function _noise3D(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    // Smoothstep interpolation
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const uz = fz * fz * (3 - 2 * fz);

    const n000 = _hash3(ix, iy, iz);
    const n100 = _hash3(ix + 1, iy, iz);
    const n010 = _hash3(ix, iy + 1, iz);
    const n110 = _hash3(ix + 1, iy + 1, iz);
    const n001 = _hash3(ix, iy, iz + 1);
    const n101 = _hash3(ix + 1, iy, iz + 1);
    const n011 = _hash3(ix, iy + 1, iz + 1);
    const n111 = _hash3(ix + 1, iy + 1, iz + 1);

    const nx00 = n000 + (n100 - n000) * ux;
    const nx10 = n010 + (n110 - n010) * ux;
    const nx01 = n001 + (n101 - n001) * ux;
    const nx11 = n011 + (n111 - n011) * ux;
    const nxy0 = nx00 + (nx10 - nx00) * uy;
    const nxy1 = nx01 + (nx11 - nx01) * uy;
    return nxy0 + (nxy1 - nxy0) * uz;
}

/**
 * 4-octave FBM noise for organic surface displacement.
 * Returns value in roughly [-0.5, 0.5].
 */
function fbm3D(x, y, z, octaves = 4) {
    let value = 0, amplitude = 0.5, frequency = 1.0;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * (_noise3D(x * frequency, y * frequency, z * frequency) - 0.5);
        frequency *= 2.17;
        amplitude *= 0.47;
    }
    return value;
}

// ============================================================
// 3D SUPERSHAPE GEOMETRY (Enhanced)
// ============================================================

/**
 * Generate a 3D supershape mesh as THREE.BufferGeometry.
 *
 * Uses the spherical product of two 2D superformulas to create
 * a closed 3D surface. Completely deterministic.
 *
 * @param {Object} params1 - Longitude superformula: {m, n1, n2, n3}
 * @param {Object} params2 - Latitude superformula: {m, n1, n2, n3}
 * @param {number} [resolution=32] - Mesh detail (stacks; slices = 2×stacks)
 * @param {Object} [modifiers] - Optional shape modifiers
 * @param {number} [modifiers.noiseAmount=0] - Detail noise displacement (0-0.15)
 * @param {number} [modifiers.noiseScale=3] - Noise frequency scale
 * @param {number} [modifiers.twistAmount=0] - Twist radians along Y axis
 * @param {number} [modifiers.spineAmount=0] - Spine extrusion strength (0-0.5)
 * @param {number} [modifiers.spineFreq=0] - Spine frequency (matches m for best results)
 * @param {number} [modifiers.noiseOctaves=4] - Noise FBM octaves
 * @param {number} [modifiers.noiseSeed=0] - Seed offset for noise variation
 * @returns {THREE.BufferGeometry}
 */
export function createSupershapeGeometry(params1, params2, resolution = 32, modifiers = {}) {
    const stacks = resolution;
    const slices = resolution * 2;

    const noiseAmt = modifiers.noiseAmount || 0;
    const noiseScale = modifiers.noiseScale || 3.0;
    const noiseOctaves = modifiers.noiseOctaves || 4;
    const noiseSeed = modifiers.noiseSeed || 0;
    const twistAmt = modifiers.twistAmount || 0;
    const spineAmt = modifiers.spineAmount || 0;
    const spineFreq = modifiers.spineFreq || (params1.m || 5);

    const vertexCount = (stacks + 1) * (slices + 1);
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const colors = new Float32Array(vertexCount * 3);
    const indices = [];

    // Helper: compute a single vertex position (used for finite-difference normals too)
    function evalVertex(phi, theta) {
        const r2 = superformulaR(phi, params2.m, params2.n1, params2.n2, params2.n3);
        const r1 = superformulaR(theta, params1.m, params1.n1, params1.n2, params1.n3);

        let x = r1 * Math.cos(theta) * r2 * Math.cos(phi);
        let y = r2 * Math.sin(phi);
        let z = r1 * Math.sin(theta) * r2 * Math.cos(phi);

        // Twist deformation around Y axis (spiral effect)
        if (twistAmt !== 0) {
            const twistAngle = y * twistAmt;
            const cosT = Math.cos(twistAngle), sinT = Math.sin(twistAngle);
            const nx = x * cosT - z * sinT;
            const nz = x * sinT + z * cosT;
            x = nx;
            z = nz;
        }

        // Spine extrusion — push vertices outward at lobe peaks
        if (spineAmt > 0) {
            const lobePeak = Math.pow(Math.abs(Math.cos(theta * spineFreq / 2)), 4.0);
            const latPeak = Math.pow(Math.cos(phi), 2.0);
            const spineStr = lobePeak * latPeak * spineAmt;
            const len = Math.sqrt(x * x + y * y + z * z) || 1;
            x += (x / len) * spineStr;
            y += (y / len) * spineStr;
            z += (z / len) * spineStr;
        }

        // Detail noise displacement (organic surface texture)
        if (noiseAmt > 0) {
            const ns = noiseScale;
            const disp = fbm3D(
                x * ns + noiseSeed,
                y * ns + noiseSeed * 1.3,
                z * ns + noiseSeed * 0.7,
                noiseOctaves
            ) * noiseAmt;
            const len = Math.sqrt(x * x + y * y + z * z) || 1;
            x += (x / len) * disp;
            y += (y / len) * disp;
            z += (z / len) * disp;
        }

        return { x, y, z };
    }

    let vi = 0;

    for (let i = 0; i <= stacks; i++) {
        const phi = -Math.PI / 2 + (i / stacks) * Math.PI;
        const v = i / stacks;

        for (let j = 0; j <= slices; j++) {
            const theta = -Math.PI + (j / slices) * 2 * Math.PI;
            const u = j / slices;

            const vert = evalVertex(phi, theta);

            positions[vi * 3] = vert.x;
            positions[vi * 3 + 1] = vert.y;
            positions[vi * 3 + 2] = vert.z;

            uvs[vi * 2] = u;
            uvs[vi * 2 + 1] = v;

            // Per-vertex color variation based on curvature/position
            // Poles get slight color shift, equator stays base
            const latFactor = Math.abs(Math.sin(phi));
            const lobeFactor = Math.abs(Math.cos(theta * (params1.m || 1) / 2));
            colors[vi * 3] = 0.85 + latFactor * 0.15;
            colors[vi * 3 + 1] = 0.85 + lobeFactor * 0.1;
            colors[vi * 3 + 2] = 0.9 + (1 - latFactor) * 0.1;

            vi++;
        }
    }

    // Triangle indices
    for (let i = 0; i < stacks; i++) {
        for (let j = 0; j < slices; j++) {
            const a = i * (slices + 1) + j;
            const b = a + slices + 1;

            indices.push(a, b, a + 1);
            indices.push(b, b + 1, a + 1);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);

    // Analytical normals via finite differences (much smoother than computeVertexNormals)
    _computeFiniteDiffNormals(geometry, stacks, slices, evalVertex);

    return geometry;
}

/**
 * Compute smooth normals using finite differences on the parametric surface.
 * Much better than computeVertexNormals() for organic shapes — avoids
 * faceted artifacts on curved surfaces.
 */
function _computeFiniteDiffNormals(geometry, stacks, slices, evalVertex) {
    const normals = new Float32Array((stacks + 1) * (slices + 1) * 3);
    const eps = 0.001; // Finite difference step size

    let vi = 0;
    for (let i = 0; i <= stacks; i++) {
        const phi = -Math.PI / 2 + (i / stacks) * Math.PI;
        for (let j = 0; j <= slices; j++) {
            const theta = -Math.PI + (j / slices) * 2 * Math.PI;

            // Central point
            const p = evalVertex(phi, theta);

            // Tangent along theta (longitude)
            const pT = evalVertex(phi, theta + eps);
            const dTx = (pT.x - p.x) / eps;
            const dTy = (pT.y - p.y) / eps;
            const dTz = (pT.z - p.z) / eps;

            // Tangent along phi (latitude)
            const pP = evalVertex(phi + eps, theta);
            const dPx = (pP.x - p.x) / eps;
            const dPy = (pP.y - p.y) / eps;
            const dPz = (pP.z - p.z) / eps;

            // Cross product: normal = dTheta × dPhi
            let nx = dTy * dPz - dTz * dPy;
            let ny = dTz * dPx - dTx * dPz;
            let nz = dTx * dPy - dTy * dPx;

            // Normalize
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= len; ny /= len; nz /= len;

            normals[vi * 3] = nx;
            normals[vi * 3 + 1] = ny;
            normals[vi * 3 + 2] = nz;
            vi++;
        }
    }

    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
}

// ============================================================
// PRESET SHAPE ARCHETYPES
// ============================================================

/**
 * A curated library of known-good parameter combos.
 * These serve as starting points that get modulated by CA rules.
 * Each preset can optionally include modifiers for twist, spines, noise.
 */
export const SHAPE_PRESETS = {
    // Smooth organic forms
    sphere:    { params1: { m: 0, n1: 1, n2: 1, n3: 1 }, params2: { m: 0, n1: 1, n2: 1, n3: 1 } },
    egg:       { params1: { m: 0, n1: 1, n2: 0.7, n3: 1.3 }, params2: { m: 0, n1: 1, n2: 1, n3: 0.5 } },
    pebble:    { params1: { m: 0, n1: 2, n2: 1, n3: 1.5 }, params2: { m: 0, n1: 1.5, n2: 1, n3: 1 },
                 modifiers: { noiseAmount: 0.06, noiseScale: 4 } },

    // Crystalline / geometric
    crystal:   { params1: { m: 4, n1: 0.5, n2: 0.5, n3: 0.5 }, params2: { m: 4, n1: 0.5, n2: 0.5, n3: 0.5 } },
    hexPrism:  { params1: { m: 6, n1: 1000, n2: 400, n3: 400 }, params2: { m: 4, n1: 100, n2: 100, n3: 100 } },
    diamond:   { params1: { m: 4, n1: 1, n2: 1, n3: 1 }, params2: { m: 4, n1: 2, n2: 2, n3: 2 } },

    // Organic / alien
    starfish:  { params1: { m: 5, n1: 0.3, n2: 0.3, n3: 0.3 }, params2: { m: 5, n1: 1, n2: 1, n3: 1 },
                 modifiers: { noiseAmount: 0.04, noiseScale: 5 } },
    flower:    { params1: { m: 7, n1: 0.2, n2: 1.7, n3: 1.7 }, params2: { m: 0, n1: 1, n2: 1, n3: 1 } },
    seaUrchin: { params1: { m: 12, n1: 0.3, n2: 0, n3: 0 }, params2: { m: 12, n1: 0.3, n2: 0, n3: 0 },
                 modifiers: { spineAmount: 0.2, spineFreq: 12 } },
    coral:     { params1: { m: 3, n1: 0.5, n2: 1.5, n3: 0.3 }, params2: { m: 2, n1: 1, n2: 4, n3: 0.5 },
                 modifiers: { noiseAmount: 0.08, noiseScale: 3, twistAmount: 0.5 } },
    alienPod:  { params1: { m: 3, n1: 4.5, n2: 10, n3: 10 }, params2: { m: 3, n1: 4.5, n2: 10, n3: 10 },
                 modifiers: { noiseAmount: 0.05, noiseScale: 6 } },
    tentacle:  { params1: { m: 2, n1: 0.2, n2: 0.5, n3: 0.2 }, params2: { m: 6, n1: 0.7, n2: 0.3, n3: 0.7 },
                 modifiers: { twistAmount: 2.0 } },
    spiralShell: { params1: { m: 1, n1: 0.3, n2: 0.3, n3: 0.3 }, params2: { m: 4, n1: 1, n2: 1.5, n3: 1 },
                 modifiers: { twistAmount: 3.0, noiseAmount: 0.03 } },
    sporeCluster: { params1: { m: 8, n1: 0.5, n2: 0.8, n3: 0.8 }, params2: { m: 3, n1: 0.4, n2: 0.4, n3: 0.4 },
                 modifiers: { spineAmount: 0.15, spineFreq: 8, noiseAmount: 0.06 } },
    fungalCap: { params1: { m: 0, n1: 1, n2: 1, n3: 0.3 }, params2: { m: 0, n1: 0.5, n2: 1, n3: 1.5 },
                 modifiers: { noiseAmount: 0.1, noiseScale: 4 } },

    // Abstract
    pinch:     { params1: { m: 4, n1: 30, n2: 15, n3: 15 }, params2: { m: 4, n1: 30, n2: 15, n3: 15 } },
    blob:      { params1: { m: 3, n1: 2, n2: 4, n3: 1 }, params2: { m: 5, n1: 1, n2: 2, n3: 3 },
                 modifiers: { noiseAmount: 0.08, noiseScale: 2.5 } },
};

// ============================================================
// UTILITY: Normalize geometry to unit bounding box
// ============================================================

/**
 * Scale and center a geometry so it fits within a 1×1×1 bounding box,
 * centered at origin. Useful for normalizing supershapes before instancing.
 * Preserves all attributes (normals, colors, UVs).
 */
export function normalizeGeometry(geometry) {
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    const size = new THREE.Vector3();
    bb.getSize(size);
    const center = new THREE.Vector3();
    bb.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return geometry;

    const scale = 1.0 / maxDim;
    const pos = geometry.getAttribute('position');

    for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i,
            (pos.getX(i) - center.x) * scale,
            (pos.getY(i) - center.y) * scale,
            (pos.getZ(i) - center.z) * scale,
        );
    }

    pos.needsUpdate = true;
    geometry.computeBoundingBox();

    // Re-derive normals only if no analytical normals exist
    const norm = geometry.getAttribute('normal');
    if (!norm) {
        geometry.computeVertexNormals();
    }

    return geometry;
}
