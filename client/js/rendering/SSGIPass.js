/**
 * THE GALACTIC ORDER - Screen-Space Global Illumination (SSGI) Pass
 *
 * Traces short rays in screen space to compute indirect diffuse color
 * bleeding. Uses depth-reconstructed normals and a cosine-weighted
 * hemisphere to sample indirect light from surrounding geometry.
 *
 * Temporal noise rotation + TAA smoothing provides stable results
 * with low per-frame ray counts.
 *
 * Performance: ~0.5ms on mid-range GPU. Disabled on MEDIUM and below.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GLSL_DEPTH, GLSL_PROJECT } from './shaders/CommonGLSL.js';

export class SSGIPass extends Pass {
    /**
     * @param {THREE.Camera} camera
     * @param {Object} options
     * @param {number} [options.maxSteps=12] - Steps per ray
     * @param {number} [options.maxDistance=10.0] - Max trace distance in world units
     * @param {number} [options.thickness=0.5] - Depth comparison threshold
     * @param {number} [options.intensity=0.4] - GI contribution strength
     * @param {number} [options.rayCount=4] - Hemisphere ray directions per pixel
     */
    constructor(camera, options = {}) {
        super();
        this.camera = camera;
        this.enabled = true;
        this.needsSwap = true;

        this.maxSteps = options.maxSteps || 12;
        this.maxDistance = options.maxDistance || 10.0;
        this.thickness = options.thickness || 0.5;
        this.intensity = options.intensity || 0.4;
        this.rayCount = options.rayCount || 4;

        this._frameIndex = 0;

        this._material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                tDepth: { value: null },
                uCameraNear: { value: camera.near },
                uCameraFar: { value: camera.far },
                uProjectionMatrix: { value: new THREE.Matrix4() },
                uViewMatrix: { value: new THREE.Matrix4() },
                uInverseProjection: { value: new THREE.Matrix4() },
                uInverseView: { value: new THREE.Matrix4() },
                uCameraPosition: { value: new THREE.Vector3() },
                uResolution: { value: new THREE.Vector2() },
                uMaxSteps: { value: this.maxSteps },
                uMaxDistance: { value: this.maxDistance },
                uThickness: { value: this.thickness },
                uIntensity: { value: this.intensity },
                uRayCount: { value: this.rayCount },
                uFrameIndex: { value: 0 },
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
                uniform mat4 uProjectionMatrix;
                uniform mat4 uViewMatrix;
                uniform mat4 uInverseProjection;
                uniform mat4 uInverseView;
                uniform vec3 uCameraPosition;
                uniform vec2 uResolution;
                uniform float uMaxSteps;
                uniform float uMaxDistance;
                uniform float uThickness;
                uniform float uIntensity;
                uniform float uRayCount;
                uniform float uFrameIndex;

                varying vec2 vUv;

                // Hash for random directions
                float hash(vec2 p) {
                    float h = dot(p, vec2(127.1, 311.7));
                    return fract(sin(h) * 43758.5453123);
                }

                vec2 hash2(vec2 p) {
                    return vec2(
                        hash(p),
                        hash(p + vec2(47.1, 93.7))
                    );
                }

                ${GLSL_DEPTH}

                // Reconstruct normal from depth buffer using cross product of gradients
                vec3 reconstructNormal(vec2 uv) {
                    vec2 texel = 1.0 / uResolution;
                    vec3 posC = getWorldPosition(uv);
                    vec3 posR = getWorldPosition(uv + vec2(texel.x, 0.0));
                    vec3 posU = getWorldPosition(uv + vec2(0.0, texel.y));
                    return normalize(cross(posR - posC, posU - posC));
                }

                ${GLSL_PROJECT}

                // Generate a cosine-weighted hemisphere direction
                vec3 cosineHemisphere(vec3 normal, vec2 rand) {
                    float theta = 6.28318530718 * rand.x;
                    float r = sqrt(rand.y);
                    float x = r * cos(theta);
                    float y = r * sin(theta);
                    float z = sqrt(1.0 - rand.y);

                    // Build TBN from normal
                    vec3 tangent = abs(normal.y) < 0.999
                        ? normalize(cross(normal, vec3(0.0, 1.0, 0.0)))
                        : normalize(cross(normal, vec3(1.0, 0.0, 0.0)));
                    vec3 bitangent = cross(normal, tangent);

                    return normalize(tangent * x + bitangent * y + normal * z);
                }

                void main() {
                    vec4 sceneColor = texture2D(tDiffuse, vUv);
                    float rawDepth = texture2D(tDepth, vUv).x;

                    // Skip sky
                    if (rawDepth > 0.9999) {
                        gl_FragColor = sceneColor;
                        return;
                    }

                    vec3 worldPos = getWorldPosition(vUv);
                    float distFromCamera = length(worldPos - uCameraPosition);

                    // Fade out GI at distance
                    float distFade = 1.0 - smoothstep(50.0, 100.0, distFromCamera);
                    if (distFade < 0.01) {
                        gl_FragColor = sceneColor;
                        return;
                    }

                    vec3 normal = reconstructNormal(vUv);

                    // Trace rays in hemisphere
                    vec3 indirectLight = vec3(0.0);
                    float hitCount = 0.0;
                    float stepSize = uMaxDistance / uMaxSteps;

                    // Per-frame noise rotation for temporal stability
                    float frameRotation = uFrameIndex * 2.399963; // golden angle

                    for (float r = 0.0; r < 8.0; r++) {
                        if (r >= uRayCount) break;

                        // Generate random hemisphere direction
                        vec2 noise = hash2(vUv * uResolution + vec2(r * 73.1, uFrameIndex * 17.3));
                        noise.x = fract(noise.x + frameRotation * (r + 1.0));

                        vec3 rayDir = cosineHemisphere(normal, noise);

                        // March along ray
                        bool hit = false;
                        for (float s = 1.0; s <= 16.0; s++) {
                            if (s > uMaxSteps) break;

                            vec3 samplePoint = worldPos + rayDir * (stepSize * s);
                            vec2 sampleUV = projectToScreen(samplePoint);

                            if (sampleUV.x < 0.0 || sampleUV.x > 1.0 ||
                                sampleUV.y < 0.0 || sampleUV.y > 1.0) break;

                            float sampleDepth = getLinearDepth(sampleUV);
                            vec4 viewSample = uViewMatrix * vec4(samplePoint, 1.0);
                            float rayDepth = -viewSample.z;

                            float depthDiff = rayDepth - sampleDepth;
                            if (depthDiff > 0.0 && depthDiff < uThickness) {
                                // Hit! Sample color at this position
                                vec3 hitColor = texture2D(tDiffuse, sampleUV).rgb;
                                float rayFade = 1.0 - (s / uMaxSteps);
                                indirectLight += hitColor * rayFade;
                                hitCount += 1.0;
                                hit = true;
                                break;
                            }
                        }
                    }

                    // Average indirect light — normalize by actual hit count
                    if (hitCount > 0.0) {
                        indirectLight /= hitCount;
                        indirectLight *= uIntensity * distFade * (hitCount / uRayCount);
                        sceneColor.rgb += indirectLight;
                    }

                    gl_FragColor = sceneColor;
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
                this.rayCount = 8;
                this.maxSteps = 16;
                this.intensity = 0.5;
                this.enabled = true;
                break;
            case 'high':
                this.rayCount = 4;
                this.maxSteps = 8;
                this.intensity = 0.4;
                this.enabled = true;
                break;
            case 'medium':
            case 'low':
            case 'potato':
                this.enabled = false;
                break;
        }
        this._material.uniforms.uRayCount.value = this.rayCount;
        this._material.uniforms.uMaxSteps.value = this.maxSteps;
        this._material.uniforms.uIntensity.value = this.intensity;
    }

    render(renderer, writeBuffer, readBuffer) {
        const uniforms = this._material.uniforms;
        uniforms.tDiffuse.value = readBuffer.texture;
        if (readBuffer.depthTexture) {
            uniforms.tDepth.value = readBuffer.depthTexture;
        }

        uniforms.uCameraNear.value = this.camera.near;
        uniforms.uCameraFar.value = this.camera.far;
        uniforms.uProjectionMatrix.value.copy(this.camera.projectionMatrix);
        uniforms.uViewMatrix.value.copy(this.camera.matrixWorldInverse);
        uniforms.uInverseProjection.value.copy(this.camera.projectionMatrixInverse);
        uniforms.uInverseView.value.copy(this.camera.matrixWorld);
        uniforms.uCameraPosition.value.copy(this.camera.position);
        uniforms.uResolution.value.set(readBuffer.width, readBuffer.height);

        uniforms.uFrameIndex.value = this._frameIndex++;

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
