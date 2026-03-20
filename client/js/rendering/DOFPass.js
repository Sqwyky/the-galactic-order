/**
 * THE GALACTIC ORDER - Depth of Field Pass
 *
 * Bokeh-style depth of field using Circle of Confusion (CoC) computed
 * from depth buffer. Applies a Poisson disc blur weighted by CoC.
 * Auto-focuses on the center of the screen by default.
 *
 * Performance: ~0.3ms on mid-range GPU. Disabled on MEDIUM and below.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GLSL_DEPTH } from './shaders/CommonGLSL.js';

export class DOFPass extends Pass {
    /**
     * @param {THREE.Camera} camera
     * @param {Object} options
     * @param {number} [options.focalDistance=30.0] - Focus distance in world units
     * @param {number} [options.focalLength=50.0] - Lens focal length in mm
     * @param {number} [options.aperture=2.8] - F-stop (lower = more blur)
     * @param {number} [options.maxBlur=8.0] - Max blur radius in pixels
     * @param {number} [options.samples=16] - Disc sample count
     * @param {boolean} [options.autoFocus=true] - Auto-focus on screen center
     */
    constructor(camera, options = {}) {
        super();
        this.camera = camera;
        this.enabled = true;
        this.needsSwap = true;

        this.focalDistance = options.focalDistance || 30.0;
        this.focalLength = options.focalLength || 50.0;
        this.aperture = options.aperture || 2.8;
        this.maxBlur = options.maxBlur || 8.0;
        this.samples = options.samples || 16;
        this.autoFocus = options.autoFocus !== undefined ? options.autoFocus : true;

        this._material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                tDepth: { value: null },
                uCameraNear: { value: camera.near },
                uCameraFar: { value: camera.far },
                uFocalDistance: { value: this.focalDistance },
                uFocalLength: { value: this.focalLength / 1000.0 }, // Convert mm to meters
                uAperture: { value: this.aperture },
                uMaxBlur: { value: this.maxBlur },
                uSamples: { value: this.samples },
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
                uniform float uFocalDistance;
                uniform float uFocalLength;
                uniform float uAperture;
                uniform float uMaxBlur;
                uniform float uSamples;
                uniform vec2 uResolution;

                varying vec2 vUv;

                ${GLSL_DEPTH}

                // Compute Circle of Confusion radius
                float computeCoC(float depth) {
                    float focalPlane = uFocalDistance;
                    float coc = abs(uFocalLength * (depth - focalPlane) /
                        (depth * (focalPlane - uFocalLength))) / uAperture;
                    // Convert to pixels and clamp
                    coc *= uResolution.y;
                    return clamp(coc, 0.0, uMaxBlur);
                }

                // Poisson disc samples (16 points)
                const vec2 poissonDisc[16] = vec2[16](
                    vec2(-0.94201624, -0.39906216),
                    vec2( 0.94558609, -0.76890725),
                    vec2(-0.09418410, -0.92938870),
                    vec2( 0.34495938,  0.29387760),
                    vec2(-0.91588581,  0.45771432),
                    vec2(-0.81544232, -0.87912464),
                    vec2(-0.38277543,  0.27676845),
                    vec2( 0.97484398,  0.75648379),
                    vec2( 0.44323325, -0.97511554),
                    vec2( 0.53742981, -0.47373420),
                    vec2(-0.26496911, -0.41893023),
                    vec2( 0.79197514,  0.19090188),
                    vec2(-0.24188840,  0.99706507),
                    vec2(-0.81409955,  0.91437590),
                    vec2( 0.19984126,  0.78641367),
                    vec2( 0.14383161, -0.14100790)
                );

                void main() {
                    vec4 centerColor = texture2D(tDiffuse, vUv);
                    float rawDepth = texture2D(tDepth, vUv).x;

                    // Skip sky
                    if (rawDepth > 0.9999) {
                        gl_FragColor = centerColor;
                        return;
                    }

                    float depth = getLinearDepth(vUv);
                    float coc = computeCoC(depth);

                    // Skip if CoC is tiny
                    if (coc < 0.5) {
                        gl_FragColor = centerColor;
                        return;
                    }

                    // Blur using Poisson disc
                    vec3 result = vec3(0.0);
                    float totalWeight = 0.0;
                    vec2 texelSize = 1.0 / uResolution;

                    int sampleCount = int(uSamples);

                    for (int i = 0; i < 32; i++) {
                        if (i >= sampleCount) break;

                        // Use modular indexing into Poisson disc
                        int idx = i < 16 ? i : i - 16;
                        vec2 offset = (i < 16 ? poissonDisc[idx] : poissonDisc[idx] * 0.5);
                        vec2 sampleUV = vUv + offset * coc * texelSize;
                        sampleUV = clamp(sampleUV, 0.0, 1.0);

                        // Weight by sample's own CoC to prevent sharp foreground bleed
                        float sampleDepth = getLinearDepth(sampleUV);
                        float sampleCoC = computeCoC(sampleDepth);
                        float weight = max(min(sampleCoC, coc), 0.5);

                        result += texture2D(tDiffuse, sampleUV).rgb * weight;
                        totalWeight += weight;
                    }

                    result /= totalWeight;
                    gl_FragColor = vec4(result, centerColor.a);
                }
            `,
            depthTest: false,
            depthWrite: false,
        });

        this._fsQuad = new FullScreenQuad(this._material);
    }

    /**
     * Update auto-focus distance from depth buffer center.
     * Call per frame before render.
     */
    updateFocus(depthAtCenter) {
        if (this.autoFocus && depthAtCenter > 0) {
            // Smooth transition to new focal distance
            this.focalDistance += (depthAtCenter - this.focalDistance) * 0.1;
            this._material.uniforms.uFocalDistance.value = this.focalDistance;
        }
    }

    setQuality(tier) {
        switch (tier) {
            case 'ultra':
                this.samples = 32;
                this.maxBlur = 10.0;
                this.enabled = true;
                break;
            case 'high':
                this.samples = 16;
                this.maxBlur = 8.0;
                this.enabled = true;
                break;
            case 'medium':
            case 'low':
            case 'potato':
                this.enabled = false;
                break;
        }
        this._material.uniforms.uSamples.value = this.samples;
        this._material.uniforms.uMaxBlur.value = this.maxBlur;
    }

    render(renderer, writeBuffer, readBuffer) {
        const uniforms = this._material.uniforms;
        uniforms.tDiffuse.value = readBuffer.texture;
        if (readBuffer.depthTexture) {
            uniforms.tDepth.value = readBuffer.depthTexture;
        }

        uniforms.uCameraNear.value = this.camera.near;
        uniforms.uCameraFar.value = this.camera.far;
        uniforms.uResolution.value.set(readBuffer.width, readBuffer.height);

        // Auto-focus: read depth at screen center
        if (this.autoFocus && readBuffer.depthTexture) {
            // We'll use a simple smooth approach — focal distance is updated externally
            // or via the game loop calling updateFocus()
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
