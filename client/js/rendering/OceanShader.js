/**
 * THE GALACTIC ORDER - Ocean Shader (Enhanced)
 *
 * Professional animated ocean with:
 * - 5-octave wave displacement (vertex shader)
 * - Foam/whitecaps at wave peaks
 * - Sun specular reflection (Blinn-Phong)
 * - Depth-based color (shallow = lighter, deep = darker)
 * - Fresnel effect (more reflective at grazing angles)
 * - Subsurface scattering hint (light passing through wave crests)
 * - Shore foam detection (where waves meet shallow areas)
 *
 * No textures needed — all math-driven.
 */

import * as THREE from 'three';

// ============================================================
// OCEAN VERTEX SHADER — enhanced wave animation
// ============================================================

export const oceanVertexShader = `
    uniform float uTime;
    uniform float uWaveHeight;
    uniform float uWaveFrequency;

    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;
    varying float vWaveHeight;
    varying float vWavePeak;

    void main() {
        vec3 pos = position;
        vec3 norm = normalize(position);

        // 5-octave wave displacement for realistic surface
        float freq = uWaveFrequency;
        float t = uTime;

        float wave1 = sin(pos.x * freq + t * 1.2) *
                       cos(pos.z * freq * 0.7 + t * 0.8);
        float wave2 = sin(pos.y * freq * 1.3 - t * 0.9) *
                       cos(pos.x * freq * 0.5 + t * 1.1);
        float wave3 = sin((pos.x + pos.z) * freq * 0.4 + t * 0.6) * 0.5;
        // Higher frequency detail waves
        float wave4 = sin(pos.x * freq * 2.3 + pos.z * freq * 1.7 + t * 1.8) * 0.25;
        float wave5 = cos(pos.y * freq * 3.1 - pos.x * freq * 0.9 - t * 2.2) * 0.12;

        float totalWave = (wave1 + wave2 * 0.5 + wave3 * 0.3 + wave4 + wave5) * uWaveHeight;
        vWaveHeight = totalWave;

        // Peak detection — how much this vertex is at a wave crest
        vWavePeak = smoothstep(uWaveHeight * 0.5, uWaveHeight * 1.0, totalWave);

        pos += norm * totalWave;

        // Compute perturbed normal for better specular
        float dx = (sin((pos.x + 0.01) * freq + t * 1.2) *
                    cos(pos.z * freq * 0.7 + t * 0.8) - wave1) / 0.01;
        float dz = (sin(pos.x * freq + t * 1.2) *
                    cos((pos.z + 0.01) * freq * 0.7 + t * 0.8) - wave1) / 0.01;
        vec3 perturbedNorm = normalize(norm + vec3(dx, 0.0, dz) * uWaveHeight * 3.0);

        vNormal = normalize(normalMatrix * perturbedNorm);
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        vViewDir = normalize(cameraPosition - worldPos.xyz);

        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

// ============================================================
// OCEAN FRAGMENT SHADER — enhanced with foam + subsurface
// ============================================================

export const oceanFragmentShader = `
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform float uSpecularPower;
    uniform float uOpacity;
    uniform float uTime;

    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;
    varying float vWaveHeight;
    varying float vWavePeak;

    // Simple hash for foam pattern
    float hash(vec2 p) {
        float h = dot(p, vec2(127.1, 311.7));
        return fract(sin(h) * 43758.5453123);
    }

    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewDir);

        // Fresnel effect (more reflective at grazing angles)
        float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.5);

        // Depth-based color mixing
        float depthFactor = smoothstep(-0.003, 0.003, vWaveHeight);
        vec3 waterColor = mix(uDeepColor, uShallowColor, depthFactor * 0.5 + fresnel * 0.3);

        // Subsurface scattering — light passing through wave crests
        float sss = pow(max(dot(viewDir, -uSunDirection), 0.0), 3.0) * vWavePeak;
        vec3 sssColor = vec3(0.05, 0.25, 0.2) * uSunColor;
        waterColor += sssColor * sss * 0.6;

        // Diffuse lighting
        float diffuse = max(dot(normal, uSunDirection), 0.0);
        waterColor *= 0.35 + diffuse * 0.65;

        // Specular sun reflection (Blinn-Phong)
        vec3 halfDir = normalize(uSunDirection + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), uSpecularPower);
        vec3 specular = uSunColor * spec * 1.8;

        // Secondary specular (broader, softer)
        float spec2 = pow(max(dot(normal, halfDir), 0.0), uSpecularPower * 0.15);
        specular += uSunColor * spec2 * 0.15;

        // Sky reflection
        vec3 skyReflect = mix(
            vec3(0.08, 0.12, 0.25),
            vec3(0.35, 0.55, 0.85),
            fresnel
        );

        // Foam / whitecaps at wave peaks
        vec2 foamUV = vWorldPos.xz * 8.0 + uTime * vec2(0.3, 0.2);
        float foamNoise = noise(foamUV) * 0.5 + noise(foamUV * 3.0) * 0.3 + noise(foamUV * 7.0) * 0.2;
        float foamMask = vWavePeak * smoothstep(0.35, 0.65, foamNoise);
        vec3 foamColor = vec3(0.9, 0.95, 1.0);
        // Foam is brighter in sunlight
        foamColor *= 0.7 + diffuse * 0.4;

        vec3 finalColor = waterColor + specular + skyReflect * fresnel * 0.35;
        finalColor = mix(finalColor, foamColor, foamMask * 0.5);

        float alpha = uOpacity + fresnel * 0.15;
        // Foam is more opaque
        alpha = mix(alpha, 1.0, foamMask * 0.3);

        gl_FragColor = vec4(finalColor, alpha);
    }
`;

// ============================================================
// OCEAN BUILDER
// ============================================================

/**
 * Create an animated ocean sphere for a planet.
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

        update(deltaTime) {
            uniforms.uTime.value += deltaTime;
        },

        setSunDirection(dir) {
            uniforms.uSunDirection.value.copy(dir.clone().normalize());
        },

        dispose() {
            geo.dispose();
            mat.dispose();
        }
    };
}
