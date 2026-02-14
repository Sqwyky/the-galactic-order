/**
 * THE GALACTIC ORDER - Atmospheric Particle System
 *
 * NMS-style floating particles that sell the "alien atmosphere" feel.
 * Tiny dust motes, pollen, or spores drift lazily around the camera.
 *
 * Different biome atmospheres get different particle styles:
 * - Default: Slow-drifting dust motes (warm light)
 * - Desert: Fine sand particles (amber, slightly faster)
 * - Swamp: Spores/pollen (green, slow float)
 * - Snow/Ice: Tiny snowflakes (white, gentle fall)
 * - Forest: Pollen/seeds (yellow-green, upward drift)
 *
 * Performance: Single Points mesh with ~200 particles.
 * All movement is in the vertex shader — zero JS per-particle cost.
 */

import * as THREE from 'three';

// ============================================================
// CONFIGURATION
// ============================================================

const PARTICLE_CONFIG = {
    count: 300,          // total particles in the cloud
    radius: 40,          // spread radius around camera (meters)
    baseSize: 2.5,       // base point size
    driftSpeed: 0.3,     // how fast particles move
    fadeNear: 2,         // fade out particles very close to camera
    fadeFar: 35,         // fade out particles far from camera
};

// ============================================================
// PARTICLE SHADER MATERIAL
// ============================================================

function createParticleMaterial(color, fogColor, fogDensity) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0.0 },
            uColor: { value: color || new THREE.Color(0xccbb99) },
            uFogColor: { value: fogColor || new THREE.Color(0x88aacc) },
            uFogDensity: { value: fogDensity || 0.0025 },
            uCameraPos: { value: new THREE.Vector3() },
        },
        vertexShader: /* glsl */ `
            uniform float uTime;
            uniform vec3 uCameraPos;

            attribute float aPhase;
            attribute float aSpeed;
            attribute float aSize;

            varying float vAlpha;
            varying float vFogDepth;

            void main() {
                // Each particle drifts in a unique elliptical path
                float t = uTime * aSpeed;
                vec3 pos = position;

                // Lazy drift motion — organic, not mechanical
                pos.x += sin(t * 0.7 + aPhase) * 2.0;
                pos.y += sin(t * 0.5 + aPhase * 1.3) * 1.5 + sin(t * 0.2) * 0.5;
                pos.z += cos(t * 0.6 + aPhase * 0.7) * 2.0;

                // Wrap particles around camera (infinite cloud effect)
                // Particles that drift too far get teleported to the other side
                float radius = 40.0;
                vec3 offset = pos - uCameraPos;
                offset = mod(offset + radius, radius * 2.0) - radius;
                pos = uCameraPos + offset;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                vFogDepth = length(mvPosition.xyz);

                // Distance-based alpha (fade near and far)
                float dist = length(offset);
                float nearFade = smoothstep(2.0, 5.0, dist);
                float farFade = smoothstep(38.0, 25.0, dist);
                vAlpha = nearFade * farFade;

                gl_Position = projectionMatrix * mvPosition;

                // Size attenuation
                gl_PointSize = aSize * (150.0 / -mvPosition.z);
                gl_PointSize = clamp(gl_PointSize, 0.5, 8.0);
            }
        `,
        fragmentShader: /* glsl */ `
            uniform vec3 uColor;
            uniform vec3 uFogColor;
            uniform float uFogDensity;

            varying float vAlpha;
            varying float vFogDepth;

            void main() {
                // Soft circular particle
                vec2 center = gl_PointCoord - 0.5;
                float dist = length(center);
                if (dist > 0.5) discard;

                // Soft edge
                float alpha = smoothstep(0.5, 0.2, dist) * vAlpha * 0.5;

                // Apply fog
                float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
                fogFactor = clamp(fogFactor, 0.0, 1.0);
                vec3 color = mix(uColor, uFogColor, fogFactor);

                if (alpha < 0.01) discard;
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
    });
}

// ============================================================
// ATMOSPHERIC PARTICLES
// ============================================================

export class AtmosphericParticles {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} options
     * @param {THREE.Color} options.color - Particle color
     * @param {THREE.Color} options.fogColor - Fog color for blending
     * @param {number} options.fogDensity - Fog density
     * @param {number} options.count - Number of particles
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        this.config = { ...PARTICLE_CONFIG, ...options };

        const count = this.config.count;
        const radius = this.config.radius;

        // Generate random starting positions in a sphere around origin
        const positions = new Float32Array(count * 3);
        const phases = new Float32Array(count);
        const speeds = new Float32Array(count);
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            // Random position in cube (will wrap around camera)
            positions[i * 3] = (Math.random() - 0.5) * radius * 2;
            positions[i * 3 + 1] = (Math.random() - 0.5) * radius * 2;
            positions[i * 3 + 2] = (Math.random() - 0.5) * radius * 2;

            // Random phase offset (prevents all particles moving in sync)
            phases[i] = Math.random() * Math.PI * 2;

            // Random speed (some particles drift faster than others)
            speeds[i] = 0.15 + Math.random() * 0.35;

            // Random size
            sizes[i] = this.config.baseSize * (0.5 + Math.random() * 1.0);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
        geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
        geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

        this.material = createParticleMaterial(
            options.color,
            options.fogColor,
            options.fogDensity
        );

        this.points = new THREE.Points(geo, this.material);
        this.points.frustumCulled = false; // Always render (particles wrap around camera)
        this.scene.add(this.points);
    }

    /**
     * Update every frame.
     * @param {THREE.Vector3} cameraPosition
     * @param {number} time - Elapsed time
     */
    update(cameraPosition, time) {
        this.material.uniforms.uTime.value = time;
        this.material.uniforms.uCameraPos.value.copy(cameraPosition);
    }

    dispose() {
        this.scene.remove(this.points);
        this.points.geometry.dispose();
        this.material.dispose();
    }
}
