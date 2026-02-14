/**
 * THE GALACTIC ORDER - Universe Manager
 *
 * The Cascading Hash — the "Seed Chain" from Architect's design.
 * One Universe Seed → infinite galaxies → infinite star systems → infinite planets.
 *
 * Nothing is stored. Everything is computed on-the-fly from the seed.
 * When you fly to coordinates (42, 17), the game says:
 * "At these coordinates, Rule 110 must exist." Your browser calculates
 * the planet into existence instantly.
 *
 * Ghost Planets: Lightweight planet descriptors (seed + orbit + type)
 * that exist as data only — no 3D mesh until you approach them.
 */

import { hashSeed, hashRange, hashFloat, hashRule, seededRandom, generateSeedChain } from '../generation/hashSeed.js';
import { classifyRule } from '../generation/cellularAutomata.js';
import { generatePlanetName, generateStarName, generateSystemLabel } from '../generation/nameGenerator.js';

// ============================================================
// STAR TYPES
// ============================================================

export const STAR_TYPES = [
    { id: 0, name: 'Red Dwarf',        color: [255, 120, 80],   temperature: 3000, size: 0.5,  luminosity: 0.04 },
    { id: 1, name: 'Orange Dwarf',     color: [255, 180, 100],  temperature: 4500, size: 0.7,  luminosity: 0.2  },
    { id: 2, name: 'Yellow Star',      color: [255, 240, 200],  temperature: 5800, size: 1.0,  luminosity: 1.0  },
    { id: 3, name: 'White Star',       color: [220, 230, 255],  temperature: 8000, size: 1.5,  luminosity: 5.0  },
    { id: 4, name: 'Blue Giant',       color: [150, 180, 255],  temperature: 15000, size: 3.0, luminosity: 25.0 },
    { id: 5, name: 'Red Giant',        color: [255, 100, 60],   temperature: 3500, size: 5.0,  luminosity: 40.0 },
];

// ============================================================
// PLANET ARCHETYPES (determined by CA rule class + seed)
// ============================================================

export const PLANET_ARCHETYPES = {
    BARREN:    { id: 0, name: 'Barren',    hasAtmosphere: false, hasOcean: false, hazardBase: 0.6 },
    DESERT:    { id: 1, name: 'Desert',    hasAtmosphere: true,  hasOcean: false, hazardBase: 0.4 },
    OCEANIC:   { id: 2, name: 'Oceanic',   hasAtmosphere: true,  hasOcean: true,  hazardBase: 0.1 },
    TEMPERATE: { id: 3, name: 'Temperate', hasAtmosphere: true,  hasOcean: true,  hazardBase: 0.0 },
    FROZEN:    { id: 4, name: 'Frozen',    hasAtmosphere: true,  hasOcean: false, hazardBase: 0.5 },
    VOLCANIC:  { id: 5, name: 'Volcanic',  hasAtmosphere: true,  hasOcean: false, hazardBase: 0.8 },
    EXOTIC:    { id: 6, name: 'Exotic',    hasAtmosphere: true,  hasOcean: true,  hazardBase: 0.3 },
    LUSH:      { id: 7, name: 'Lush',      hasAtmosphere: true,  hasOcean: true,  hazardBase: 0.0 },
};

const ARCHETYPE_LIST = Object.values(PLANET_ARCHETYPES);

// ============================================================
// GHOST PLANET — lightweight descriptor, no 3D mesh
// ============================================================

/**
 * Generate a Ghost Planet — all the data needed to describe a planet
 * without actually building its 3D mesh.
 *
 * @param {number} systemSeed - The star system's seed
 * @param {number} planetIndex - Orbital position (0 = closest to star)
 * @param {number} planetCount - Total planets in system
 * @returns {Object} Ghost planet descriptor
 */
export function generateGhostPlanet(systemSeed, planetIndex, planetCount) {
    const chain = {
        planet: hashSeed(systemSeed, 'planet', planetIndex),
    };
    chain.planetRule = hashSeed(chain.planet, 'rule') & 0xFF;
    chain.terrainSeed = hashSeed(chain.planet, 'terrain');

    const rng = seededRandom(chain.planet, 'properties');

    // Orbital distance — inner planets are closer, exponential spacing
    const normalizedOrbit = (planetIndex + 1) / (planetCount + 1);
    const orbitRadius = 3 + normalizedOrbit * 25; // 3 to 28 units from star

    // Planet size (0.3 to 2.0 relative scale)
    const sizeBase = 0.4 + rng() * 1.2;
    // Gas giants tend to be in middle orbits
    const isGasGiant = orbitRadius > 10 && orbitRadius < 22 && rng() < 0.3;
    const planetSize = isGasGiant ? sizeBase * 2.5 : sizeBase;

    // CA rule classification determines base archetype
    const classification = classifyRule(chain.planetRule);

    // Determine archetype from rule class + orbital position + seed
    const archetype = determineArchetype(classification, normalizedOrbit, rng);

    // Atmosphere color (seed-dependent)
    const atmosColor = generateAtmosphereColor(archetype, rng);

    // Orbital parameters
    const orbitSpeed = 0.3 / Math.pow(orbitRadius, 0.5); // Kepler-ish
    const orbitPhase = rng() * Math.PI * 2;
    const orbitTilt = (rng() - 0.5) * 0.15; // Slight orbital plane variation
    const axialTilt = (rng() - 0.5) * 0.5;  // Planet's own tilt

    // Ring system (10% chance, more likely for gas giants)
    const hasRings = rng() < (isGasGiant ? 0.4 : 0.08);

    // Moon count
    const moonCount = isGasGiant
        ? Math.floor(rng() * 5)
        : Math.floor(rng() * 3);

    const name = generatePlanetName(chain.planet);

    return {
        // Identity
        index: planetIndex,
        name,
        seed: chain.planet,
        rule: chain.planetRule,
        terrainSeed: chain.terrainSeed,

        // Classification
        ruleClass: classification.class,
        ruleLabel: classification.label,
        archetype,
        isGasGiant,

        // Orbital
        orbitRadius,
        orbitSpeed,
        orbitPhase,
        orbitTilt,
        axialTilt,

        // Physical
        size: planetSize,
        hasRings,
        moonCount,

        // Visual
        atmosColor,

        // State
        meshGenerated: false,
        mesh: null,
        currentAngle: orbitPhase,
    };
}

/**
 * Determine planet archetype from rule classification and orbital position.
 */
function determineArchetype(classification, normalizedOrbit, rng) {
    const roll = rng();

    // Close to star = hot
    if (normalizedOrbit < 0.2) {
        if (roll < 0.4) return PLANET_ARCHETYPES.VOLCANIC;
        if (roll < 0.7) return PLANET_ARCHETYPES.BARREN;
        return PLANET_ARCHETYPES.DESERT;
    }

    // Habitable zone (0.2 - 0.5)
    if (normalizedOrbit < 0.5) {
        // Chaotic rules (Class 3) = more interesting planets
        if (classification.class === 3) {
            if (roll < 0.3) return PLANET_ARCHETYPES.LUSH;
            if (roll < 0.6) return PLANET_ARCHETYPES.TEMPERATE;
            if (roll < 0.8) return PLANET_ARCHETYPES.OCEANIC;
            return PLANET_ARCHETYPES.EXOTIC;
        }
        // Complex rules (Class 4)
        if (classification.class === 4) {
            if (roll < 0.4) return PLANET_ARCHETYPES.EXOTIC;
            if (roll < 0.7) return PLANET_ARCHETYPES.TEMPERATE;
            return PLANET_ARCHETYPES.LUSH;
        }
        // Periodic (Class 2) = more barren
        if (roll < 0.3) return PLANET_ARCHETYPES.DESERT;
        if (roll < 0.6) return PLANET_ARCHETYPES.TEMPERATE;
        return PLANET_ARCHETYPES.BARREN;
    }

    // Outer zone (0.5 - 0.8)
    if (normalizedOrbit < 0.8) {
        if (roll < 0.3) return PLANET_ARCHETYPES.FROZEN;
        if (roll < 0.5) return PLANET_ARCHETYPES.OCEANIC;
        if (roll < 0.7) return PLANET_ARCHETYPES.BARREN;
        return PLANET_ARCHETYPES.TEMPERATE;
    }

    // Far out
    if (roll < 0.5) return PLANET_ARCHETYPES.FROZEN;
    if (roll < 0.8) return PLANET_ARCHETYPES.BARREN;
    return PLANET_ARCHETYPES.EXOTIC;
}

/**
 * Generate atmosphere color based on planet archetype.
 */
function generateAtmosphereColor(archetype, rng) {
    switch (archetype.id) {
        case 0: return [0.2, 0.2, 0.25];                          // Barren — faint gray
        case 1: return [0.8 + rng()*0.1, 0.5 + rng()*0.2, 0.2];  // Desert — orange
        case 2: return [0.2, 0.5 + rng()*0.2, 0.9];               // Oceanic — deep blue
        case 3: return [0.3, 0.6 + rng()*0.2, 0.9];               // Temperate — blue
        case 4: return [0.5, 0.7, 0.9 + rng()*0.1];               // Frozen — pale blue
        case 5: return [0.9, 0.3 + rng()*0.2, 0.1];               // Volcanic — red
        case 6: return [0.4 + rng()*0.4, 0.2 + rng()*0.3, 0.8];  // Exotic — purple/violet
        case 7: return [0.3, 0.7 + rng()*0.2, 0.5 + rng()*0.3];  // Lush — teal/green
        default: return [0.3, 0.55, 0.9];
    }
}

// ============================================================
// STAR SYSTEM — the star + its ghost planets
// ============================================================

/**
 * Generate a complete star system from coordinates.
 *
 * @param {number} galaxyId - Galaxy index (default 0 for now)
 * @param {number} systemX - X coordinate in galaxy
 * @param {number} systemY - Y coordinate in galaxy
 * @returns {Object} Star system with star info and ghost planets
 */
export function generateStarSystem(galaxyId, systemX, systemY) {
    const systemSeed = hashSeed('tgo', 'galaxy', galaxyId, 'system', systemX, systemY);
    const rng = seededRandom(systemSeed, 'system_props');

    // Star properties
    const starTypeId = hashRange(0, STAR_TYPES.length - 1, systemSeed, 'star');
    const starType = STAR_TYPES[starTypeId];
    const starName = generateStarName(systemSeed);
    const systemLabel = generateSystemLabel(systemSeed);

    // Number of planets (2-8, weighted toward 4-5)
    const planetCount = Math.min(8, Math.max(2,
        Math.round(3 + rng() * 3 + rng() * 2)
    ));

    // Generate ghost planets
    const planets = [];
    for (let i = 0; i < planetCount; i++) {
        planets.push(generateGhostPlanet(systemSeed, i, planetCount));
    }

    return {
        seed: systemSeed,
        coordinates: { galaxy: galaxyId, x: systemX, y: systemY },
        star: {
            name: starName,
            type: starType,
            catalog: systemLabel.catalog,
        },
        planets,
        planetCount,
    };
}

// ============================================================
// UNIVERSE MANAGER CLASS
// ============================================================

/**
 * The Universe Manager — orchestrates generation and manages
 * the current view of the universe.
 *
 * Usage:
 *   const universe = new UniverseManager(42);
 *   const system = universe.getSystem(10, 15);
 *   // system.planets[0] is a ghost planet
 *   // Call PlanetRenderer to build its mesh when the player approaches
 */
export class UniverseManager {
    constructor(universeSeed = 42) {
        this.universeSeed = universeSeed;
        this.galaxySeed = hashSeed('tgo', 'universe', universeSeed);

        // Cache recently visited systems
        this.systemCache = new Map();
        this.maxCachedSystems = 20;

        // Current location
        this.currentGalaxy = 0;
        this.currentSystem = null;
        this.currentPlanet = null;
    }

    /**
     * Get or generate a star system at given coordinates.
     * Results are cached for performance.
     */
    getSystem(x, y, galaxyId = 0) {
        const key = `${galaxyId}:${x}:${y}`;

        if (this.systemCache.has(key)) {
            return this.systemCache.get(key);
        }

        const system = generateStarSystem(galaxyId, x, y);

        // LRU-style cache eviction
        if (this.systemCache.size >= this.maxCachedSystems) {
            const firstKey = this.systemCache.keys().next().value;
            this.systemCache.delete(firstKey);
        }

        this.systemCache.set(key, system);
        return system;
    }

    /**
     * Navigate to a star system.
     * Returns the system data for rendering.
     */
    enterSystem(x, y, galaxyId = 0) {
        this.currentSystem = this.getSystem(x, y, galaxyId);
        this.currentPlanet = null;
        return this.currentSystem;
    }

    /**
     * Select a planet to approach.
     * Returns the ghost planet for the renderer to build.
     */
    approachPlanet(planetIndex) {
        if (!this.currentSystem) return null;
        if (planetIndex < 0 || planetIndex >= this.currentSystem.planets.length) return null;

        this.currentPlanet = this.currentSystem.planets[planetIndex];
        return this.currentPlanet;
    }

    /**
     * Generate nearby star systems for the galaxy map.
     * Returns an array of {x, y, system} within the given radius.
     */
    getNearbySystems(centerX, centerY, radius = 5, galaxyId = 0) {
        const systems = [];

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const x = centerX + dx;
                const y = centerY + dy;

                // Not every coordinate has a star — use hash to determine
                const starChance = hashFloat('tgo', 'starExists', galaxyId, x, y);
                if (starChance < 0.3) continue; // ~30% of coordinates have stars

                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > radius) continue;

                systems.push({
                    x, y,
                    distance: dist,
                    system: this.getSystem(x, y, galaxyId),
                });
            }
        }

        return systems.sort((a, b) => a.distance - b.distance);
    }

    /**
     * Get the current state for saving/loading.
     */
    getState() {
        return {
            universeSeed: this.universeSeed,
            currentGalaxy: this.currentGalaxy,
            currentSystem: this.currentSystem ? this.currentSystem.coordinates : null,
            currentPlanet: this.currentPlanet ? this.currentPlanet.index : null,
        };
    }
}
