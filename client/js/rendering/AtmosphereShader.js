/**
 * THE GALACTIC ORDER - Atmosphere Shaders
 *
 * Two-layer atmosphere system inspired by NMS:
 * 1. OUTER GLOW — Fresnel rim light visible from space (BackSide rendering)
 * 2. INNER HAZE — distance-based fog that tints terrain as camera approaches (FrontSide)
 *
 * The atmosphere color is determined by the planet's archetype and seed,
 * so every planet has a unique sky.
 *
 * Rayleigh-inspired scattering: blue sides, warm sun-facing edge.
 */

import * as THREE from 'three';

// ============================================================
// VERTEX SHADER (shared by both layers)
// ============================================================

export const atmosphereVertexShader = `
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

// ============================================================
// OUTER ATMOSPHERE — the "glow ring" seen from space
// ============================================================

export const outerAtmosphereFragmentShader = `
    uniform vec3 uAtmosColor;
    uniform vec3 uSunDirection;
    uniform float uIntensity;
    uniform float uFalloff;

    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;

    void main() {
        // Fresnel rim
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float fresnel = pow(rim, uFalloff) * uIntensity;

        // Sun-side brightness (Rayleigh-ish forward scatter)
        float sunDot = max(dot(vNormal, uSunDirection), 0.0);
        float sunGlow = pow(sunDot, 1.5) * 0.6;

        // Back-scatter (slight glow on dark side)
        float backScatter = pow(1.0 - sunDot, 3.0) * 0.05;

        // Color shift — brighter and warmer near sun
        vec3 warmShift = vec3(1.2, 1.05, 0.9);
        vec3 coolShift = vec3(0.8, 0.9, 1.2);
        vec3 scatter = uAtmosColor * mix(coolShift, warmShift, sunGlow);

        float alpha = clamp(fresnel + sunGlow * 0.3 + backScatter, 0.0, 1.0);
        gl_FragColor = vec4(scatter, alpha * 0.85);
    }
`;

// ============================================================
// INNER ATMOSPHERE — horizon haze visible as you get closer
// ============================================================

export const innerAtmosphereFragmentShader = `
    uniform vec3 uAtmosColor;
    uniform vec3 uSunDirection;
    uniform float uHazeStrength;

    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;

    void main() {
        // Limb-darkening haze
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float haze = pow(rim, 5.0) * uHazeStrength;

        // Sun scatter on horizon
        float sunDot = max(dot(vNormal, uSunDirection), 0.0);
        float horizonGlow = pow(sunDot, 3.0) * 0.2;

        // Warm golden light at sun-lit horizon
        vec3 hazeColor = mix(
            uAtmosColor * 0.8,
            vec3(1.0, 0.92, 0.8),
            horizonGlow
        );

        float alpha = haze + horizonGlow * 0.5;
        gl_FragColor = vec4(hazeColor, alpha);
    }
`;

// ============================================================
// ATMOSPHERE BUILDER
// ============================================================

/**
 * Create a complete two-layer atmosphere for a planet.
 *
 * @param {Object} options
 * @param {number[]} options.color - RGB atmosphere color [0-1, 0-1, 0-1]
 * @param {THREE.Vector3} options.sunDirection - Normalized sun direction
 * @param {number} [options.planetRadius=1] - Radius of the planet mesh
 * @param {number} [options.outerScale=1.12] - Scale of outer glow sphere
 * @param {number} [options.innerScale=1.03] - Scale of inner haze sphere
 * @param {number} [options.intensity=1.2] - Outer glow intensity
 * @param {number} [options.falloff=4.0] - Fresnel falloff exponent
 * @param {number} [options.hazeStrength=0.6] - Inner haze strength
 * @returns {{ outerMesh: THREE.Mesh, innerMesh: THREE.Mesh, update: Function }}
 */
export function createAtmosphere(options) {
    const {
        color = [0.3, 0.55, 0.9],
        sunDirection = new THREE.Vector3(1, 0.3, 0.5).normalize(),
        planetRadius = 1,
        outerScale = 1.12,
        innerScale = 1.03,
        intensity = 1.2,
        falloff = 4.0,
        hazeStrength = 0.6,
    } = options;

    const atmosColor = new THREE.Color(color[0], color[1], color[2]);
    const sunDir = sunDirection.clone().normalize();

    // Outer glow (BackSide, Additive)
    const outerGeo = new THREE.SphereGeometry(planetRadius * outerScale, 64, 64);
    const outerUniforms = {
        uAtmosColor: { value: atmosColor },
        uSunDirection: { value: sunDir },
        uIntensity: { value: intensity },
        uFalloff: { value: falloff },
    };
    const outerMat = new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: outerAtmosphereFragmentShader,
        uniforms: outerUniforms,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);

    // Inner haze (FrontSide, Normal)
    const innerGeo = new THREE.SphereGeometry(planetRadius * innerScale, 64, 64);
    const innerUniforms = {
        uAtmosColor: { value: atmosColor },
        uSunDirection: { value: sunDir },
        uHazeStrength: { value: hazeStrength },
    };
    const innerMat = new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: innerAtmosphereFragmentShader,
        uniforms: innerUniforms,
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false,
        blending: THREE.NormalBlending,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);

    return {
        outerMesh,
        innerMesh,
        uniforms: { outer: outerUniforms, inner: innerUniforms },

        /**
         * Update sun direction (e.g., as planet orbits).
         */
        setSunDirection(dir) {
            const normalized = dir.clone().normalize();
            outerUniforms.uSunDirection.value.copy(normalized);
            innerUniforms.uSunDirection.value.copy(normalized);
        },

        /**
         * Dispose GPU resources.
         */
        dispose() {
            outerGeo.dispose();
            outerMat.dispose();
            innerGeo.dispose();
            innerMat.dispose();
        }
    };
}
