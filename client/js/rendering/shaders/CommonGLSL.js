/**
 * THE GALACTIC ORDER - Shared GLSL Shader Utilities
 *
 * Centralized GLSL code snippets shared across all post-processing passes.
 * Eliminates duplication of depth reconstruction, world position recovery,
 * screen projection, and noise functions.
 *
 * Usage:
 *   import { GLSL_DEPTH, GLSL_NOISE_2D, GLSL_PROJECT } from './shaders/CommonGLSL.js';
 *
 *   const fragmentShader = `
 *       ${GLSL_DEPTH}
 *       ${GLSL_PROJECT}
 *       void main() { ... }
 *   `;
 *
 * Each snippet declares uniforms it depends on. Passes must provide
 * matching uniforms (tDepth, uCameraNear, uCameraFar, etc.). Duplicate
 * uniform declarations are harmless in GLSL — the compiler deduplicates.
 *
 * Modules:
 *   GLSL_DEPTH      - getLinearDepth(), getWorldPosition()
 *   GLSL_PROJECT    - projectToScreen()
 *   GLSL_NOISE_2D   - hash(), noise2D()
 *   GLSL_NOISE_3D   - hash3(), noise3D(), fbm3D()
 *   GLSL_FBM_CLOUD  - sampleCloudDensitySimple() (3-octave FBM for cloud shadows/occlusion)
 */

// ============================================================
// DEPTH RECONSTRUCTION
// Requires uniforms: tDepth, uCameraNear, uCameraFar,
//                    uInverseProjection, uInverseView
// ============================================================

export const GLSL_DEPTH = /* glsl */ `
    // ---- Shared: Depth Reconstruction (CommonGLSL) ----
    float getLinearDepth(vec2 uv) {
        float fragDepth = texture2D(tDepth, uv).x;
        return (uCameraNear * uCameraFar) /
            (uCameraFar - fragDepth * (uCameraFar - uCameraNear));
    }

    vec3 getWorldPosition(vec2 uv) {
        float depth = texture2D(tDepth, uv).x;
        vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 viewPos = uInverseProjection * ndc;
        viewPos /= viewPos.w;
        vec4 worldPos = uInverseView * viewPos;
        return worldPos.xyz;
    }
`;

// ============================================================
// SCREEN PROJECTION
// Requires uniforms: uViewMatrix, uProjectionMatrix
// ============================================================

export const GLSL_PROJECT = /* glsl */ `
    // ---- Shared: Screen Projection (CommonGLSL) ----
    vec2 projectToScreen(vec3 worldPos) {
        vec4 viewPos = uViewMatrix * vec4(worldPos, 1.0);
        vec4 clipPos = uProjectionMatrix * viewPos;
        vec2 ndc = clipPos.xy / clipPos.w;
        return ndc * 0.5 + 0.5;
    }
`;

// ============================================================
// 2D NOISE
// No uniform requirements (pure math)
// ============================================================

export const GLSL_NOISE_2D = /* glsl */ `
    // ---- Shared: 2D Noise (CommonGLSL) ----
    float hash(vec2 p) {
        float h = dot(p, vec2(127.1, 311.7));
        return fract(sin(h) * 43758.5453123);
    }

    float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
`;

// ============================================================
// 3D NOISE + FBM
// No uniform requirements (pure math)
// ============================================================

export const GLSL_NOISE_3D = /* glsl */ `
    // ---- Shared: 3D Noise (CommonGLSL) ----
    float hash3(vec3 p) {
        float h = dot(p, vec3(127.1, 311.7, 74.7));
        return fract(sin(h) * 43758.5453123);
    }

    float noise3D(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float n000 = hash3(i);
        float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash3(i + vec3(1.0, 1.0, 1.0));

        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);

        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);

        return mix(nxy0, nxy1, f.z);
    }

    float fbm3D(vec3 p, int octaves) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        for (int i = 0; i < 6; i++) {
            if (i >= octaves) break;
            value += amplitude * noise3D(p * frequency);
            frequency *= 2.17;
            amplitude *= 0.47;
        }
        return value;
    }
`;

// ============================================================
// CLOUD DENSITY (simplified 3-octave for shadows/occlusion)
// Requires: GLSL_NOISE_2D + uniforms uCloudCoverage
// ============================================================

export const GLSL_FBM_CLOUD = /* glsl */ `
    // ---- Shared: Cloud Density Sampling (CommonGLSL) ----
    float sampleCloudDensitySimple(vec2 cloudUV) {
        float density = 0.0;
        float amp = 0.5;
        float freq = 1.0;
        for (int i = 0; i < 3; i++) {
            density += amp * noise2D(cloudUV * freq * 400.0);
            freq *= 2.17;
            amp *= 0.47;
        }
        return smoothstep(1.0 - uCloudCoverage, 1.0 - uCloudCoverage + 0.3, density);
    }
`;
