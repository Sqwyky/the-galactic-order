/**
 * THE GALACTIC ORDER - Sky Dome
 *
 * NMS-style gradient sky: a huge inverted sphere with a vertical
 * color gradient from zenith to horizon. Replaces flat scene.background.
 *
 * Inspired by No Man's Sky's painterly, 70s sci-fi book cover skies:
 * deep saturated colors at the zenith fading through bands of warmth
 * into a hazy, atmospheric horizon.
 *
 * The dome uses a simple vertex shader that passes the vertical
 * position (y-normalized) to the fragment shader, which blends
 * between sky colors. A subtle sun glow is added near the horizon.
 *
 * Performance: Essentially free — 1 draw call, ~200 triangles,
 * no textures, rendered behind everything (depthWrite: false).
 */

import * as THREE from 'three';

// ============================================================
// SKY DOME
// ============================================================

export class SkyDome {
    /**
     * @param {Object} options
     * @param {THREE.Color} options.topColor - Zenith color (deep sky)
     * @param {THREE.Color} options.midColor - Mid-sky color
     * @param {THREE.Color} options.bottomColor - Horizon color
     * @param {THREE.Color} options.fogColor - Below-horizon / fog blend
     * @param {THREE.Vector3} [options.sunDirection] - Normalized sun direction
     * @param {THREE.Color} [options.sunColor] - Sun glow color
     */
    constructor(options = {}) {
        this.topColor = options.topColor || new THREE.Color(0x0a1a4a);
        this.midColor = options.midColor || new THREE.Color(0x3366aa);
        this.bottomColor = options.bottomColor || new THREE.Color(0x88aacc);
        this.fogColor = options.fogColor || new THREE.Color(0x88aacc);
        this.sunDirection = options.sunDirection || new THREE.Vector3(0.5, 0.3, 0.4).normalize();
        this.sunColor = options.sunColor || new THREE.Color(0xffeedd);

        this.mesh = null;
        this._build();
    }

    _build() {
        // Large sphere — rendered from inside (64x32 for smoother gradients)
        const geo = new THREE.SphereGeometry(2000, 64, 32);

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTopColor: { value: this.topColor },
                uMidColor: { value: this.midColor },
                uBottomColor: { value: this.bottomColor },
                uFogColor: { value: this.fogColor },
                uSunDirection: { value: this.sunDirection },
                uSunColor: { value: this.sunColor },
                uTime: { value: 0.0 },
            },
            vertexShader: /* glsl */ `
                varying vec3 vWorldPosition;
                varying vec3 vNormal;
                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                uniform vec3 uTopColor;
                uniform vec3 uMidColor;
                uniform vec3 uBottomColor;
                uniform vec3 uFogColor;
                uniform vec3 uSunDirection;
                uniform vec3 uSunColor;
                uniform float uTime;

                varying vec3 vWorldPosition;
                varying vec3 vNormal;

                // ---- Procedural noise for clouds ----
                // Simple hash-based noise (no texture needed)
                float hash(vec2 p) {
                    float h = dot(p, vec2(127.1, 311.7));
                    return fract(sin(h) * 43758.5453123);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f); // smoothstep

                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));

                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }

                // FBM (Fractal Brownian Motion) — 6 octaves for finer cloud detail
                float fbm(vec2 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    for (int i = 0; i < 6; i++) {
                        value += amplitude * noise(p);
                        p *= 2.0;
                        amplitude *= 0.5;
                    }
                    return value;
                }
                // ---- End noise ----

                void main() {
                    // Normalized height: 0 at horizon, 1 at zenith, <0 below horizon
                    vec3 dir = normalize(vWorldPosition - cameraPosition);
                    float h = dir.y;

                    // Sky gradient — 3-stop with smooth transitions
                    vec3 skyColor;
                    if (h > 0.3) {
                        float t = smoothstep(0.3, 0.9, h);
                        skyColor = mix(uMidColor, uTopColor, t);
                    } else if (h > 0.0) {
                        float t = smoothstep(0.0, 0.3, h);
                        skyColor = mix(uBottomColor, uMidColor, t);
                    } else {
                        float t = smoothstep(-0.15, 0.0, h);
                        skyColor = mix(uFogColor, uBottomColor, t);
                    }

                    // ---- Rayleigh Scattering Approximation ----
                    // Blue overhead, warm tones near sun at horizon
                    float scatterAngle = max(dot(dir, uSunDirection), 0.0);
                    vec3 rayleigh = vec3(0.3, 0.5, 0.9) * (1.0 - scatterAngle * 0.3);
                    skyColor = mix(skyColor, skyColor * rayleigh * 1.2, 0.25 * smoothstep(0.0, 0.6, h));

                    // ---- Procedural Clouds ----
                    // Project direction onto a flat plane for cloud UV
                    if (h > 0.02) {
                        vec2 cloudUV = dir.xz / (h + 0.1) * 0.8;

                        // Animate clouds drifting slowly
                        cloudUV += uTime * vec2(0.008, 0.003);

                        // Domain warping for more natural, swirly cloud shapes
                        vec2 warpedUV = cloudUV + fbm(cloudUV * 2.0) * 0.25;

                        // Multi-octave FBM cloud density with domain warping
                        float density = fbm(warpedUV * 3.0);
                        // Second layer for more detail
                        density += fbm(warpedUV * 7.0 + vec2(100.0)) * 0.3;

                        // Shape clouds: threshold to create fluffy patches
                        float cloudShape = smoothstep(0.45, 0.7, density);

                        // Clouds fade out at zenith and near horizon
                        float cloudFade = smoothstep(0.02, 0.15, h) * smoothstep(0.85, 0.4, h);
                        cloudShape *= cloudFade * 0.55;

                        // Cloud color: bright white on top, darker underneath
                        vec3 cloudBright = vec3(1.0, 0.98, 0.95);
                        vec3 cloudDark = uMidColor * 0.7;
                        // Fake lighting: clouds facing sun are brighter
                        float sunLight = max(dot(dir, uSunDirection), 0.0);
                        vec3 cloudColor = mix(cloudDark, cloudBright, 0.5 + sunLight * 0.5);

                        // Sun-tinted cloud edges (golden hour effect)
                        cloudColor = mix(cloudColor, uSunColor, sunLight * sunLight * 0.2);

                        skyColor = mix(skyColor, cloudColor, cloudShape);
                    }

                    // Sun glow — warm halo near the sun direction
                    float sunDot = max(dot(dir, uSunDirection), 0.0);

                    // Broad haze around sun
                    float sunHaze = pow(sunDot, 4.0) * 0.3;
                    // Tight sun disc
                    float sunDisc = pow(sunDot, 64.0) * 0.8;
                    // Very tight core
                    float sunCore = pow(sunDot, 256.0) * 1.5;

                    vec3 sunGlow = uSunColor * (sunHaze + sunDisc + sunCore);

                    // Horizon haze — warm glow at horizon line
                    float horizonHaze = 1.0 - abs(h);
                    horizonHaze = pow(horizonHaze, 6.0) * 0.15;
                    vec3 hazeColor = mix(uSunColor, uBottomColor, 0.5);

                    // Combine
                    vec3 finalColor = skyColor + sunGlow + hazeColor * horizonHaze;

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            side: THREE.BackSide, // Render inside of sphere
            depthWrite: false,
            fog: false,
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.renderOrder = -1000; // Render first (behind everything)
        this.material = mat;
    }

    /**
     * Add to scene.
     */
    addToScene(scene) {
        scene.add(this.mesh);
        // Remove flat background — sky dome replaces it
        scene.background = null;
    }

    /**
     * Follow the camera (sky dome is always centered on camera).
     */
    update(cameraPosition, time) {
        this.mesh.position.copy(cameraPosition);
        if (this.material.uniforms.uTime) {
            this.material.uniforms.uTime.value = time || 0;
        }
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}
