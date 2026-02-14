/**
 * THE GALACTIC ORDER - Harmonic Periodic Table
 *
 * A futuristic elemental system where resources aren't "Iron" and "Wood"
 * but harmonic substances tied to the planet's CA rule and resonant frequency.
 *
 * Every element has a Resonance Frequency — when the player's Multi-tool
 * beam matches that frequency, mining is maximally efficient. If mistuned,
 * the tool overheats from resistance.
 *
 * Element groups:
 *   Organic    — Carbon (C)           — fuel, life support
 *   Structural — Ferrite (Fe)         — building, hull repair
 *   Catalyst   — Resonance Dust (Rd)  — warp drive tuning, frequency matching
 *   Exotic     — Void Matter (Vm)     — high-tier tech, Rule 110 planets only
 *
 * Refining uses CA Rule Annealing: raw inputs + a specific Rule Number
 * as catalyst → reorganized atomic lattice → refined output.
 */

import { hashSeed, seededRandom } from './hashSeed.js';
import { classifyRule } from './cellularAutomata.js';

// ============================================================
// ELEMENT DEFINITIONS
// ============================================================

export const ELEMENTS = {
    // ---- ORGANIC (Carbon group) ----
    carbon: {
        id: 'carbon',
        name: 'Carbon',
        symbol: 'C',
        group: 'organic',
        tier: 1,
        color: [0.2, 0.8, 0.3],       // Green
        glowColor: [0.1, 0.6, 0.2],
        resonanceFreq: 4.0,            // Hz — Theta band (life frequency)
        description: 'Basic organic compound. Powers life support and Multi-tool.',
        maxStack: 500,
        icon: '◆',
    },
    condensed_carbon: {
        id: 'condensed_carbon',
        name: 'Condensed Carbon',
        symbol: 'C+',
        group: 'organic',
        tier: 2,
        color: [0.1, 0.5, 0.15],
        glowColor: [0.05, 0.4, 0.1],
        resonanceFreq: 8.0,
        description: 'Refined carbon lattice. Dense energy storage.',
        maxStack: 250,
        icon: '◈',
    },

    // ---- STRUCTURAL (Ferrite group) ----
    ferrite: {
        id: 'ferrite',
        name: 'Ferrite Dust',
        symbol: 'Fe',
        group: 'structural',
        tier: 1,
        color: [0.7, 0.5, 0.3],       // Rusty brown
        glowColor: [0.8, 0.6, 0.2],
        resonanceFreq: 12.0,           // Hz — Alpha band (structural stability)
        description: 'Raw metallic dust. Foundation of all construction.',
        maxStack: 500,
        icon: '▣',
    },
    pure_ferrite: {
        id: 'pure_ferrite',
        name: 'Pure Ferrite',
        symbol: 'Fe+',
        group: 'structural',
        tier: 2,
        color: [0.8, 0.7, 0.5],
        glowColor: [0.9, 0.8, 0.4],
        resonanceFreq: 24.0,
        description: 'Annealed ferrite crystal. Stable lattice for advanced construction.',
        maxStack: 250,
        icon: '▧',
    },

    // ---- CATALYST (Resonance group) ----
    resonance_dust: {
        id: 'resonance_dust',
        name: 'Resonance Dust',
        symbol: 'Rd',
        group: 'catalyst',
        tier: 2,
        color: [0.4, 0.6, 1.0],       // Electric blue
        glowColor: [0.3, 0.5, 1.0],
        resonanceFreq: 7.83,           // Hz — Schumann resonance!
        description: 'Crystallized harmonic energy. Tunes warp drives and refining processes.',
        maxStack: 100,
        icon: '◎',
    },

    // ---- EXOTIC (Void group) ----
    void_matter: {
        id: 'void_matter',
        name: 'Void Matter',
        symbol: 'Vm',
        group: 'exotic',
        tier: 3,
        color: [0.6, 0.1, 0.8],       // Deep purple
        glowColor: [0.8, 0.2, 1.0],
        resonanceFreq: 50.0,           // Hz — Gamma band (extreme)
        description: 'Non-algorithmic substance. Found only on Rule 110 (Complex) worlds.',
        maxStack: 50,
        icon: '⬡',
    },
};

// ============================================================
// BIOME → RESOURCE DISTRIBUTION
// ============================================================

/**
 * Which elements can be mined from which biome, and at what density.
 * Higher density = more nodes spawn per chunk.
 *
 * Biome IDs (from biomeMap.js):
 *   2=Beach, 3=Desert, 4=Savanna, 5=Grassland, 6=Forest,
 *   7=Dense Forest, 8=Swamp, 9=Mountain, 10=Snow Peak, 11=Ice
 */
export const BIOME_RESOURCES = {
    2:  { elements: ['carbon'],                  density: 0.2 },  // Beach
    3:  { elements: ['ferrite'],                  density: 0.4 },  // Desert
    4:  { elements: ['carbon', 'ferrite'],        density: 0.3 },  // Savanna
    5:  { elements: ['carbon'],                   density: 0.6 },  // Grassland
    6:  { elements: ['carbon'],                   density: 0.8 },  // Forest
    7:  { elements: ['carbon', 'resonance_dust'], density: 0.7 },  // Dense Forest
    8:  { elements: ['carbon', 'ferrite'],        density: 0.4 },  // Swamp
    9:  { elements: ['ferrite', 'resonance_dust'], density: 0.9 }, // Mountain
    10: { elements: ['ferrite', 'resonance_dust'], density: 0.5 }, // Snow Peak
    11: { elements: ['resonance_dust'],           density: 0.3 },  // Ice
};

// ============================================================
// SOURCE TYPE → ELEMENT MAPPING
// ============================================================

/**
 * What elements drop from which source objects.
 * 'rock' and 'flora' are the two mineable object categories.
 */
export const SOURCE_DROPS = {
    rock: {
        primary: 'ferrite',
        secondary: 'resonance_dust',
        secondaryChance: 0.15,
        baseYield: 25,
        yieldVariation: 15,
    },
    flora: {
        primary: 'carbon',
        secondary: 'resonance_dust',
        secondaryChance: 0.10,
        baseYield: 15,
        yieldVariation: 10,
    },
};

// ============================================================
// REFINERY RECIPES (CA Annealing)
// ============================================================

/**
 * Refinery recipes. Each requires:
 * - input: raw element + quantity
 * - catalyst: a CA Rule Number that acts as the annealing pattern
 * - time: seconds to refine
 * - output: refined element + quantity
 *
 * The rule number matters: using the WRONG rule still works but
 * produces less output (efficiency penalty).
 */
export const REFINERY_RECIPES = [
    {
        id: 'refine_carbon',
        name: 'Anneal Carbon',
        input: { element: 'carbon', quantity: 50 },
        optimalRule: 30,   // Chaotic rule → organic annealing
        time: 8,           // seconds
        output: { element: 'condensed_carbon', quantity: 25 },
        description: 'Compress carbon chains using Rule 30 chaos annealing.',
    },
    {
        id: 'refine_ferrite',
        name: 'Anneal Ferrite',
        input: { element: 'ferrite', quantity: 50 },
        optimalRule: 90,   // Fractal rule → crystalline lattice
        time: 10,
        output: { element: 'pure_ferrite', quantity: 25 },
        description: 'Organize ferrite dust into stable crystal using Rule 90 fractal annealing.',
    },
    {
        id: 'synthesize_resonance',
        name: 'Synthesize Resonance Dust',
        input: { element: 'condensed_carbon', quantity: 10 },
        secondInput: { element: 'pure_ferrite', quantity: 10 },
        optimalRule: 110,  // Complex rule → harmonic synthesis
        time: 15,
        output: { element: 'resonance_dust', quantity: 5 },
        description: 'Fuse organic and metallic lattices at Rule 110 complexity threshold.',
    },
    {
        id: 'distill_void',
        name: 'Distill Void Matter',
        input: { element: 'resonance_dust', quantity: 20 },
        optimalRule: 110,
        time: 30,
        output: { element: 'void_matter', quantity: 1 },
        description: 'Push resonance dust past the algorithmic boundary. Requires Rule 110.',
    },
];

// ============================================================
// MINING EFFICIENCY: Frequency Tuning
// ============================================================

/**
 * Calculate mining efficiency based on how well the Multi-tool
 * frequency matches the target element's resonance frequency.
 *
 * Perfect match: 100% efficiency (instant mine, no heat)
 * Close match: 50-100% (moderate speed, some heat)
 * Far off: 10-50% (slow, heavy heat buildup)
 *
 * @param {number} toolFreq - Current Multi-tool frequency (Hz)
 * @param {string} elementId - Target element ID
 * @returns {{ efficiency: number, heatRate: number, label: string }}
 */
export function calculateMiningEfficiency(toolFreq, elementId) {
    const element = ELEMENTS[elementId];
    if (!element) return { efficiency: 0.5, heatRate: 1.0, label: 'UNKNOWN' };

    const targetFreq = element.resonanceFreq;
    const ratio = toolFreq / targetFreq;

    // How close to a 1:1 ratio (or harmonic 2:1, 3:2)
    const distances = [
        Math.abs(ratio - 1.0),         // Fundamental
        Math.abs(ratio - 2.0),         // Octave above
        Math.abs(ratio - 0.5),         // Octave below
        Math.abs(ratio - 1.5),         // Fifth
        Math.abs(ratio - 0.667),       // Fifth below
    ];
    const minDistance = Math.min(...distances);

    if (minDistance < 0.05) {
        return { efficiency: 1.0, heatRate: 0.2, label: 'RESONANT' };
    } else if (minDistance < 0.15) {
        return { efficiency: 0.8, heatRate: 0.5, label: 'HARMONIC' };
    } else if (minDistance < 0.3) {
        return { efficiency: 0.5, heatRate: 1.0, label: 'PARTIAL' };
    } else {
        return { efficiency: 0.25, heatRate: 2.0, label: 'DISSONANT' };
    }
}

/**
 * Calculate refinery efficiency based on how close the chosen
 * rule number is to the recipe's optimal rule.
 *
 * @param {number} chosenRule - Player's selected rule (0-255)
 * @param {Object} recipe - Recipe from REFINERY_RECIPES
 * @returns {{ efficiency: number, label: string }}
 */
export function calculateRefineEfficiency(chosenRule, recipe) {
    if (chosenRule === recipe.optimalRule) {
        return { efficiency: 1.0, label: 'PERFECT LATTICE' };
    }

    // Check if same Wolfram class
    const chosenClass = classifyRule(chosenRule).class;
    const optimalClass = classifyRule(recipe.optimalRule).class;

    if (chosenClass === optimalClass) {
        return { efficiency: 0.75, label: 'COMPATIBLE CLASS' };
    }

    // Different class entirely
    return { efficiency: 0.4, label: 'UNSTABLE LATTICE' };
}

/**
 * Determine what element a rock/flora drops based on biome and seed.
 *
 * @param {'rock'|'flora'} sourceType - What was mined
 * @param {number} biomeId - Biome where it was mined
 * @param {number} seed - Deterministic seed for this object
 * @param {number} planetRule - The planet's CA rule
 * @returns {{ element: string, quantity: number, bonus: string|null }}
 */
export function determineDrops(sourceType, biomeId, seed, planetRule) {
    const drops = SOURCE_DROPS[sourceType];
    const rng = seededRandom(seed, 'drop', biomeId);

    let element = drops.primary;
    let bonus = null;

    // Check for secondary drop
    if (rng() < drops.secondaryChance) {
        element = drops.secondary;
        bonus = 'RARE';
    }

    // Biome override — if the biome has specific resources
    const biomeRes = BIOME_RESOURCES[biomeId];
    if (biomeRes && biomeRes.elements.length > 0) {
        const biomeRoll = Math.floor(rng() * biomeRes.elements.length);
        element = biomeRes.elements[biomeRoll];
    }

    // Void Matter only on Rule 110 (Complex) planets
    const cls = classifyRule(planetRule);
    if (cls.class === 4 && rng() < 0.05) {
        element = 'void_matter';
        bonus = 'EXOTIC';
    }

    // Quantity
    const quantity = drops.baseYield + Math.floor(rng() * drops.yieldVariation);

    return { element, quantity, bonus };
}
