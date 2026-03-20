/**
 * THE GALACTIC ORDER - Quadtree Node
 *
 * A node in the terrain quadtree. Each node can either be a leaf
 * (has a mesh) or a branch (has 4 children). Pioneer Space Sim's
 * terrain uses this exact pattern — split when close, merge when far.
 *
 * Extracted from TerrainChunk.js for modularity.
 */

import { TERRAIN_CONFIG } from './TerrainChunk.js';

export class QuadtreeNode {
    /**
     * @param {number} x - Center X in world units
     * @param {number} z - Center Z in world units
     * @param {number} size - Width/height of this node in world units
     * @param {number} depth - Quadtree depth (0 = root)
     * @param {QuadtreeNode|null} parent - Parent node
     */
    constructor(x, z, size, depth, parent = null) {
        this.x = x;
        this.z = z;
        this.size = size;
        this.depth = depth;
        this.parent = parent;

        // Children (null if leaf)
        this.children = null;

        // Mesh (null if branch)
        this.chunk = null;

        // Split state
        this.isSplit = false;
        this.splitDistance = size * TERRAIN_CONFIG.splitDistanceMultiplier * TERRAIN_CONFIG.lodBias;
        this.mergeDistance = this.splitDistance * TERRAIN_CONFIG.mergeHysteresis;
    }

    /**
     * Determine if this node should split (camera is close enough).
     * Pioneer uses distance-to-center with a size-proportional threshold.
     */
    shouldSplit(camX, camZ) {
        if (this.depth >= TERRAIN_CONFIG.maxQuadtreeDepth) return false;
        const dx = camX - this.x;
        const dz = camZ - this.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        return dist < this.splitDistance;
    }

    /**
     * Determine if this node should merge (camera is far enough).
     * Uses hysteresis to prevent oscillation.
     */
    shouldMerge(camX, camZ) {
        const dx = camX - this.x;
        const dz = camZ - this.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        return dist > this.mergeDistance;
    }

    /**
     * Check if camera is within the visible range for this node.
     */
    isVisible(camX, camZ, viewRadius) {
        const halfSize = this.size / 2;
        const maxDist = viewRadius + halfSize;
        const dx = Math.abs(camX - this.x);
        const dz = Math.abs(camZ - this.z);
        return dx < maxDist && dz < maxDist;
    }
}
