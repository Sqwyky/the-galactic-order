/**
 * THE GALACTIC ORDER - Superformula 3D Shape Generator
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
// 3D SUPERSHAPE GEOMETRY
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
 * @returns {THREE.BufferGeometry}
 */
export function createSupershapeGeometry(params1, params2, resolution = 32) {
    const stacks = resolution;
    const slices = resolution * 2;

    const vertexCount = (stacks + 1) * (slices + 1);
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = [];

    let vi = 0;

    for (let i = 0; i <= stacks; i++) {
        // Latitude: -π/2 to π/2
        const phi = -Math.PI / 2 + (i / stacks) * Math.PI;
        const r2 = superformulaR(phi, params2.m, params2.n1, params2.n2, params2.n3);

        for (let j = 0; j <= slices; j++) {
            // Longitude: -π to π
            const theta = -Math.PI + (j / slices) * 2 * Math.PI;
            const r1 = superformulaR(theta, params1.m, params1.n1, params1.n2, params1.n3);

            const x = r1 * Math.cos(theta) * r2 * Math.cos(phi);
            const y = r2 * Math.sin(phi); // Y is up
            const z = r1 * Math.sin(theta) * r2 * Math.cos(phi);

            positions[vi * 3] = x;
            positions[vi * 3 + 1] = y;
            positions[vi * 3 + 2] = z;

            uvs[vi * 2] = j / slices;
            uvs[vi * 2 + 1] = i / stacks;

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
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

// ============================================================
// PRESET SHAPE ARCHETYPES
// ============================================================

/**
 * A curated library of known-good parameter combos.
 * These serve as starting points that get modulated by CA rules.
 */
export const SHAPE_PRESETS = {
    // Smooth organic forms
    sphere:    { params1: { m: 0, n1: 1, n2: 1, n3: 1 }, params2: { m: 0, n1: 1, n2: 1, n3: 1 } },
    egg:       { params1: { m: 0, n1: 1, n2: 0.7, n3: 1.3 }, params2: { m: 0, n1: 1, n2: 1, n3: 0.5 } },
    pebble:    { params1: { m: 0, n1: 2, n2: 1, n3: 1.5 }, params2: { m: 0, n1: 1.5, n2: 1, n3: 1 } },

    // Crystalline / geometric
    crystal:   { params1: { m: 4, n1: 0.5, n2: 0.5, n3: 0.5 }, params2: { m: 4, n1: 0.5, n2: 0.5, n3: 0.5 } },
    hexPrism:  { params1: { m: 6, n1: 1000, n2: 400, n3: 400 }, params2: { m: 4, n1: 100, n2: 100, n3: 100 } },
    diamond:   { params1: { m: 4, n1: 1, n2: 1, n3: 1 }, params2: { m: 4, n1: 2, n2: 2, n3: 2 } },

    // Organic / alien
    starfish:  { params1: { m: 5, n1: 0.3, n2: 0.3, n3: 0.3 }, params2: { m: 5, n1: 1, n2: 1, n3: 1 } },
    flower:    { params1: { m: 7, n1: 0.2, n2: 1.7, n3: 1.7 }, params2: { m: 0, n1: 1, n2: 1, n3: 1 } },
    seaUrchin: { params1: { m: 12, n1: 0.3, n2: 0, n3: 0 }, params2: { m: 12, n1: 0.3, n2: 0, n3: 0 } },
    coral:     { params1: { m: 3, n1: 0.5, n2: 1.5, n3: 0.3 }, params2: { m: 2, n1: 1, n2: 4, n3: 0.5 } },
    alienPod:  { params1: { m: 3, n1: 4.5, n2: 10, n3: 10 }, params2: { m: 3, n1: 4.5, n2: 10, n3: 10 } },
    tentacle:  { params1: { m: 2, n1: 0.2, n2: 0.5, n3: 0.2 }, params2: { m: 6, n1: 0.7, n2: 0.3, n3: 0.7 } },

    // Abstract
    pinch:     { params1: { m: 4, n1: 30, n2: 15, n3: 15 }, params2: { m: 4, n1: 30, n2: 15, n3: 15 } },
    blob:      { params1: { m: 3, n1: 2, n2: 4, n3: 1 }, params2: { m: 5, n1: 1, n2: 2, n3: 3 } },
};

// ============================================================
// UTILITY: Normalize geometry to unit bounding box
// ============================================================

/**
 * Scale and center a geometry so it fits within a 1×1×1 bounding box,
 * centered at origin. Useful for normalizing supershapes before instancing.
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
    geometry.computeVertexNormals();
    return geometry;
}
