/**
 * THE GALACTIC ORDER - FXAA Anti-Aliasing Pass
 *
 * Fast Approximate Anti-Aliasing fallback for LOW/POTATO quality tiers
 * where TAA is disabled. Provides basic edge smoothing at minimal cost.
 *
 * Based on FXAA 3.11 by Timothy Lottes (NVIDIA).
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ============================================================
// FXAA 3.11 SHADER
// ============================================================

const FXAAShader = {
    uniforms: {
        tDiffuse:     { value: null },
        uResolution:  { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
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
        uniform vec2 uResolution; // 1.0 / screenSize

        varying vec2 vUv;

        // --------------------------------------------------------
        // FXAA quality presets (standard QUALITY_PRESET 12)
        //
        // Each step defines how far along the edge to search.
        // More steps = better long-edge detection at higher cost.
        // --------------------------------------------------------

        #define FXAA_EDGE_THRESHOLD      (1.0 / 8.0)
        #define FXAA_EDGE_THRESHOLD_MIN  (1.0 / 24.0)
        #define FXAA_SUBPIX_TRIM         (1.0 / 4.0)
        #define FXAA_SUBPIX_CAP          (3.0 / 4.0)
        #define FXAA_SEARCH_STEPS        12
        #define FXAA_SEARCH_THRESHOLD    (1.0 / 4.0)

        // --------------------------------------------------------
        // Luma helper — perceptual luminance
        // --------------------------------------------------------

        float fxaaLuma(vec3 rgb) {
            return dot(rgb, vec3(0.299, 0.587, 0.114));
        }

        // --------------------------------------------------------
        // FXAA 3.11 implementation
        // --------------------------------------------------------

        vec4 fxaa(sampler2D tex, vec2 fragCoord, vec2 rcpFrame) {

            // --------------------------------------------------
            // 1. Sample center and 4 direct neighbors
            // --------------------------------------------------
            vec3 rgbM  = texture2D(tex, fragCoord).rgb;
            vec3 rgbN  = texture2D(tex, fragCoord + vec2( 0.0, -rcpFrame.y)).rgb;
            vec3 rgbS  = texture2D(tex, fragCoord + vec2( 0.0,  rcpFrame.y)).rgb;
            vec3 rgbW  = texture2D(tex, fragCoord + vec2(-rcpFrame.x,  0.0)).rgb;
            vec3 rgbE  = texture2D(tex, fragCoord + vec2( rcpFrame.x,  0.0)).rgb;

            float lumaM = fxaaLuma(rgbM);
            float lumaN = fxaaLuma(rgbN);
            float lumaS = fxaaLuma(rgbS);
            float lumaW = fxaaLuma(rgbW);
            float lumaE = fxaaLuma(rgbE);

            // --------------------------------------------------
            // 2. Edge detection — local contrast check
            // --------------------------------------------------
            float lumaMin = min(lumaM, min(min(lumaN, lumaS), min(lumaW, lumaE)));
            float lumaMax = max(lumaM, max(max(lumaN, lumaS), max(lumaW, lumaE)));
            float lumaRange = lumaMax - lumaMin;

            // Early exit — no edge detected
            if (lumaRange < max(FXAA_EDGE_THRESHOLD_MIN, lumaMax * FXAA_EDGE_THRESHOLD)) {
                return vec4(rgbM, 1.0);
            }

            // --------------------------------------------------
            // 3. Sample corner neighbors for sub-pixel aliasing
            // --------------------------------------------------
            vec3 rgbNW = texture2D(tex, fragCoord + vec2(-rcpFrame.x, -rcpFrame.y)).rgb;
            vec3 rgbNE = texture2D(tex, fragCoord + vec2( rcpFrame.x, -rcpFrame.y)).rgb;
            vec3 rgbSW = texture2D(tex, fragCoord + vec2(-rcpFrame.x,  rcpFrame.y)).rgb;
            vec3 rgbSE = texture2D(tex, fragCoord + vec2( rcpFrame.x,  rcpFrame.y)).rgb;

            float lumaNW = fxaaLuma(rgbNW);
            float lumaNE = fxaaLuma(rgbNE);
            float lumaSW = fxaaLuma(rgbSW);
            float lumaSE = fxaaLuma(rgbSE);

            // --------------------------------------------------
            // 4. Sub-pixel aliasing detection
            // --------------------------------------------------
            float lumaL = (lumaN + lumaS + lumaW + lumaE) * 0.25;
            float rangeL = abs(lumaL - lumaM);
            float blendL = max(0.0, (rangeL / lumaRange) - FXAA_SUBPIX_TRIM);
            blendL = min(FXAA_SUBPIX_CAP, blendL);

            // --------------------------------------------------
            // 5. Determine edge direction (horizontal vs vertical)
            //
            // Sobel-like gradient estimation across the 3x3 block.
            // --------------------------------------------------
            float edgeH =
                abs(lumaNW + lumaN + lumaNE - lumaSW - lumaS - lumaSE) * 2.0 +
                abs(lumaW - lumaE);
            float edgeV =
                abs(lumaNW + lumaW + lumaSW - lumaNE - lumaE - lumaSE) * 2.0 +
                abs(lumaN - lumaS);

            bool isHorizontal = (edgeH >= edgeV);

            // --------------------------------------------------
            // 6. Select edge normal direction and luma pair
            // --------------------------------------------------
            float luma1 = isHorizontal ? lumaN : lumaW;
            float luma2 = isHorizontal ? lumaS : lumaE;

            float gradient1 = abs(luma1 - lumaM);
            float gradient2 = abs(luma2 - lumaM);

            bool is1Steeper = gradient1 >= gradient2;

            float gradientScaled = 0.25 * max(gradient1, gradient2);

            // Step size along the edge normal (perpendicular to edge)
            float stepLength = isHorizontal ? rcpFrame.y : rcpFrame.x;

            float lumaLocalAvg;
            if (is1Steeper) {
                stepLength = -stepLength;
                lumaLocalAvg = 0.5 * (luma1 + lumaM);
            } else {
                lumaLocalAvg = 0.5 * (luma2 + lumaM);
            }

            // UV shifted half a pixel along the edge normal
            vec2 currentUv = fragCoord;
            if (isHorizontal) {
                currentUv.y += stepLength * 0.5;
            } else {
                currentUv.x += stepLength * 0.5;
            }

            // --------------------------------------------------
            // 7. Search along the edge in both directions
            //
            // Walk along the edge and stop when the luma change
            // relative to the local average exceeds a threshold.
            // --------------------------------------------------
            vec2 offset = isHorizontal
                ? vec2(rcpFrame.x, 0.0)
                : vec2(0.0, rcpFrame.y);

            vec2 uv1 = currentUv - offset;
            vec2 uv2 = currentUv + offset;

            float lumaEnd1 = fxaaLuma(texture2D(tex, uv1).rgb) - lumaLocalAvg;
            float lumaEnd2 = fxaaLuma(texture2D(tex, uv2).rgb) - lumaLocalAvg;

            bool reached1 = abs(lumaEnd1) >= gradientScaled;
            bool reached2 = abs(lumaEnd2) >= gradientScaled;
            bool reachedBoth = reached1 && reached2;

            if (!reached1) uv1 -= offset;
            if (!reached2) uv2 += offset;

            // Unrolled search loop (quality preset 12)
            if (!reachedBoth) {
                for (int i = 2; i < FXAA_SEARCH_STEPS; i++) {
                    if (!reached1) {
                        lumaEnd1 = fxaaLuma(texture2D(tex, uv1).rgb) - lumaLocalAvg;
                    }
                    if (!reached2) {
                        lumaEnd2 = fxaaLuma(texture2D(tex, uv2).rgb) - lumaLocalAvg;
                    }

                    reached1 = abs(lumaEnd1) >= gradientScaled;
                    reached2 = abs(lumaEnd2) >= gradientScaled;
                    reachedBoth = reached1 && reached2;

                    if (!reached1) uv1 -= offset;
                    if (!reached2) uv2 += offset;

                    if (reachedBoth) break;
                }
            }

            // --------------------------------------------------
            // 8. Compute edge blend factor from search results
            // --------------------------------------------------
            float distance1 = isHorizontal ? (fragCoord.x - uv1.x) : (fragCoord.y - uv1.y);
            float distance2 = isHorizontal ? (uv2.x - fragCoord.x) : (uv2.y - fragCoord.y);

            bool isDirection1 = distance1 < distance2;
            float distanceFinal = min(distance1, distance2);

            float edgeLength = distance1 + distance2;

            // Pixel offset along the edge normal
            float pixelOffset = -distanceFinal / edgeLength + 0.5;

            // Check if the center pixel is on the correct side of the edge
            bool isLumaMSmaller = lumaM < lumaLocalAvg;
            bool correctVariation = ((isDirection1 ? lumaEnd1 : lumaEnd2) < 0.0) != isLumaMSmaller;

            float finalOffset = correctVariation ? pixelOffset : 0.0;

            // --------------------------------------------------
            // 9. Sub-pixel anti-aliasing
            //
            // Blend with the 3x3 neighborhood average for
            // sub-pixel features (thin lines, single-pixel details).
            // --------------------------------------------------
            float lumaAvg3x3 = (1.0 / 12.0) * (
                2.0 * (lumaN + lumaS + lumaW + lumaE) +
                (lumaNW + lumaNE + lumaSW + lumaSE)
            );
            float subPixOffset = clamp(
                abs(lumaAvg3x3 - lumaM) / lumaRange,
                0.0, 1.0
            );
            float subPixBlend = (-2.0 * subPixOffset + 3.0) * subPixOffset * subPixOffset;
            subPixBlend = subPixBlend * subPixBlend * FXAA_SUBPIX_CAP;

            // Take the larger of edge-blend and sub-pixel blend
            finalOffset = max(finalOffset, subPixBlend);

            // --------------------------------------------------
            // 10. Final sample — offset along edge normal
            // --------------------------------------------------
            vec2 finalUv = fragCoord;
            if (isHorizontal) {
                finalUv.y += finalOffset * stepLength;
            } else {
                finalUv.x += finalOffset * stepLength;
            }

            return vec4(texture2D(tex, finalUv).rgb, 1.0);
        }

        // --------------------------------------------------------
        // Main
        // --------------------------------------------------------

        void main() {
            gl_FragColor = fxaa(tDiffuse, vUv, uResolution);
        }
    `,
};

// ============================================================
// FXAA PASS
// ============================================================

export class FXAAPass extends Pass {
    constructor() {
        super();
        this.enabled = true;
        this.needsSwap = true;

        this._material = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
            vertexShader: FXAAShader.vertexShader,
            fragmentShader: FXAAShader.fragmentShader,
            depthTest: false,
            depthWrite: false,
        });

        this._fsQuad = new FullScreenQuad(this._material);
    }

    /**
     * Update the resolution uniform. Call this whenever the render
     * target size changes (window resize, resolution scale change).
     *
     * @param {number} width  - Render target width in pixels
     * @param {number} height - Render target height in pixels
     */
    setSize(width, height) {
        this._material.uniforms.uResolution.value.set(
            1.0 / width,
            1.0 / height
        );
    }

    render(renderer, writeBuffer, readBuffer /*, deltaTime, maskActive */) {
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
