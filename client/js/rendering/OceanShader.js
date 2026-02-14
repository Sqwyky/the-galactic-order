/**
 * THE GALACTIC ORDER - Ocean Shader
 *
 * Animated ocean with:
 * - Wave displacement (vertex shader)
 * - Sun specular reflection
 * - Depth-based color (shallow = lighter, deep = darker)
 * - Fresnel effect (more reflective at grazing angles)
 *
 * No textures needed — all math-driven, all from the seed.
 */

import * as THREE from 'three';

// ============================================================
// OCEAN VERTEX SHADER — wave animation
// ============================================================

export const oceanVertexShader = `
    uniform float uTime;
    uniform float uWaveHeight;
    uniform float uWaveFrequency;

    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;
    varying float vWaveHeight;

    void main() {
        vec3 pos = position;

        // Multi-octave wave displacement along normal
        vec3 norm = normalize(position);
        float wave1 = sin(pos.x * uWaveFrequency + uTime * 1.2) *
                       cos(pos.z * uWaveFrequency * 0.7 + uTime * 0.8);
        float wave2 = sin(pos.y * uWaveFrequency * 1.3 - uTime * 0.9) *
                       cos(pos.x * uWaveFrequency * 0.5 + uTime * 1.1);
        float wave3 = sin((pos.x + pos.z) * uWaveFrequency * 0.4 + uTime * 0.6) * 0.5;

        float totalWave = (wave1 + wave2 * 0.5 + wave3 * 0.3) * uWaveHeight;
        vWaveHeight = totalWave;

        pos += norm * totalWave;

        vNormal = normalize(normalMatrix * norm);
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        vViewDir = normalize(cameraPosition - worldPos.xyz);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

// ============================================================
// OCEAN FRAGMENT SHADER — color, reflection, Fresnel
// ============================================================

export const oceanFragmentShader = `
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform float uSpecularPower;
    uniform float uOpacity;

    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;
    varying float vWaveHeight;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewDir);

        // Fresnel effect (more reflective at edges)
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);

        // Depth-based color mixing
        float depthFactor = smoothstep(-0.003, 0.003, vWaveHeight);
        vec3 waterColor = mix(uDeepColor, uShallowColor, depthFactor * 0.5 + fresnel * 0.3);

        // Diffuse lighting
        float diffuse = max(dot(normal, uSunDirection), 0.0);
        waterColor *= 0.4 + diffuse * 0.6;

        // Specular sun reflection (Blinn-Phong)
        vec3 halfDir = normalize(uSunDirection + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), uSpecularPower);
        vec3 specular = uSunColor * spec * 1.5;

        // Sky reflection (simple)
        vec3 skyReflect = mix(
            vec3(0.1, 0.15, 0.3),
            vec3(0.4, 0.6, 0.9),
            fresnel
        );

        vec3 finalColor = waterColor + specular + skyReflect * fresnel * 0.3;

        float alpha = uOpacity + fresnel * 0.15;
        gl_FragColor = vec4(finalColor, alpha);
    }
`;

// ============================================================
// OCEAN BUILDER
// ============================================================

/**
 * Create an animated ocean sphere for a planet.
 *
 * @param {Object} options
 * @param {number} [options.radius=0.998] - Ocean sphere radius
 * @param {THREE.Vector3} [options.sunDirection] - Sun direction
 * @param {number[]} [options.deepColor] - Deep ocean RGB [0-1]
 * @param {number[]} [options.shallowColor] - Shallow water RGB [0-1]
 * @param {number} [options.waveHeight=0.002] - Wave displacement height
 * @param {number} [options.waveFrequency=8.0] - Wave frequency
 * @param {number} [options.opacity=0.92] - Base opacity
 * @returns {{ mesh: THREE.Mesh, update: Function, dispose: Function }}
 */
export function createOcean(options = {}) {
    const {
        radius = 0.998,
        sunDirection = new THREE.Vector3(1, 0.3, 0.5).normalize(),
        deepColor = [0.02, 0.06, 0.2],
        shallowColor = [0.05, 0.15, 0.35],
        sunColor = [1.0, 0.95, 0.85],
        waveHeight = 0.002,
        waveFrequency = 8.0,
        specularPower = 128.0,
        opacity = 0.92,
    } = options;

    const geo = new THREE.SphereGeometry(radius, 64, 64);

    const uniforms = {
        uTime: { value: 0 },
        uWaveHeight: { value: waveHeight },
        uWaveFrequency: { value: waveFrequency },
        uDeepColor: { value: new THREE.Color(...deepColor) },
        uShallowColor: { value: new THREE.Color(...shallowColor) },
        uSunDirection: { value: sunDirection.clone().normalize() },
        uSunColor: { value: new THREE.Color(...sunColor) },
        uSpecularPower: { value: specularPower },
        uOpacity: { value: opacity },
    };

    const mat = new THREE.ShaderMaterial({
        vertexShader: oceanVertexShader,
        fragmentShader: oceanFragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(geo, mat);

    return {
        mesh,
        uniforms,

        /**
         * Call every frame to animate waves.
         * @param {number} deltaTime - Seconds since last frame
         */
        update(deltaTime) {
            uniforms.uTime.value += deltaTime;
        },

        /**
         * Update sun direction.
         */
        setSunDirection(dir) {
            uniforms.uSunDirection.value.copy(dir.clone().normalize());
        },

        dispose() {
            geo.dispose();
            mat.dispose();
        }
    };
}
