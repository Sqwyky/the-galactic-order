/**
 * THE GALACTIC ORDER - Auto-Exposure / Eye Adaptation Pass
 *
 * Simulates human eye adaptation to brightness changes:
 * - Walking out of a dark cave into sunlight → brief bloom then settling
 * - Looking at the sun → slight dimming of the rest of the scene
 * - Entering a dark valley → gradual brightening
 *
 * Technique:
 * 1. Measure average luminance of the current frame (downsampled)
 * 2. Smoothly interpolate toward the target exposure over ~1 second
 * 3. Apply exposure adjustment to the final image
 *
 * This creates the cinematic "eye adaptation" seen in AAA games.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export class AutoExposurePass extends Pass {
    /**
     * @param {Object} options
     * @param {number} [options.adaptationSpeed=2.0] - How fast exposure adapts (higher = faster)
     * @param {number} [options.minExposure=0.5] - Minimum exposure multiplier
     * @param {number} [options.maxExposure=2.5] - Maximum exposure multiplier
     * @param {number} [options.targetLuminance=0.25] - Target average luminance
     * @param {number} [options.keyValue=0.18] - Middle grey key value
     */
    constructor(options = {}) {
        super();
        this.enabled = true;
        this.needsSwap = true;

        this.adaptationSpeed = options.adaptationSpeed || 2.0;
        this.minExposure = options.minExposure || 0.5;
        this.maxExposure = options.maxExposure || 2.5;
        this.targetLuminance = options.targetLuminance || 0.25;
        this.keyValue = options.keyValue || 0.18;

        // Current adapted exposure (starts at 1.0)
        this._currentExposure = 1.0;
        this._currentLuminance = 0.25;
        this._lastTime = 0;
        this._frameCount = 0;
        this._readbackInterval = 4; // Only read GPU data every N frames

        // Luminance measurement material (downsamples and computes average)
        this._luminanceMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
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
                varying vec2 vUv;

                void main() {
                    // Sample a grid of points to estimate average luminance
                    float totalLuma = 0.0;
                    float count = 0.0;

                    for (float x = 0.1; x < 1.0; x += 0.2) {
                        for (float y = 0.1; y < 1.0; y += 0.2) {
                            vec3 color = texture2D(tDiffuse, vec2(x, y)).rgb;
                            float luma = dot(color, vec3(0.299, 0.587, 0.114));
                            // Use log-average for better exposure (Reinhard 2002)
                            totalLuma += log(max(luma, 0.001));
                            count += 1.0;
                        }
                    }

                    float avgLogLuma = totalLuma / count;
                    float avgLuma = exp(avgLogLuma);

                    gl_FragColor = vec4(avgLuma, 0.0, 0.0, 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false,
        });

        // 1x1 render target for luminance readback
        this._luminanceRT = new THREE.WebGLRenderTarget(1, 1, {
            format: THREE.RGBAFormat,
            type: THREE.FloatType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
        });
        this._luminanceQuad = new FullScreenQuad(this._luminanceMaterial);
        this._readBuffer = new Float32Array(4);

        // Exposure application material
        this._exposureMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                uExposure: { value: 1.0 },
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
                uniform float uExposure;
                varying vec2 vUv;

                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);

                    // Apply exposure adjustment
                    color.rgb *= uExposure;

                    gl_FragColor = color;
                }
            `,
            depthTest: false,
            depthWrite: false,
        });

        this._fsQuad = new FullScreenQuad(this._exposureMaterial);
    }

    render(renderer, writeBuffer, readBuffer, deltaTime) {
        const dt = deltaTime || 0.016;
        this._frameCount++;

        // ---- Step 1: Measure average luminance ----
        // Only perform GPU readback every N frames to avoid sync stalls
        if (this._frameCount % this._readbackInterval === 0) {
            this._luminanceMaterial.uniforms.tDiffuse.value = readBuffer.texture;
            renderer.setRenderTarget(this._luminanceRT);
            this._luminanceQuad.render(renderer);

            renderer.readRenderTargetPixels(
                this._luminanceRT, 0, 0, 1, 1, this._readBuffer
            );
        }
        const measuredLuminance = this._readBuffer[0];

        // ---- Step 2: Smoothly adapt exposure ----
        // Exponential smoothing toward target
        const adaptSpeed = this.adaptationSpeed * dt;
        this._currentLuminance = this._currentLuminance +
            (measuredLuminance - this._currentLuminance) * Math.min(adaptSpeed, 1.0);

        // Compute target exposure from luminance
        // Reinhard key-value mapping: exposure = keyValue / luminance
        const targetExposure = this.keyValue / Math.max(this._currentLuminance, 0.001);
        const clampedExposure = Math.max(
            this.minExposure,
            Math.min(this.maxExposure, targetExposure)
        );

        // Smooth exposure change
        this._currentExposure = this._currentExposure +
            (clampedExposure - this._currentExposure) * Math.min(adaptSpeed * 0.5, 1.0);

        // ---- Step 3: Apply exposure ----
        this._exposureMaterial.uniforms.tDiffuse.value = readBuffer.texture;
        this._exposureMaterial.uniforms.uExposure.value = this._currentExposure;

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
        }
        this._fsQuad.render(renderer);
    }

    /** Get current exposure for HUD/debug display */
    get exposure() {
        return this._currentExposure;
    }

    /** Get current measured luminance */
    get luminance() {
        return this._currentLuminance;
    }

    dispose() {
        this._luminanceMaterial.dispose();
        this._exposureMaterial.dispose();
        this._luminanceRT.dispose();
        this._luminanceQuad.dispose();
        this._fsQuad.dispose();
    }
}
