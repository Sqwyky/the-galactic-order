/**
 * THE GALACTIC ORDER - Temporal Anti-Aliasing (TAA) Pass
 *
 * Eliminates shimmer on vegetation edges, terrain silhouettes, and
 * instanced geometry (grass, alien flora) by blending the current
 * frame with a clamped history buffer.
 *
 * Technique:
 * 1. Jitter the camera projection matrix each frame using a Halton
 *    sequence (sub-pixel offsets across 4–16 samples)
 * 2. Render the scene with that jitter (handled by the RenderPass)
 * 3. In this pass, sample the previous frame's history buffer
 * 4. Clamp the history color to the 3×3 neighborhood min/max of
 *    the current frame (motion-aware rejection)
 * 5. Blend current frame with clamped history using a velocity-
 *    aware weight (static pixels ~0.95, moving pixels ~0.8)
 * 6. Ping-pong: write result to history, swap targets each frame
 *
 * Performance: ~0.15 ms on mid-range GPU. Disabled on LOW/POTATO.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ============================================================
// Halton sequence generator (low-discrepancy quasi-random)
// ============================================================

function halton(index, base) {
    let result = 0;
    let f = 1 / base;
    let i = index;
    while (i > 0) {
        result += f * (i % base);
        i = Math.floor(i / base);
        f /= base;
    }
    return result;
}

/**
 * Pre-compute a Halton(2,3) jitter table centered around 0.
 * Each entry is { x, y } in [-0.5, 0.5] range (pixel units).
 */
function generateHaltonSequence(count) {
    const sequence = [];
    for (let i = 0; i < count; i++) {
        sequence.push({
            x: halton(i + 1, 2) - 0.5,
            y: halton(i + 1, 3) - 0.5,
        });
    }
    return sequence;
}

// Pre-generate tables for each quality tier
const HALTON_16 = generateHaltonSequence(16);
const HALTON_8  = generateHaltonSequence(8);
const HALTON_4  = generateHaltonSequence(4);

// ============================================================
// TAA PASS
// ============================================================

export class TAAPass extends Pass {
    /**
     * @param {THREE.Camera} camera - The scene camera (projection will be jittered)
     * @param {Object} [options]
     * @param {number} [options.blendFactor=0.93] - History blend weight for static pixels
     * @param {number} [options.movingBlendFactor=0.8] - History blend weight for moving pixels
     */
    constructor(camera, options = {}) {
        super();
        this.camera = camera;
        this.enabled = true;
        this.needsSwap = true;

        // Quality settings
        this._haltonSequence = HALTON_8;
        this._sampleCount = 8;
        this._blendFactor = options.blendFactor || 0.93;
        this._movingBlendFactor = options.movingBlendFactor || 0.8;

        // Frame counter for cycling through jitter offsets
        this._frameIndex = 0;

        // Current jitter offset (exposed so other passes can compensate)
        this.jitterOffset = new THREE.Vector2(0, 0);

        // Saved original projection matrix (restored after each frame)
        this._savedProjectionMatrix = new THREE.Matrix4();

        // History render targets (ping-pong)
        this._historyRT = [null, null];
        this._currentTarget = 0;
        this._firstFrame = true;

        // TAA resolve shader material
        this._material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse:       { value: null },
                tHistory:       { value: null },
                uResolution:    { value: new THREE.Vector2() },
                uJitterOffset:  { value: new THREE.Vector2() },
                uBlendFactor:   { value: this._blendFactor },
                uMovingBlend:   { value: this._movingBlendFactor },
                uFirstFrame:    { value: 1.0 },
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
                uniform sampler2D tHistory;
                uniform vec2 uResolution;
                uniform vec2 uJitterOffset;
                uniform float uBlendFactor;
                uniform float uMovingBlend;
                uniform float uFirstFrame;

                varying vec2 vUv;

                // Convert RGB to luminance
                float luminance(vec3 c) {
                    return dot(c, vec3(0.299, 0.587, 0.114));
                }

                void main() {
                    vec2 texelSize = 1.0 / uResolution;

                    // Current frame color (unjittered UV — the jitter was applied
                    // to the projection, so the rendered texels are already offset)
                    vec3 current = texture2D(tDiffuse, vUv).rgb;

                    // On the very first frame there's no valid history
                    if (uFirstFrame > 0.5) {
                        gl_FragColor = vec4(current, 1.0);
                        return;
                    }

                    // ---- 3×3 Neighborhood min/max (for history clamping) ----
                    vec3 nMin = current;
                    vec3 nMax = current;

                    for (int x = -1; x <= 1; x++) {
                        for (int y = -1; y <= 1; y++) {
                            if (x == 0 && y == 0) continue;
                            vec2 offset = vec2(float(x), float(y)) * texelSize;
                            vec3 s = texture2D(tDiffuse, vUv + offset).rgb;
                            nMin = min(nMin, s);
                            nMax = max(nMax, s);
                        }
                    }

                    // ---- Sample history at reprojected position ----
                    // Approximate reprojection: undo the current jitter offset
                    // (in texel-space → UV-space)
                    vec2 historyUV = vUv - uJitterOffset * texelSize;
                    vec3 history = texture2D(tHistory, historyUV).rgb;

                    // ---- Clamp history to neighborhood AABB ----
                    vec3 clampedHistory = clamp(history, nMin, nMax);

                    // ---- Velocity-based blend factor ----
                    // Use luminance difference as a proxy for motion
                    float lumDiff = abs(luminance(current) - luminance(clampedHistory));
                    float motionWeight = smoothstep(0.0, 0.15, lumDiff);
                    float blend = mix(uBlendFactor, uMovingBlend, motionWeight);

                    // ---- Final blend ----
                    vec3 result = mix(current, clampedHistory, blend);

                    gl_FragColor = vec4(result, 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false,
        });

        this._fsQuad = new FullScreenQuad(this._material);
    }

    // ================================================================
    // QUALITY CONTROL
    // ================================================================

    /**
     * Set TAA quality based on performance tier.
     * @param {'ultra'|'high'|'medium'|'low'|'potato'} tier
     */
    setQuality(tier) {
        switch (tier) {
            case 'ultra':
                this._haltonSequence = HALTON_16;
                this._sampleCount = 16;
                this._blendFactor = 0.95;
                this.enabled = true;
                break;
            case 'high':
                this._haltonSequence = HALTON_8;
                this._sampleCount = 8;
                this._blendFactor = 0.93;
                this.enabled = true;
                break;
            case 'medium':
                this._haltonSequence = HALTON_4;
                this._sampleCount = 4;
                this._blendFactor = 0.9;
                this.enabled = true;
                break;
            case 'low':
            case 'potato':
                this.enabled = false;
                break;
        }
        this._material.uniforms.uBlendFactor.value = this._blendFactor;
    }

    // ================================================================
    // JITTER — apply before the RenderPass, restore after
    // ================================================================

    /**
     * Apply sub-pixel jitter to the camera's projection matrix.
     * Call this BEFORE the scene is rendered (before composer.render).
     */
    applyJitter() {
        if (!this.enabled) return;

        // Save the original projection matrix
        this._savedProjectionMatrix.copy(this.camera.projectionMatrix);

        // Get the current Halton sample
        const idx = this._frameIndex % this._sampleCount;
        const sample = this._haltonSequence[idx];

        // Store the jitter offset (in pixel units)
        this.jitterOffset.set(sample.x, sample.y);

        // Apply sub-pixel offset to projection matrix
        // The offset is in pixel space; convert to NDC by dividing by resolution
        // and multiplying by 2 (NDC range is -1..+1)
        const uniforms = this._material.uniforms;
        const w = uniforms.uResolution.value.x || window.innerWidth;
        const h = uniforms.uResolution.value.y || window.innerHeight;

        if (w > 0 && h > 0) {
            const jitterX = (sample.x * 2.0) / w;
            const jitterY = (sample.y * 2.0) / h;

            // Modify the projection matrix elements [2][0] and [2][1]
            // which correspond to the sub-pixel shift in clip space
            this.camera.projectionMatrix.elements[8]  += jitterX;
            this.camera.projectionMatrix.elements[9]  += jitterY;
        }
    }

    /**
     * Restore the camera's original projection matrix.
     * Call this AFTER composer.render().
     */
    restoreJitter() {
        if (!this.enabled) return;
        this.camera.projectionMatrix.copy(this._savedProjectionMatrix);
    }

    // ================================================================
    // RENDER
    // ================================================================

    render(renderer, writeBuffer, readBuffer) {
        const w = readBuffer.width;
        const h = readBuffer.height;

        // Lazy-init history render targets
        if (!this._historyRT[0] || this._historyRT[0].width !== w || this._historyRT[0].height !== h) {
            this._allocateTargets(w, h);
        }

        const uniforms = this._material.uniforms;
        uniforms.tDiffuse.value = readBuffer.texture;
        uniforms.uResolution.value.set(w, h);
        uniforms.uJitterOffset.value.copy(this.jitterOffset);
        uniforms.uFirstFrame.value = this._firstFrame ? 1.0 : 0.0;

        // History from the OTHER target (the one we wrote last frame)
        const historyIdx = 1 - this._currentTarget;
        uniforms.tHistory.value = this._historyRT[historyIdx].texture;

        // Render TAA resolve into the CURRENT history target
        renderer.setRenderTarget(this._historyRT[this._currentTarget]);
        this._fsQuad.render(renderer);

        // Also write to the output (writeBuffer or screen)
        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
        }
        // Re-render the resolved result to the output buffer
        uniforms.tDiffuse.value = this._historyRT[this._currentTarget].texture;
        uniforms.uFirstFrame.value = 1.0; // pass-through: just copy from history
        this._fsQuad.render(renderer);

        // Reset for next frame
        uniforms.uFirstFrame.value = this._firstFrame ? 1.0 : 0.0;

        // Swap ping-pong target
        this._currentTarget = 1 - this._currentTarget;
        this._firstFrame = false;
        this._frameIndex++;
    }

    // ================================================================
    // RESIZE
    // ================================================================

    setSize(width, height) {
        this._material.uniforms.uResolution.value.set(width, height);
        if (width > 0 && height > 0) {
            this._allocateTargets(width, height);
            // Reset history on resize to avoid ghosting from old resolution
            this._firstFrame = true;
        }
    }

    // ================================================================
    // INTERNALS
    // ================================================================

    _allocateTargets(width, height) {
        const params = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
        };

        for (let i = 0; i < 2; i++) {
            if (this._historyRT[i]) {
                this._historyRT[i].dispose();
            }
            this._historyRT[i] = new THREE.WebGLRenderTarget(width, height, params);
        }
    }

    dispose() {
        this._material.dispose();
        this._fsQuad.dispose();
        for (let i = 0; i < 2; i++) {
            if (this._historyRT[i]) {
                this._historyRT[i].dispose();
            }
        }
    }
}
