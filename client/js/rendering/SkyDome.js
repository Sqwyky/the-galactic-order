/**
 * THE GALACTIC ORDER - Sky Dome (Enhanced)
 *
 * NMS-quality procedural sky with:
 * - 3-stop gradient sky (zenith → mid → horizon → fog)
 * - 7-octave FBM procedural clouds with sun-lit edges
 * - Multi-layer sun glow with lens flare rings
 * - Procedural starfield visible through thin sky
 * - Atmospheric Rayleigh scattering at horizon
 * - Animated cloud drift
 *
 * Performance: 1 draw call, ~200 triangles, no textures.
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
        const geo = new THREE.SphereGeometry(2000, 32, 20);

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

                // ---- Noise functions ----
                float hash(vec2 p) {
                    float h = dot(p, vec2(127.1, 311.7));
                    return fract(sin(h) * 43758.5453123);
                }

                float hash3(vec3 p) {
                    float h = dot(p, vec3(127.1, 311.7, 74.7));
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

                // 7-octave FBM — richer cloud detail
                float fbm(vec2 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    float frequency = 1.0;
                    for (int i = 0; i < 7; i++) {
                        value += amplitude * noise(p * frequency);
                        frequency *= 2.1;
                        amplitude *= 0.48;
                    }
                    return value;
                }

                // ---- Starfield ----
                float starField(vec3 dir) {
                    // Use direction as 3D hash seed for consistent star positions
                    vec3 cell = floor(dir * 120.0);
                    float star = hash3(cell);
                    // Only ~2% of cells are stars
                    float threshold = 0.98;
                    if (star < threshold) return 0.0;
                    // Brightness variation
                    float brightness = (star - threshold) / (1.0 - threshold);
                    brightness = pow(brightness, 0.5);
                    // Twinkle
                    float twinkle = sin(uTime * 2.0 + star * 100.0) * 0.3 + 0.7;
                    return brightness * twinkle;
                }

                void main() {
                    vec3 dir = normalize(vWorldPosition - cameraPosition);
                    float h = dir.y;

                    // ---- Sky gradient — 3-stop with smooth transitions ----
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

                    // ---- Stars — visible where sky is dark (high altitude) ----
                    if (h > 0.1) {
                        float skyLuma = dot(skyColor, vec3(0.299, 0.587, 0.114));
                        // Stars are more visible in darker skies
                        float starVisibility = smoothstep(0.35, 0.08, skyLuma) * smoothstep(0.1, 0.35, h);
                        float stars = starField(dir);
                        // Colorize stars slightly
                        vec3 starColor = mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.95, 0.85), hash(dir.xz * 50.0));
                        skyColor += starColor * stars * starVisibility * 0.6;
                    }

                    // ---- Procedural Clouds (enhanced) ----
                    if (h > 0.02) {
                        vec2 cloudUV = dir.xz / (h + 0.1) * 0.8;
                        cloudUV += uTime * vec2(0.008, 0.003);

                        // Multi-octave FBM cloud density (7 octaves for rich detail)
                        float density = fbm(cloudUV * 3.0);
                        // Second layer — different offset for detail variation
                        density += fbm(cloudUV * 7.0 + vec2(100.0, 50.0)) * 0.3;
                        // Third layer — high-frequency wisps
                        density += fbm(cloudUV * 15.0 + vec2(-50.0, 200.0)) * 0.1;

                        // Shape clouds: threshold to create fluffy patches
                        float cloudShape = smoothstep(0.42, 0.68, density);

                        // Clouds fade out at zenith and near horizon
                        float cloudFade = smoothstep(0.02, 0.12, h) * smoothstep(0.85, 0.35, h);
                        cloudShape *= cloudFade * 0.55;

                        // Cloud lighting: sun-facing edges are bright, shadows underneath
                        float sunLight = max(dot(dir, uSunDirection), 0.0);
                        vec3 cloudBright = vec3(1.0, 0.98, 0.95);
                        vec3 cloudDark = uMidColor * 0.55;
                        vec3 cloudColor = mix(cloudDark, cloudBright, 0.4 + sunLight * 0.6);

                        // Sun-tinted cloud edges (golden hour effect — stronger)
                        cloudColor = mix(cloudColor, uSunColor * 1.1, sunLight * sunLight * 0.3);

                        // Cloud self-shadowing hint — darker on bottom using density gradient
                        float shadowHint = fbm(cloudUV * 3.0 + vec2(0.1, 0.15));
                        cloudColor *= mix(0.8, 1.0, shadowHint);

                        skyColor = mix(skyColor, cloudColor, cloudShape);
                    }

                    // ---- Sun glow — multi-layer with lens flare rings ----
                    float sunDot = max(dot(dir, uSunDirection), 0.0);

                    // Broad atmospheric haze
                    float sunHaze = pow(sunDot, 3.0) * 0.35;
                    // Medium glow
                    float sunGlow = pow(sunDot, 16.0) * 0.5;
                    // Tight sun disc
                    float sunDisc = pow(sunDot, 64.0) * 0.9;
                    // Very tight core
                    float sunCore = pow(sunDot, 256.0) * 1.8;

                    // Lens flare ring — concentric ring artifact
                    float ringDist = abs(sunDot - 0.92);
                    float lensRing = exp(-ringDist * 400.0) * 0.15;
                    float ringDist2 = abs(sunDot - 0.85);
                    float lensRing2 = exp(-ringDist2 * 200.0) * 0.08;

                    vec3 sunTotal = uSunColor * (sunHaze + sunGlow + sunDisc + sunCore + lensRing + lensRing2);

                    // ---- Horizon atmospheric scattering ----
                    // Rayleigh-like bluing at horizon + sunset reddening
                    float horizonHaze = 1.0 - abs(h);
                    horizonHaze = pow(horizonHaze, 5.0) * 0.2;
                    vec3 hazeColor = mix(uSunColor, uBottomColor, 0.4);
                    // Redden at sunset angles (sun near horizon)
                    float sunAltitude = uSunDirection.y;
                    vec3 sunsetTint = mix(vec3(1.0, 0.4, 0.2), hazeColor, smoothstep(-0.1, 0.4, sunAltitude));
                    hazeColor = mix(hazeColor, sunsetTint, 0.3);

                    // Combine
                    vec3 finalColor = skyColor + sunTotal + hazeColor * horizonHaze;

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
        });

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.renderOrder = -1000;
        this.material = mat;
    }

    addToScene(scene) {
        scene.add(this.mesh);
        scene.background = null;
    }

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
