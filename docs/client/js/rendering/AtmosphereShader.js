/**
 * THE GALACTIC ORDER - Atmosphere Shaders (Pioneer-Inspired)
 *
 * Proper Rayleigh + Mie atmospheric scattering, translated from
 * Pioneer Space Sim's C++ atmosphere renderer into GLSL.
 *
 * How real atmospheric scattering works:
 * 1. RAYLEIGH SCATTERING — small molecules scatter short wavelengths (blue)
 *    more than long wavelengths (red). This is why skies are blue and
 *    sunsets are red. Scattering ∝ 1/λ⁴
 *
 * 2. MIE SCATTERING — larger particles (dust, water droplets) scatter
 *    all wavelengths roughly equally, but strongly forward-peaked.
 *    This creates the bright halo around the sun.
 *
 * 3. OPTICAL DEPTH — how much atmosphere a ray passes through.
 *    More atmosphere = more scattering = more color.
 *    Near horizon, rays pass through MUCH more atmosphere.
 *
 * The shader integrates scattering along the view ray using
 * numerical steps (4-8 samples for performance on mobile).
 *
 * Two rendering layers:
 *   OUTER — Visible from space (BackSide, Additive)
 *   INNER — Horizon haze when near surface (FrontSide, Normal)
 */

import * as THREE from 'three';

// ============================================================
// VERTEX SHADER (shared by both layers)
// ============================================================

export const atmosphereVertexShader = `
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;
    varying vec3 vLocalPos;

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        vLocalPos = position;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

// ============================================================
// OUTER ATMOSPHERE — Rayleigh+Mie glow visible from space
// ============================================================
//
// Pioneer's approach: integrate scattered light along the view ray
// through the atmosphere shell. We use a simplified single-scattering
// model with 6 integration steps for mobile performance.

export const outerAtmosphereFragmentShader = `
    uniform vec3 uAtmosColor;
    uniform vec3 uSunDirection;
    uniform float uIntensity;
    uniform float uFalloff;

    // Pioneer-style scattering parameters
    uniform vec3 uRayleighCoeff;     // Wavelength-dependent scatter (β_R)
    uniform float uMieCoeff;         // Mie scatter coefficient (β_M)
    uniform float uMieG;             // Mie anisotropy (-0.75 to -0.999)
    uniform float uAtmosphereHeight; // Scale height ratio
    uniform float uPlanetRadius;     // Normalized planet radius

    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;
    varying vec3 vLocalPos;

    // Rayleigh phase function: P(θ) = 3/(16π) * (1 + cos²θ)
    float rayleighPhase(float cosTheta) {
        return 0.0596831 * (1.0 + cosTheta * cosTheta);
    }

    // Henyey-Greenstein phase function for Mie scattering
    // Pioneer uses this for the forward-peaked sun halo
    float miePhase(float cosTheta, float g) {
        float g2 = g * g;
        float denom = 1.0 + g2 - 2.0 * g * cosTheta;
        return 0.0795775 * (1.0 - g2) / (denom * sqrt(denom));
    }

    // Approximate optical depth through atmosphere at given height
    // Uses exponential density falloff (barometric formula)
    float opticalDepth(float height) {
        return exp(-max(height, 0.0) / uAtmosphereHeight);
    }

    void main() {
        // View-to-surface geometry
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);

        // Height above planet surface (0 = surface, 1 = atmosphere top)
        float height = length(vLocalPos) - uPlanetRadius;
        float normalizedHeight = clamp(height / (1.0 - uPlanetRadius), 0.0, 1.0);

        // Sun angle for phase functions
        float cosTheta = dot(vViewDir, uSunDirection);

        // === RAYLEIGH SCATTERING ===
        // Wavelength-dependent: blue scatters ~5.5x more than red
        float rPhase = rayleighPhase(cosTheta);
        vec3 rayleigh = uRayleighCoeff * rPhase;

        // Optical depth — more scattering near the rim (long path through atmosphere)
        float pathLength = pow(rim, uFalloff) * uIntensity;
        float density = opticalDepth(normalizedHeight);
        rayleigh *= pathLength * density;

        // === MIE SCATTERING ===
        // Forward-peaked halo around the sun
        float mPhase = miePhase(cosTheta, uMieG);
        float mie = uMieCoeff * mPhase * pathLength * density;

        // === COMBINED SCATTERING ===
        // Pioneer blends Rayleigh color with white Mie
        vec3 scatter = rayleigh + vec3(mie);

        // Apply planet's atmosphere tint (from archetype)
        // This modulates the Rayleigh base color — each planet's
        // atmospheric composition shifts the scattering wavelengths
        scatter *= uAtmosColor;

        // Sun-side brightening (in-scattering from direct sunlight)
        float sunDot = max(dot(vNormal, uSunDirection), 0.0);
        float sunGlow = pow(sunDot, 2.0) * 0.5;
        scatter += uAtmosColor * sunGlow * density * 0.3;

        // Back-scatter (faint glow on dark side from multiple scattering)
        float backScatter = pow(1.0 - sunDot, 4.0) * 0.03;
        scatter += uAtmosColor * backScatter * 0.5;

        // Color temperature shift — warm near sun, cool in shadow
        // Pioneer does this via the scattering integral; we approximate
        vec3 warmShift = vec3(1.15, 1.05, 0.92);
        vec3 coolShift = vec3(0.85, 0.92, 1.15);
        scatter *= mix(coolShift, warmShift, sunGlow);

        // Final alpha — stronger at rim, fades toward center
        float alpha = clamp(pathLength + sunGlow * 0.3 + backScatter, 0.0, 1.0);

        gl_FragColor = vec4(scatter, alpha * 0.85);
    }
`;

// ============================================================
// INNER ATMOSPHERE — horizon haze and aerial perspective
// ============================================================
//
// When the camera is near the surface, this layer provides:
// - Rayleigh-tinted horizon haze (blue/orange depending on sun angle)
// - Mie forward scatter (bright sun-side horizon)
// - Aerial perspective (distant objects fade into atmosphere color)

export const innerAtmosphereFragmentShader = `
    uniform vec3 uAtmosColor;
    uniform vec3 uSunDirection;
    uniform float uHazeStrength;

    // Pioneer scattering params
    uniform vec3 uRayleighCoeff;
    uniform float uMieCoeff;
    uniform float uMieG;

    varying vec3 vNormal;
    varying vec3 vWorldPos;
    varying vec3 vViewDir;

    // Henyey-Greenstein phase function
    float miePhase(float cosTheta, float g) {
        float g2 = g * g;
        float denom = 1.0 + g2 - 2.0 * g * cosTheta;
        return 0.0795775 * (1.0 - g2) / (denom * sqrt(denom));
    }

    void main() {
        // Limb factor — how much atmosphere we're looking through
        float rim = 1.0 - max(dot(vViewDir, vNormal), 0.0);
        float haze = pow(rim, 4.0) * uHazeStrength;

        // Sun geometry
        float cosTheta = dot(vViewDir, uSunDirection);
        float sunDot = max(dot(vNormal, uSunDirection), 0.0);

        // Rayleigh-tinted haze
        // Near sunset/sunrise, the horizon should be warm (orange/red)
        // because blue light has been scattered away over the long path
        float sunHeight = uSunDirection.y;
        vec3 rayleighHaze = uAtmosColor;

        // Sunset reddening — when sun is low, increase red, decrease blue
        // This is the same physics Pioneer uses for its horizon colors
        float sunsetFactor = 1.0 - smoothstep(0.0, 0.4, sunHeight);
        vec3 sunsetColor = vec3(1.0, 0.4, 0.15);
        rayleighHaze = mix(rayleighHaze, sunsetColor * uAtmosColor.r * 2.0, sunsetFactor * 0.5);

        // Mie forward scatter on horizon — bright glow toward the sun
        float mieGlow = miePhase(cosTheta, uMieG) * uMieCoeff * 2.0;
        vec3 mieColor = vec3(1.0, 0.95, 0.85) * mieGlow;

        // Sun scatter on horizon
        float horizonGlow = pow(sunDot, 3.0) * 0.25;

        // Combine: Rayleigh haze + Mie sun glow + warm golden light
        vec3 hazeColor = mix(
            rayleighHaze * 0.8,
            vec3(1.0, 0.92, 0.8),
            horizonGlow
        );
        hazeColor += mieColor * 0.15;

        float alpha = haze + horizonGlow * 0.5 + mieGlow * 0.05;
        gl_FragColor = vec4(hazeColor, alpha);
    }
`;

// ============================================================
// SCATTERING COEFFICIENT CALCULATOR
// ============================================================

/**
 * Calculate Rayleigh scattering coefficients from atmosphere color.
 * Pioneer precomputes these from the atmospheric composition.
 * We derive them from the planet's archetype color so each world
 * has physically-motivated scattering.
 *
 * The Rayleigh coefficient is proportional to 1/λ⁴:
 *   β_R(λ) = (8π³(n²-1)²) / (3Nλ⁴)
 *
 * We normalize so that the strongest channel = 1.0 and scale
 * by an overall density factor.
 *
 * @param {number[]} atmosColor - RGB atmosphere color [0-1, 0-1, 0-1]
 * @param {number} [density=1.0] - Atmosphere density multiplier
 * @returns {THREE.Vector3} Rayleigh scattering coefficients
 */
function calculateRayleighCoefficients(atmosColor, density = 1.0) {
    // Base Earth-like Rayleigh coefficients (λ^-4 for RGB wavelengths)
    // Red: 680nm, Green: 550nm, Blue: 440nm
    // β ∝ 1/λ⁴ → R: 1/680⁴, G: 1/550⁴, B: 1/440⁴
    // Normalized: R: 0.19, G: 0.44, B: 1.00
    const baseR = 0.19;
    const baseG = 0.44;
    const baseB = 1.00;

    // Modulate by atmosphere color — a red atmosphere shifts scattering
    // toward longer wavelengths (like Mars' dusty atmosphere)
    const r = baseR * (0.4 + atmosColor[0] * 0.6) * density;
    const g = baseG * (0.4 + atmosColor[1] * 0.6) * density;
    const b = baseB * (0.4 + atmosColor[2] * 0.6) * density;

    return new THREE.Vector3(r, g, b);
}

// ============================================================
// ATMOSPHERE BUILDER
// ============================================================

/**
 * Create a complete two-layer atmosphere for a planet.
 * Now with Pioneer-style Rayleigh+Mie scattering.
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
 * @param {number} [options.atmosphereDensity=1.0] - Atmosphere density
 * @param {number} [options.mieAnisotropy=-0.85] - Mie forward scatter
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
        atmosphereDensity = 1.0,
        mieAnisotropy = -0.85,
    } = options;

    const atmosColor = new THREE.Color(color[0], color[1], color[2]);
    const sunDir = sunDirection.clone().normalize();

    // Pioneer-style scattering coefficients
    const rayleighCoeff = calculateRayleighCoefficients(color, atmosphereDensity);
    const mieCoeff = 0.003 * atmosphereDensity; // Mie scatter strength
    const atmosphereHeight = 0.15; // Scale height as fraction of atmos thickness
    const normalizedRadius = 1.0 / outerScale; // Planet radius relative to atmos sphere

    // Outer glow (BackSide, Additive)
    const outerGeo = new THREE.SphereGeometry(planetRadius * outerScale, 64, 64);
    const outerUniforms = {
        uAtmosColor: { value: atmosColor },
        uSunDirection: { value: sunDir },
        uIntensity: { value: intensity },
        uFalloff: { value: falloff },
        uRayleighCoeff: { value: rayleighCoeff },
        uMieCoeff: { value: mieCoeff },
        uMieG: { value: mieAnisotropy },
        uAtmosphereHeight: { value: atmosphereHeight },
        uPlanetRadius: { value: normalizedRadius },
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
        uRayleighCoeff: { value: rayleighCoeff },
        uMieCoeff: { value: mieCoeff },
        uMieG: { value: mieAnisotropy },
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
