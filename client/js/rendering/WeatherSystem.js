/**
 * THE GALACTIC ORDER - Procedural Weather System
 *
 * State-machine orchestrator that manages weather transitions and drives
 * parameters across all rendering subsystems. Not a shader itself — it
 * smoothly lerps uniforms and settings on VolumetricClouds, Atmosphere,
 * TriplanarTerrain, WindField, and SkyDome.
 *
 * Weather states: CLEAR, OVERCAST, RAIN, STORM, SNOW, FOG
 *
 * Also manages weather particles (rain/snow) using a camera-relative
 * particle system similar to AtmosphericParticles.
 */

import * as THREE from 'three';

// ============================================================
// WEATHER STATES
// ============================================================

export const WEATHER_STATE = {
    CLEAR: 'clear',
    OVERCAST: 'overcast',
    RAIN: 'rain',
    STORM: 'storm',
    SNOW: 'snow',
    FOG: 'fog',
};

// Per-state parameter targets
const WEATHER_PARAMS = {
    [WEATHER_STATE.CLEAR]: {
        cloudCoverage: 0.35,
        cloudDensity: 0.04,
        fogMultiplier: 1.0,
        godRayStrength: 0.25,
        wetness: 0.0,
        windMultiplier: 1.0,
        gustMultiplier: 1.0,
        skyDarkening: 1.0,
        particleType: null,
        particleCount: 0,
    },
    [WEATHER_STATE.OVERCAST]: {
        cloudCoverage: 0.7,
        cloudDensity: 0.06,
        fogMultiplier: 1.5,
        godRayStrength: 0.1,
        wetness: 0.2,
        windMultiplier: 1.5,
        gustMultiplier: 1.5,
        skyDarkening: 0.7,
        particleType: null,
        particleCount: 0,
    },
    [WEATHER_STATE.RAIN]: {
        cloudCoverage: 0.85,
        cloudDensity: 0.08,
        fogMultiplier: 2.0,
        godRayStrength: 0.0,
        wetness: 0.8,
        windMultiplier: 2.0,
        gustMultiplier: 2.5,
        skyDarkening: 0.5,
        particleType: 'rain',
        particleCount: 2000,
    },
    [WEATHER_STATE.STORM]: {
        cloudCoverage: 0.95,
        cloudDensity: 0.1,
        fogMultiplier: 3.0,
        godRayStrength: 0.0,
        wetness: 1.0,
        windMultiplier: 4.0,
        gustMultiplier: 5.0,
        skyDarkening: 0.3,
        particleType: 'rain',
        particleCount: 3000,
    },
    [WEATHER_STATE.SNOW]: {
        cloudCoverage: 0.7,
        cloudDensity: 0.06,
        fogMultiplier: 2.0,
        godRayStrength: 0.05,
        wetness: 0.0,
        windMultiplier: 1.3,
        gustMultiplier: 1.5,
        skyDarkening: 0.6,
        particleType: 'snow',
        particleCount: 800,
    },
    [WEATHER_STATE.FOG]: {
        cloudCoverage: 0.5,
        cloudDensity: 0.04,
        fogMultiplier: 5.0,
        godRayStrength: 0.0,
        wetness: 0.3,
        windMultiplier: 0.5,
        gustMultiplier: 0.3,
        skyDarkening: 0.4,
        particleType: null,
        particleCount: 0,
    },
};

// ============================================================
// WEATHER PARTICLES (rain/snow)
// ============================================================

class WeatherParticles {
    constructor(scene) {
        this._scene = scene;
        this._particles = null;
        this._geometry = null;
        this._material = null;
        this._type = null;
        this._count = 0;
        this._velocities = null;
        this._boxSize = 40; // Particles wrap in a 40m cube around camera
    }

    /**
     * Set particle type and count. Recreates geometry if type changes.
     */
    setConfig(type, count, particleMultiplier) {
        count = Math.floor(count * particleMultiplier);

        if (type === this._type && count === this._count) return;

        // Clean up old particles
        this.dispose();

        if (!type || count <= 0) {
            this._type = null;
            this._count = 0;
            return;
        }

        this._type = type;
        this._count = count;

        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        this._velocities = new Float32Array(count * 3);

        const half = this._boxSize / 2;
        const isRain = type === 'rain';

        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * this._boxSize;
            positions[i * 3 + 1] = Math.random() * this._boxSize;
            positions[i * 3 + 2] = (Math.random() - 0.5) * this._boxSize;

            if (isRain) {
                // Rain: fast downward, slight horizontal drift
                this._velocities[i * 3] = (Math.random() - 0.5) * 2;
                this._velocities[i * 3 + 1] = -(15 + Math.random() * 10); // 15-25 m/s
                this._velocities[i * 3 + 2] = (Math.random() - 0.5) * 2;
                sizes[i] = 1.5 + Math.random() * 1.5; // Elongated streaks
            } else {
                // Snow: slow drift
                this._velocities[i * 3] = (Math.random() - 0.5) * 3;
                this._velocities[i * 3 + 1] = -(1.0 + Math.random() * 1.5); // 1-2.5 m/s
                this._velocities[i * 3 + 2] = (Math.random() - 0.5) * 3;
                sizes[i] = 2.0 + Math.random() * 2.0; // Soft round flakes
            }
        }

        this._geometry = new THREE.BufferGeometry();
        this._geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this._geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        this._material = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: isRain ? new THREE.Color(0.7, 0.75, 0.8) : new THREE.Color(0.95, 0.95, 1.0) },
                uOpacity: { value: isRain ? 0.3 : 0.6 },
            },
            vertexShader: /* glsl */ `
                attribute float size;
                varying float vAlpha;
                void main() {
                    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (200.0 / -mvPos.z);
                    gl_PointSize = clamp(gl_PointSize, 1.0, 8.0);
                    vAlpha = smoothstep(0.0, 5.0, -mvPos.z) * smoothstep(40.0, 20.0, -mvPos.z);
                    gl_Position = projectionMatrix * mvPos;
                }
            `,
            fragmentShader: /* glsl */ `
                precision mediump float;
                uniform vec3 uColor;
                uniform float uOpacity;
                varying float vAlpha;
                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    float alpha = smoothstep(0.5, 0.2, dist) * vAlpha * uOpacity;
                    if (alpha < 0.01) discard;
                    gl_FragColor = vec4(uColor, alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        this._particles = new THREE.Points(this._geometry, this._material);
        this._particles.frustumCulled = false;
        this._scene.add(this._particles);
    }

    update(dt, cameraPosition, windStrength) {
        if (!this._particles || !this._velocities) return;

        const positions = this._geometry.attributes.position.array;
        const half = this._boxSize / 2;
        const isRain = this._type === 'rain';

        // Wind influence on particles
        const windX = windStrength * 0.5;

        for (let i = 0; i < this._count; i++) {
            const i3 = i * 3;
            positions[i3] += (this._velocities[i3] + windX) * dt;
            positions[i3 + 1] += this._velocities[i3 + 1] * dt;
            positions[i3 + 2] += this._velocities[i3 + 2] * dt;

            // Wrap around camera position
            const relX = positions[i3] - cameraPosition.x;
            const relY = positions[i3 + 1] - cameraPosition.y;
            const relZ = positions[i3 + 2] - cameraPosition.z;

            if (relX > half) positions[i3] -= this._boxSize;
            else if (relX < -half) positions[i3] += this._boxSize;

            if (relY < -half) positions[i3 + 1] += this._boxSize;
            else if (relY > half) positions[i3 + 1] -= this._boxSize;

            if (relZ > half) positions[i3 + 2] -= this._boxSize;
            else if (relZ < -half) positions[i3 + 2] += this._boxSize;
        }

        this._geometry.attributes.position.needsUpdate = true;
    }

    dispose() {
        if (this._particles) {
            this._scene.remove(this._particles);
            this._geometry.dispose();
            this._material.dispose();
            this._particles = null;
            this._geometry = null;
            this._material = null;
            this._velocities = null;
        }
    }
}

// ============================================================
// WEATHER SYSTEM
// ============================================================

export class WeatherSystem {
    /**
     * @param {Object} options
     * @param {THREE.Scene} options.scene
     * @param {VolumetricCloudPass} [options.volumetricClouds]
     * @param {RayMarchedAtmospherePass} [options.atmospherePass]
     * @param {THREE.ShaderMaterial} [options.triplanarMaterial]
     * @param {WindField} [options.windField]
     * @param {SkyDome} [options.skyDome]
     */
    constructor(options = {}) {
        this._scene = options.scene;
        this._volumetricClouds = options.volumetricClouds || null;
        this._atmospherePass = options.atmospherePass || null;
        this._triplanarMaterial = options.triplanarMaterial || null;
        this._windField = options.windField || null;
        this._skyDome = options.skyDome || null;

        // State machine
        this._currentWeather = WEATHER_STATE.CLEAR;
        this._targetWeather = WEATHER_STATE.CLEAR;
        this._transitionProgress = 1.0; // 1.0 = fully transitioned
        this._transitionSpeed = 0.1;    // ~10 second transitions

        // Current interpolated parameters
        this._currentParams = { ...WEATHER_PARAMS[WEATHER_STATE.CLEAR] };
        this._fromParams = { ...WEATHER_PARAMS[WEATHER_STATE.CLEAR] };
        this._toParams = { ...WEATHER_PARAMS[WEATHER_STATE.CLEAR] };

        // Base values (captured from systems at init, used as reference for multipliers)
        this._baseFogDensity = 0.003;
        this._baseWindStrength = 1.0;
        this._baseGustStrength = 1.0;

        // Weather particles
        this._weatherParticles = new WeatherParticles(this._scene);
        this._particleMultiplier = 1.0;

        // Auto weather change timer
        this._autoWeatherEnabled = true;
        this._autoWeatherTimer = 120 + Math.random() * 180; // 2-5 min initial

        // Store base fog from atmosphere
        if (this._atmospherePass) {
            this._baseFogDensity = this._atmospherePass.fogDensity;
        }
        if (this._windField) {
            this._baseWindStrength = this._windField.baseStrength || 1.0;
            this._baseGustStrength = this._windField.gustStrength || 1.0;
        }
    }

    /**
     * Get the current weather state.
     * @returns {string}
     */
    get currentWeather() {
        return this._currentWeather;
    }

    /**
     * Set particle multiplier from PerformanceManager.
     * @param {number} multiplier
     */
    setParticleMultiplier(multiplier) {
        this._particleMultiplier = multiplier;
    }

    /**
     * Transition to a new weather state.
     * @param {string} state - One of WEATHER_STATE values
     */
    setWeather(state) {
        if (!WEATHER_PARAMS[state]) {
            console.warn(`[TGO Weather] Unknown weather state: ${state}`);
            return;
        }

        if (state === this._targetWeather && this._transitionProgress >= 1.0) return;

        console.log(`[TGO Weather] Transitioning: ${this._currentWeather} → ${state}`);

        // Snapshot current interpolated state as the "from"
        this._fromParams = { ...this._currentParams };
        this._toParams = WEATHER_PARAMS[state];
        this._targetWeather = state;
        this._transitionProgress = 0.0;
    }

    /**
     * Update weather system each frame.
     * @param {number} dt - Delta time in seconds
     * @param {THREE.Vector3} cameraPosition
     */
    update(dt, cameraPosition) {
        // Auto weather changes
        if (this._autoWeatherEnabled) {
            this._autoWeatherTimer -= dt;
            if (this._autoWeatherTimer <= 0) {
                this._pickRandomWeather();
                this._autoWeatherTimer = 120 + Math.random() * 180;
            }
        }

        // Transition
        if (this._transitionProgress < 1.0) {
            this._transitionProgress += dt * this._transitionSpeed;
            if (this._transitionProgress >= 1.0) {
                this._transitionProgress = 1.0;
                this._currentWeather = this._targetWeather;
            }

            this._interpolateParams();
            this._applyToSystems();
        }

        // Update weather particles
        const windStr = this._currentParams.windMultiplier * this._baseWindStrength;
        this._weatherParticles.update(dt, cameraPosition, windStr);
    }

    _pickRandomWeather() {
        const states = Object.values(WEATHER_STATE);
        // Weight toward clear/overcast, less likely storm/snow
        const weights = [
            WEATHER_STATE.CLEAR,    WEATHER_STATE.CLEAR,
            WEATHER_STATE.OVERCAST, WEATHER_STATE.OVERCAST,
            WEATHER_STATE.RAIN,
            WEATHER_STATE.STORM,
            WEATHER_STATE.FOG,
        ];
        const pick = weights[Math.floor(Math.random() * weights.length)];
        if (pick !== this._currentWeather) {
            this.setWeather(pick);
        }
    }

    _interpolateParams() {
        const t = this._transitionProgress;
        // Smooth ease
        const ease = t * t * (3 - 2 * t);

        const from = this._fromParams;
        const to = this._toParams;

        this._currentParams.cloudCoverage = from.cloudCoverage + (to.cloudCoverage - from.cloudCoverage) * ease;
        this._currentParams.cloudDensity = from.cloudDensity + (to.cloudDensity - from.cloudDensity) * ease;
        this._currentParams.fogMultiplier = from.fogMultiplier + (to.fogMultiplier - from.fogMultiplier) * ease;
        this._currentParams.godRayStrength = from.godRayStrength + (to.godRayStrength - from.godRayStrength) * ease;
        this._currentParams.wetness = from.wetness + (to.wetness - from.wetness) * ease;
        this._currentParams.windMultiplier = from.windMultiplier + (to.windMultiplier - from.windMultiplier) * ease;
        this._currentParams.gustMultiplier = from.gustMultiplier + (to.gustMultiplier - from.gustMultiplier) * ease;
        this._currentParams.skyDarkening = from.skyDarkening + (to.skyDarkening - from.skyDarkening) * ease;
        this._currentParams.particleCount = Math.floor(from.particleCount + (to.particleCount - from.particleCount) * ease);
        this._currentParams.particleType = ease > 0.5 ? to.particleType : from.particleType;
    }

    _applyToSystems() {
        const p = this._currentParams;

        // Volumetric Clouds
        if (this._volumetricClouds) {
            this._volumetricClouds.coverage = p.cloudCoverage;
            this._volumetricClouds.density = p.cloudDensity;
            if (this._volumetricClouds._material && this._volumetricClouds._material.uniforms) {
                if (this._volumetricClouds._material.uniforms.uCoverage) {
                    this._volumetricClouds._material.uniforms.uCoverage.value = p.cloudCoverage;
                }
                if (this._volumetricClouds._material.uniforms.uDensity) {
                    this._volumetricClouds._material.uniforms.uDensity.value = p.cloudDensity;
                }
            }
        }

        // Atmosphere
        if (this._atmospherePass) {
            this._atmospherePass.fogDensity = this._baseFogDensity * p.fogMultiplier;
            this._atmospherePass.godRayStrength = p.godRayStrength;
        }

        // Triplanar terrain (wetness)
        if (this._triplanarMaterial && this._triplanarMaterial.uniforms) {
            if (this._triplanarMaterial.uniforms.uWetness) {
                this._triplanarMaterial.uniforms.uWetness.value = p.wetness;
            }
        }

        // Wind field
        if (this._windField) {
            this._windField.baseStrength = this._baseWindStrength * p.windMultiplier;
            this._windField.gustStrength = this._baseGustStrength * p.gustMultiplier;
        }

        // SkyDome darkening
        if (this._skyDome && this._skyDome.setDarkening) {
            this._skyDome.setDarkening(p.skyDarkening);
        }

        // Weather particles
        this._weatherParticles.setConfig(
            p.particleType,
            p.particleCount,
            this._particleMultiplier
        );
    }

    /**
     * Enable/disable auto weather transitions.
     */
    setAutoWeather(enabled) {
        this._autoWeatherEnabled = enabled;
    }

    dispose() {
        this._weatherParticles.dispose();
    }
}
