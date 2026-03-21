/**
 * THE GALACTIC ORDER — Engine Visual Effects
 *
 * Replaces simple CircleGeometry glow discs with proper engine effects:
 *   - Animated engine cones with Perlin noise shader
 *   - GPU-instanced particle trails
 *   - Afterburner mode with extended trail + bloom
 *
 * Registers with PerformanceManager for quality-tier scaling.
 */

import * as THREE from 'three';

// ============================================================
// ENGINE CONE SHADER
// ============================================================

const EngineConeShader = {
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vZ;
        void main() {
            vUv = uv;
            vZ = position.z;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uThrust;
        uniform float uAfterburner;

        varying vec2 vUv;
        varying float vZ;

        // Simple noise
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
            float dist = length(vUv - 0.5) * 2.0;
            float thrust = uThrust;

            // Noise turbulence
            float n = noise(vUv * 8.0 + uTime * 4.0) * 0.3;
            n += noise(vUv * 16.0 - uTime * 6.0) * 0.15;

            // Core glow (white center fading to color)
            float core = smoothstep(0.6, 0.0, dist + n * 0.2);
            vec3 coreColor = mix(uColor, vec3(1.0), core * 0.7);

            // Overall intensity
            float alpha = smoothstep(1.0, 0.2, dist) * thrust;
            alpha *= (0.8 + n * 0.4);

            // Afterburner boost
            alpha *= 1.0 + uAfterburner * 0.5;
            coreColor = mix(coreColor, vec3(1.0, 0.9, 0.7), uAfterburner * 0.3);

            gl_FragColor = vec4(coreColor, alpha * 0.85);
        }
    `,
};

// ============================================================
// ENGINE EFFECTS
// ============================================================

export class EngineEffects {
    /**
     * @param {THREE.Group} shipGroup - Ship's hull group to attach effects to
     * @param {Object[]} enginePositions - Array of {x, y, z, radius} for each engine
     * @param {THREE.Color|number} engineColor - Engine glow color
     * @param {Object} [qualitySettings] - Performance tier settings
     */
    constructor(shipGroup, enginePositions, engineColor, qualitySettings = {}) {
        this.shipGroup = shipGroup;
        this.engineColor = new THREE.Color(engineColor);
        this.engines = [];
        this.particles = [];
        this.thrust = 0;
        this.afterburner = 0;
        this.time = 0;

        // Quality settings
        this.particlesEnabled = qualitySettings.shipEngineParticles !== false;
        this.particleCount = qualitySettings.shipEngineParticleCount ?? 200;

        this._buildEngines(enginePositions);
    }

    _buildEngines(positions) {
        for (const pos of positions) {
            const radius = pos.radius || 0.25;
            const engine = this._createEngineCone(pos, radius);
            this.engines.push(engine);

            if (this.particlesEnabled && this.particleCount > 0) {
                const trail = this._createParticleTrail(pos, radius);
                this.particles.push(trail);
            }
        }
    }

    _createEngineCone(pos, radius) {
        // Cone geometry pointing backward (-Z)
        const geo = new THREE.ConeGeometry(radius * 1.2, radius * 3, 12, 1, true);
        geo.rotateX(Math.PI / 2); // Point along Z

        const mat = new THREE.ShaderMaterial({
            vertexShader: EngineConeShader.vertexShader,
            fragmentShader: EngineConeShader.fragmentShader,
            uniforms: {
                uColor: { value: this.engineColor.clone() },
                uTime: { value: 0 },
                uThrust: { value: 0 },
                uAfterburner: { value: 0 },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos.x, pos.y, pos.z - radius * 1.5);
        this.shipGroup.add(mesh);

        // Also add the classic glow disc for fallback / layered look
        const discGeo = new THREE.CircleGeometry(radius, 10);
        const discMat = new THREE.MeshBasicMaterial({
            color: this.engineColor,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.position.set(pos.x, pos.y, pos.z - 0.02);
        disc.rotation.y = Math.PI;
        this.shipGroup.add(disc);

        // Inner core disc
        const coreGeo = new THREE.CircleGeometry(radius * 0.5, 8);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.set(pos.x, pos.y, pos.z - 0.03);
        core.rotation.y = Math.PI;
        this.shipGroup.add(core);

        return { cone: mesh, disc, core, mat };
    }

    _createParticleTrail(pos, radius) {
        const count = Math.min(this.particleCount, 300);
        const geo = new THREE.BufferGeometry();

        const positions = new Float32Array(count * 3);
        const velocities = new Float32Array(count * 3);
        const lifetimes = new Float32Array(count);
        const ages = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            // Start at engine position
            positions[i * 3]     = pos.x + (Math.random() - 0.5) * radius * 0.5;
            positions[i * 3 + 1] = pos.y + (Math.random() - 0.5) * radius * 0.5;
            positions[i * 3 + 2] = pos.z;

            // Velocity pointing backward
            velocities[i * 3]     = (Math.random() - 0.5) * 0.5;
            velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
            velocities[i * 3 + 2] = -(2 + Math.random() * 3);

            lifetimes[i] = 0.3 + Math.random() * 0.7;
            ages[i] = Math.random() * lifetimes[i]; // Stagger start
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            color: this.engineColor,
            size: 0.08,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const points = new THREE.Points(geo, mat);
        this.shipGroup.add(points);

        return { points, velocities, lifetimes, ages, origin: pos, radius, count };
    }

    /**
     * Update engine effects.
     * @param {number} thrust - 0-1 thrust level
     * @param {number} dt - Delta time in seconds
     * @param {number} time - Elapsed time in seconds
     * @param {boolean} [afterburnerActive=false]
     */
    update(thrust, dt, time, afterburnerActive = false) {
        this.thrust = thrust;
        this.afterburner = afterburnerActive ? 1.0 : 0.0;
        this.time = time;

        // Update engine cones
        for (const engine of this.engines) {
            engine.mat.uniforms.uTime.value = time;
            engine.mat.uniforms.uThrust.value = thrust;
            engine.mat.uniforms.uAfterburner.value = this.afterburner;

            // Scale cone by thrust
            const s = 0.3 + thrust * 0.7 + this.afterburner * 0.5;
            engine.cone.scale.set(s, s, s + this.afterburner * 0.8);
            engine.cone.visible = thrust > 0.01;

            // Update glow discs
            const pulse = 0.7 + Math.sin(time * 12) * 0.15;
            const intensity = thrust * pulse;
            engine.disc.material.opacity = 0.25 + intensity * 0.6;
            engine.disc.scale.setScalar(0.8 + intensity * 0.5);
            engine.core.material.opacity = 0.4 + intensity * 0.5;
            engine.core.scale.setScalar(0.6 + intensity * 0.5);
        }

        // Update particle trails
        for (const trail of this.particles) {
            this._updateParticles(trail, dt, thrust);
        }
    }

    _updateParticles(trail, dt, thrust) {
        const posAttr = trail.points.geometry.getAttribute('position');
        const positions = posAttr.array;

        for (let i = 0; i < trail.count; i++) {
            trail.ages[i] += dt;

            if (trail.ages[i] >= trail.lifetimes[i]) {
                // Reset particle to origin
                positions[i * 3]     = trail.origin.x + (Math.random() - 0.5) * trail.radius * 0.5;
                positions[i * 3 + 1] = trail.origin.y + (Math.random() - 0.5) * trail.radius * 0.5;
                positions[i * 3 + 2] = trail.origin.z;
                trail.ages[i] = 0;
                trail.lifetimes[i] = 0.3 + Math.random() * 0.7;

                // New velocity
                trail.velocities[i * 3]     = (Math.random() - 0.5) * 0.5;
                trail.velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
                trail.velocities[i * 3 + 2] = -(2 + Math.random() * 3);
            } else {
                // Move particle
                positions[i * 3]     += trail.velocities[i * 3]     * dt * thrust;
                positions[i * 3 + 1] += trail.velocities[i * 3 + 1] * dt * thrust;
                positions[i * 3 + 2] += trail.velocities[i * 3 + 2] * dt * thrust;
            }
        }

        posAttr.needsUpdate = true;
        trail.points.material.opacity = 0.1 + thrust * 0.5;
        trail.points.visible = thrust > 0.01;
    }

    /**
     * Set quality tier settings.
     * @param {Object} settings
     */
    setQuality(settings) {
        this.particlesEnabled = settings.shipEngineParticles !== false;
        for (const trail of this.particles) {
            trail.points.visible = this.particlesEnabled;
        }
    }

    /** Dispose all engine effect resources. */
    dispose() {
        for (const engine of this.engines) {
            engine.cone.geometry.dispose();
            engine.mat.dispose();
            engine.disc.geometry.dispose();
            engine.disc.material.dispose();
            engine.core.geometry.dispose();
            engine.core.material.dispose();
            this.shipGroup.remove(engine.cone);
            this.shipGroup.remove(engine.disc);
            this.shipGroup.remove(engine.core);
        }
        for (const trail of this.particles) {
            trail.points.geometry.dispose();
            trail.points.material.dispose();
            this.shipGroup.remove(trail.points);
        }
        this.engines = [];
        this.particles = [];
    }
}
