/**
 * THE GALACTIC ORDER - Screen-Space Lens Flare Pass
 *
 * Procedural screen-space lens flare post-processing effect that simulates
 * optical artifacts from bright light sources (stars, suns, explosions):
 *   - Ghost images: reflected bright spots at multiple scales with chromatic shift
 *   - Halo ring: bright ring at screen edges when facing a light source
 *   - Starburst: procedural 6-pointed star pattern from bright sources
 *
 * All effects are procedural — no external textures required.
 * Designed for mobile GPU efficiency with early-out and quality tiers.
 *
 * Performance: ~0.1-0.3ms depending on quality tier.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** Quality tiers controlling which sub-effects are active */
const QUALITY_TIERS = {
    ultra: { ghosts: 4, halo: true, starburst: true },
    high: { ghosts: 4, halo: true, starburst: false },
    medium: { ghosts: 2, halo: false, starburst: false },
    low: { ghosts: 0, halo: false, starburst: false },
    potato: { ghosts: 0, halo: false, starburst: false },
};

export class LensFlarePass extends Pass {
    /**
     * @param {Object} [options]
     * @param {number} [options.brightThreshold=0.8] - Luminance threshold for bright pixel extraction
     * @param {number} [options.ghostIntensity=0.4] - Ghost image brightness
     * @param {number} [options.haloIntensity=0.3] - Halo ring brightness
     * @param {number} [options.starburstIntensity=0.15] - Starburst brightness
     * @param {string} [options.quality='ultra'] - Quality tier: ultra|high|medium|low|potato
     */
    constructor(options = {}) {
        super();
        this.enabled = true;
        this.needsSwap = true;

        this._quality = options.quality || 'ultra';
        this._tier = QUALITY_TIERS[this._quality] || QUALITY_TIERS.ultra;
        this._overallIntensity = 1.0;

        // Sun screen position — updated externally via setSunScreenPosition()
        this._sunScreenPos = new THREE.Vector2(0.5, 0.5);

        this._material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                uBrightThreshold: { value: options.brightThreshold ?? 0.8 },
                uGhostIntensity: { value: options.ghostIntensity ?? 0.4 },
                uHaloIntensity: { value: options.haloIntensity ?? 0.3 },
                uStarburstIntensity: { value: options.starburstIntensity ?? 0.15 },
                uSunScreenPos: { value: this._sunScreenPos },
                uOverallIntensity: { value: this._overallIntensity },
                uGhostCount: { value: this._tier.ghosts },
                uEnableHalo: { value: this._tier.halo ? 1.0 : 0.0 },
                uEnableStarburst: { value: this._tier.starburst ? 1.0 : 0.0 },
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
                uniform float uBrightThreshold;
                uniform float uGhostIntensity;
                uniform float uHaloIntensity;
                uniform float uStarburstIntensity;
                uniform vec2 uSunScreenPos;
                uniform float uOverallIntensity;
                uniform float uGhostCount; // 0, 2, or 4
                uniform float uEnableHalo;
                uniform float uEnableStarburst;

                varying vec2 vUv;

                // ---- Utility: luminance ----
                float luminance(vec3 c) {
                    return dot(c, vec3(0.299, 0.587, 0.114));
                }

                // ---- Utility: extract bright pixels ----
                vec3 extractBright(vec2 uv) {
                    vec3 c = texture2D(tDiffuse, uv).rgb;
                    float lum = luminance(c);
                    float contrib = max(lum - uBrightThreshold, 0.0) / max(1.0 - uBrightThreshold, 0.001);
                    return c * clamp(contrib, 0.0, 1.0);
                }

                // ---- Procedural noise for starburst ----
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

                // ---- 6-pointed starburst pattern ----
                float starburst(vec2 uv, vec2 sunPos) {
                    vec2 delta = uv - sunPos;
                    float dist = length(delta);
                    float angle = atan(delta.y, delta.x);

                    // 6-pointed star: cos(6 * angle) gives 6 lobes
                    float star = pow(abs(cos(angle * 3.0)), 12.0);

                    // Add noise rotation for more natural look
                    float n = noise(vec2(angle * 2.0, 0.0)) * 0.3 + 0.7;
                    star *= n;

                    // Fall off with distance from sun
                    float falloff = 1.0 / (1.0 + dist * 8.0);
                    return star * falloff;
                }

                // ---- Ghost images with chromatic aberration ----
                vec3 ghostSample(vec2 uv, float scale, float chromaticShift) {
                    // Reflect UV through center and scale
                    vec2 ghostUv = vec2(0.5) + (vec2(0.5) - uv) * scale;

                    // Discard if out of bounds
                    if (any(lessThan(ghostUv, vec2(0.0))) || any(greaterThan(ghostUv, vec2(1.0)))) {
                        return vec3(0.0);
                    }

                    // Chromatic aberration: offset R and B channels slightly
                    vec2 dir = normalize(ghostUv - vec2(0.5)) * chromaticShift;
                    float r = extractBright(ghostUv + dir).r;
                    float g = extractBright(ghostUv).g;
                    float b = extractBright(ghostUv - dir).b;

                    return vec3(r, g, b);
                }

                void main() {
                    vec4 sceneColor = texture2D(tDiffuse, vUv);

                    // Early-out: if sun is well off-screen or effect disabled, skip entirely
                    float sunDist = distance(uSunScreenPos, vec2(0.5));
                    bool sunOffScreen = uSunScreenPos.x < -0.1 || uSunScreenPos.x > 1.1
                                     || uSunScreenPos.y < -0.1 || uSunScreenPos.y > 1.1;

                    if (sunOffScreen || uOverallIntensity < 0.001 || uGhostCount < 0.5) {
                        gl_FragColor = sceneColor;
                        return;
                    }

                    vec3 flare = vec3(0.0);

                    // Fade out as sun approaches screen edge
                    float edgeFade = 1.0 - smoothstep(0.3, 0.7, sunDist);

                    // ---- Ghost images ----
                    // Scales: 0.25, 0.5, -0.5, -1.0 (negative = same side as sun)
                    if (uGhostCount > 0.5) {
                        flare += ghostSample(vUv, 0.25, 0.004) * 0.8;
                        flare += ghostSample(vUv, 0.5, 0.006) * 1.0;
                    }
                    if (uGhostCount > 2.5) {
                        flare += ghostSample(vUv, -0.5, 0.008) * 0.6;
                        flare += ghostSample(vUv, -1.0, 0.010) * 0.4;
                    }
                    flare *= uGhostIntensity;

                    // ---- Halo ring ----
                    if (uEnableHalo > 0.5) {
                        // Ring at ~0.6 from center, opposite to sun direction
                        vec2 haloUv = vec2(0.5) + (vec2(0.5) - vUv);
                        float haloDist = distance(haloUv, vec2(0.5));
                        float ring = 1.0 - abs(haloDist - 0.6) * 6.0;
                        ring = clamp(ring, 0.0, 1.0);
                        ring *= ring; // sharpen

                        // Weight by proximity to sun-center axis
                        vec2 sunDir = normalize(uSunScreenPos - vec2(0.5));
                        vec2 pixDir = haloUv - vec2(0.5);
                        float pixLen = length(pixDir);
                        float axisWeight = pixLen > 0.001
                            ? max(dot(pixDir / pixLen, sunDir), 0.0)
                            : 0.0;
                        axisWeight = pow(axisWeight, 2.0);

                        vec3 bright = extractBright(haloUv);
                        flare += bright * ring * axisWeight * uHaloIntensity;
                    }

                    // ---- Starburst ----
                    if (uEnableStarburst > 0.5) {
                        float sb = starburst(vUv, uSunScreenPos);
                        vec3 sunBright = extractBright(uSunScreenPos);
                        float sunLum = luminance(sunBright);
                        flare += sunBright * sb * uStarburstIntensity * sunLum;
                    }

                    // Composite additively
                    flare *= edgeFade * uOverallIntensity;
                    gl_FragColor = vec4(sceneColor.rgb + flare, sceneColor.a);
                }
            `,
            depthTest: false,
            depthWrite: false,
        });

        this._fsQuad = new FullScreenQuad(this._material);
    }

    // ---- Public API ----

    /**
     * Update the sun's screen-space position (0-1 range, bottom-left origin).
     * Typically called each frame after projecting the sun world position.
     * @param {number} x - Horizontal position [0..1]
     * @param {number} y - Vertical position [0..1]
     */
    setSunScreenPosition(x, y) {
        this._sunScreenPos.set(x, y);
    }

    /**
     * Set overall lens flare intensity multiplier.
     * @param {number} value - 0 = invisible, 1 = normal, >1 = exaggerated
     */
    setIntensity(value) {
        this._overallIntensity = value;
        this._material.uniforms.uOverallIntensity.value = value;
    }

    /**
     * Switch quality tier at runtime (e.g. from PerformanceManager).
     * @param {'ultra'|'high'|'medium'|'low'|'potato'} tier
     */
    setQuality(tier) {
        this._quality = tier;
        this._tier = QUALITY_TIERS[tier] || QUALITY_TIERS.ultra;

        const u = this._material.uniforms;
        u.uGhostCount.value = this._tier.ghosts;
        u.uEnableHalo.value = this._tier.halo ? 1.0 : 0.0;
        u.uEnableStarburst.value = this._tier.starburst ? 1.0 : 0.0;
    }

    // ---- Pass interface ----

    render(renderer, writeBuffer, readBuffer /*, deltaTime */) {
        this._material.uniforms.tDiffuse.value = readBuffer.texture;

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
        }
        this._fsQuad.render(renderer);
    }

    dispose() {
        this._material.dispose();
        this._fsQuad.dispose();
    }
}
