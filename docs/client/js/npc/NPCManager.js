/**
 * THE GALACTIC ORDER - NPC Manager
 *
 * Manages NPCs on planet surfaces. First NPC: The Mysterious Being.
 *
 * The Mysterious Being:
 * - A glowing, rotating geometric form (octahedron + particles)
 * - Hovers slightly above the ground
 * - Emits pulsing light that shifts color
 * - Appears at a specific location on every planet (deterministic from seed)
 * - When the player approaches, triggers dialogue
 * - Eventually asks for the "Key of Insight" (Gemini API key)
 *
 * Aesthetic: Abstract, geometric, otherworldly — like Destiny's Ghost
 * meets NMS's Atlas Interface. NOT humanoid. Pure geometry.
 */

import * as THREE from 'three';
import { hashSeed, seededRandom } from '../generation/hashSeed.js';

// ============================================================
// THE MYSTERIOUS BEING
// ============================================================

export class MysteriousBeingNPC {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} options
     * @param {THREE.Vector3} options.position - World position
     * @param {number} [options.seed] - Seed for appearance variation
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        this.position = options.position || new THREE.Vector3(0, 5, 30);
        this.seed = options.seed || 42;
        this.rng = seededRandom(this.seed, 'being');

        // State
        this.isActive = true;
        this.hasBeenApproached = false;
        this.dialogueTriggered = false;
        this.proximityRadius = 12; // meters — triggers dialogue
        this.glowRadius = 30;      // meters — start seeing the glow

        // 3D objects
        this.group = new THREE.Group();
        this.coreGeo = null;
        this.coreMat = null;
        this.coreMesh = null;
        this.particleSystem = null;
        this.pointLight = null;
        this.outerGlow = null;

        // Animation
        this.time = 0;
        this.floatHeight = 2.5;  // hovers this high above ground
        this.baseColor = new THREE.Color();
        this._setAppearance();

        this._build();
    }

    /**
     * Determine appearance from seed (each planet's Being looks slightly different).
     */
    _setAppearance() {
        const hue = this.rng() * 0.3 + 0.45; // Cyan to purple range (0.45 - 0.75)
        this.baseColor.setHSL(hue, 0.9, 0.6);
        this.glowColor = this.baseColor.clone();
        this.glowColor.multiplyScalar(1.5);
    }

    /**
     * Build the 3D mesh.
     */
    _build() {
        // ---- CORE: Octahedron (the "soul") ----
        this.coreGeo = new THREE.OctahedronGeometry(0.6, 0);
        this.coreMat = new THREE.MeshStandardMaterial({
            color: this.baseColor,
            emissive: this.baseColor,
            emissiveIntensity: 0.8,
            roughness: 0.1,
            metalness: 0.9,
            transparent: true,
            opacity: 0.9,
        });
        this.coreMesh = new THREE.Mesh(this.coreGeo, this.coreMat);
        this.group.add(this.coreMesh);

        // ---- OUTER SHELL: Wireframe icosahedron (the "mind") ----
        const shellGeo = new THREE.IcosahedronGeometry(1.0, 1);
        const shellMat = new THREE.MeshBasicMaterial({
            color: this.baseColor,
            wireframe: true,
            transparent: true,
            opacity: 0.3,
        });
        this.shellMesh = new THREE.Mesh(shellGeo, shellMat);
        this.group.add(this.shellMesh);

        // ---- INNER GLOW: Small bright sphere ----
        const innerGeo = new THREE.SphereGeometry(0.2, 8, 8);
        const innerMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
        });
        this.innerGlow = new THREE.Mesh(innerGeo, innerMat);
        this.group.add(this.innerGlow);

        // ---- PARTICLE RING ----
        this._buildParticles();

        // ---- POINT LIGHT (subtle — mysterious, not blinding) ----
        this.pointLight = new THREE.PointLight(this.baseColor, 1.5, 12);
        this.group.add(this.pointLight);

        // ---- GLOW SPRITE (small, ethereal halo) ----
        const glowTexture = this._createGlowTexture();
        const glowMat = new THREE.SpriteMaterial({
            map: glowTexture,
            color: this.baseColor,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.15,
        });
        this.outerGlow = new THREE.Sprite(glowMat);
        this.outerGlow.scale.set(3, 3, 1);
        this.group.add(this.outerGlow);

        // Position
        this.group.position.copy(this.position);
        this.group.position.y += this.floatHeight;

        this.scene.add(this.group);
    }

    /**
     * Build orbiting particle ring.
     */
    _buildParticles() {
        const count = 60;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const radius = 1.5 + this.rng() * 0.5;
            const height = (this.rng() - 0.5) * 1.0;

            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = height;
            positions[i * 3 + 2] = Math.sin(angle) * radius;

            colors[i * 3] = this.baseColor.r;
            colors[i * 3 + 1] = this.baseColor.g;
            colors[i * 3 + 2] = this.baseColor.b;

            sizes[i] = 2 + this.rng() * 3;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            size: 2,
            vertexColors: true,
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.particleSystem = new THREE.Points(geo, mat);
        this.group.add(this.particleSystem);
    }

    /**
     * Create a radial glow texture.
     */
    _createGlowTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(
            size / 2, size / 2, 0,
            size / 2, size / 2, size / 2
        );
        gradient.addColorStop(0, 'rgba(255,255,255,0.6)');
        gradient.addColorStop(0.15, 'rgba(200,255,220,0.3)');
        gradient.addColorStop(0.4, 'rgba(100,200,255,0.1)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(canvas);
    }

    // ============================================================
    // UPDATE (called every frame)
    // ============================================================

    update(deltaTime, cameraPosition) {
        if (!this.isActive) return;

        this.time += deltaTime;

        // ---- FLOATING ANIMATION ----
        const float = Math.sin(this.time * 0.8) * 0.3;
        this.group.position.y = this.position.y + this.floatHeight + float;

        // ---- ROTATION ----
        this.coreMesh.rotation.x += deltaTime * 0.3;
        this.coreMesh.rotation.y += deltaTime * 0.5;

        this.shellMesh.rotation.x -= deltaTime * 0.15;
        this.shellMesh.rotation.y += deltaTime * 0.25;
        this.shellMesh.rotation.z += deltaTime * 0.1;

        // Particles orbit
        if (this.particleSystem) {
            this.particleSystem.rotation.y += deltaTime * 0.4;
            this.particleSystem.rotation.x = Math.sin(this.time * 0.3) * 0.2;
        }

        // ---- PULSING ----
        const pulse = (Math.sin(this.time * 2.0) + 1) * 0.5; // 0-1
        this.coreMat.emissiveIntensity = 0.5 + pulse * 0.8;

        // Color shift
        const hueShift = Math.sin(this.time * 0.5) * 0.05;
        const baseHSL = {};
        this.baseColor.getHSL(baseHSL);
        const shiftedColor = new THREE.Color().setHSL(
            baseHSL.h + hueShift,
            baseHSL.s,
            baseHSL.l + pulse * 0.1
        );
        this.coreMat.emissive.copy(shiftedColor);
        this.pointLight.color.copy(shiftedColor);

        // Light intensity pulse (subtle)
        this.pointLight.intensity = 1.0 + pulse * 1.0;

        // ---- INNER GLOW PULSE ----
        this.innerGlow.scale.setScalar(0.12 + pulse * 0.08);
        this.innerGlow.material.opacity = 0.5 + pulse * 0.3;

        // ---- OUTER GLOW (ethereal, not blinding) ----
        this.outerGlow.material.opacity = 0.08 + pulse * 0.12;
        this.outerGlow.scale.setScalar(2.5 + pulse * 1.0);

        // ---- PROXIMITY CHECK ----
        const distance = cameraPosition.distanceTo(this.group.position);
        return distance;
    }

    /**
     * Check if player is close enough for dialogue.
     */
    isInDialogueRange(cameraPosition) {
        const dist = cameraPosition.distanceTo(this.group.position);
        return dist < this.proximityRadius;
    }

    /**
     * Check if player can see the glow (attraction range).
     */
    isInGlowRange(cameraPosition) {
        const dist = cameraPosition.distanceTo(this.group.position);
        return dist < this.glowRadius;
    }

    /**
     * Set the ground height under the Being.
     */
    setGroundHeight(height) {
        this.position.y = height || 0;
    }

    dispose() {
        this.isActive = false;
        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
        this.scene.remove(this.group);
    }
}

// ============================================================
// NPC MANAGER — orchestrates all NPCs on a planet
// ============================================================

export class NPCManager {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} planetData - { seed, rule }
     * @param {Function} getHeightAt - Terrain height query
     */
    constructor(scene, planetData, getHeightAt) {
        this.scene = scene;
        this.planetData = planetData;
        this.getHeightAt = getHeightAt;

        this.npcs = [];
        this.mysteriousBeing = null;
    }

    /**
     * Spawn the Mysterious Being at a deterministic location.
     * The location is derived from the planet seed so it's always
     * in the same spot for the same planet.
     */
    spawnMysteriousBeing() {
        const rng = seededRandom(this.planetData.seed, 'being_location');

        // Place the Being somewhere near the player spawn
        // but not too close (make them explore a bit)
        const angle = rng() * Math.PI * 2;
        const distance = 25 + rng() * 30; // 25-55 meters from origin

        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        const groundHeight = this.getHeightAt(x, z) || 0;

        this.mysteriousBeing = new MysteriousBeingNPC(this.scene, {
            position: new THREE.Vector3(x, groundHeight, z),
            seed: this.planetData.seed,
        });

        this.npcs.push(this.mysteriousBeing);

        return this.mysteriousBeing;
    }

    /**
     * Update all NPCs.
     */
    update(deltaTime, cameraPosition) {
        for (const npc of this.npcs) {
            npc.update(deltaTime, cameraPosition);
        }
    }

    /**
     * Check if the Mysterious Being is in dialogue range.
     */
    checkMysteriousBeingProximity(cameraPosition) {
        if (!this.mysteriousBeing) return { inRange: false, distance: Infinity };

        const dist = cameraPosition.distanceTo(this.mysteriousBeing.group.position);
        return {
            inRange: dist < this.mysteriousBeing.proximityRadius,
            inGlowRange: dist < this.mysteriousBeing.glowRadius,
            distance: dist,
            hasBeenApproached: this.mysteriousBeing.hasBeenApproached,
        };
    }

    dispose() {
        for (const npc of this.npcs) {
            npc.dispose();
        }
        this.npcs = [];
        this.mysteriousBeing = null;
    }
}
