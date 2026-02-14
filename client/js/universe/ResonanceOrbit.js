/**
 * THE GALACTIC ORDER - Resonance Orbit System
 *
 * The "Antigravity Twist" on Pioneer's Newtonian orbital mechanics:
 *
 * In Pioneer, you just orbit. In The Galactic Order, you must find
 * the RESONANCE ORBIT — the altitude where the planet's harmonic
 * frequency matches your ship's Consciousness Core frequency.
 *
 * How it works:
 * 1. Each planet has a fundamental frequency (from Harmonic Resonance)
 * 2. The ship has a "tuning" frequency (adjustable by the player)
 * 3. At certain orbital altitudes, the planet's gravitational frequency
 *    (derived from orbital period) forms a harmonic ratio with the
 *    planet's core frequency
 * 4. When the ship enters a Resonance Orbit, special effects trigger:
 *    - Reduced fuel consumption (anti-gravity assist)
 *    - Planet reveals hidden information
 *    - Sister planet connections become visible
 *    - NPC mood shifts (CURIOUS → FOCUSED)
 *
 * The "gravitational frequency" is derived from Kepler's third law:
 *   T = 2π√(r³/GM)
 *   f_orbit = 1/T
 *
 * We then check if f_orbit and f_planet form a harmonic ratio
 * (octave, fifth, fourth, etc.)
 *
 * This creates a gameplay mechanic where players must "listen" to
 * the planet and adjust their orbit to find the resonance point.
 */

import { derivePlanetFrequency, findHarmonicRelation, frequencyToNote } from '../generation/harmonicResonance.js';
import { hashSeed, seededRandom } from '../generation/hashSeed.js';

// ============================================================
// CONSTANTS
// ============================================================

// Gravitational parameter (arbitrary units — tuned for gameplay)
const GM = 1000.0;

// Minimum and maximum orbit altitudes
const MIN_ORBIT_ALTITUDE = 5.0;   // Just above atmosphere
const MAX_ORBIT_ALTITUDE = 50.0;  // Far orbit

// Number of resonance orbit candidates to check
const RESONANCE_SEARCH_STEPS = 200;

// Harmonic tolerance (how close the ratio needs to be)
const RESONANCE_TOLERANCE = 0.08;

// ============================================================
// RESONANCE ORBIT CALCULATOR
// ============================================================

/**
 * Calculate the orbital frequency at a given altitude.
 * Based on Kepler's third law: f = 1/(2π) * √(GM/r³)
 *
 * @param {number} altitude - Orbital altitude above planet surface
 * @param {number} planetRadius - Radius of the planet
 * @returns {number} Orbital frequency in Hz
 */
export function orbitalFrequency(altitude, planetRadius = 1.0) {
    const r = planetRadius + altitude;
    const period = 2 * Math.PI * Math.sqrt((r * r * r) / GM);
    return 1.0 / period;
}

/**
 * Find all Resonance Orbits for a planet.
 * These are altitudes where the orbital frequency forms
 * a harmonic ratio with the planet's fundamental frequency.
 *
 * @param {number} ruleNumber - Planet's CA rule
 * @param {number} seed - Planet seed
 * @param {number} [planetRadius=1] - Planet radius
 * @returns {Object[]} Array of resonance orbits
 */
export function findResonanceOrbits(ruleNumber, seed, planetRadius = 1.0) {
    const planetFreq = derivePlanetFrequency(ruleNumber, seed);
    const orbits = [];

    // Scan altitudes for harmonic relationships
    for (let i = 0; i <= RESONANCE_SEARCH_STEPS; i++) {
        const t = i / RESONANCE_SEARCH_STEPS;
        const altitude = MIN_ORBIT_ALTITUDE + t * (MAX_ORBIT_ALTITUDE - MIN_ORBIT_ALTITUDE);
        const orbFreq = orbitalFrequency(altitude, planetRadius);

        // Check if orbital frequency is harmonically related to planet frequency
        const relation = findHarmonicRelation(orbFreq, planetFreq.frequency, RESONANCE_TOLERANCE);

        if (relation) {
            // Check we haven't already found a very nearby orbit
            const tooClose = orbits.some(o => Math.abs(o.altitude - altitude) < 1.0);
            if (!tooClose) {
                orbits.push({
                    altitude,
                    orbitalFrequency: orbFreq,
                    planetFrequency: planetFreq.frequency,
                    harmonicRatio: relation.name,
                    harmonicStrength: relation.strength,
                    resonanceQuality: 1.0 - relation.error / RESONANCE_TOLERANCE,
                    note: frequencyToNote(orbFreq),
                    planetNote: frequencyToNote(planetFreq.frequency),
                    band: planetFreq.band,
                });
            }
        }
    }

    // Sort by harmonic strength (strongest first)
    orbits.sort((a, b) => b.harmonicStrength - a.harmonicStrength);

    return orbits;
}

/**
 * Check if the ship is currently in a Resonance Orbit.
 * Returns the resonance data if within tolerance, or null.
 *
 * @param {number} currentAltitude - Ship's current altitude
 * @param {Object[]} resonanceOrbits - From findResonanceOrbits()
 * @param {number} [tolerance=2.0] - How close to orbit center (in units)
 * @returns {Object|null} Resonance data or null
 */
export function checkResonance(currentAltitude, resonanceOrbits, tolerance = 2.0) {
    for (const orbit of resonanceOrbits) {
        const dist = Math.abs(currentAltitude - orbit.altitude);
        if (dist < tolerance) {
            // Resonance strength falls off with distance from center
            const proximity = 1.0 - (dist / tolerance);
            return {
                ...orbit,
                proximity,        // 0-1, 1 = dead center
                fuelReduction: 0.3 + proximity * 0.5, // 30-80% fuel savings
                scanBonus: proximity * 2.0,            // Enhanced scanner range
                isActive: true,
            };
        }
    }
    return null;
}

/**
 * Calculate the visual effects for a resonance orbit.
 * Used by the renderer to show the "resonance ring" around the planet.
 *
 * @param {Object} resonanceOrbit - Single orbit from findResonanceOrbits()
 * @param {number} time - Current time for animation
 * @returns {Object} Visual parameters
 */
export function resonanceVisuals(resonanceOrbit, time) {
    const { harmonicStrength, resonanceQuality, altitude, band } = resonanceOrbit;

    // Color based on brainwave band
    const bandColors = {
        delta: [0.4, 0.2, 0.8],   // Purple
        theta: [0.2, 0.4, 0.9],   // Blue
        alpha: [0.2, 0.8, 0.4],   // Green
        beta:  [0.9, 0.7, 0.2],   // Gold
        gamma: [0.9, 0.2, 0.2],   // Red
    };

    const color = bandColors[band] || [0.5, 0.5, 1.0];

    // Pulsing animation (frequency matches the harmonic)
    const pulseFreq = resonanceOrbit.orbitalFrequency * 10; // Speed up for visibility
    const pulse = 0.5 + 0.5 * Math.sin(time * pulseFreq * Math.PI * 2);

    return {
        color,
        opacity: 0.1 + harmonicStrength * 0.3 * pulse,
        ringRadius: altitude,
        ringWidth: 0.5 + resonanceQuality * 1.5,
        particleSpeed: harmonicStrength * 2.0,
        glowIntensity: pulse * harmonicStrength,
    };
}

/**
 * Derive the "Consciousness Core" tuning for the ship.
 * The ship's frequency determines which resonance orbits are accessible.
 *
 * Players can adjust this by:
 * - Visiting Schumann-resonant planets (7.83 Hz worlds)
 * - Collecting harmonic crystals
 * - Meditating at resonance points
 *
 * @param {number} baseSeed - Ship/player seed
 * @returns {Object} Ship frequency profile
 */
export function deriveShipFrequency(baseSeed) {
    const rng = seededRandom(baseSeed, 'consciousness_core');

    // Ship starts near Schumann resonance (most welcoming)
    const baseFreq = 6.0 + rng() * 4.0; // 6-10 Hz (Theta-Alpha range)

    return {
        frequency: baseFreq,
        note: frequencyToNote(baseFreq),
        tuningRange: 2.0, // Hz — how far the player can shift
        harmonicReach: 3,  // How many harmonic ratios the ship can access
    };
}

/**
 * Calculate sister planet visibility from a resonance orbit.
 * When in a resonance orbit, the player can "see" harmonically
 * related planets as glowing points in the sky.
 *
 * @param {Object} currentResonance - From checkResonance()
 * @param {Object[]} systemPlanets - All planets in the star system
 * @returns {Object[]} Visible sister planets with direction info
 */
export function getVisibleSisterPlanets(currentResonance, systemPlanets) {
    if (!currentResonance || !currentResonance.isActive) return [];

    const visible = [];
    const currentFreq = currentResonance.planetFrequency;

    for (const planet of systemPlanets) {
        if (!planet.rule || !planet.seed) continue;

        const otherFreq = derivePlanetFrequency(planet.rule, planet.seed);
        const relation = findHarmonicRelation(currentFreq, otherFreq.frequency);

        if (relation) {
            visible.push({
                planet,
                frequency: otherFreq.frequency,
                harmonicName: relation.name,
                strength: relation.strength * currentResonance.proximity,
                note: frequencyToNote(otherFreq.frequency),
                band: otherFreq.band,
            });
        }
    }

    return visible.sort((a, b) => b.strength - a.strength);
}
