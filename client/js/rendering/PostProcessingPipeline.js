/**
 * THE GALACTIC ORDER - Post-Processing Pipeline
 *
 * Encapsulates the entire post-processing chain into a single class.
 * Merges simple effects (color grading + film grain) into one pass
 * to reduce full-screen draw calls.
 *
 * Pass order:
 *   Render → TAA → GTAO → ContactShadows → SSGI → Atmosphere →
 *   VolumetricClouds → SSR → Bloom → LensFlare → LensDirt →
 *   AutoExposure → DOF → CombinedGrade → MotionBlur → FXAA → Output
 *
 * CombinedGrade = color grading + film grain + vignette + chromatic aberration
 * (was 2 separate passes, now 1)
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

import { RayMarchedAtmospherePass } from './RayMarchedAtmosphere.js';
import { SSRPass } from './SSRPass.js';
import { AutoExposurePass } from './AutoExposurePass.js';
import { VolumetricCloudPass } from './VolumetricClouds.js';
import { TAAPass } from './TAAPass.js';
import { MotionBlurPass } from './MotionBlurPass.js';
import { DOFPass } from './DOFPass.js';
import { ContactShadowPass } from './ContactShadowPass.js';
import { SSGIPass } from './SSGIPass.js';
import { LensFlarePass } from './LensFlarePass.js';
import { LensDirtPass } from './LensDirtPass.js';
import { FXAAPass } from './FXAAPass.js';

// ============================================================
// COMBINED COLOR GRADE + FILM GRAIN SHADER
// Merges two full-screen passes into one
// ============================================================

const combinedGradeShader = {
    uniforms: {
        tDiffuse: { value: null },
        // Color grading
        uSaturation: { value: 1.3 },
        uContrast: { value: 1.12 },
        uBrightness: { value: 0.01 },
        uVignetteStrength: { value: 0.45 },
        uChromaticAberration: { value: 0.003 },
        // Film grain
        uTime: { value: 0.0 },
        uGrainIntensity: { value: 0.025 },
        uGrainEnabled: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        // Color grading
        uniform float uSaturation;
        uniform float uContrast;
        uniform float uBrightness;
        uniform float uVignetteStrength;
        uniform float uChromaticAberration;
        // Film grain
        uniform float uTime;
        uniform float uGrainIntensity;
        uniform float uGrainEnabled;

        varying vec2 vUv;

        // Filmic S-curve tone map
        vec3 sCurve(vec3 x) {
            return x * x * (3.0 - 2.0 * x);
        }

        // Hash functions for grain
        float hash(vec2 p) {
            float h = dot(p, vec2(127.1, 311.7));
            return fract(sin(h) * 43758.5453123);
        }
        float hash2(vec2 p) {
            float h = dot(p, vec2(269.5, 183.3));
            return fract(sin(h) * 28786.3157832);
        }

        void main() {
            // ---- Chromatic aberration ----
            vec2 center = vUv - 0.5;
            float edgeDist = length(center);
            vec2 dir = center * uChromaticAberration * (1.0 + edgeDist * 2.0);
            float r = texture2D(tDiffuse, vUv + dir).r;
            float g = texture2D(tDiffuse, vUv).g;
            float b = texture2D(tDiffuse, vUv - dir).b;
            vec3 color = vec3(r, g, b);

            // ---- Saturation ----
            float luma = dot(color, vec3(0.299, 0.587, 0.114));
            color = mix(vec3(luma), color, uSaturation);

            // ---- S-curve contrast ----
            color = clamp(color, 0.0, 1.0);
            color = mix(color, sCurve(color), uContrast - 1.0 + 0.4);
            color += uBrightness;

            // ---- Split toning ----
            vec3 warmTint  = vec3(1.02, 0.98, 0.92);
            vec3 coolTint  = vec3(0.92, 0.95, 1.05);
            float lumaSplit = dot(color, vec3(0.299, 0.587, 0.114));
            vec3 tint = mix(coolTint, warmTint, smoothstep(0.25, 0.75, lumaSplit));
            color *= tint;

            // ---- Vignette ----
            float vigDist = length(center * vec2(1.1, 1.0));
            float vig = smoothstep(0.3, 1.1, vigDist) * uVignetteStrength;
            vig += smoothstep(0.6, 1.3, vigDist) * uVignetteStrength * 0.3;
            color *= 1.0 - vig;

            // ---- Film grain (merged) ----
            if (uGrainEnabled > 0.5) {
                float fineGrain  = hash(vUv * 1200.0 + uTime * 137.0) * 2.0 - 1.0;
                float coarseGrain = hash2(vUv * 300.0 + uTime * 89.0) * 2.0 - 1.0;
                float grain = fineGrain * 0.7 + coarseGrain * 0.3;

                float grainLuma = dot(color, vec3(0.299, 0.587, 0.114));
                float grainStrength = uGrainIntensity * (1.2 - grainLuma * 0.6);

                float rGrain = grain + hash(vUv * 800.0 + uTime * 51.0) * 0.15;
                float bGrain = grain + hash2(vUv * 900.0 + uTime * 73.0) * 0.15;

                color.r += rGrain * grainStrength;
                color.g += grain * grainStrength;
                color.b += bGrain * grainStrength;
            }

            gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
        }
    `
};

// ============================================================
// PIPELINE CLASS
// ============================================================

export class PostProcessingPipeline {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     * @param {Object} config - Planet mood/atmosphere settings
     */
    constructor(renderer, scene, camera, config = {}) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;

        // Create composer with depth textures
        this.composer = new EffectComposer(renderer);
        try {
            const depthTex1 = new THREE.DepthTexture();
            depthTex1.format = THREE.DepthFormat;
            depthTex1.type = THREE.UnsignedIntType;
            this.composer.renderTarget1.depthTexture = depthTex1;
            const depthTex2 = new THREE.DepthTexture();
            depthTex2.format = THREE.DepthFormat;
            depthTex2.type = THREE.UnsignedIntType;
            this.composer.renderTarget2.depthTexture = depthTex2;
        } catch (e) {
            console.warn('[Pipeline] Depth texture setup failed:', e.message);
        }

        // Pass references (for PerformanceManager)
        this.passes = {};

        this._buildPipeline(config);
    }

    _buildPipeline(config) {
        const { scene, camera, composer } = this;
        const {
            skyTopColor, fogColor, sunColor, sunDirection,
            moodFogDensity, bloomStrength, scatterStrength,
            planetMood,
        } = config;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const sunDir = sunDirection || new THREE.Vector3(0.5, 0.3, 0.4).normalize();

        // ---- Render Pass ----
        composer.addPass(new RenderPass(scene, camera));

        // ---- TAA ----
        this.passes.taaPass = this._tryAdd(() => {
            const p = new TAAPass(camera);
            composer.addPass(p);
            return p;
        }, 'TAA');

        // ---- GTAO ----
        this.passes.ssaoPass = this._tryAdd(() => {
            const p = new GTAOPass(scene, camera, width, height);
            p.output = GTAOPass.OUTPUT.Default;
            p.blendIntensity = 1.0;
            p.updateGtaoMaterial({ radius: 0.5, distanceExponent: 2, thickness: 10, scale: 1, samples: 16 });
            composer.addPass(p);
            return p;
        }, 'GTAO');

        // ---- Contact Shadows ----
        this.passes.contactShadowPass = this._tryAdd(() => {
            const p = new ContactShadowPass(camera, {
                sunDirection: sunDir,
                maxSteps: 12, maxDistance: 2.0, thickness: 0.1, shadowStrength: 0.4,
            });
            composer.addPass(p);
            return p;
        }, 'Contact shadows');

        // ---- SSGI ----
        this.passes.ssgiPass = this._tryAdd(() => {
            const p = new SSGIPass(camera, {
                maxSteps: 12, maxDistance: 10.0, thickness: 0.5, intensity: 0.4, rayCount: 4,
            });
            composer.addPass(p);
            return p;
        }, 'SSGI');

        // ---- Ray-Marched Atmosphere ----
        this.passes.atmospherePass = this._tryAdd(() => {
            const p = new RayMarchedAtmospherePass(camera, {
                skyColor: skyTopColor,
                fogColor: fogColor,
                sunColor: sunColor,
                sunDirection: sunDir,
                fogDensity: moodFogDensity,
                scatterStrength: scatterStrength || 0.8,
                godRayStrength: 0.25,
                aerialPerspective: 0.8,
                heightFalloff: 0.08,
            });
            composer.addPass(p);
            return p;
        }, 'Ray-marched atmosphere');

        // ---- Volumetric Clouds ----
        this.passes.volumetricClouds = this._tryAdd(() => {
            const p = new VolumetricCloudPass(camera, {
                skyColor: skyTopColor,
                sunColor: sunColor,
                sunDirection: sunDir,
                cloudBase: 80, cloudTop: 200,
                coverage: (moodFogDensity || 0) > 0.003 ? 0.55 : 0.35,
                density: 0.04,
                windSpeed: (planetMood?.atmosphere?.windStrength || 0.2) * 40 || 8.0,
            });
            composer.addPass(p);
            return p;
        }, 'Volumetric clouds');

        // ---- SSR ----
        this.passes.ssrPass = this._tryAdd(() => {
            const p = new SSRPass(camera, {
                maxSteps: 32, maxDistance: 50, thickness: 0.5,
                reflectionStrength: 0.6, waterLevel: 0.0,
                skyColor: skyTopColor,
            });
            p.setSunDirection(sunDir);
            p.setSunColor(sunColor);
            composer.addPass(p);
            return p;
        }, 'SSR');

        // ---- Bloom ----
        this.passes.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(width, height),
            bloomStrength || 0.3,
            0.85, 0.75
        );
        composer.addPass(this.passes.bloomPass);

        // ---- Lens Flare ----
        this.passes.lensFlarePass = this._tryAdd(() => {
            const p = new LensFlarePass();
            composer.addPass(p);
            return p;
        }, 'Lens flare');

        // ---- Lens Dirt ----
        this.passes.lensDirtPass = this._tryAdd(() => {
            const p = new LensDirtPass();
            composer.addPass(p);
            return p;
        }, 'Lens dirt');

        // ---- Auto Exposure ----
        this.passes.autoExposure = this._tryAdd(() => {
            const p = new AutoExposurePass({
                adaptationSpeed: 2.0, minExposure: 0.6, maxExposure: 2.0, keyValue: 0.18,
            });
            composer.addPass(p);
            return p;
        }, 'Auto-exposure');

        // ---- DOF ----
        this.passes.dofPass = this._tryAdd(() => {
            const p = new DOFPass(camera, {
                focalDistance: 30.0, focalLength: 50.0, aperture: 2.8,
                maxBlur: 8.0, samples: 16, autoFocus: true,
            });
            composer.addPass(p);
            return p;
        }, 'DOF');

        // ---- Combined Color Grade + Film Grain (merged — saves 1 full-screen pass) ----
        this.passes.combinedGradePass = new ShaderPass(combinedGradeShader);
        composer.addPass(this.passes.combinedGradePass);

        // ---- Motion Blur ----
        this.passes.motionBlurPass = this._tryAdd(() => {
            const p = new MotionBlurPass(camera, {
                velocityScale: 1.0, maxBlurRadius: 20.0, samples: 8,
            });
            composer.addPass(p);
            return p;
        }, 'Motion blur');

        // ---- FXAA (disabled by default, enabled on LOW/POTATO) ----
        this.passes.fxaaPass = this._tryAdd(() => {
            const p = new FXAAPass();
            p.enabled = false;
            composer.addPass(p);
            return p;
        }, 'FXAA');

        // ---- Output ----
        composer.addPass(new OutputPass());
    }

    /**
     * Try to add a pass, return null on failure.
     */
    _tryAdd(fn, name) {
        try {
            return fn();
        } catch (e) {
            console.warn(`[Pipeline] ${name} disabled:`, e.message);
            return null;
        }
    }

    /**
     * Update time-varying uniforms and render the pipeline.
     */
    render(time) {
        // Update film grain time
        if (this.passes.combinedGradePass) {
            this.passes.combinedGradePass.uniforms.uTime.value = time;
        }
        this.composer.render();
    }

    /**
     * Resize all passes.
     */
    setSize(width, height) {
        this.composer.setSize(width, height);
    }

    /**
     * Get pass references for PerformanceManager registration.
     * Returns an object matching the keys PerformanceManager.registerPasses() expects.
     */
    getPassRefs() {
        return {
            composer: this.composer,
            ssaoPass: this.passes.ssaoPass,
            bloomPass: this.passes.bloomPass,
            // Combined grade replaces separate colorGrade + filmGrain passes
            filmGrainPass: {
                get enabled() { return true; },
                set enabled(v) {
                    // Grain is toggled via uniform, not pass.enabled
                },
                get uniforms() { return this.passes?.combinedGradePass?.uniforms; },
            },
            colorGradePass: this.passes.combinedGradePass,
            taaPass: this.passes.taaPass,
            ssrPass: this.passes.ssrPass,
            autoExposure: this.passes.autoExposure,
            volumetricClouds: this.passes.volumetricClouds,
            atmospherePass: this.passes.atmospherePass,
            motionBlurPass: this.passes.motionBlurPass,
            dofPass: this.passes.dofPass,
            contactShadowPass: this.passes.contactShadowPass,
            ssgiPass: this.passes.ssgiPass,
            lensFlarePass: this.passes.lensFlarePass,
            lensDirtPass: this.passes.lensDirtPass,
            fxaaPass: this.passes.fxaaPass,
        };
    }

    dispose() {
        // Dispose all passes that have a dispose method
        for (const pass of Object.values(this.passes)) {
            if (pass && typeof pass.dispose === 'function') {
                pass.dispose();
            }
        }
    }
}
