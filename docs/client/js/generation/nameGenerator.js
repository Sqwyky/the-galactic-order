/**
 * THE GALACTIC ORDER - Procedural Name Generator
 *
 * Generates deterministic names for stars, planets, species, and regions.
 * Same seed = same name, always.
 *
 * Names are built from syllable pools selected by seed-derived indices.
 * Different entity types use different syllable pools to give them
 * distinct phonetic character.
 */

import { seededRandom } from './hashSeed.js';

// ============================================================
// SYLLABLE POOLS
// ============================================================

const STAR_PREFIXES = [
    'Al', 'Bel', 'Cas', 'Den', 'El', 'Far', 'Gal', 'Hel',
    'Ix', 'Jor', 'Kel', 'Lyr', 'Mir', 'Nor', 'Or', 'Pol',
    'Qua', 'Rig', 'Sir', 'Tar', 'Ul', 'Veg', 'Wol', 'Xen',
    'Yor', 'Zel', 'Ath', 'Bor', 'Cep', 'Dra'
];

const STAR_SUFFIXES = [
    'us', 'a', 'ion', 'is', 'ar', 'en', 'ix', 'or',
    'um', 'ei', 'os', 'an', 'es', 'ia', 'on', 'ur'
];

const STAR_DESIGNATIONS = [
    'Prime', 'Major', 'Minor', 'Alpha', 'Beta', 'Gamma',
    'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'
];

const PLANET_PREFIXES = [
    'Keth', 'Zil', 'Mor', 'Pha', 'Ven', 'Tyr', 'Ash', 'Bol',
    'Cra', 'Dun', 'Esk', 'Fol', 'Grim', 'Hex', 'Ith', 'Jax',
    'Kro', 'Lum', 'Mex', 'Nyx', 'Oph', 'Pyr', 'Rho', 'Syl',
    'Tho', 'Uma', 'Vox', 'Wyr', 'Xal', 'Yth', 'Zor', 'Aku'
];

const PLANET_MIDDLES = [
    '', '', '', '',  // 50% chance of no middle syllable
    'vo', 'ra', 'li', 'ta', 'no', 'ke', 'si', 'ma',
    'phi', 'ro', 'ga', 'ne'
];

const PLANET_SUFFIXES = [
    'ran', 'tos', 'phis', 'nar', 'vex', 'ium', 'ora', 'yx',
    'thos', 'mir', 'kel', 'don', 'phe', 'zan', 'ark', 'esh'
];

const SPECIES_PREFIXES = [
    'Glo', 'Ska', 'Fli', 'Bro', 'Cri', 'Dwe', 'Gna', 'Hov',
    'Jit', 'Kna', 'Lur', 'Maw', 'Nib', 'Plu', 'Qui', 'Rut',
    'Sli', 'Tro', 'Vib', 'Whi', 'Zap', 'Buz', 'Cho', 'Dri'
];

const SPECIES_SUFFIXES = [
    'moth', 'pod', 'fin', 'wing', 'claw', 'maw', 'horn', 'tail',
    'shell', 'fang', 'eye', 'leg', 'tusk', 'gill', 'bark', 'thorn'
];

const FLORA_PREFIXES = [
    'Wis', 'Fer', 'Bri', 'Coa', 'Dew', 'Elm', 'Fen', 'Glo',
    'Haz', 'Ivy', 'Jas', 'Kin', 'Lil', 'Mos', 'Net', 'Oak',
    'Pin', 'Ros', 'Sag', 'Thi', 'Umb', 'Vin', 'Wil', 'Yew'
];

const FLORA_SUFFIXES = [
    'bloom', 'leaf', 'root', 'vine', 'bush', 'wort', 'fern', 'reed',
    'moss', 'cap', 'stalk', 'bud', 'frond', 'bulb', 'stem', 'spike'
];

// ============================================================
// NAME GENERATORS
// ============================================================

/**
 * Generate a star name.
 * Format: "Prefix + Suffix" or "Prefix + Suffix + Designation"
 *
 * @param {number} seed - Star seed
 * @returns {string} Star name (e.g., "Belar Prime", "Vegos III")
 */
export function generateStarName(seed) {
    const rng = seededRandom('star', seed);

    const prefix = STAR_PREFIXES[Math.floor(rng() * STAR_PREFIXES.length)];
    const suffix = STAR_SUFFIXES[Math.floor(rng() * STAR_SUFFIXES.length)];

    // 60% chance of a designation
    if (rng() < 0.6) {
        const designation = STAR_DESIGNATIONS[Math.floor(rng() * STAR_DESIGNATIONS.length)];
        return `${prefix}${suffix} ${designation}`;
    }

    return `${prefix}${suffix}`;
}

/**
 * Generate a planet name.
 * Format: "Prefix + [Middle] + Suffix"
 *
 * @param {number} seed - Planet seed
 * @returns {string} Planet name (e.g., "Kethvoran", "Zilphi-Thos")
 */
export function generatePlanetName(seed) {
    const rng = seededRandom('planet', seed);

    const prefix = PLANET_PREFIXES[Math.floor(rng() * PLANET_PREFIXES.length)];
    const middle = PLANET_MIDDLES[Math.floor(rng() * PLANET_MIDDLES.length)];
    const suffix = PLANET_SUFFIXES[Math.floor(rng() * PLANET_SUFFIXES.length)];

    // 30% chance of hyphenated name
    if (rng() < 0.3) {
        return `${prefix}${middle}-${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
    }

    return `${prefix}${middle}${suffix}`;
}

/**
 * Generate a species name.
 * Format: "Prefix + Suffix" (sounds creature-like)
 *
 * @param {number} seed - Species seed
 * @returns {string} Species name (e.g., "Glomoth", "Skafin")
 */
export function generateSpeciesName(seed) {
    const rng = seededRandom('species', seed);

    const prefix = SPECIES_PREFIXES[Math.floor(rng() * SPECIES_PREFIXES.length)];
    const suffix = SPECIES_SUFFIXES[Math.floor(rng() * SPECIES_SUFFIXES.length)];

    return `${prefix}${suffix}`;
}

/**
 * Generate a flora name.
 * Format: "Prefix + Suffix" (sounds plant-like)
 *
 * @param {number} seed - Flora seed
 * @returns {string} Flora name (e.g., "Wisbloom", "Fernleaf")
 */
export function generateFloraName(seed) {
    const rng = seededRandom('flora', seed);

    const prefix = FLORA_PREFIXES[Math.floor(rng() * FLORA_PREFIXES.length)];
    const suffix = FLORA_SUFFIXES[Math.floor(rng() * FLORA_SUFFIXES.length)];

    return `${prefix}${suffix}`;
}

/**
 * Generate a star system label.
 * Includes star name and a catalog-style identifier.
 *
 * @param {number} seed - System seed
 * @returns {{ name: string, catalog: string }}
 */
export function generateSystemLabel(seed) {
    const name = generateStarName(seed);
    const catalogNum = (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');

    return {
        name,
        catalog: `TGO-${catalogNum.slice(0, 4)}-${catalogNum.slice(4)}`
    };
}
