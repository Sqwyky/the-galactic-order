/**
 * THE GALACTIC ORDER - CA Rule → Shape Parameter Bridge
 *
 * This is the magic link between the game's cellular automata engine
 * and the superformula 3D shape generator.
 *
 * The planet's CA rule (0-255) determines not just terrain, but the
 * SHAPES of every rock, crystal, plant, and creature on the surface.
 *
 * How it works:
 * 1. classifyRule() gives us the Wolfram class (1-4)
 *    → Determines the "style archetype" (smooth vs geometric vs organic vs complex)
 *
 * 2. runCA1D() for 8 generations at width 16 gives us a micro-grid
 *    → Row densities fine-tune the 8 superformula parameters
 *
 * 3. The rule's bit pattern (8 bits) toggles specific features
 *    → Does the shape twist? Have spines? Glow? Branch?
 *
 * Result: Rule 30 (chaotic) produces twisted, asymmetric alien forms.
 *         Rule 90 (fractal) produces symmetrical crystal structures.
 *         Rule 110 (complex) produces intricate, balanced organic shapes.
 *         Rule 0 (dead) produces smooth pebbles and eggs.
 *
 * Every planet looks fundamentally DIFFERENT because its flora shapes
 * come directly from its rule number.
 */

import { classifyRule, runCA1D, ruleToBinary } from './cellularAutomata.js';
import { hashSeed, seededRandom, hashFloat } from './hashSeed.js';

// ============================================================
// STYLE PRESETS: Parameter ranges per Wolfram class (Enhanced)
// ============================================================

const STYLE_PRESETS = {
    1: { // Uniform → smooth, minimal, gentle forms
        name: 'smooth',
        m:  [0, 3],      // Low symmetry (circles, ellipses, soft tri)
        n1: [0.6, 5],    // Rounded, range widened for more variety
        n2: [0.4, 2.5],  // Soft edges
        n3: [0.4, 2.5],  // Soft edges
        // Modifiers: minimal noise for organic feel, no twist/spines
        noiseRange: [0.02, 0.06],
        twistRange: [0, 0],
        spineRange: [0, 0],
    },
    2: { // Periodic → crystalline, geometric, faceted
        name: 'geometric',
        m:  [3, 10],     // Regular polygonal symmetry (wider range)
        n1: [0.2, 3],    // Can be very sharp
        n2: [0.2, 3],    // Faceted edges, wider range
        n3: [0.2, 3],    // Faceted edges, wider range
        noiseRange: [0, 0.03],  // Crystals are clean — minimal noise
        twistRange: [0, 0.5],   // Slight twist possible
        spineRange: [0, 0.15],  // Sharp protrusions
    },
    3: { // Chaotic → wild, asymmetric, organic, alien
        name: 'organic',
        m:  [1, 15],     // Huge range (anything goes, even wider)
        n1: [0.08, 10],  // From extremely pinched to bulbous
        n2: [0.08, 8],   // Wildly varied
        n3: [0.08, 8],   // Wildly varied
        noiseRange: [0.04, 0.12], // Heavy organic noise
        twistRange: [0, 3.0],    // Can be very twisted
        spineRange: [0, 0.35],   // Wild spines
    },
    4: { // Complex → intricate, balanced, structured
        name: 'complex',
        m:  [3, 12],     // Moderate symmetry (wider for more intricate patterns)
        n1: [0.15, 6],   // Varied but not extreme
        n2: [0.2, 5],    // Balanced, wider range
        n3: [0.2, 5],    // Balanced, wider range
        noiseRange: [0.03, 0.08], // Moderate detail noise
        twistRange: [0, 1.5],    // Moderate twist
        spineRange: [0, 0.25],   // Moderate spines
    },
};

// ============================================================
// EASING CURVES: Non-linear parameter interpolation
// ============================================================

/**
 * Ease-in-out cubic — prevents boring linear interpolation.
 * Low density values stay near min, high values accelerate to max.
 */
function easeInOutCubic(t) {
    t = Math.max(0, Math.min(1, t));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Ease-out quad — fast start, gentle end. Good for symmetry parameter.
 */
function easeOutQuad(t) {
    t = Math.max(0, Math.min(1, t));
    return 1 - (1 - t) * (1 - t);
}

/**
 * Exponential ease — dramatic contrast. Good for n1 (curvature).
 */
function easeExponential(t) {
    t = Math.max(0, Math.min(1, t));
    return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
}

// ============================================================
// CORE: Rule + Seed → Superformula Parameters
// ============================================================

/**
 * Derive superformula parameters from a CA rule and seed.
 *
 * Now uses non-linear easing curves for parameter interpolation —
 * this creates more dramatic, visually distinct shapes rather than
 * everything clustering around the midpoint.
 *
 * Also derives shape modifiers (noise, twist, spines) from the
 * Wolfram class style and CA micro-grid patterns.
 *
 * @param {number} ruleNumber - The CA rule (0-255)
 * @param {number} seed - Deterministic seed for variation
 * @param {string} [category='flora'] - Category for hash domain separation
 * @returns {{ params1: Object, params2: Object, modifiers: Object, wolframClass: number, style: string }}
 */
export function deriveShapeParams(ruleNumber, seed, category = 'flora') {
    const cls = classifyRule(ruleNumber);
    const style = STYLE_PRESETS[cls.class];
    const rng = seededRandom(ruleNumber, seed, category);

    // Run a small CA to extract density-based modifiers
    // 16 cells wide, 8 generations = 128 total cells, very fast
    const initPos = hashSeed(seed, 'shape_init') % 16;
    const microGrid = runCA1D(ruleNumber, 16, 8, [initPos]);

    // Count active cells in each row → 8 density values in [0, 1]
    const rowDensities = [];
    for (let y = 0; y < 8; y++) {
        if (!microGrid[y]) { rowDensities.push(0.5); continue; }
        let sum = 0;
        for (let x = 0; x < microGrid[y].length; x++) {
            sum += microGrid[y][x];
        }
        rowDensities.push(sum / microGrid[y].length);
    }

    function lerp(min, max, t) {
        return min + (max - min) * Math.max(0, Math.min(1, t));
    }

    // Non-linear interpolation: each parameter uses different easing
    // m (symmetry) uses easeOutQuad — favors lower symmetry, occasional high
    // n1 (curvature) uses easeExponential — mostly gentle, rare extreme pinch
    // n2/n3 (edge shape) uses easeInOutCubic — balanced exploration of range

    const params1 = {
        m: Math.round(lerp(style.m[0], style.m[1],
            easeOutQuad(rowDensities[0] * 0.6 + rng() * 0.4))),
        n1: lerp(style.n1[0], style.n1[1],
            easeExponential(rowDensities[1] * 0.5 + rng() * 0.5)),
        n2: lerp(style.n2[0], style.n2[1],
            easeInOutCubic(rowDensities[2] * 0.5 + rng() * 0.5)),
        n3: lerp(style.n3[0], style.n3[1],
            easeInOutCubic(rowDensities[3] * 0.5 + rng() * 0.5)),
    };

    const params2 = {
        m: Math.round(lerp(style.m[0], style.m[1],
            easeOutQuad(rowDensities[4] * 0.6 + rng() * 0.4))),
        n1: lerp(style.n1[0], style.n1[1],
            easeExponential(rowDensities[5] * 0.5 + rng() * 0.5)),
        n2: lerp(style.n2[0], style.n2[1],
            easeInOutCubic(rowDensities[6] * 0.5 + rng() * 0.5)),
        n3: lerp(style.n3[0], style.n3[1],
            easeInOutCubic(rowDensities[7] * 0.5 + rng() * 0.5)),
    };

    // Derive shape modifiers from class style + feature flags
    const flags = deriveFeatureFlags(ruleNumber);
    const avgDensity = rowDensities.reduce((a, b) => a + b, 0) / 8;

    const modifiers = {
        noiseAmount: lerp(style.noiseRange[0], style.noiseRange[1],
            avgDensity * 0.4 + rng() * 0.6),
        noiseScale: 2.0 + rng() * 4.0,
        noiseOctaves: cls.class >= 3 ? 4 : 3,
        noiseSeed: Math.floor(rng() * 10000),
        twistAmount: flags.hasTwist
            ? lerp(style.twistRange[0], style.twistRange[1], rng())
            : 0,
        spineAmount: flags.hasSpines
            ? lerp(style.spineRange[0], style.spineRange[1], rng())
            : 0,
        spineFreq: params1.m || 5,
    };

    return {
        params1,
        params2,
        modifiers,
        wolframClass: cls.class,
        style: style.name,
        entropy: cls.entropy,
        density: cls.density,
    };
}

// ============================================================
// VARIANT GENERATION: Multiple shapes per planet
// ============================================================

/**
 * Generate N distinct shape variants for a planet.
 * Each variant uses a different sub-seed, creating unique shapes
 * that all share the same stylistic "DNA" from the rule.
 *
 * @param {number} ruleNumber - The CA rule (0-255)
 * @param {number} baseSeed - The planet's flora/creature seed
 * @param {number} [count=5] - Number of variants to generate
 * @param {string} [category='flora'] - Category for separation
 * @returns {Object[]} Array of shape parameter sets
 */
export function deriveShapeVariants(ruleNumber, baseSeed, count = 5, category = 'flora') {
    const variants = [];

    for (let i = 0; i < count; i++) {
        const variantSeed = hashSeed(baseSeed, category, 'variant', i);
        const params = deriveShapeParams(ruleNumber, variantSeed, category);

        // Add a variant index for material/color selection
        params.variantIndex = i;

        variants.push(params);
    }

    return variants;
}

// ============================================================
// FEATURE FLAGS: Rule bits → visual features
// ============================================================

/**
 * Extract boolean feature flags from the rule's bit pattern.
 * Each of the 8 bits of the rule number toggles a visual feature.
 *
 * @param {number} ruleNumber - The CA rule (0-255)
 * @returns {Object} Feature flags
 */
export function deriveFeatureFlags(ruleNumber) {
    const bits = ruleToBinary(ruleNumber).split('').map(Number);
    return {
        hasEmissiveGlow: bits[0] === 1,  // Bioluminescent
        hasTransparency: bits[1] === 1,  // Semi-transparent (crystal-like)
        hasMetallic:     bits[2] === 1,  // Metallic sheen
        hasTwist:        bits[3] === 1,  // Twisted/spiraling
        hasSpines:       bits[4] === 1,  // Spiny protrusions
        isTall:          bits[5] === 1,  // Vertically stretched
        isFlat:          bits[6] === 1,  // Horizontally stretched
        hasRichColor:    bits[7] === 1,  // Extra color saturation
    };
}

// ============================================================
// COLOR DERIVATION: Rule → material colors
// ============================================================

/**
 * Derive a color palette for shapes on this planet.
 * Uses color harmony theory (triadic, split-complementary, analogous)
 * selected by Wolfram class for aesthetically pleasing palettes.
 *
 * @param {number} ruleNumber
 * @param {number} seed
 * @returns {{ primary: [r,g,b], secondary: [r,g,b], accent: [r,g,b], emissive: [r,g,b], metalness: number, roughness: number }}
 */
export function deriveShapeColors(ruleNumber, seed) {
    const cls = classifyRule(ruleNumber);
    const rng = seededRandom(ruleNumber, seed, 'color');
    const flags = deriveFeatureFlags(ruleNumber);

    // Base hue from seed (0-360 degrees)
    const hue = rng() * 360;

    // Saturation curves per class — non-linear for richer variety
    const satBase = {
        1: 0.15, // Muted, natural tones
        2: 0.45, // Clean, mineral colors
        3: 0.5,  // Vivid alien biology
        4: 0.55, // Rich, balanced
    }[cls.class];
    const satRange = {
        1: 0.25,
        2: 0.35,
        3: 0.45,
        4: 0.35,
    }[cls.class];
    const sat = satBase + easeInOutCubic(rng()) * satRange;
    // Extra saturation for hasRichColor flag
    const satFinal = flags.hasRichColor ? Math.min(1, sat * 1.3) : sat;

    // Lightness: entropy-driven with class-specific bias
    const lightnessBase = { 1: 0.45, 2: 0.38, 3: 0.35, 4: 0.4 }[cls.class];
    const lightness = lightnessBase + cls.entropy * 0.25 + rng() * 0.1;

    // HSL → RGB (standard algorithm)
    function hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360;
        h /= 360;
        s = Math.max(0, Math.min(1, s));
        l = Math.max(0, Math.min(1, l));
        const a = s * Math.min(l, 1 - l);
        function f(n) {
            const k = (n + h * 12) % 12;
            return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        }
        return [f(0), f(8), f(4)];
    }

    // Color harmony selection by Wolfram class:
    // Class 1 (smooth): Analogous (nearby hues — peaceful)
    // Class 2 (geometric): Split-complementary (controlled contrast)
    // Class 3 (chaotic): Triadic (bold, alien)
    // Class 4 (complex): Tetradic (rich, varied)
    let secondaryHue, accentHue;

    switch (cls.class) {
        case 1: // Analogous: ±25-35°
            secondaryHue = hue + 25 + rng() * 10;
            accentHue = hue - 25 - rng() * 10;
            break;
        case 2: // Split-complementary: 150° and 210° offsets
            secondaryHue = hue + 150 + rng() * 20;
            accentHue = hue + 210 + rng() * 20;
            break;
        case 3: // Triadic: 120° apart
            secondaryHue = hue + 120 + (rng() - 0.5) * 20;
            accentHue = hue + 240 + (rng() - 0.5) * 20;
            break;
        case 4: // Tetradic: 90° steps
        default:
            secondaryHue = hue + 90 + (rng() - 0.5) * 15;
            accentHue = hue + 180 + (rng() - 0.5) * 15;
            break;
    }

    const primary = hslToRgb(hue, satFinal, lightness);
    const secondary = hslToRgb(secondaryHue, satFinal * 0.75, lightness * 0.8);
    const accent = hslToRgb(accentHue, satFinal * 0.9, lightness * 0.9);
    const emissive = flags.hasEmissiveGlow
        ? hslToRgb(accentHue, 0.85, 0.35)
        : [0, 0, 0];

    return {
        primary,
        secondary,
        accent,
        emissive,
        metalness: flags.hasMetallic ? 0.55 + rng() * 0.35 : 0.05 + rng() * 0.1,
        roughness: flags.hasMetallic ? 0.15 + rng() * 0.3 : 0.45 + rng() * 0.45,
        opacity: flags.hasTransparency ? 0.45 + rng() * 0.35 : 1.0,
    };
}
