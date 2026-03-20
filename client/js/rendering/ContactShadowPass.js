/**
 * THE GALACTIC ORDER - Contact Shadows Pass
 *
 * Screen-space contact shadows that ray-march through the depth buffer
 * in the light direction to detect nearby occluders. Catches fine shadows
 * that cascade shadow maps miss: under rocks, in terrain crevices, at
 * vegetation roots.
 *
 * Performance: ~0.2ms on mid-range GPU. Disabled on MEDIUM and below.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GLSL_DEPTH, GLSL_PROJECT } from './shaders/CommonGLSL.js';

export class ContactShadowPass extends Pass {
    /**
     * @param {THREE.Camera} camera
     * @param {Object} options
     * @param {THREE.Vector3} [options.sunDirection] - Light direction
     * @param {number} [options.maxSteps=12] - Ray march steps
     * @param {number} [options.maxDistance=2.0] - Max search distance in world units
     * @param {number} [options.thickness=0.1] - Depth comparison threshold
     * @param {number} [options.shadowStrength=0.4] - Shadow darkness
     */
    constructor(camera, options = {}) {
        super();
        this.camera = camera;
        this.enabled = true;
        this.needsSwap = true;

        this.sunDirection = options.sunDirection || new THREE.Vector3(0.5, 0.3, 0.4).normalize();
        this.maxSteps = options.maxSteps || 12;
        this.maxDistance = options.maxDistance || 2.0;
        this.thickness = options.thickness || 0.1;
        this.shadowStrength = options.shadowStrength || 0.4;

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
                uSunDirection: { value: this.sunDirection },
                uResolution: { value: new THREE.Vector2() },
                uMaxSteps: { value: this.maxSteps },
                uMaxDistance: { value: this.maxDistance },
                uThickness: { value: this.thickness },
                uShadowStrength: { value: this.shadowStrength },
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
                uniform vec3 uSunDirection;
                uniform vec2 uResolution;
                uniform float uMaxSteps;
                uniform float uMaxDistance;
                uniform float uThickness;
                uniform float uShadowStrength;

                varying vec2 vUv;

                ${GLSL_DEPTH}
                ${GLSL_PROJECT}

                void main() {
                    vec4 sceneColor = texture2D(tDiffuse, vUv);
                    float rawDepth = texture2D(tDepth, vUv).x;

                    // Skip sky pixels
                    if (rawDepth > 0.9999) {
                        gl_FragColor = sceneColor;
                        return;
                    }

                    vec3 worldPos = getWorldPosition(vUv);
                    float distFromCamera = length(worldPos - uCameraPosition);

                    // Fade out contact shadows at distance (beyond 80m they're invisible)
                    float distFade = 1.0 - smoothstep(40.0, 80.0, distFromCamera);
                    if (distFade < 0.01) {
                        gl_FragColor = sceneColor;
                        return;
                    }

                    // Ray march toward light source
                    float stepSize = uMaxDistance / uMaxSteps;
                    float shadow = 0.0;

                    // March in the light direction (toward the sun)
                    vec3 rayDir = normalize(uSunDirection);

                    for (float i = 1.0; i <= 16.0; i++) {
                        if (i > uMaxSteps) break;

                        vec3 samplePoint = worldPos + rayDir * (stepSize * i);
                        vec2 sampleUV = projectToScreen(samplePoint);

                        // Out of screen bounds
                        if (sampleUV.x < 0.0 || sampleUV.x > 1.0 ||
                            sampleUV.y < 0.0 || sampleUV.y > 1.0) break;

                        float sampleDepth = getLinearDepth(sampleUV);
                        vec4 viewSample = uViewMatrix * vec4(samplePoint, 1.0);
                        float rayDepth = -viewSample.z;

                        // Check if ray is behind geometry
                        float depthDiff = rayDepth - sampleDepth;
                        if (depthDiff > 0.0 && depthDiff < uThickness) {
                            // Fade shadow based on how far along the ray we are
                            float fade = 1.0 - (i / uMaxSteps);
                            shadow = max(shadow, fade);
                            break;
                        }
                    }

                    // Apply shadow
                    shadow *= uShadowStrength * distFade;
                    vec3 result = sceneColor.rgb * (1.0 - shadow);

                    gl_FragColor = vec4(result, sceneColor.a);
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
                this.maxSteps = 16;
                this.shadowStrength = 0.4;
                this.enabled = true;
                break;
            case 'high':
                this.maxSteps = 8;
                this.shadowStrength = 0.35;
                this.enabled = true;
                break;
            case 'medium':
            case 'low':
            case 'potato':
                this.enabled = false;
                break;
        }
        this._material.uniforms.uMaxSteps.value = this.maxSteps;
        this._material.uniforms.uShadowStrength.value = this.shadowStrength;
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
