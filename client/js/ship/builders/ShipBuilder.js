/**
 * THE GALACTIC ORDER — Ship Builder Base Class
 *
 * Abstract base for procedural ship geometry builders.
 * Each ship class extends this with its own geometry logic.
 *
 * Builders produce a THREE.Group containing all ship meshes,
 * plus metadata about engine positions, station positions,
 * weapon hardpoints, and bounding dimensions.
 */

import * as THREE from 'three';

// ============================================================
// HELPERS (shared by all builders)
// ============================================================

/** Create a mesh, position it, optionally rotate & scale. */
export function _mesh(geo, mat, pos, rot, scl) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) {
        if (typeof scl === 'number') m.scale.setScalar(scl);
        else m.scale.set(scl[0], scl[1], scl[2]);
    }
    return m;
}

/** Taper a BoxGeometry along +Z (front) by a given ratio. */
export function _taperBox(geo, zThreshold, xTaper, yTaper) {
    const pos = geo.getAttribute('position');
    const halfDepth = geo.parameters.depth / 2;
    for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        if (z > zThreshold) {
            const t = (z - zThreshold) / (halfDepth - zThreshold);
            pos.setX(i, pos.getX(i) * (1 - t * xTaper));
            pos.setY(i, pos.getY(i) * (1 - t * yTaper));
        }
    }
    geo.computeVertexNormals();
    return geo;
}

// ============================================================
// BASE BUILDER
// ============================================================

export class ShipBuilder {
    constructor() {
        /** @type {THREE.Group} The hull group containing all ship meshes */
        this.hull = new THREE.Group();

        /** @type {Object[]} Engine positions {x, y, z, radius} */
        this.enginePositions = [];

        /** @type {Object[]} Station positions {role, x, y, z, lookDir} */
        this.stationPositions = [];

        /** @type {{x: number, y: number, z: number}} Ship bounding dimensions */
        this.bounds = { x: 2, y: 1, z: 5 };

        /** @type {THREE.Mesh[]} Engine glow meshes (legacy compat) */
        this.engineGlows = [];

        /** @type {THREE.Mesh[]} Running light meshes */
        this.runningLights = [];

        /** @type {THREE.Group|null} Landing gear group */
        this.landingGear = null;
    }

    /**
     * Build the complete ship geometry.
     * Subclasses must override this.
     * @param {Object} materials - Material palette from ShipMaterials
     * @returns {ShipBuilder} this (for chaining)
     */
    build(materials) {
        throw new Error('ShipBuilder.build() must be overridden');
    }

    /**
     * Get the bounding radius for shield effects.
     * @returns {number}
     */
    getBoundingRadius() {
        return Math.max(this.bounds.x, this.bounds.y, this.bounds.z);
    }
}
