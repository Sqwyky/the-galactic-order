/**
 * THE GALACTIC ORDER - Camera Motion Blur Pass
 *
 * Per-pixel velocity-based motion blur using current vs previous
 * view-projection matrix. Reconstructs world position from depth,
 * computes screen-space velocity, and blurs along the velocity vector.
 *
 * Performance: ~0.2ms on mid-range GPU. Disabled on LOW/POTATO tiers.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export class MotionBlurPass extends Pass {
    /**
     * @param {THREE.Camera} camera
     * @param {Object} options
     * @param {number} [options.velocityScale=1.0] - Blur intensity multiplier
     * @param {number} [options.maxBlurRadius=20.0] - Max blur in pixels
     * @param {number} [options.samples=8] - Number of blur samples
     */
    constructor(camera, options = {}) {
        super();
        this.camera = camera;
        this.enabled = true;
        this.needsSwap = true;

        this.velocityScale = options.velocityScale || 1.0;
        this.maxBlurRadius = options.maxBlurRadius || 20.0;
        this.samples = options.samples || 8;

        this._previousViewProjection = new THREE.Matrix4();
        this._currentViewProjection = new THREE.Matrix4();
        this._initialized = false;

        this._material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                tDepth: { value: null },
                uCameraNear: { value: camera.near },
                uCameraFar: { value: camera.far },
                uInverseProjection: { value: new THREE.Matrix4() },
                uInverseView: { value: new THREE.Matrix4() },
                uCurrentViewProjection: { value: new THREE.Matrix4() },
                uPreviousViewProjection: { value: new THREE.Matrix4() },
                uVelocityScale: { value: this.velocityScale },
                uMaxBlurRadius: { value: this.maxBlurRadius },
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
                uniform mat4 uInverseProjection;
                uniform mat4 uInverseView;
                uniform mat4 uCurrentViewProjection;
                uniform mat4 uPreviousViewProjection;
                uniform float uVelocityScale;
                uniform float uMaxBlurRadius;
                uniform float uSamples;
                uniform vec2 uResolution;

                varying vec2 vUv;

                vec3 getWorldPosition(vec2 uv) {
                    float depth = texture2D(tDepth, uv).x;
                    vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
                    vec4 viewPos = uInverseProjection * ndc;
                    viewPos /= viewPos.w;
                    vec4 worldPos = uInverseView * viewPos;
                    return worldPos.xyz;
                }

                void main() {
                    float rawDepth = texture2D(tDepth, vUv).x;

                    // Skip sky pixels
                    if (rawDepth > 0.9999) {
                        gl_FragColor = texture2D(tDiffuse, vUv);
                        return;
                    }

                    // Reconstruct world position
                    vec3 worldPos = getWorldPosition(vUv);

                    // Project through current and previous VP matrices
                    vec4 currentClip = uCurrentViewProjection * vec4(worldPos, 1.0);
                    vec4 previousClip = uPreviousViewProjection * vec4(worldPos, 1.0);

                    vec2 currentScreen = (currentClip.xy / currentClip.w) * 0.5 + 0.5;
                    vec2 previousScreen = (previousClip.xy / previousClip.w) * 0.5 + 0.5;

                    // Velocity in screen space
                    vec2 velocity = (currentScreen - previousScreen) * uVelocityScale;

                    // Clamp velocity magnitude to max blur radius (in pixels)
                    float velocityLength = length(velocity * uResolution);
                    if (velocityLength > uMaxBlurRadius) {
                        velocity *= uMaxBlurRadius / velocityLength;
                    }

                    // Skip if velocity is negligible
                    if (velocityLength < 0.5) {
                        gl_FragColor = texture2D(tDiffuse, vUv);
                        return;
                    }

                    // Sample along velocity vector
                    vec3 result = vec3(0.0);
                    float totalWeight = 0.0;

                    for (float i = 0.0; i < 16.0; i++) {
                        if (i >= uSamples) break;
                        float t = (i / (uSamples - 1.0)) - 0.5; // -0.5 to 0.5
                        vec2 sampleUV = vUv + velocity * t;
                        sampleUV = clamp(sampleUV, 0.0, 1.0);

                        // Gaussian-like weight (center samples stronger)
                        float weight = 1.0 - abs(t) * 1.5;
                        weight = max(weight, 0.2);

                        result += texture2D(tDiffuse, sampleUV).rgb * weight;
                        totalWeight += weight;
                    }

                    result /= totalWeight;

                    gl_FragColor = vec4(result, 1.0);
                }
            `,
            depthTest: false,
            depthWrite: false,
        });

        this._fsQuad = new FullScreenQuad(this._material);
    }

    setQuality(tier) {
        switch (tier) {
            case 'ultra':
                this.samples = 16;
                this.velocityScale = 1.0;
                this.enabled = true;
                break;
            case 'high':
                this.samples = 8;
                this.velocityScale = 0.8;
                this.enabled = true;
                break;
            case 'medium':
                this.samples = 4;
                this.velocityScale = 0.5;
                this.enabled = true;
                break;
            case 'low':
            case 'potato':
                this.enabled = false;
                break;
        }
        this._material.uniforms.uSamples.value = this.samples;
        this._material.uniforms.uVelocityScale.value = this.velocityScale;
    }

    render(renderer, writeBuffer, readBuffer) {
        const uniforms = this._material.uniforms;
        uniforms.tDiffuse.value = readBuffer.texture;
        if (readBuffer.depthTexture) {
            uniforms.tDepth.value = readBuffer.depthTexture;
        }

        uniforms.uCameraNear.value = this.camera.near;
        uniforms.uCameraFar.value = this.camera.far;
        uniforms.uInverseProjection.value.copy(this.camera.projectionMatrixInverse);
        uniforms.uInverseView.value.copy(this.camera.matrixWorld);
        uniforms.uResolution.value.set(readBuffer.width, readBuffer.height);

        // Compute current view-projection matrix
        this._currentViewProjection.multiplyMatrices(
            this.camera.projectionMatrix,
            this.camera.matrixWorldInverse
        );
        uniforms.uCurrentViewProjection.value.copy(this._currentViewProjection);

        // Use previous VP (or current if first frame)
        if (!this._initialized) {
            this._previousViewProjection.copy(this._currentViewProjection);
            this._initialized = true;
        }
        uniforms.uPreviousViewProjection.value.copy(this._previousViewProjection);

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
        }
        this._fsQuad.render(renderer);

        // Store current VP as previous for next frame
        this._previousViewProjection.copy(this._currentViewProjection);
    }

    setSize(width, height) {
        this._material.uniforms.uResolution.value.set(width, height);
    }

    dispose() {
        this._material.dispose();
        this._fsQuad.dispose();
    }
}
