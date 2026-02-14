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
// STYLE PRESETS: Parameter ranges per Wolfram class
// ============================================================

const STYLE_PRESETS = {
    1: { // Uniform → smooth, minimal, gentle forms
        name: 'smooth',
        m:  [0, 2],     // Low symmetry (circles, ellipses)
        n1: [0.8, 4],   // Rounded
        n2: [0.5, 2],   // Soft
        n3: [0.5, 2],   // Soft
    },
    2: { // Periodic → crystalline, geometric, faceted
        name: 'geometric',
        m:  [3, 8],     // Regular polygonal symmetry
        n1: [0.3, 2],   // Can be sharp
        n2: [0.3, 2],   // Faceted edges
        n3: [0.3, 2],   // Faceted edges
    },
    3: { // Chaotic → wild, asymmetric, organic, alien
        name: 'organic',
        m:  [1, 13],    // Huge range (anything goes)
        n1: [0.1, 8],   // From extremely pinched to bulbous
        n2: [0.1, 6],   // Wildly varied
        n3: [0.1, 6],   // Wildly varied
    },
    4: { // Complex → intricate, balanced, structured
        name: 'complex',
        m:  [3, 9],     // Moderate symmetry
        n1: [0.2, 5],   // Varied but not extreme
        n2: [0.3, 4],   // Balanced
        n3: [0.3, 4],   // Balanced
    },
};

// ============================================================
// CORE: Rule + Seed → Superformula Parameters
// ============================================================

/**
 * Derive superformula parameters from a CA rule and seed.
 *
 * @param {number} ruleNumber - The CA rule (0-255)
 * @param {number} seed - Deterministic seed for variation
 * @param {string} [category='flora'] - Category for hash domain separation
 * @returns {{ params1: Object, params2: Object, wolframClass: number, style: string }}
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

    // Each row density (modulated by RNG) controls one parameter
    // This creates deterministic but varied shapes:
    // - Same rule + same seed = same shape (deterministic)
    // - Same rule + different seed = variation within the style
    // - Different rule = fundamentally different style

    const params1 = {
        m: Math.round(lerp(style.m[0], style.m[1],
            rowDensities[0] * 0.6 + rng() * 0.4)),
        n1: lerp(style.n1[0], style.n1[1],
            rowDensities[1] * 0.5 + rng() * 0.5),
        n2: lerp(style.n2[0], style.n2[1],
            rowDensities[2] * 0.5 + rng() * 0.5),
        n3: lerp(style.n3[0], style.n3[1],
            rowDensities[3] * 0.5 + rng() * 0.5),
    };

    const params2 = {
        m: Math.round(lerp(style.m[0], style.m[1],
            rowDensities[4] * 0.6 + rng() * 0.4)),
        n1: lerp(style.n1[0], style.n1[1],
            rowDensities[5] * 0.5 + rng() * 0.5),
        n2: lerp(style.n2[0], style.n2[1],
            rowDensities[6] * 0.5 + rng() * 0.5),
        n3: lerp(style.n3[0], style.n3[1],
            rowDensities[7] * 0.5 + rng() * 0.5),
    };

    return {
        params1,
        params2,
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
 * Uses the rule classification to set the overall color mood,
 * then the seed for specific hues.
 *
 * @param {number} ruleNumber
 * @param {number} seed
 * @returns {{ primary: [r,g,b], secondary: [r,g,b], emissive: [r,g,b], metalness: number, roughness: number }}
 */
export function deriveShapeColors(ruleNumber, seed) {
    const cls = classifyRule(ruleNumber);
    const rng = seededRandom(ruleNumber, seed, 'color');
    const flags = deriveFeatureFlags(ruleNumber);

    // Base hue from seed (0-360 degrees)
    const hue = rng() * 360;

    // Saturation from class
    const sat = {
        1: 0.2 + rng() * 0.3,    // Muted
        2: 0.5 + rng() * 0.3,    // Moderate
        3: 0.4 + rng() * 0.5,    // Wide range
        4: 0.6 + rng() * 0.3,    // Rich
    }[cls.class];

    // Lightness from entropy
    const lightness = 0.35 + cls.entropy * 0.3;

    // Convert HSL to RGB (simple conversion)
    function hslToRgb(h, s, l) {
        h /= 360;
        const a = s * Math.min(l, 1 - l);
        function f(n) {
            const k = (n + h * 12) % 12;
            return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        }
        return [f(0), f(8), f(4)];
    }

    const primary = hslToRgb(hue, sat, lightness);
    const secondary = hslToRgb((hue + 30 + rng() * 60) % 360, sat * 0.8, lightness * 0.7);
    const emissive = flags.hasEmissiveGlow ?
        hslToRgb((hue + 120) % 360, 0.8, 0.3) : [0, 0, 0];

    return {
        primary,
        secondary,
        emissive,
        metalness: flags.hasMetallic ? 0.6 + rng() * 0.3 : 0.1,
        roughness: flags.hasMetallic ? 0.2 + rng() * 0.3 : 0.5 + rng() * 0.4,
        opacity: flags.hasTransparency ? 0.5 + rng() * 0.3 : 1.0,
    };
}
