/**
 * THE GALACTIC ORDER - Deterministic Seed Hashing
 *
 * FNV-1a hash function for generating deterministic seeds from any input.
 * This is the glue between "Galaxy 0, System 42, Planet 3" and the actual
 * CA rule + parameters used to generate that planet.
 *
 * CRITICAL: This must produce identical results across:
 * - Different browsers (Chrome, Firefox, Edge)
 * - Different operating systems
 * - Server (Node.js) and client (browser)
 *
 * FNV-1a is chosen because:
 * - Simple to implement (no dependencies)
 * - Good avalanche properties (small input change → big output change)
 * - Fast (just XOR and multiply per byte)
 * - Fits in 32-bit unsigned integer (JavaScript safe)
 */

// FNV-1a constants (32-bit)
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a hash function.
 * Takes any number of arguments, converts them to strings,
 * and produces a deterministic 32-bit unsigned integer.
 *
 * Usage:
 *   hashSeed('galaxy', 0, 'system', 42)         → always the same uint32
 *   hashSeed('galaxy', 0, 'system', 42, 'planet', 3) → different uint32
 *   hashSeed('Planet-X-Rule-110')                → always the same uint32
 *
 * @param {...(string|number)} args - Values to hash
 * @returns {number} 32-bit unsigned integer
 */
export function hashSeed(...args) {
    let hash = FNV_OFFSET_BASIS;

    for (const arg of args) {
        const str = String(arg);
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, FNV_PRIME) >>> 0; // >>> 0 forces unsigned 32-bit
        }
    }

    return hash >>> 0;
}

/**
 * Hash a seed and map it to a range [min, max] (inclusive).
 *
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {...(string|number)} args - Values to hash
 * @returns {number} Integer in [min, max]
 */
export function hashRange(min, max, ...args) {
    const hash = hashSeed(...args);
    return min + (hash % (max - min + 1));
}

/**
 * Hash a seed and return a float in [0, 1).
 *
 * @param {...(string|number)} args - Values to hash
 * @returns {number} Float in [0, 1)
 */
export function hashFloat(...args) {
    const hash = hashSeed(...args);
    return hash / 0x100000000; // Divide by 2^32
}

/**
 * Derive a CA rule number (0-255) from a seed.
 *
 * @param {...(string|number)} args - Values to hash
 * @returns {number} Rule number (0-255)
 */
export function hashRule(...args) {
    return hashSeed(...args) & 0xFF; // Mask to 8 bits
}

/**
 * Deterministic pseudo-random number generator (seeded).
 * Returns a function that produces a sequence of floats in [0, 1).
 * Same seed = same sequence, always.
 *
 * Uses a simple mulberry32 PRNG seeded from FNV-1a.
 *
 * @param {...(string|number)} args - Seed values
 * @returns {function(): number} A function that returns the next random float
 */
export function seededRandom(...args) {
    let state = hashSeed(...args);

    return function () {
        state |= 0;
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
}

// ============================================================
// SEED CHAIN: Generate the full hierarchy of seeds
// ============================================================

/**
 * Generate the complete seed chain for a location in the universe.
 *
 * Universe hierarchy:
 *   Galaxy Cluster → Galaxy → Star System → Planet → Region
 *
 * Each level's seed is derived from its parent, ensuring:
 * - Same coordinates = same world (deterministic)
 * - Different coordinates = different world (good distribution)
 *
 * @param {number} galaxyId - Galaxy index
 * @param {number} systemX - Star system X coordinate
 * @param {number} systemY - Star system Y coordinate
 * @param {number} [planetIndex] - Planet index in system (optional)
 * @returns {Object} Seed chain with numeric seeds at each level
 */
export function generateSeedChain(galaxyId, systemX, systemY, planetIndex = null) {
    const chain = {
        galaxy: hashSeed('tgo', 'galaxy', galaxyId),
        system: hashSeed('tgo', 'galaxy', galaxyId, 'system', systemX, systemY),
    };

    // System seed determines star properties and planet count
    chain.starType = hashRange(0, 5, chain.system, 'star');
    chain.planetCount = hashRange(2, 6, chain.system, 'planetcount');

    // Planet-level seeds (if requested)
    if (planetIndex !== null) {
        chain.planet = hashSeed(chain.system, 'planet', planetIndex);
        chain.planetRule = hashSeed(chain.planet, 'rule') & 0xFF;
        chain.terrainSeed = hashSeed(chain.planet, 'terrain');
        chain.biomeSeed = hashSeed(chain.planet, 'biome');
        chain.floraSeed = hashSeed(chain.planet, 'flora');
        chain.creatureSeed = hashSeed(chain.planet, 'creature');
        chain.resourceSeed = hashSeed(chain.planet, 'resource');
        chain.rockSeed = hashSeed(chain.planet, 'rock');
        chain.frequencySeed = hashSeed(chain.planet, 'frequency');
    }

    return chain;
}
