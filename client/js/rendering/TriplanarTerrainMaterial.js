/**
 * THE GALACTIC ORDER - Triplanar PBR Terrain Material
 *
 * The single biggest visual upgrade: replaces flat vertex-colored terrain
 * with a physically-based triplanar-mapped surface featuring:
 *
 * 1. TRIPLANAR PROJECTION — projects procedural detail textures from X/Y/Z
 *    axes, eliminating UV stretching on cliffs and steep terrain.
 *
 * 2. PROCEDURAL NORMAL MAPS — generates per-pixel surface detail normals
 *    from multi-octave noise, giving terrain micro-relief (pebbles, cracks,
 *    ridges) without any texture memory.
 *
 * 3. PBR LIGHTING — full metalness/roughness workflow with:
 *    - Biome-driven roughness (wet marshes = low roughness, dry desert = high)
 *    - Slope-based rock blending (steep areas automatically become rocky)
 *    - Elevation-based snow/frost overlay
 *    - Subsurface scattering for grass/vegetation areas
 *
 * 4. DETAIL LAYERS — 3 procedural noise octaves at different scales:
 *    - Macro (terrain-scale color variation)
 *    - Meso (1m-scale rock/soil detail)
 *    - Micro (cm-scale surface texture, pebbles/grains)
 *
 * Performance: Single ShaderMaterial per chunk, all computation in fragment
 * shader. No texture lookups = zero VRAM for terrain textures.
 *
 * The returned material has public API methods attached for external control:
 * - setCloudShadowEnabled(bool) — toggle cloud shadows
 * - setCausticsEnabled(bool) — toggle water caustics
 * - setWetness(value) — set terrain wetness (0-1)
 * - setWeatherParams({wetness, cloudShadows, caustics}) — convenience
 */

import * as THREE from 'three';

// ============================================================
// TRIPLANAR TERRAIN MATERIAL
// ============================================================

/**
 * Create a triplanar PBR terrain material.
 *
 * @param {Object} options
 * @param {THREE.Color} options.fogColor
 * @param {number} options.fogDensity
 * @param {THREE.Vector3} options.sunDirection
 * @param {THREE.Color} options.sunColor
 * @param {THREE.Color} options.skyColor - For hemisphere ambient
 * @returns {THREE.ShaderMaterial}
 */
export function createTriplanarTerrainMaterial(options = {}) {
    const {
        fogColor = new THREE.Color(0x88aacc),
        fogDensity = 0.003,
        sunDirection = new THREE.Vector3(0.5, 0.3, 0.4).normalize(),
        sunColor = new THREE.Color(0xffeedd),
        skyColor = new THREE.Color(0x3366aa),
    } = options;

    const material = new THREE.ShaderMaterial({
        uniforms: {
            uFogColor: { value: fogColor },
            uFogDensity: { value: fogDensity },
            uSunDirection: { value: sunDirection },
            uSunColor: { value: sunColor },
            uSkyColor: { value: skyColor },
            uTime: { value: 0.0 },
            uDetailScale: { value: 1.0 },
            // Cloud shadows (Feature 4)
            uCloudShadowEnabled: { value: 1.0 },
            uCloudWindOffset: { value: new THREE.Vector2() },
            uCloudBase: { value: 80.0 },
            uCloudTop: { value: 200.0 },
            uCloudCoverage: { value: 0.45 },
            uCloudShadowStrength: { value: 0.35 },
            // Water caustics (Feature 5)
            uCausticsEnabled: { value: 1.0 },
            uWaterLevel: { value: 0.0 },
            uCausticsIntensity: { value: 0.3 },
            uCausticsScale: { value: 0.15 },
            uCausticsSpeed: { value: 0.8 },
            // Wetness (Feature 8 - Weather System)
            uWetness: { value: 0.0 },
        },
        vertexShader: TRIPLANAR_VERTEX,
        fragmentShader: TRIPLANAR_FRAGMENT,
        side: THREE.FrontSide,
        fog: false,
    });

    // ---- Public API methods (attached to material instance) ----

    /**
     * Enable or disable cloud shadows on terrain.
     * @param {boolean} enabled
     */
    material.setCloudShadowEnabled = function (enabled) {
        this.uniforms.uCloudShadowEnabled.value = enabled ? 1.0 : 0.0;
    };

    /**
     * Enable or disable water caustics on terrain.
     * @param {boolean} enabled
     */
    material.setCausticsEnabled = function (enabled) {
        this.uniforms.uCausticsEnabled.value = enabled ? 1.0 : 0.0;
    };

    /**
     * Set terrain wetness (0 = dry, 1 = fully wet).
     * Reduces roughness and darkens color.
     * @param {number} value
     */
    material.setWetness = function (value) {
        this.uniforms.uWetness.value = value;
    };

    /**
     * Set weather-driven parameters on the terrain material.
     * @param {Object} params
     * @param {number} [params.wetness] - Terrain wetness (0-1)
     * @param {boolean} [params.cloudShadows] - Enable cloud shadows
     * @param {boolean} [params.caustics] - Enable water caustics
     */
    material.setWeatherParams = function (params) {
        if (params.wetness !== undefined) this.setWetness(params.wetness);
        if (params.cloudShadows !== undefined) this.setCloudShadowEnabled(params.cloudShadows);
        if (params.caustics !== undefined) this.setCausticsEnabled(params.caustics);
    };

    return material;
}

// ============================================================
// VERTEX SHADER
// ============================================================

const TRIPLANAR_VERTEX = /* glsl */ `
    attribute vec3 color;

    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    varying vec3 vColor;
    varying float vFogDepth;
    varying float vElevation;
    varying float vSlope;

    void main() {
        // Vertex color from biome system (passed through for base tint)
        vColor = color;

        // World-space position and normal for triplanar mapping
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

        // Elevation (Y position) for snow/frost overlay
        vElevation = position.y;

        // Slope (how vertical the surface is) for rock blending
        vSlope = 1.0 - abs(dot(vWorldNormal, vec3(0.0, 1.0, 0.0)));

        // Fog depth
        vec4 mvPos = viewMatrix * worldPos;
        vFogDepth = length(mvPos.xyz);

        gl_Position = projectionMatrix * mvPos;
    }
`;

// ============================================================
// FRAGMENT SHADER
// ============================================================

const TRIPLANAR_FRAGMENT = /* glsl */ `
    precision highp float;

    uniform vec3 uFogColor;
    uniform float uFogDensity;
    uniform vec3 uSunDirection;
    uniform vec3 uSunColor;
    uniform vec3 uSkyColor;
    uniform float uTime;
    uniform float uDetailScale;
    // Cloud shadows
    uniform float uCloudShadowEnabled;
    uniform vec2 uCloudWindOffset;
    uniform float uCloudBase;
    uniform float uCloudTop;
    uniform float uCloudCoverage;
    uniform float uCloudShadowStrength;
    // Water caustics
    uniform float uCausticsEnabled;
    uniform float uWaterLevel;
    uniform float uCausticsIntensity;
    uniform float uCausticsScale;
    uniform float uCausticsSpeed;
    // Wetness
    uniform float uWetness;

    varying vec3 vWorldPosition;
    varying vec3 vWorldNormal;
    varying vec3 vColor;
    varying float vFogDepth;
    varying float vElevation;
    varying float vSlope;

    // ============================================================
    // NOISE FUNCTIONS (procedural, no textures)
    // ============================================================

    // Fast hash
    float hash(vec2 p) {
        float h = dot(p, vec2(127.1, 311.7));
        return fract(sin(h) * 43758.5453123);
    }

    float hash3(vec3 p) {
        float h = dot(p, vec3(127.1, 311.7, 74.7));
        return fract(sin(h) * 43758.5453123);
    }

    // Value noise 2D
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

    // Value noise 3D (for triplanar)
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

    // FBM 3D — multi-octave noise
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

    // ============================================================
    // TRIPLANAR MAPPING
    // ============================================================

    // Sample a procedural pattern using triplanar projection
    // Blends samples from XY, XZ, YZ planes weighted by surface normal
    float triplanarNoise(vec3 worldPos, vec3 worldNormal, float scale) {
        // Triplanar blend weights from world normal
        vec3 blendWeights = abs(worldNormal);
        // Sharpen the blend to reduce ugly transitions
        blendWeights = pow(blendWeights, vec3(4.0));
        blendWeights /= (blendWeights.x + blendWeights.y + blendWeights.z);

        vec3 p = worldPos * scale;

        // Sample noise from each axis plane
        float xy = noise2D(p.xy);
        float xz = noise2D(p.xz);
        float yz = noise2D(p.yz);

        // Blend
        return xy * blendWeights.z + xz * blendWeights.y + yz * blendWeights.x;
    }

    // Triplanar FBM for richer detail
    float triplanarFBM(vec3 worldPos, vec3 worldNormal, float scale, int octaves) {
        vec3 blendWeights = abs(worldNormal);
        blendWeights = pow(blendWeights, vec3(4.0));
        blendWeights /= (blendWeights.x + blendWeights.y + blendWeights.z);

        vec3 p = worldPos * scale;
        float value = 0.0;
        float amp = 0.5;
        float freq = 1.0;

        for (int i = 0; i < 5; i++) {
            if (i >= octaves) break;
            float xy = noise2D(p.xy * freq);
            float xz = noise2D(p.xz * freq);
            float yz = noise2D(p.yz * freq);
            float sample = xy * blendWeights.z + xz * blendWeights.y + yz * blendWeights.x;
            value += amp * sample;
            freq *= 2.13;
            amp *= 0.49;
        }
        return value;
    }

    // ============================================================
    // PROCEDURAL NORMAL MAP (triplanar)
    // ============================================================

    // Compute normal perturbation from procedural noise
    // Uses central differences to estimate surface gradient
    vec3 triplanarNormal(vec3 worldPos, vec3 worldNormal, float scale, float strength) {
        float eps = 0.05 / scale; // Epsilon for finite difference

        // Sample noise at offset positions
        float center = triplanarFBM(worldPos, worldNormal, scale, 4);
        float dx = triplanarFBM(worldPos + vec3(eps, 0.0, 0.0), worldNormal, scale, 4);
        float dz = triplanarFBM(worldPos + vec3(0.0, 0.0, eps), worldNormal, scale, 4);

        // Gradient
        float gradX = (dx - center) / eps;
        float gradZ = (dz - center) / eps;

        // Perturb normal
        vec3 tangent = normalize(cross(worldNormal, vec3(0.0, 0.0, 1.0)));
        if (length(tangent) < 0.01) tangent = normalize(cross(worldNormal, vec3(1.0, 0.0, 0.0)));
        vec3 bitangent = normalize(cross(worldNormal, tangent));

        vec3 perturbedNormal = normalize(
            worldNormal +
            tangent * (-gradX * strength) +
            bitangent * (-gradZ * strength)
        );

        return perturbedNormal;
    }

    // ============================================================
    // PBR LIGHTING (simplified but physically correct)
    // ============================================================

    // GGX normal distribution function
    float distributionGGX(vec3 N, vec3 H, float roughness) {
        float a = roughness * roughness;
        float a2 = a * a;
        float NdotH = max(dot(N, H), 0.0);
        float NdotH2 = NdotH * NdotH;
        float denom = NdotH2 * (a2 - 1.0) + 1.0;
        return a2 / (3.14159265 * denom * denom);
    }

    // Schlick-GGX geometry function
    float geometrySchlickGGX(float NdotV, float roughness) {
        float r = roughness + 1.0;
        float k = (r * r) / 8.0;
        return NdotV / (NdotV * (1.0 - k) + k);
    }

    float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
        float NdotV = max(dot(N, V), 0.0);
        float NdotL = max(dot(N, L), 0.0);
        return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
    }

    // Fresnel-Schlick approximation
    vec3 fresnelSchlick(float cosTheta, vec3 F0) {
        return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
    }

    // ============================================================
    // CLOUD SHADOWS (Feature 4)
    // ============================================================

    float sampleCloudShadow(vec3 worldPos) {
        if (uCloudShadowEnabled < 0.5) return 0.0;

        // Project fragment XZ to cloud midplane altitude
        float cloudMid = (uCloudBase + uCloudTop) * 0.5;
        vec2 cloudUV = worldPos.xz * 0.002 + uCloudWindOffset * 0.002;

        // Simplified 3-octave FBM (cheaper than volumetric 5-octave)
        float density = 0.0;
        float amp = 0.5;
        float freq = 1.0;
        for (int i = 0; i < 3; i++) {
            density += amp * noise2D(cloudUV * freq * 400.0);
            freq *= 2.17;
            amp *= 0.47;
        }

        // Apply coverage threshold
        density = smoothstep(1.0 - uCloudCoverage, 1.0 - uCloudCoverage + 0.3, density);
        return density;
    }

    // ============================================================
    // WATER CAUSTICS (Feature 5)
    // ============================================================

    float causticPattern(vec2 uv, float time) {
        // Two animated noise layers at different rotations
        float s = sin(0.5236); // ~30 degrees
        float c = cos(0.5236);

        vec2 uv1 = uv * 1.0;
        vec2 uv2 = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) * 1.3;

        // Animate each layer at different speeds
        float layer1 = noise2D(uv1 + vec2(time * 0.3, time * 0.2));
        float layer2 = noise2D(uv2 + vec2(-time * 0.25, time * 0.35));

        // Intersect layers to create web pattern
        float pattern = max(layer1, layer2);
        pattern = smoothstep(0.45, 0.65, pattern);

        return pattern;
    }

    // ============================================================
    // MAIN
    // ============================================================

    void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPosition);
        vec3 L = normalize(uSunDirection);
        vec3 H = normalize(V + L);

        // ---- TRIPLANAR DETAIL LAYERS ----

        // Macro detail — large-scale terrain variation (5m scale)
        float macroDetail = triplanarFBM(vWorldPosition, N, 0.08 * uDetailScale, 3);

        // Meso detail — rock/soil texture (0.5m scale)
        float mesoDetail = triplanarFBM(vWorldPosition, N, 0.5 * uDetailScale, 4);

        // Micro detail — fine grain/pebbles (5cm scale)
        float microDetail = triplanarNoise(vWorldPosition, N, 3.0 * uDetailScale);

        // ---- PROCEDURAL NORMAL MAP ----
        // Multi-scale normal perturbation for micro-relief

        // Medium-frequency normals (rock cracks, soil ridges)
        vec3 mesoNormal = triplanarNormal(vWorldPosition, N, 0.8 * uDetailScale, 0.6);

        // High-frequency normals (pebbles, grain) — subtle
        vec3 microNormal = triplanarNormal(vWorldPosition, N, 4.0 * uDetailScale, 0.25);

        // Blend normals (meso dominates, micro adds fine detail)
        vec3 detailNormal = normalize(mesoNormal + (microNormal - N) * 0.4);

        // On steep slopes, use stronger normal perturbation (more rocky)
        float slopeBlend = smoothstep(0.3, 0.7, vSlope);
        vec3 rockNormal = triplanarNormal(vWorldPosition, N, 1.5 * uDetailScale, 1.2);
        vec3 finalNormal = normalize(mix(detailNormal, rockNormal, slopeBlend));

        // ---- BASE COLOR (from biome vertex colors + detail modulation) ----
        vec3 baseColor = vColor;

        // Modulate base color with detail layers for painterly variation
        float colorVariation = macroDetail * 0.15 + mesoDetail * 0.08 + microDetail * 0.04;
        baseColor *= (0.88 + colorVariation * 0.24);

        // Slope-based rock blending — steep areas become rocky
        vec3 rockColor = baseColor * vec3(0.75, 0.72, 0.68); // Desaturated, slightly warm
        rockColor *= (0.8 + mesoDetail * 0.4); // Rock has more visible texture
        baseColor = mix(baseColor, rockColor, slopeBlend * 0.7);

        // Elevation-based frost overlay (high altitude)
        float frostFactor = smoothstep(12.0, 18.0, vElevation) * (1.0 - slopeBlend * 0.5);
        vec3 frostColor = vec3(0.85, 0.88, 0.95) * (0.9 + microDetail * 0.2);
        baseColor = mix(baseColor, frostColor, frostFactor * 0.6);

        // Valley darkening (fake AO for low areas)
        float valleyDarken = smoothstep(2.0, 0.0, vElevation) * 0.15;
        baseColor *= (1.0 - valleyDarken);

        // ---- PBR MATERIAL PROPERTIES ----
        // Roughness varies by terrain type
        float baseRoughness = 0.85;
        // Rock is rougher
        baseRoughness = mix(baseRoughness, 0.95, slopeBlend);
        // Wet areas are smoother (valleys, near water)
        float wetFactor = smoothstep(1.0, -0.5, vElevation);
        baseRoughness = mix(baseRoughness, 0.35, wetFactor * 0.5);
        // Frost is smooth
        baseRoughness = mix(baseRoughness, 0.4, frostFactor * 0.4);
        // Micro roughness variation
        baseRoughness += (microDetail - 0.5) * 0.1;
        // Wetness reduces roughness and darkens surface (Weather System)
        baseRoughness -= uWetness * 0.4;
        baseRoughness = clamp(baseRoughness, 0.15, 1.0);
        baseColor *= (1.0 - uWetness * 0.15);

        float metalness = 0.02; // Terrain is non-metallic
        // Wet rock gets slightly more reflective
        metalness = mix(metalness, 0.08, wetFactor * slopeBlend);

        // ---- PBR DIRECT LIGHTING (Cook-Torrance BRDF) ----
        vec3 F0 = mix(vec3(0.04), baseColor, metalness);

        float NdotL = max(dot(finalNormal, L), 0.0);
        float NdotV = max(dot(finalNormal, V), 0.001);

        // Specular BRDF
        float D = distributionGGX(finalNormal, H, baseRoughness);
        float G = geometrySmith(finalNormal, V, L, baseRoughness);
        vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

        vec3 numerator = D * G * F;
        float denominator = 4.0 * NdotV * NdotL + 0.0001;
        vec3 specular = numerator / denominator;

        // Diffuse (energy conservation)
        vec3 kD = (vec3(1.0) - F) * (1.0 - metalness);
        vec3 diffuse = kD * baseColor / 3.14159265;

        vec3 directLight = (diffuse + specular) * uSunColor * NdotL * 2.5;

        // ---- CLOUD SHADOWS (Feature 4) ----
        float cloudShadow = sampleCloudShadow(vWorldPosition);
        directLight *= (1.0 - cloudShadow * uCloudShadowStrength);

        // ---- WATER CAUSTICS (Feature 5) ----
        if (uCausticsEnabled > 0.5 && vWorldPosition.y < uWaterLevel + 2.0) {
            float depthBelow = uWaterLevel - vWorldPosition.y;
            float causticFade = smoothstep(-0.5, 3.0, depthBelow) * smoothstep(12.0, 4.0, depthBelow);
            float caustics = causticPattern(
                vWorldPosition.xz * uCausticsScale,
                uTime * uCausticsSpeed
            );
            directLight += uSunColor * caustics * uCausticsIntensity * causticFade;
        }

        // ---- AMBIENT LIGHTING (hemisphere) ----
        float upFactor = dot(finalNormal, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
        vec3 ambientSky = uSkyColor * 0.3;
        vec3 ambientGround = vec3(0.08, 0.06, 0.04);
        vec3 ambient = mix(ambientGround, ambientSky, upFactor) * baseColor;

        // Ambient occlusion from detail noise (cheap fake AO)
        float ao = 0.7 + mesoDetail * 0.3;
        ao *= (1.0 - slopeBlend * 0.15); // Crevices in rock are darker
        ambient *= ao;

        // ---- SUBSURFACE SCATTERING (for grassy/vegetated areas) ----
        // When looking through thin vegetation, light passes through
        float sss = pow(max(dot(V, -L), 0.0), 4.0);
        float vegetationFactor = (1.0 - slopeBlend) * (1.0 - frostFactor) * smoothstep(0.5, 3.0, vElevation);
        vec3 sssColor = baseColor * vec3(1.3, 1.1, 0.8) * sss * vegetationFactor * 0.15;

        // ---- COMBINE ----
        vec3 color = directLight + ambient + sssColor;

        // ---- FOG ----
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
        fogFactor = clamp(fogFactor, 0.0, 1.0);
        color = mix(color, uFogColor, fogFactor);

        gl_FragColor = vec4(color, 1.0);
    }
`;
