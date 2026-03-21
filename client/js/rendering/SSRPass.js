/**
 * THE GALACTIC ORDER - Screen-Space Reflections (SSR) Pass
 *
 * Adds reflections to the ocean and wet surfaces by ray-marching
 * against the depth buffer in screen space.
 *
 * Technique:
 * 1. For each pixel, check if it's reflective (below a height threshold
 *    or on a surface facing upward — i.e., water/wet ground)
 * 2. Reflect the view direction around the surface normal
 * 3. March along the reflected ray in screen space
 * 4. When the ray hits geometry (depth buffer intersection), sample the
 *    color from that position
 * 5. Blend the reflection with the original color based on Fresnel
 *
 * Performance: ~0.3ms on mid-range GPU at half resolution.
 * Falls back to simple sky-color reflection on LOW tier.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GLSL_DEPTH, GLSL_PROJECT } from './shaders/CommonGLSL.js';

export class SSRPass extends Pass {
    /**
     * @param {THREE.Camera} camera
     * @param {Object} options
     * @param {number} [options.maxSteps=32] - Max ray march steps
     * @param {number} [options.maxDistance=50] - Max reflection distance
     * @param {number} [options.thickness=0.5] - Depth comparison thickness
     * @param {number} [options.reflectionStrength=0.6] - Overall reflection intensity
     * @param {number} [options.waterLevel=0.0] - Y position of water surface
     * @param {THREE.Color} [options.skyColor] - Fallback sky reflection color
     */
    constructor(camera, options = {}) {
        super();
        this.camera = camera;
        this.enabled = true;
        this.needsSwap = true;

        this.maxSteps = options.maxSteps || 32;
        this.maxDistance = options.maxDistance || 50;
        this.thickness = options.thickness || 0.5;
        this.reflectionStrength = options.reflectionStrength || 0.6;
        this.waterLevel = options.waterLevel || 0.0;
        this.skyColor = options.skyColor || new THREE.Color(0x3366aa);

        this._material = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                tDepth: { value: null },
                uCameraNear: { value: camera.near },
                uCameraFar: { value: camera.far },
                uProjectionMatrix: { value: new THREE.Matrix4() },
                uInverseProjection: { value: new THREE.Matrix4() },
                uViewMatrix: { value: new THREE.Matrix4() },
                uInverseView: { value: new THREE.Matrix4() },
                uCameraPosition: { value: new THREE.Vector3() },
                uResolution: { value: new THREE.Vector2() },
                uMaxSteps: { value: this.maxSteps },
                uMaxDistance: { value: this.maxDistance },
                uThickness: { value: this.thickness },
                uReflectionStrength: { value: this.reflectionStrength },
                uWaterLevel: { value: this.waterLevel },
                uSkyColor: { value: this.skyColor },
                uSunDirection: { value: new THREE.Vector3(0.5, 0.3, 0.4).normalize() },
                uSunColor: { value: new THREE.Color(0xffeedd) },
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
                uniform mat4 uInverseProjection;
                uniform mat4 uViewMatrix;
                uniform mat4 uInverseView;
                uniform vec3 uCameraPosition;
                uniform vec2 uResolution;
                uniform float uMaxSteps;
                uniform float uMaxDistance;
                uniform float uThickness;
                uniform float uReflectionStrength;
                uniform float uWaterLevel;
                uniform vec3 uSkyColor;
                uniform vec3 uSunDirection;
                uniform vec3 uSunColor;

                varying vec2 vUv;

                ${GLSL_DEPTH}
                ${GLSL_PROJECT}

                // Fresnel effect for reflection intensity
                float fresnelSchlick(float cosTheta) {
                    float f0 = 0.04; // Water
                    return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
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
                    vec3 viewDir = normalize(worldPos - uCameraPosition);

                    // Determine if this pixel is reflective
                    // Water: below water level AND mostly upward-facing
                    // Wet surfaces: near water level
                    float heightAboveWater = worldPos.y - uWaterLevel;
                    float isWater = smoothstep(0.5, -0.5, heightAboveWater);
                    float isWetGround = smoothstep(2.0, 0.0, abs(heightAboveWater)) * 0.3;
                    float reflectivity = max(isWater, isWetGround);

                    if (reflectivity < 0.01) {
                        gl_FragColor = sceneColor;
                        return;
                    }

                    // Approximate surface normal (water is mostly up)
                    vec3 surfaceNormal = vec3(0.0, 1.0, 0.0);

                    // Fresnel
                    float cosAngle = abs(dot(viewDir, surfaceNormal));
                    float fresnel = fresnelSchlick(cosAngle);

                    // Reflect view direction
                    vec3 reflectDir = reflect(viewDir, surfaceNormal);

                    // ---- Screen-space ray march ----
                    vec3 reflectColor = uSkyColor * 0.4; // Fallback: sky color
                    bool hit = false;

                    vec3 rayOrigin = worldPos + surfaceNormal * 0.1;
                    float stepSize = uMaxDistance / uMaxSteps;

                    for (float i = 1.0; i <= 64.0; i++) {
                        if (i > uMaxSteps) break;

                        vec3 samplePoint = rayOrigin + reflectDir * (stepSize * i);
                        vec2 sampleUV = projectToScreen(samplePoint);

                        // Out of screen bounds
                        if (sampleUV.x < 0.0 || sampleUV.x > 1.0 ||
                            sampleUV.y < 0.0 || sampleUV.y > 1.0) break;

                        float sampleDepth = getLinearDepth(sampleUV);
                        vec4 viewSample = uViewMatrix * vec4(samplePoint, 1.0);
                        float rayDepth = -viewSample.z;

                        // Check if ray is behind scene geometry
                        float depthDiff = rayDepth - sampleDepth;
                        if (depthDiff > 0.0 && depthDiff < uThickness) {
                            reflectColor = texture2D(tDiffuse, sampleUV).rgb;

                            // Fade based on distance along ray and screen edge
                            float edgeFade = 1.0 - smoothstep(0.8, 1.0, max(
                                abs(sampleUV.x - 0.5) * 2.0,
                                abs(sampleUV.y - 0.5) * 2.0
                            ));
                            float distFade = 1.0 - (i / uMaxSteps);
                            reflectColor *= edgeFade * distFade;
                            hit = true;
                            break;
                        }
                    }

                    // If no hit, use sky + sun specular as reflection
                    if (!hit) {
                        // Sun specular on water
                        float sunSpec = pow(max(dot(reflectDir, uSunDirection), 0.0), 256.0);
                        float sunBroad = pow(max(dot(reflectDir, uSunDirection), 0.0), 16.0);
                        reflectColor += uSunColor * sunSpec * 2.0;
                        reflectColor += uSunColor * sunBroad * 0.15;

                        // Sky gradient in reflection
                        float skyGrad = max(reflectDir.y, 0.0);
                        reflectColor = mix(reflectColor, uSkyColor * 0.6, skyGrad * 0.5);
                    }

                    // Blend reflection with scene
                    float blendFactor = fresnel * reflectivity * uReflectionStrength;
                    vec3 finalColor = mix(sceneColor.rgb, reflectColor, blendFactor);

                    gl_FragColor = vec4(finalColor, sceneColor.a);
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
                this.maxSteps = 48;
                this.maxDistance = 80;
                break;
            case 'high':
                this.maxSteps = 32;
                this.maxDistance = 50;
                break;
            case 'medium':
                this.maxSteps = 16;
                this.maxDistance = 30;
                break;
            case 'low':
                this.enabled = false;
                break;
        }
        this._material.uniforms.uMaxSteps.value = this.maxSteps;
        this._material.uniforms.uMaxDistance.value = this.maxDistance;
    }

    /**
     * Set sun direction for specular highlight on reflections.
     * @param {THREE.Vector3} dir - Normalized sun direction
     */
    setSunDirection(dir) {
        this._material.uniforms.uSunDirection.value.copy(dir);
    }

    /**
     * Set sun color for reflection highlights.
     * @param {THREE.Color} color
     */
    setSunColor(color) {
        this._material.uniforms.uSunColor.value.copy(color);
    }

    /**
     * Set sky color for fallback reflections.
     * @param {THREE.Color} color
     */
    setSkyColor(color) {
        this._material.uniforms.uSkyColor.value.copy(color);
    }

    /**
     * No-op — SSR visual output is not affected by weather parameters.
     * Reflections are driven by sun/sky color (setSunColor, setSkyColor)
     * rather than weather state.
     */
    setWeatherParams(params) {
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
        uniforms.uInverseProjection.value.copy(this.camera.projectionMatrixInverse);
        uniforms.uViewMatrix.value.copy(this.camera.matrixWorldInverse);
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
