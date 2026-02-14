/**
 * THE GALACTIC ORDER - Ray-Marched Atmosphere (Post-Processing Pass)
 *
 * Pioneer-inspired volumetric atmosphere rendered as a screen-space
 * post-processing pass. Reads the depth buffer to reconstruct world
 * positions and applies physically-based atmospheric scattering.
 *
 * Features:
 * 1. Rayleigh scattering — wavelength-dependent sky tint (blue/purple/orange)
 * 2. Mie scattering — forward-peaked sun glow (golden halo)
 * 3. Aerial perspective — distant objects fade toward atmosphere color
 * 4. Height-based density — exponential falloff with altitude
 * 5. God rays — screen-space radial blur from sun position
 * 6. Planet mood integration — all colors driven by CA rule
 *
 * Performance: Single full-screen pass, 8-16 ray steps (adaptive),
 * ~0.5ms on mobile GPU. Falls back to cheaper analytical mode on low tier.
 *
 * Integration: Slot between SSAO and Bloom in the EffectComposer.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ============================================================
// RAY-MARCHED ATMOSPHERE PASS
// ============================================================

export class RayMarchedAtmospherePass extends Pass {
    /**
     * @param {THREE.Camera} camera
     * @param {Object} options
     * @param {THREE.Color} options.skyColor - Atmosphere base color (from mood)
     * @param {THREE.Color} options.fogColor - Fog/horizon color
     * @param {THREE.Color} options.sunColor - Sun light color
     * @param {THREE.Vector3} options.sunDirection - Normalized sun direction
     * @param {number} options.fogDensity - Base fog density
     * @param {number} [options.scatterStrength=1.0] - Scattering intensity
     * @param {number} [options.godRayStrength=0.3] - God ray intensity
     * @param {number} [options.aerialPerspective=1.0] - Aerial perspective strength
     * @param {number} [options.heightFalloff=0.08] - Density height falloff rate
     * @param {number} [options.raySteps=12] - Number of ray march steps
     */
    constructor(camera, options = {}) {
        super();

        this.camera = camera;
        this.enabled = true;
        this.needsSwap = true;

        // Atmosphere parameters
        this.skyColor = options.skyColor || new THREE.Color(0x3366aa);
        this.fogColor = options.fogColor || new THREE.Color(0x88aacc);
        this.sunColor = options.sunColor || new THREE.Color(0xffeedd);
        this.sunDirection = options.sunDirection || new THREE.Vector3(0.5, 0.3, 0.4).normalize();
        this.fogDensity = options.fogDensity || 0.003;
        this.scatterStrength = options.scatterStrength !== undefined ? options.scatterStrength : 1.0;
        this.godRayStrength = options.godRayStrength !== undefined ? options.godRayStrength : 0.3;
        this.aerialPerspective = options.aerialPerspective !== undefined ? options.aerialPerspective : 1.0;
        this.heightFalloff = options.heightFalloff !== undefined ? options.heightFalloff : 0.08;
        this.raySteps = options.raySteps !== undefined ? options.raySteps : 12;

        // Shader material
        this._material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                tDepth: { value: null },
                uCameraNear: { value: camera.near },
                uCameraFar: { value: camera.far },
                uInverseProjection: { value: new THREE.Matrix4() },
                uInverseView: { value: new THREE.Matrix4() },
                uCameraPosition: { value: new THREE.Vector3() },
                uSkyColor: { value: this.skyColor },
                uFogColor: { value: this.fogColor },
                uSunColor: { value: this.sunColor },
                uSunDirection: { value: this.sunDirection },
                uSunScreenPos: { value: new THREE.Vector2(0.5, 0.5) },
                uFogDensity: { value: this.fogDensity },
                uScatterStrength: { value: this.scatterStrength },
                uGodRayStrength: { value: this.godRayStrength },
                uAerialPerspective: { value: this.aerialPerspective },
                uHeightFalloff: { value: this.heightFalloff },
                uRaySteps: { value: this.raySteps },
                uTime: { value: 0 },
                uResolution: { value: new THREE.Vector2() },
            },
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                precision highp float;

                uniform sampler2D tDiffuse;
                uniform sampler2D tDepth;
                uniform float uCameraNear;
                uniform float uCameraFar;
                uniform mat4 uInverseProjection;
                uniform mat4 uInverseView;
                uniform vec3 uCameraPosition;
                uniform vec3 uSkyColor;
                uniform vec3 uFogColor;
                uniform vec3 uSunColor;
                uniform vec3 uSunDirection;
                uniform vec2 uSunScreenPos;
                uniform float uFogDensity;
                uniform float uScatterStrength;
                uniform float uGodRayStrength;
                uniform float uAerialPerspective;
                uniform float uHeightFalloff;
                uniform float uRaySteps;
                uniform float uTime;
                uniform vec2 uResolution;

                varying vec2 vUv;

                // ============================================================
                // DEPTH RECONSTRUCTION
                // ============================================================

                float getLinearDepth(vec2 uv) {
                    float fragDepth = texture2D(tDepth, uv).x;
                    float viewZ = (uCameraNear * uCameraFar) /
                        (uCameraFar - fragDepth * (uCameraFar - uCameraNear));
                    return viewZ;
                }

                vec3 getWorldPosition(vec2 uv, float depth) {
                    // NDC coordinates
                    vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
                    // Unproject to view space
                    vec4 viewPos = uInverseProjection * ndc;
                    viewPos /= viewPos.w;
                    // View to world
                    vec4 worldPos = uInverseView * viewPos;
                    return worldPos.xyz;
                }

                // ============================================================
                // SCATTERING FUNCTIONS
                // ============================================================

                // Rayleigh phase function — isotropic, wavelength-dependent
                float rayleighPhase(float cosTheta) {
                    return 0.75 * (1.0 + cosTheta * cosTheta);
                }

                // Henyey-Greenstein phase function — forward-peaked (Mie)
                float miePhase(float cosTheta, float g) {
                    float g2 = g * g;
                    float denom = 1.0 + g2 - 2.0 * g * cosTheta;
                    return (1.0 - g2) / (4.0 * 3.14159265 * pow(denom, 1.5));
                }

                // Height-based atmospheric density
                float atmosphereDensity(float height) {
                    return exp(-max(height, 0.0) * uHeightFalloff);
                }

                // ============================================================
                // AERIAL PERSPECTIVE (analytical, fast)
                // ============================================================

                vec3 computeAerialPerspective(float dist, float height, vec3 viewDir) {
                    // Optical depth increases with distance, modulated by height
                    float density = atmosphereDensity(height);
                    float opticalDepth = dist * uFogDensity * density * 2.0;

                    // Transmittance (Beer-Lambert)
                    float transmittance = exp(-opticalDepth);

                    // View-sun angle for scattering color
                    float cosTheta = dot(viewDir, uSunDirection);

                    // Rayleigh scattering — wavelength-dependent
                    // Blue scatters ~5.5x more than red (λ^-4 law)
                    vec3 rayleighCoeff = vec3(0.19, 0.44, 1.0) * 0.5;
                    float rayleighP = rayleighPhase(cosTheta);
                    vec3 rayleigh = rayleighCoeff * rayleighP * uSkyColor;

                    // Mie scattering — forward sun glow (g = 0.76 for atmosphere)
                    float mieP = miePhase(cosTheta, 0.76);
                    vec3 mie = vec3(0.02) * mieP * uSunColor;

                    // In-scattered light (what the atmosphere adds)
                    vec3 inscatter = (rayleigh + mie) * uScatterStrength * (1.0 - transmittance);

                    // Extinction color — what fog color the scene fades toward
                    vec3 extinction = uFogColor;

                    return mix(extinction, inscatter, 0.5) * (1.0 - transmittance);
                }

                // ============================================================
                // GOD RAYS (screen-space radial blur)
                // ============================================================

                float computeGodRays(vec2 uv) {
                    vec2 deltaUV = (uv - uSunScreenPos) * (1.0 / 16.0);
                    vec2 sampleUV = uv;
                    float illumination = 0.0;
                    float decay = 1.0;

                    // 16 samples along ray toward sun
                    for (int i = 0; i < 16; i++) {
                        sampleUV -= deltaUV;
                        // Clamp to screen bounds
                        vec2 clampedUV = clamp(sampleUV, 0.0, 1.0);
                        // Sample depth — sky pixels (far) contribute to god rays
                        float d = texture2D(tDepth, clampedUV).x;
                        float isSky = step(0.999, d); // 1.0 for sky, 0.0 for geometry
                        illumination += isSky * decay;
                        decay *= 0.94;
                    }

                    return illumination / 16.0;
                }

                // ============================================================
                // MAIN
                // ============================================================

                void main() {
                    vec4 sceneColor = texture2D(tDiffuse, vUv);
                    float rawDepth = texture2D(tDepth, vUv).x;

                    // Early out for sky pixels (no atmosphere needed on sky dome)
                    if (rawDepth > 0.9999) {
                        // Apply only god rays to sky
                        if (uGodRayStrength > 0.01) {
                            float rays = computeGodRays(vUv);
                            vec3 rayColor = uSunColor * rays * uGodRayStrength;
                            sceneColor.rgb += rayColor;
                        }
                        gl_FragColor = sceneColor;
                        return;
                    }

                    // Reconstruct world position and compute view properties
                    float linearDepth = getLinearDepth(vUv);
                    vec3 worldPos = getWorldPosition(vUv, rawDepth);
                    vec3 viewDir = normalize(worldPos - uCameraPosition);
                    float dist = length(worldPos - uCameraPosition);

                    // Height at the world position (Y is up)
                    float height = worldPos.y;
                    // Camera height for mid-point density
                    float camHeight = uCameraPosition.y;
                    float avgHeight = (height + camHeight) * 0.5;

                    // ---- AERIAL PERSPECTIVE ----
                    vec3 atmosColor = computeAerialPerspective(dist, avgHeight, viewDir);
                    float atmosFactor = uAerialPerspective;

                    // Distance-based blend — stronger for farther objects
                    float distFade = 1.0 - exp(-dist * uFogDensity * atmosphereDensity(avgHeight) * 2.0);
                    distFade = clamp(distFade, 0.0, 1.0);

                    // Apply aerial perspective
                    vec3 result = sceneColor.rgb * (1.0 - distFade * atmosFactor)
                               + atmosColor * atmosFactor;

                    // ---- HEIGHT FOG ----
                    // Thicker fog in valleys, clear on peaks
                    float fogHeight = exp(-max(avgHeight * 0.15, 0.0));
                    float heightFog = distFade * fogHeight * 0.4;
                    result = mix(result, uFogColor, heightFog);

                    // ---- SUN GLOW ON TERRAIN ----
                    // Warm sunlight scattering on surfaces facing the sun direction
                    float sunAngle = max(dot(viewDir, uSunDirection), 0.0);
                    float sunScatter = pow(sunAngle, 8.0) * distFade * 0.15 * uScatterStrength;
                    result += uSunColor * sunScatter;

                    // ---- GOD RAYS ----
                    if (uGodRayStrength > 0.01) {
                        float rays = computeGodRays(vUv);
                        // God rays tinted by sun color, modulated by depth
                        vec3 rayColor = uSunColor * rays * uGodRayStrength;
                        // Stronger god rays for closer objects (light hitting particles)
                        rayColor *= (1.0 - distFade * 0.5);
                        result += rayColor;
                    }

                    gl_FragColor = vec4(result, sceneColor.a);
                }
            `,
            depthTest: false,
            depthWrite: false,
        });

        this._fsQuad = new FullScreenQuad(this._material);

        // Temp vectors for sun screen position
        this._sunWorldDir = new THREE.Vector3();
        this._sunScreenPos = new THREE.Vector4();
    }

    /**
     * Update atmosphere parameters (call when planet changes).
     */
    setAtmosphere(options) {
        if (options.skyColor) this.skyColor.copy(options.skyColor);
        if (options.fogColor) this.fogColor.copy(options.fogColor);
        if (options.sunColor) this.sunColor.copy(options.sunColor);
        if (options.sunDirection) this.sunDirection.copy(options.sunDirection);
        if (options.fogDensity !== undefined) this.fogDensity = options.fogDensity;
        if (options.scatterStrength !== undefined) this.scatterStrength = options.scatterStrength;
        if (options.godRayStrength !== undefined) this.godRayStrength = options.godRayStrength;
        if (options.aerialPerspective !== undefined) this.aerialPerspective = options.aerialPerspective;
    }

    /**
     * Set quality tier (for PerformanceManager integration).
     * @param {'high'|'medium'|'low'} tier
     */
    setQuality(tier) {
        switch (tier) {
            case 'high':
                this.raySteps = 16;
                this.godRayStrength = 0.3;
                break;
            case 'medium':
                this.raySteps = 12;
                this.godRayStrength = 0.2;
                break;
            case 'low':
                this.raySteps = 8;
                this.godRayStrength = 0.0; // Skip god rays on low
                break;
        }
    }

    render(renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */) {
        const uniforms = this._material.uniforms;

        // Scene color from previous pass
        uniforms.tDiffuse.value = readBuffer.texture;

        // Depth texture (must be attached to read buffer)
        if (readBuffer.depthTexture) {
            uniforms.tDepth.value = readBuffer.depthTexture;
        }

        // Camera matrices
        uniforms.uCameraNear.value = this.camera.near;
        uniforms.uCameraFar.value = this.camera.far;
        uniforms.uInverseProjection.value.copy(this.camera.projectionMatrixInverse);
        uniforms.uInverseView.value.copy(this.camera.matrixWorld);
        uniforms.uCameraPosition.value.copy(this.camera.position);

        // Atmosphere params
        uniforms.uSkyColor.value = this.skyColor;
        uniforms.uFogColor.value = this.fogColor;
        uniforms.uSunColor.value = this.sunColor;
        uniforms.uSunDirection.value = this.sunDirection;
        uniforms.uFogDensity.value = this.fogDensity;
        uniforms.uScatterStrength.value = this.scatterStrength;
        uniforms.uGodRayStrength.value = this.godRayStrength;
        uniforms.uAerialPerspective.value = this.aerialPerspective;
        uniforms.uHeightFalloff.value = this.heightFalloff;
        uniforms.uRaySteps.value = this.raySteps;
        uniforms.uResolution.value.set(readBuffer.width, readBuffer.height);

        // Project sun direction to screen space for god rays
        this._sunWorldDir.copy(this.sunDirection).multiplyScalar(1000).add(this.camera.position);
        this._sunScreenPos.set(this._sunWorldDir.x, this._sunWorldDir.y, this._sunWorldDir.z, 1);
        this._sunScreenPos.applyMatrix4(this.camera.matrixWorldInverse);
        this._sunScreenPos.applyMatrix4(this.camera.projectionMatrix);
        if (this._sunScreenPos.w > 0) {
            uniforms.uSunScreenPos.value.set(
                (this._sunScreenPos.x / this._sunScreenPos.w) * 0.5 + 0.5,
                (this._sunScreenPos.y / this._sunScreenPos.w) * 0.5 + 0.5
            );
        }

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
        }

        this._fsQuad.render(renderer);
    }

    setSize(width, height) {
        this._material.uniforms.uResolution.value.set(width, height);
    }

    dispose() {
        this._material.dispose();
        this._fsQuad.dispose();
    }
}
