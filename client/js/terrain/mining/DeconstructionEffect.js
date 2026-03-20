/**
 * THE GALACTIC ORDER - Deconstruction Particle Effect
 *
 * CA-pattern glitch/deconstruction particles spawned when a rock or
 * flora object is destroyed. Particles first form a brief CA-grid
 * pattern before dispersing. Mixed sizes: big "data blocks" and tiny
 * "dust" particles convey the digital nature of matter.
 */

import * as THREE from 'three';
import { ELEMENTS } from '../../generation/HarmonicElements.js';

export class DeconstructionEffect {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} config - Shared MINING_CONFIG reference
     */
    constructor(scene, config) {
        this.scene = scene;
        this.config = config;

        // Active particle systems
        this._particles = [];

        // Destruction flash light (pooled, reused)
        this._flashLight = new THREE.PointLight(0xffffff, 0, 10);
        this.scene.add(this._flashLight);
        this._flashTimer = 0;
    }

    /**
     * Spawn a CA-pattern deconstruction effect at the given position.
     * @param {THREE.Vector3} position - World position of destroyed object
     * @param {string|number} color - Element ID (used to look up element color)
     */
    trigger(position, color) {
        const elementId = color; // parameter named 'color' per API, but is elementId

        // Enforce max concurrent particle systems for performance
        while (this._particles.length >= this.config.maxParticleSystems) {
            const oldest = this._particles.shift();
            this.scene.remove(oldest.points);
            this.scene.remove(oldest.glow);
            oldest.geo.dispose();
            oldest.mat.dispose();
        }

        const element = ELEMENTS[elementId];
        const elementColor = element ? new THREE.Color(element.color[0], element.color[1], element.color[2])
                                     : new THREE.Color(0.5, 0.5, 0.5);

        const count = this.config.particleCount;
        const positions = new Float32Array(count * 3);
        const velocities = [];
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        // CA-grid layout: particles initially form a small 3D grid, then disperse
        const gridDim = Math.max(2, Math.ceil(Math.cbrt(count)));
        const gridSpacing = 0.3;

        for (let i = 0; i < count; i++) {
            const gx = (i % gridDim) - gridDim / 2;
            const gy = (Math.floor(i / gridDim) % gridDim) - gridDim / 2;
            const gz = (Math.floor(i / (gridDim * gridDim)) % gridDim) - gridDim / 2;

            positions[i * 3]     = position.x + gx * gridSpacing;
            positions[i * 3 + 1] = position.y + gy * gridSpacing + 0.5;
            positions[i * 3 + 2] = position.z + gz * gridSpacing;

            // Velocity: upward + outward burst (applied after grid phase)
            const angle = Math.random() * Math.PI * 2;
            const upSpeed = 1 + Math.random() * this.config.particleSpeed;
            const outSpeed = Math.random() * this.config.particleSpeed * 0.7;
            velocities.push(new THREE.Vector3(
                Math.cos(angle) * outSpeed,
                upSpeed,
                Math.sin(angle) * outSpeed
            ));

            // CA-style binary coloring: alternate between element color and "code green"
            const isBit = Math.random() > 0.5;
            if (isBit) {
                colors[i * 3]     = 0.0;
                colors[i * 3 + 1] = 1.0;
                colors[i * 3 + 2] = 0.5; // Matrix green
            } else {
                colors[i * 3]     = elementColor.r;
                colors[i * 3 + 1] = elementColor.g;
                colors[i * 3 + 2] = elementColor.b;
            }

            // Varied sizes: ~30% are big "data blocks", rest are tiny "dust"
            const isDataBlock = Math.random() < 0.3;
            sizes[i] = isDataBlock
                ? this.config.particleSize * (1.8 + Math.random() * 1.2)
                : this.config.particleSize * (0.3 + Math.random() * 0.5);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            size: this.config.particleSize,
            transparent: true,
            opacity: 1.0,
            vertexColors: true,
            sizeAttenuation: true,
        });

        const points = new THREE.Points(geo, mat);
        points.frustumCulled = true;
        this.scene.add(points);

        // Glow at destruction point
        const glow = new THREE.PointLight(
            new THREE.Color(element ? element.glowColor[0] : 0, element ? element.glowColor[1] : 1, element ? element.glowColor[2] : 0.5),
            3, 8
        );
        glow.position.copy(position);
        this.scene.add(glow);

        // Destruction flash -- spike the shared flash light
        this._flashLight.position.copy(position);
        this._flashLight.intensity = 5;
        this._flashLight.color.set(0xffffff);
        this._flashTimer = 0.2;

        this._particles.push({
            points,
            geo,
            mat,
            glow,
            velocities,
            baseSizes: sizes,
            gridPhase: 0.15,
            lifetime: this.config.particleDuration,
            maxLifetime: this.config.particleDuration,
        });
    }

    /**
     * Per-frame update: animate particles, fade, cleanup expired systems.
     * @param {number} dt
     */
    update(dt) {
        // Update destruction flash decay
        if (this._flashTimer > 0) {
            this._flashTimer -= dt;
            this._flashLight.intensity = Math.max(0, 5 * (this._flashTimer / 0.2));
        }

        for (let i = this._particles.length - 1; i >= 0; i--) {
            const p = this._particles[i];
            p.lifetime -= dt;

            const t = 1 - p.lifetime / p.maxLifetime;

            // Fade out
            p.mat.opacity = Math.max(0, 1 - t * t);

            // Scale per-particle sizes
            if (p.baseSizes) {
                const sizeScale = 1 + t * 2;
                p.mat.size = this.config.particleSize * sizeScale;
            } else {
                p.mat.size = this.config.particleSize * (1 + t * 2);
            }

            // Glow decay
            p.glow.intensity = 3 * (1 - t);

            // Grid phase: particles hold position briefly before dispersing
            const inGrid = p.gridPhase !== undefined && p.gridPhase > 0;
            if (inGrid) {
                p.gridPhase -= dt;
            }

            // Move particles (only after grid phase ends)
            const posArr = p.geo.getAttribute('position').array;
            if (!inGrid) {
                for (let j = 0; j < p.velocities.length; j++) {
                    posArr[j * 3]     += p.velocities[j].x * dt;
                    posArr[j * 3 + 1] += p.velocities[j].y * dt;
                    posArr[j * 3 + 2] += p.velocities[j].z * dt;

                    // Gravity + drag
                    p.velocities[j].y -= 4 * dt;
                    p.velocities[j].multiplyScalar(0.98);
                }
            }
            p.geo.getAttribute('position').needsUpdate = true;

            // CA flicker effect: randomly toggle particle colors (binary glitch)
            if (Math.random() < 0.1) {
                const colorArr = p.geo.getAttribute('color').array;
                const ri = Math.floor(Math.random() * p.velocities.length);
                colorArr[ri * 3 + 1] = colorArr[ri * 3 + 1] > 0.5 ? 0.2 : 1.0;
                p.geo.getAttribute('color').needsUpdate = true;
            }

            if (p.lifetime <= 0) {
                this.scene.remove(p.points);
                this.scene.remove(p.glow);
                p.geo.dispose();
                p.mat.dispose();
                this._particles.splice(i, 1);
            }
        }
    }

    /** Dispose all GPU resources. */
    dispose() {
        for (const p of this._particles) {
            this.scene.remove(p.points);
            this.scene.remove(p.glow);
            p.geo.dispose();
            p.mat.dispose();
        }
        this._particles = [];
        this.scene.remove(this._flashLight);
    }
}
