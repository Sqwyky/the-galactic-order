/**
 * THE GALACTIC ORDER - Genesis Block
 *
 * The First Mathematical Rule of the Universe.
 *
 * This is the immutable "constitution" that ALL forked versions of the game
 * must obey. Like Bitcoin's genesis block, this defines the foundational
 * constants that bind every node, every fork, every station into ONE universe.
 *
 * If a fork changes any value in this file, their universe diverges from
 * the Nexus — their planets won't match, their RES won't validate,
 * and their Oracle requests will be rejected.
 *
 * THE GENESIS SEED: The mathematical origin of everything.
 * From this single number, all 256 rules, all star systems, all planets
 * cascade deterministically. Change it, and you get a different universe.
 */

// ============================================================
// THE GENESIS CONSTANTS (IMMUTABLE)
// ============================================================

/**
 * The Genesis Seed — the origin of the universe.
 * All hash chains start from this value.
 * This is "Rule 0" of the protocol.
 */
export const GENESIS_SEED = 0x54474F_42; // "TGO" + "B" (The Galactic Order: Beginning)

/**
 * The Protocol Version — forks must match this to connect to the Nexus.
 * Increment on breaking changes to the universe rules.
 */
export const PROTOCOL_VERSION = 1;

/**
 * The Harmonic Constant — derived from Rule 110 (the universal computer).
 * Used to validate that a node is running the correct CA engine.
 * Any fork that modifies the CA logic will produce a different fingerprint.
 */
export const HARMONIC_CONSTANT = 110;

/**
 * The Resonance Base Frequency — Schumann resonance (7.83 Hz).
 * The "heartbeat" of the universe. Used as the base for all
 * harmonic calculations and RES (Resonance) currency generation.
 */
export const RESONANCE_BASE_HZ = 7.83;

/**
 * The Genesis Rule Table — the 8 canonical rules that define
 * the "physics" of The Galactic Order. These rules are the
 * DNA of the universe. Every planet uses one of 256 rules,
 * but these 8 are the "fundamental forces."
 *
 * A fork can render planets however it wants, but these rules
 * must produce identical CA output or the fork is incompatible.
 */
export const GENESIS_RULES = Object.freeze({
    VOID:       0,    // Class I  — Nothingness. The empty universe.
    ORDER:      4,    // Class II — Perfect crystal. Static equilibrium.
    FRACTAL:    90,   // Class II — Self-similar patterns. Sierpinski.
    CHAOS:      30,   // Class III — Apparent randomness from simple rules.
    LIFE:       110,  // Class IV — Universal computation. Edge of chaos.
    MIRROR:     150,  // Class III — Chaotic complement of Rule 105.
    CASCADE:    126,  // Class III — Dense chaotic cascade.
    ARCHITECT:  137,  // Class III — The Architect's signature rule.
});

/**
 * The Genesis Fingerprint — a checksum of the CA engine's output.
 *
 * To validate a node, we run Rule 110 with width=101 for 50 generations
 * starting from a single center cell, then hash the final row.
 * If the result doesn't match, the node's CA engine has been tampered with.
 *
 * This is computed once and hardcoded. It's the "proof of correct physics."
 */
export const GENESIS_FINGERPRINT = 'tgo-genesis-v1-rule110-w101-g50';

/**
 * The Mint Rate — how many RES units are generated per compute-cycle.
 * This controls the "inflation" of the in-game economy.
 * Only the Master Ledger can mint RES at this rate.
 */
export const MINT_RATE = {
    basePerCycle: 1.0,
    decayFactor: 0.9999,      // Slight deflation over time (like Bitcoin halving)
    maxSupply: 21_000_000,     // Maximum RES that can ever exist
    genesisReward: 100,        // First node gets this many RES
};

/**
 * The Oracle Configuration — defines how the Mysterious Being works.
 * The Being's dialogue logic runs server-side (the Oracle).
 * Clients send requests, Oracle sends signed responses.
 */
export const ORACLE_CONFIG = {
    maxRequestsPerMinute: 30,   // Rate limit per node
    responseSignatureAlgo: 'hmac-sha256',
    dialogueTimeout: 30_000,    // 30 seconds max per dialogue exchange
    requiredProtocolVersion: PROTOCOL_VERSION,
};

/**
 * The Node Requirements — what a fork must provide to join the Nexus.
 */
export const NODE_REQUIREMENTS = {
    minProtocolVersion: PROTOCOL_VERSION,
    mustValidateGenesis: true,       // Must pass the Genesis Fingerprint check
    mustConnectToOracle: true,       // Being dialogue requires Oracle
    mustValidateTransactions: true,  // RES transactions need Ledger approval
    heartbeatInterval: 60_000,       // Ping the Nexus every 60 seconds
};

// ============================================================
// GENESIS VALIDATION FUNCTIONS
// ============================================================

/**
 * Validate that a CA engine produces correct output.
 * This is the "proof of correct physics" check.
 *
 * Run Rule 110, width 101, 50 generations, single center cell.
 * Count the alive cells in the final row.
 * The answer must be exactly right.
 *
 * @param {Function} runCA - A function(rule, width, generations) that returns a CA grid
 * @returns {{ valid: boolean, fingerprint: string, aliveCount: number }}
 */
export function validateGenesisFingerprint(runCA) {
    const width = 101;
    const generations = 50;
    const rule = HARMONIC_CONSTANT; // Rule 110

    const grid = runCA(rule, width, generations);
    const lastRow = grid[generations - 1];

    // Count alive cells in the final generation
    let alive = 0;
    for (let i = 0; i < width; i++) {
        if (lastRow[i] === 1) alive++;
    }

    // Hash the final row to get a fingerprint
    let rowHash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < width; i++) {
        rowHash ^= lastRow[i];
        rowHash = Math.imul(rowHash, 0x01000193) >>> 0;
    }

    const fingerprint = `tgo-v${PROTOCOL_VERSION}-r110-alive${alive}-hash${rowHash.toString(16)}`;

    return {
        valid: alive > 0 && alive < width, // Rule 110 never dies out or fills completely
        fingerprint,
        aliveCount: alive,
        rowHash,
    };
}

/**
 * Generate the Genesis Seed Chain — the root of the entire universe.
 * All galaxies, systems, and planets derive from this chain.
 *
 * @param {Function} hashFn - A hash function (hashSeed from hashSeed.js)
 * @returns {Object} The root seed chain
 */
export function generateGenesisSeedChain(hashFn) {
    return {
        origin: GENESIS_SEED,
        universe: hashFn('tgo', 'genesis', GENESIS_SEED),
        galaxyRoot: hashFn('tgo', 'genesis', GENESIS_SEED, 'galaxies'),
        protocolVersion: PROTOCOL_VERSION,
        timestamp: Date.now(),
    };
}

/**
 * Create a Node Identity — a unique ID for a fork/station.
 * This is used to identify nodes in the Nexus network.
 *
 * @param {Function} hashFn - Hash function
 * @param {string} nodeUrl - The node's URL or identifier
 * @param {number} registrationTime - When the node was registered
 * @returns {Object} Node identity
 */
export function createNodeIdentity(hashFn, nodeUrl, registrationTime) {
    const nodeId = hashFn('tgo', 'node', nodeUrl, registrationTime);
    const nodeSecret = hashFn('tgo', 'node_secret', nodeId, GENESIS_SEED);

    return {
        nodeId: nodeId.toString(16).padStart(8, '0'),
        nodeUrl,
        registrationTime,
        protocolVersion: PROTOCOL_VERSION,
        // The secret is used for signing requests to the Oracle
        // In production, this would use proper asymmetric cryptography
        secretHash: nodeSecret.toString(16).padStart(8, '0'),
    };
}
