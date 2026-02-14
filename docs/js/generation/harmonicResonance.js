/**
 * THE GALACTIC ORDER - Harmonic Resonance System
 *
 * Inspired by Dudu's Antigravity Brain project:
 * Every object in the universe has a fundamental frequency (f₀).
 * Objects with harmonic relationships (2:1, 3:2, 5:4) are cosmically linked.
 *
 * This module assigns frequencies to planets and star systems,
 * determines "sister" relationships, and computes the planet's
 * "mood" (brainwave band) that drives atmosphere, sky color,
 * particle behavior, and NPC temperament.
 *
 * Frequency mapping:
 *   CA Rule → Wolfram Class → Base frequency band
 *   Seed → Fine-tunes the exact frequency within that band
 *
 * Brainwave bands (from Antigravity Brain's bio-resonance):
 *   Delta  (0.5-4 Hz)  → Dreamlike, slow, misty
 *   Theta  (4-8 Hz)    → Mysterious, deep, high AI activity
 *   Alpha  (8-13 Hz)   → Calm, balanced, lush
 *   Beta   (13-30 Hz)  → Energetic, bright, stormy
 *   Gamma  (30-100 Hz) → Intense, radioactive, dangerous
 *
 * The Schumann resonance (7.83 Hz) is the "home frequency" —
 * planets near this frequency feel most Earth-like and welcoming.
 */

import { classifyRule } from './cellularAutomata.js';
import { hashSeed, hashFloat, seededRandom } from './hashSeed.js';

// ============================================================
// CONSTANTS
// ============================================================

const SCHUMANN_RESONANCE = 7.83; // Hz — Earth's heartbeat

// Musical ratios for harmonic detection (just intonation)
const HARMONIC_RATIOS = [
    { ratio: 2 / 1, name: 'octave', strength: 1.0 },
    { ratio: 3 / 2, name: 'fifth', strength: 0.9 },
    { ratio: 4 / 3, name: 'fourth', strength: 0.85 },
    { ratio: 5 / 4, name: 'major_third', strength: 0.75 },
    { ratio: 5 / 3, name: 'major_sixth', strength: 0.7 },
    { ratio: 8 / 5, name: 'minor_sixth', strength: 0.65 },
    { ratio: 6 / 5, name: 'minor_third', strength: 0.6 },
];

// Brainwave bands
const BRAINWAVE_BANDS = {
    delta: { min: 0.5, max: 4, label: 'Delta', mood: 'dreamlike' },
    theta: { min: 4, max: 8, label: 'Theta', mood: 'mysterious' },
    alpha: { min: 8, max: 13, label: 'Alpha', mood: 'calm' },
    beta:  { min: 13, max: 30, label: 'Beta', mood: 'energetic' },
    gamma: { min: 30, max: 100, label: 'Gamma', mood: 'intense' },
};

// ============================================================
// CORE: Planet Frequency Derivation
// ============================================================

/**
 * Derive the fundamental frequency of a planet from its CA rule and seed.
 *
 * The frequency is determined by:
 * 1. Wolfram class → base band (which brainwave range)
 * 2. Rule entropy → position within that band
 * 3. Seed → fine variation
 *
 * @param {number} ruleNumber - CA rule (0-255)
 * @param {number} seed - Planet seed
 * @returns {{ frequency: number, band: string, bandInfo: Object, overtones: number[], subharmonic: number }}
 */
export function derivePlanetFrequency(ruleNumber, seed) {
    const cls = classifyRule(ruleNumber);
    const rng = seededRandom(ruleNumber, seed, 'frequency');

    // Map Wolfram class to brainwave band
    // Class 1 (Uniform/Dead) → Delta (dreamlike, empty)
    // Class 2 (Periodic) → Alpha (calm, structured)
    // Class 3 (Chaotic) → Beta/Gamma (wild, energetic)
    // Class 4 (Complex) → Theta (mysterious, edge of chaos)
    const bandMap = {
        1: 'delta',
        2: 'alpha',
        3: cls.entropy > 0.8 ? 'gamma' : 'beta',
        4: 'theta',
    };

    const bandKey = bandMap[cls.class];
    const band = BRAINWAVE_BANDS[bandKey];

    // Position within band: entropy + seed variation
    const bandPosition = cls.entropy * 0.6 + rng() * 0.4;
    const frequency = band.min + bandPosition * (band.max - band.min);

    // Overtones (harmonics above f₀)
    const overtones = [
        frequency * 2,   // 1st overtone (octave)
        frequency * 3,   // 2nd overtone
        frequency * 5,   // 3rd overtone (major)
    ];

    // Subharmonic (below f₀)
    const subharmonic = frequency / 2;

    return {
        frequency,
        band: bandKey,
        bandInfo: band,
        overtones,
        subharmonic,
        schumannDistance: Math.abs(frequency - SCHUMANN_RESONANCE),
    };
}

/**
 * Derive the frequency for a star system.
 * Star frequency is the "root note" — all planets in the system
 * are harmonically related to it.
 *
 * @param {number} systemSeed - The star system seed
 * @returns {{ frequency: number, band: string }}
 */
export function deriveSystemFrequency(systemSeed) {
    const rng = seededRandom(systemSeed, 'starfreq');

    // Star systems span the full frequency range
    // Use a log scale for natural distribution
    const logMin = Math.log(0.5);   // Delta low
    const logMax = Math.log(100);   // Gamma high
    const logFreq = logMin + rng() * (logMax - logMin);
    const frequency = Math.exp(logFreq);

    // Determine band
    let band = 'delta';
    for (const [key, info] of Object.entries(BRAINWAVE_BANDS)) {
        if (frequency >= info.min && frequency < info.max) {
            band = key;
            break;
        }
    }

    return { frequency, band };
}

// ============================================================
// HARMONIC RELATIONSHIPS: Sister Planets
// ============================================================

/**
 * Check if two frequencies are harmonically related.
 * Returns the relationship if found, or null.
 *
 * @param {number} freq1
 * @param {number} freq2
 * @param {number} [tolerance=0.05] - How close to a perfect ratio (5% default)
 * @returns {{ ratio: number, name: string, strength: number } | null}
 */
export function findHarmonicRelation(freq1, freq2, tolerance = 0.05) {
    const actualRatio = Math.max(freq1, freq2) / Math.min(freq1, freq2);

    for (const harmonic of HARMONIC_RATIOS) {
        const error = Math.abs(actualRatio - harmonic.ratio) / harmonic.ratio;
        if (error <= tolerance) {
            return {
                ...harmonic,
                actualRatio,
                error,
            };
        }
    }

    return null;
}

/**
 * Find all sister planets for a given planet within a region of space.
 * Sisters are planets whose frequencies form harmonic ratios.
 *
 * @param {number} planetFreq - This planet's frequency
 * @param {Object[]} nearbyPlanets - Array of { id, frequency, position }
 * @returns {Object[]} Array of sister relationships
 */
export function findSisterPlanets(planetFreq, nearbyPlanets) {
    const sisters = [];

    for (const other of nearbyPlanets) {
        const relation = findHarmonicRelation(planetFreq, other.frequency);
        if (relation) {
            sisters.push({
                planetId: other.id,
                position: other.position,
                frequency: other.frequency,
                ...relation,
            });
        }
    }

    // Sort by harmonic strength (strongest relationship first)
    sisters.sort((a, b) => b.strength - a.strength);
    return sisters;
}

// ============================================================
// PLANET MOOD: Frequency → Visual Atmosphere
// ============================================================

/**
 * Derive the full "mood" of a planet from its frequency.
 * This drives sky colors, fog density, particle speed, flora sway,
 * ambient sounds, and NPC behavior.
 *
 * @param {number} ruleNumber - CA rule
 * @param {number} seed - Planet seed
 * @returns {Object} Complete mood profile
 */
export function derivePlanetMood(ruleNumber, seed) {
    const freq = derivePlanetFrequency(ruleNumber, seed);
    const rng = seededRandom(ruleNumber, seed, 'mood');

    // Normalize frequency to 0-1 scale (log) for interpolation
    const logNorm = (Math.log(freq.frequency) - Math.log(0.5)) /
                    (Math.log(100) - Math.log(0.5));
    const t = Math.max(0, Math.min(1, logNorm));

    // Sky colors based on brainwave band
    const skyPalettes = {
        delta: {
            topColor:    [0.02, 0.02, 0.08],  // Near-black deep blue
            midColor:    [0.08, 0.05, 0.15],  // Dark purple
            bottomColor: [0.15, 0.10, 0.20],  // Misty purple
            fogColor:    [0.12, 0.08, 0.18],  // Purple haze
            sunColor:    [0.6, 0.4, 0.7],     // Pale violet
        },
        theta: {
            topColor:    [0.03, 0.05, 0.18],  // Deep mysterious blue
            midColor:    [0.10, 0.15, 0.35],  // Rich blue
            bottomColor: [0.20, 0.25, 0.40],  // Twilight blue
            fogColor:    [0.15, 0.18, 0.30],  // Blue mist
            sunColor:    [0.8, 0.6, 0.4],     // Amber
        },
        alpha: {
            topColor:    [0.04, 0.10, 0.30],  // Clear blue sky
            midColor:    [0.20, 0.40, 0.65],  // Bright blue
            bottomColor: [0.55, 0.70, 0.80],  // Light horizon
            fogColor:    [0.55, 0.70, 0.80],  // Atmosphere
            sunColor:    [1.0, 0.95, 0.85],   // Warm white
        },
        beta: {
            topColor:    [0.10, 0.05, 0.02],  // Orange-brown sky
            midColor:    [0.50, 0.25, 0.10],  // Amber
            bottomColor: [0.70, 0.50, 0.20],  // Golden horizon
            fogColor:    [0.60, 0.40, 0.15],  // Dusty
            sunColor:    [1.0, 0.8, 0.3],     // Hot yellow
        },
        gamma: {
            topColor:    [0.15, 0.02, 0.02],  // Blood red sky
            midColor:    [0.40, 0.08, 0.05],  // Deep red
            bottomColor: [0.60, 0.20, 0.10],  // Fiery horizon
            fogColor:    [0.50, 0.15, 0.08],  // Toxic haze
            sunColor:    [1.0, 0.4, 0.2],     // Angry orange
        },
    };

    const palette = skyPalettes[freq.band];

    // Add seed-based variation to colors (±10%)
    function varyColor(rgb) {
        return rgb.map(c => Math.max(0, Math.min(1,
            c + (rng() - 0.5) * 0.1
        )));
    }

    // Atmosphere properties from frequency band
    const atmosphereProfiles = {
        delta: {
            fogDensity: 0.004,       // Heavy fog
            particleSpeed: 0.3,      // Slow drifting
            particleCount: 200,      // Moderate
            windStrength: 0.05,      // Almost still
            cloudCoverage: 0.8,      // Heavy clouds
            cloudSpeed: 0.002,       // Barely moving
            ambientLight: 0.25,      // Dim
            bloomStrength: 0.5,      // Dreamy glow
        },
        theta: {
            fogDensity: 0.003,
            particleSpeed: 0.5,
            particleCount: 250,
            windStrength: 0.10,
            cloudCoverage: 0.6,
            cloudSpeed: 0.005,
            ambientLight: 0.35,
            bloomStrength: 0.4,
        },
        alpha: {
            fogDensity: 0.002,
            particleSpeed: 0.8,
            particleCount: 150,
            windStrength: 0.15,
            cloudCoverage: 0.4,
            cloudSpeed: 0.008,
            ambientLight: 0.5,
            bloomStrength: 0.3,
        },
        beta: {
            fogDensity: 0.0025,
            particleSpeed: 1.5,
            particleCount: 350,
            windStrength: 0.25,
            cloudCoverage: 0.3,
            cloudSpeed: 0.015,
            ambientLight: 0.6,
            bloomStrength: 0.35,
        },
        gamma: {
            fogDensity: 0.005,       // Toxic haze
            particleSpeed: 2.0,      // Fast
            particleCount: 500,      // Lots of particles
            windStrength: 0.35,      // Strong wind
            cloudCoverage: 0.5,      // Storm clouds
            cloudSpeed: 0.025,       // Fast clouds
            ambientLight: 0.45,      // Eerie
            bloomStrength: 0.6,      // Intense glow
        },
    };

    const atmosphere = atmosphereProfiles[freq.band];

    // NPC mood state (for the Mysterious Being's Consciousness Core)
    // Maps to the AB mood states: CURIOUS, FOCUSED, DREAMING, OVERWHELMED
    const npcMoodMap = {
        delta: { state: 'DREAMING', trust_rate: 0.8, responsiveness: 0.3 },
        theta: { state: 'CURIOUS', trust_rate: 1.0, responsiveness: 0.7 },
        alpha: { state: 'FOCUSED', trust_rate: 0.9, responsiveness: 0.8 },
        beta:  { state: 'CURIOUS', trust_rate: 0.7, responsiveness: 1.0 },
        gamma: { state: 'OVERWHELMED', trust_rate: 0.4, responsiveness: 0.5 },
    };

    return {
        // Frequency info
        frequency: freq.frequency,
        band: freq.band,
        bandLabel: freq.bandInfo.label,
        moodName: freq.bandInfo.mood,
        schumannDistance: freq.schumannDistance,
        isSchumannResonant: freq.schumannDistance < 1.0,

        // Harmonic info
        overtones: freq.overtones,
        subharmonic: freq.subharmonic,

        // Visual atmosphere
        sky: {
            topColor: varyColor(palette.topColor),
            midColor: varyColor(palette.midColor),
            bottomColor: varyColor(palette.bottomColor),
            fogColor: varyColor(palette.fogColor),
            sunColor: varyColor(palette.sunColor),
        },
        atmosphere,

        // NPC state
        npcMood: npcMoodMap[freq.band],
    };
}

// ============================================================
// UTILITY: Frequency to musical note (for UI display)
// ============================================================

/**
 * Convert a frequency to the nearest musical note name.
 * Used for the planet info display.
 *
 * @param {number} frequency - Hz
 * @returns {{ note: string, octave: number, cents: number }}
 */
export function frequencyToNote(frequency) {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // MIDI number from frequency (A4 = 440Hz = MIDI 69)
    const midi = 12 * Math.log2(frequency / 440) + 69;
    const roundedMidi = Math.round(midi);
    const cents = Math.round((midi - roundedMidi) * 100);

    const noteIndex = ((roundedMidi % 12) + 12) % 12;
    const octave = Math.floor(roundedMidi / 12) - 1;

    return {
        note: noteNames[noteIndex],
        octave,
        cents,
        display: `${noteNames[noteIndex]}${octave}`,
    };
}
