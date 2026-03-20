/**
 * THE GALACTIC ORDER - Resource Crystal Pickup
 *
 * Spawns resource crystals when rocks/flora are destroyed. Crystals
 * burst upward, then attract toward the player via magnetism.
 * Includes optional trail particles behind each crystal.
 */

import * as THREE from 'three';
import { ELEMENTS } from '../../generation/HarmonicElements.js';

export class ResourceCrystal {
    /**
     * @param {THREE.Scene} scene
     * @param {import('../../ui/InventoryManager.js').InventoryManager|null} inventoryManager
     * @param {Object} config - Shared MINING_CONFIG reference
     */
    constructor(scene, inventoryManager, config) {
        this.scene = scene;
        this.inventory = inventoryManager;
        this.config = config;

        // Active crystals
        this._crystals = [];
    }

    /**
     * Spawn a resource crystal at the given position.
     * @param {THREE.Vector3} position - World position to spawn at
     * @param {string|number} resourceType - Element ID for drop
     * @param {number} amount - Quantity of resource
     * @param {Object} [dropData] - Full drops object { element, quantity, bonus }
     */
    spawn(position, resourceType, amount, dropData) {
        const drops = dropData || { element: resourceType, quantity: amount, bonus: false };
        const element = ELEMENTS[drops.element];
        if (!element) return;

        // Enforce max concurrent crystals for performance
        while (this._crystals.length >= this.config.maxCrystals) {
            const oldest = this._crystals.shift();
            this.scene.remove(oldest.mesh);
            oldest.geo.dispose();
            oldest.mat.dispose();
            if (oldest.trail) {
                this.scene.remove(oldest.trail);
                oldest.trailGeo.dispose();
                oldest.trailMat.dispose();
            }
        }

        const crystalColor = new THREE.Color(element.color[0], element.color[1], element.color[2]);
        const glowColor = new THREE.Color(element.glowColor[0], element.glowColor[1], element.glowColor[2]);

        // Crystal mesh -- small rotating octahedron
        const geo = new THREE.OctahedronGeometry(0.2, 0);
        const mat = new THREE.MeshBasicMaterial({
            color: crystalColor,
            transparent: true,
            opacity: 0.9,
        });
        const crystal = new THREE.Mesh(geo, mat);
        crystal.position.copy(position);
        crystal.position.y += 0.5;

        // Glow
        const light = new THREE.PointLight(glowColor, 1.5, 4);
        crystal.add(light);

        this.scene.add(crystal);

        // Trail particles behind crystal
        let trail = null;
        let trailGeo = null;
        let trailMat = null;
        if (this.config.crystalTrailEnabled) {
            const trailCount = this.config.crystalTrailCount;
            const trailPositions = new Float32Array(trailCount * 3);
            for (let i = 0; i < trailCount; i++) {
                trailPositions[i * 3]     = crystal.position.x;
                trailPositions[i * 3 + 1] = crystal.position.y;
                trailPositions[i * 3 + 2] = crystal.position.z;
            }
            trailGeo = new THREE.BufferGeometry();
            trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
            trailMat = new THREE.PointsMaterial({
                color: crystalColor,
                transparent: true,
                opacity: 0.5,
                size: 0.05,
                sizeAttenuation: true,
            });
            trail = new THREE.Points(trailGeo, trailMat);
            trail.frustumCulled = true;
            this.scene.add(trail);
        }

        this._crystals.push({
            mesh: crystal,
            geo,
            mat,
            light,
            trail,
            trailGeo,
            trailMat,
            trailIndex: 0,
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                2 + Math.random() * 2,
                (Math.random() - 0.5) * 2
            ),
            phase: 0,
            wobblePhase: Math.random() * Math.PI * 2,
            baseScale: 1.0,
            magnetism: false,
            burstTime: 0.5,
            lifetime: 5.0,
            element: drops.element,
            quantity: drops.quantity,
            collected: false,
        });
    }

    /**
     * Per-frame update: animate crystals, magnetism, trail, collect.
     * @param {number} dt
     * @param {THREE.Vector3} playerPosition - Camera/player world position
     */
    update(dt, playerPosition) {
        const playerPos = playerPosition;

        for (let i = this._crystals.length - 1; i >= 0; i--) {
            const c = this._crystals[i];
            c.lifetime -= dt;
            c.phase += dt * 3;
            c.wobblePhase += dt * 1.7;

            // Initial burst
            if (c.burstTime > 0) {
                c.burstTime -= dt;
                c.mesh.position.addScaledVector(c.velocity, dt);
                c.velocity.y -= 6 * dt; // Gravity
            } else {
                // Magnetism -- fly toward player
                c.magnetism = true;
                const toPlayer = new THREE.Vector3().subVectors(playerPos, c.mesh.position);
                const dist = toPlayer.length();

                if (dist < 1.5) {
                    c.collected = true;
                } else if (dist < 8) {
                    const pullStrength = Math.max(3, 12 / dist);
                    toPlayer.normalize().multiplyScalar(pullStrength * dt);
                    c.mesh.position.add(toPlayer);

                    const growFactor = 1.0 + (1.0 - dist / 8) * 0.6;
                    c.mesh.scale.setScalar(c.baseScale * growFactor);
                }

                // Bob up and down
                c.mesh.position.y += Math.sin(c.phase) * 0.01;
            }

            // Rotate with slight wobble
            c.mesh.rotation.y += dt * 2;
            c.mesh.rotation.x += dt * 0.5 + Math.sin(c.wobblePhase) * 0.02;
            c.mesh.rotation.z = Math.sin(c.wobblePhase * 0.8) * 0.15;

            // Glow pulse
            c.light.intensity = 1.0 + Math.sin(c.phase * 2) * 0.5;

            // Update trail particles (ring buffer)
            if (c.trail && c.trailGeo) {
                const tPos = c.trailGeo.getAttribute('position').array;
                const trailCount = this.config.crystalTrailCount;
                const idx = c.trailIndex % trailCount;
                tPos[idx * 3]     = c.mesh.position.x + (Math.random() - 0.5) * 0.05;
                tPos[idx * 3 + 1] = c.mesh.position.y + (Math.random() - 0.5) * 0.05;
                tPos[idx * 3 + 2] = c.mesh.position.z + (Math.random() - 0.5) * 0.05;
                c.trailIndex++;
                c.trailGeo.getAttribute('position').needsUpdate = true;
                c.trailMat.opacity = Math.max(0.1, 0.5 * (c.lifetime / 5.0));
            }

            // Remove if collected or expired
            if (c.collected || c.lifetime <= 0) {
                this.scene.remove(c.mesh);
                c.geo.dispose();
                c.mat.dispose();
                if (c.trail) {
                    this.scene.remove(c.trail);
                    c.trailGeo.dispose();
                    c.trailMat.dispose();
                }
                this._crystals.splice(i, 1);
            }
        }
    }

    /** Dispose all GPU resources. */
    dispose() {
        for (const c of this._crystals) {
            this.scene.remove(c.mesh);
            c.geo.dispose();
            c.mat.dispose();
            if (c.trail) {
                this.scene.remove(c.trail);
                c.trailGeo.dispose();
                c.trailMat.dispose();
            }
        }
        this._crystals = [];
    }
}
