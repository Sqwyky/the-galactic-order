/**
 * THE GALACTIC ORDER - Procedural Environment Map
 *
 * Generates a low-res cubemap from the sky colors for PBR reflections.
 * Computed ONCE when the planet loads — all MeshStandardMaterial and
 * MeshPhysicalMaterial in the scene automatically pick up subtle
 * sky reflections (ship metal, wet terrain, ice, etc.).
 *
 * Performance: One-time cost of 6 renders at 64×64 (~0.5ms total).
 * At runtime, env map sampling is already part of Standard material
 * pipeline — having it vs not having it is essentially free.
 */

import * as THREE from 'three';

/**
 * Create a procedural environment cubemap from sky gradient colors.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Color} topColor - Zenith sky color
 * @param {THREE.Color} midColor - Mid-sky color
 * @param {THREE.Color} bottomColor - Horizon sky color
 * @param {THREE.Color} sunColor - Sun glow color
 * @param {THREE.Vector3} sunDirection - Normalized sun direction
 * @returns {THREE.CubeTexture} The environment cubemap
 */
export function createProceduralEnvMap(renderer, topColor, midColor, bottomColor, sunColor, sunDirection) {
    const size = 64;
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(size, {
        format: THREE.RGBAFormat,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
    });

    // Create a tiny scene with just a sky gradient box
    const envScene = new THREE.Scene();
    const envCamera = new THREE.CubeCamera(0.1, 10, cubeRenderTarget);

    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            uTopColor: { value: topColor },
            uMidColor: { value: midColor },
            uBottomColor: { value: bottomColor },
            uSunColor: { value: sunColor },
            uSunDirection: { value: sunDirection },
        },
        vertexShader: /* glsl */ `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPos.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */ `
            uniform vec3 uTopColor;
            uniform vec3 uMidColor;
            uniform vec3 uBottomColor;
            uniform vec3 uSunColor;
            uniform vec3 uSunDirection;

            varying vec3 vWorldPosition;

            void main() {
                vec3 dir = normalize(vWorldPosition);
                float h = dir.y;

                // Sky gradient
                vec3 skyColor;
                if (h > 0.3) {
                    float t = smoothstep(0.3, 0.9, h);
                    skyColor = mix(uMidColor, uTopColor, t);
                } else if (h > 0.0) {
                    float t = smoothstep(0.0, 0.3, h);
                    skyColor = mix(uBottomColor, uMidColor, t);
                } else {
                    skyColor = uBottomColor;
                }

                // Subtle sun glow
                float sunDot = max(dot(dir, uSunDirection), 0.0);
                float sunHaze = pow(sunDot, 4.0) * 0.2;
                skyColor += uSunColor * sunHaze;

                gl_FragColor = vec4(skyColor, 1.0);
            }
        `,
        side: THREE.BackSide,
        depthWrite: false,
    });

    const skyBox = new THREE.Mesh(
        new THREE.BoxGeometry(5, 5, 5),
        skyMat
    );
    envScene.add(skyBox);

    envCamera.update(renderer, envScene);

    // Cleanup
    skyBox.geometry.dispose();
    skyMat.dispose();

    return cubeRenderTarget.texture;
}
