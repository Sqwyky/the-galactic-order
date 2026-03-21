/**
 * THE GALACTIC ORDER - Lens Dirt Bloom Overlay
 *
 * Simulates a dirty camera lens by extracting bright areas from the scene,
 * blurring them, and compositing through a procedurally-generated dirt pattern.
 * The dirt texture is generated entirely in-shader with no external textures:
 *   - Large smudges via low-frequency Worley/cellular noise
 *   - Fine dust specks via high-frequency hash noise
 *   - Fingerprint-like directional streaks
 *   - Circular lens-element artifacts near edges
 *
 * Performance: ~0.15ms on mid-range GPU. Disabled on LOW/POTATO tiers.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export class LensDirtPass extends Pass {
    /**
     * @param {Object} options
     * @param {number} [options.dirtIntensity=0.15] - Strength of the dirt overlay
     * @param {number} [options.brightThreshold=0.7] - Luminance threshold for bloom extraction
     */
    constructor(options = {}) {
        super();
        this.enabled = true;
        this.needsSwap = true;

        this.dirtIntensity = options.dirtIntensity ?? 0.15;
        this.brightThreshold = options.brightThreshold ?? 0.7;
        this._qualityBlurTaps = 5;

        this._material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                uDirtIntensity: { value: this.dirtIntensity },
                uBrightThreshold: { value: this.brightThreshold },
                uResolution: { value: new THREE.Vector2(1, 1) },
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
                uniform float uDirtIntensity;
                uniform float uBrightThreshold;
                uniform vec2 uResolution;

                varying vec2 vUv;

                // ─── Hash functions ──────────────────────────────────────
                float hash21(vec2 p) {
                    p = fract(p * vec2(123.34, 456.21));
                    p += dot(p, p + 45.32);
                    return fract(p.x * p.y);
                }

                vec2 hash22(vec2 p) {
                    vec3 a = fract(p.xyx * vec3(123.34, 234.34, 345.65));
                    a += dot(a, a + 34.45);
                    return fract(vec2(a.x * a.y, a.y * a.z));
                }

                // ─── Worley / cellular noise (low-frequency smudges) ────
                float worley(vec2 uv, float scale) {
                    vec2 p = uv * scale;
                    vec2 i = floor(p);
                    vec2 f = fract(p);

                    float minDist = 1.0;
                    for (int y = -1; y <= 1; y++) {
                        for (int x = -1; x <= 1; x++) {
                            vec2 neighbor = vec2(float(x), float(y));
                            vec2 point = hash22(i + neighbor);
                            vec2 diff = neighbor + point - f;
                            minDist = min(minDist, length(diff));
                        }
                    }
                    return minDist;
                }

                // ─── Directional streak noise (fingerprint-like) ────────
                float streakNoise(vec2 uv) {
                    // Stretch coordinates along a slight angle to mimic finger smears
                    vec2 centered = uv - 0.5;
                    float angle = atan(centered.y, centered.x);
                    float r = length(centered);

                    // Angular striations
                    float streak = sin(angle * 28.0 + r * 15.0) * 0.5 + 0.5;
                    streak *= sin(angle * 13.0 - r * 8.0) * 0.5 + 0.5;

                    // Modulate by radial falloff (more prominent mid-radius)
                    float radialMask = smoothstep(0.05, 0.25, r) * smoothstep(0.55, 0.3, r);
                    return streak * radialMask;
                }

                // ─── Fine dust speck noise ──────────────────────────────
                float dustSpecks(vec2 uv, float density) {
                    vec2 cell = floor(uv * density);
                    float h = hash21(cell);
                    // Only a small fraction of cells contain a speck
                    float speck = step(0.92, h);
                    // Slightly vary intensity per speck
                    return speck * (0.5 + 0.5 * hash21(cell + 7.77));
                }

                // ─── Circular lens element artifacts ────────────────────
                float lensRings(vec2 uv) {
                    vec2 centered = uv - 0.5;
                    float r = length(centered);
                    // Concentric rings from lens elements
                    float rings = sin(r * 80.0) * 0.5 + 0.5;
                    rings = pow(rings, 8.0); // Sharpen into thin lines
                    // Only visible toward edges
                    float edgeMask = smoothstep(0.2, 0.5, r);
                    return rings * edgeMask * 0.3;
                }

                // ─── Composite dirt pattern ─────────────────────────────
                float dirtPattern(vec2 uv) {
                    // Edge vignette: dirt accumulates more at edges
                    vec2 centered = uv - 0.5;
                    float r = length(centered);
                    float edgeDirt = smoothstep(0.15, 0.55, r);

                    // Large smudges (low-frequency cellular)
                    float smudge1 = 1.0 - worley(uv, 4.0);
                    float smudge2 = 1.0 - worley(uv + 3.7, 6.0);
                    float smudges = smudge1 * 0.6 + smudge2 * 0.4;
                    smudges = pow(smudges, 1.5) * edgeDirt;

                    // Fingerprint streaks
                    float streaks = streakNoise(uv) * 0.5;

                    // Fine dust
                    float dust = dustSpecks(uv, 120.0) * 0.4;
                    dust += dustSpecks(uv + 0.31, 200.0) * 0.25;

                    // Lens element rings
                    float rings = lensRings(uv);

                    // Combine layers
                    float dirt = smudges * 0.5 + streaks + dust + rings;

                    // Boost edges where dirt naturally accumulates
                    dirt *= 0.4 + 0.6 * edgeDirt;

                    return clamp(dirt, 0.0, 1.0);
                }

                // ─── 5-tap Gaussian blur (cheap single-pass) ────────────
                vec3 blurBright(vec2 uv, vec2 texelSize) {
                    // Extract bright areas from center sample first to decide weights
                    vec3 center = texture2D(tDiffuse, uv).rgb;
                    float luma = dot(center, vec3(0.299, 0.587, 0.114));
                    vec3 bright = center * smoothstep(uBrightThreshold - 0.1, uBrightThreshold + 0.2, luma);

                    // 5-tap cross filter
                    vec2 off1 = texelSize * 2.0;
                    vec2 off2 = texelSize * 4.0;

                    vec3 sum = bright * 0.30;

                    vec3 s;
                    float l;

                    s = texture2D(tDiffuse, uv + vec2(off1.x, 0.0)).rgb;
                    l = dot(s, vec3(0.299, 0.587, 0.114));
                    sum += s * smoothstep(uBrightThreshold - 0.1, uBrightThreshold + 0.2, l) * 0.15;

                    s = texture2D(tDiffuse, uv - vec2(off1.x, 0.0)).rgb;
                    l = dot(s, vec3(0.299, 0.587, 0.114));
                    sum += s * smoothstep(uBrightThreshold - 0.1, uBrightThreshold + 0.2, l) * 0.15;

                    s = texture2D(tDiffuse, uv + vec2(0.0, off1.y)).rgb;
                    l = dot(s, vec3(0.299, 0.587, 0.114));
                    sum += s * smoothstep(uBrightThreshold - 0.1, uBrightThreshold + 0.2, l) * 0.15;

                    s = texture2D(tDiffuse, uv - vec2(0.0, off1.y)).rgb;
                    l = dot(s, vec3(0.299, 0.587, 0.114));
                    sum += s * smoothstep(uBrightThreshold - 0.1, uBrightThreshold + 0.2, l) * 0.15;

                    // Wider taps at lower weight for extra glow spread
                    s = texture2D(tDiffuse, uv + vec2(off2.x, off2.y)).rgb;
                    l = dot(s, vec3(0.299, 0.587, 0.114));
                    sum += s * smoothstep(uBrightThreshold - 0.1, uBrightThreshold + 0.2, l) * 0.05;

                    s = texture2D(tDiffuse, uv - vec2(off2.x, off2.y)).rgb;
                    l = dot(s, vec3(0.299, 0.587, 0.114));
                    sum += s * smoothstep(uBrightThreshold - 0.1, uBrightThreshold + 0.2, l) * 0.05;

                    return sum;
                }

                void main() {
                    vec4 original = texture2D(tDiffuse, vUv);
                    vec2 texelSize = 1.0 / uResolution;

                    // Blur bright areas
                    vec3 bloom = blurBright(vUv, texelSize);

                    // Generate static dirt pattern
                    // Slight sub-pixel jitter per frame to reduce banding (using fragment position)
                    vec2 dirtUv = vUv + (texelSize * 0.1) * fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 0.01);
                    float dirt = dirtPattern(dirtUv);

                    // Multiply bloom through dirt and add to scene
                    vec3 dirtBloom = bloom * dirt * uDirtIntensity;

                    gl_FragColor = vec4(original.rgb + dirtBloom, original.a);
                }
            `,
            depthTest: false,
            depthWrite: false,
        });

        this._fsQuad = new FullScreenQuad(this._material);
    }

    /**
     * Set the dirt overlay intensity.
     * @param {number} value - Intensity multiplier (0 = no effect, 1 = very strong)
     */
    setIntensity(value) {
        this.dirtIntensity = value;
        this._material.uniforms.uDirtIntensity.value = value;
    }

    /**
     * Adjust quality based on performance tier.
     * @param {'ultra'|'high'|'medium'|'low'|'potato'} tier
     */
    setQuality(tier) {
        switch (tier) {
            case 'ultra':
            case 'high':
                this.enabled = true;
                this._material.uniforms.uDirtIntensity.value = this.dirtIntensity;
                break;
            case 'medium':
                this.enabled = true;
                // Reduce effective intensity on medium to lighten GPU load
                this._material.uniforms.uDirtIntensity.value = this.dirtIntensity * 0.5;
                break;
            case 'low':
            case 'potato':
                this.enabled = false;
                break;
        }
    }

    render(renderer, writeBuffer, readBuffer) {
        const width = readBuffer.width;
        const height = readBuffer.height;

        this._material.uniforms.tDiffuse.value = readBuffer.texture;
        this._material.uniforms.uResolution.value.set(width, height);

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
