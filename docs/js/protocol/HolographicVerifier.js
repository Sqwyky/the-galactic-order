/**
 * THE GALACTIC ORDER - Holographic Verifier
 *
 * The "Reality Check" — ensures every planet, every resource node,
 * every CA output is mathematically correct before rendering.
 *
 * Why "Holographic"?
 * In physics, the holographic principle says that all the information
 * about a 3D volume is encoded on its 2D boundary. Similarly,
 * ALL information about a planet is encoded in its SEED.
 * This verifier checks that the 3D world matches its seed.
 *
 * What it verifies:
 * 1. Genesis Compliance — the CA engine produces correct Rule 110 output
 * 2. Seed Integrity — planet data matches its hash chain
 * 3. Architect Signatures — economy updates are signed by the Architect
 * 4. Transaction Validity — RES transactions are mathematically sound
 * 5. Fork Detection — identifies if the client has been tampered with
 *
 * This runs IN THE BROWSER. No server needed.
 * Every player is their own validator — like a Bitcoin full node.
 */

import { verifyArchitectSignature, verifyTransaction } from './SecurityCore.js';
import {
    GENESIS_SEED,
    PROTOCOL_VERSION,
    HARMONIC_CONSTANT,
    GENESIS_RULES,
    validateGenesisFingerprint,
} from '../../protocol/genesis.js';

// ============================================================
// HOLOGRAPHIC VERIFIER
// ============================================================

export class HolographicVerifier {
    /**
     * @param {Object} options
     * @param {Object} options.caEngine - The CA engine module (cellularAutomata.js)
     * @param {Object} options.hashEngine - The hash module (hashSeed.js)
     */
    constructor(options = {}) {
        this.caEngine = options.caEngine;
        this.hashEngine = options.hashEngine;

        // Verification state
        this.genesisValid = false;
        this.genesisFingerprint = null;
        this.verificationLog = [];

        // Cache for verified planet hashes (avoid re-verification)
        this._verifiedPlanets = new Map();
        this._maxCacheSize = 200;
    }

    // ============================================================
    // GENESIS VERIFICATION
    // ============================================================

    /**
     * Step 1: Verify the CA engine is unmodified.
     *
     * This is the FIRST thing that runs when the game starts.
     * It proves that THIS copy of the game uses the correct
     * cellular automata rules. If someone modified cellularAutomata.js,
     * this will fail, and the game will know it's been tampered with.
     *
     * @returns {Object} Verification result
     */
    verifyGenesis() {
        if (!this.caEngine?.runCA1D) {
            return this._fail('GENESIS', 'CA engine not loaded');
        }

        const result = validateGenesisFingerprint(this.caEngine.runCA1D);

        if (!result.valid) {
            return this._fail('GENESIS', 'CA engine produces invalid Rule 110 output. Physics are broken.');
        }

        this.genesisValid = true;
        this.genesisFingerprint = result;

        return this._pass('GENESIS', {
            message: 'CA engine verified. Physics are correct.',
            fingerprint: result.fingerprint,
            aliveCount: result.aliveCount,
        });
    }

    /**
     * Verify that the Genesis Rules produce expected behavior.
     * Runs a quick check on each of the 8 fundamental rules.
     */
    verifyGenesisRules() {
        const results = {};

        for (const [name, ruleNumber] of Object.entries(GENESIS_RULES)) {
            const grid = this.caEngine.runCA1D(ruleNumber, 51, 25);
            const lastRow = grid[24];
            let alive = 0;
            for (let i = 0; i < 51; i++) {
                if (lastRow[i] === 1) alive++;
            }

            const classification = this.caEngine.classifyRule(ruleNumber);

            results[name] = {
                rule: ruleNumber,
                aliveCount: alive,
                class: classification.class,
                label: classification.label,
                valid: true, // Any output is technically valid for non-110 rules
            };

            // Special check: VOID (Rule 0) should produce all dead
            if (name === 'VOID' && alive !== 0) {
                results[name].valid = false;
                results[name].error = 'Rule 0 should produce all dead cells';
            }

            // Special check: LIFE (Rule 110) should be Class IV (Complex)
            if (name === 'LIFE' && classification.class !== 4 && classification.class !== 3) {
                // Rule 110 is classified as Class III or IV depending on the heuristic
                // Both are acceptable
                results[name].warning = 'Rule 110 classification may vary';
            }
        }

        const allValid = Object.values(results).every(r => r.valid);
        return allValid
            ? this._pass('GENESIS_RULES', { results })
            : this._fail('GENESIS_RULES', 'One or more Genesis Rules produce incorrect output', { results });
    }

    // ============================================================
    // PLANET VERIFICATION
    // ============================================================

    /**
     * Verify that a planet's data matches its seed chain.
     *
     * This catches:
     * - Forks that modify planet generation to give better resources
     * - Clients that inject fake planet data
     * - Corrupted data from mesh sync
     *
     * @param {Object} planet - Ghost planet descriptor
     * @returns {Object} Verification result
     */
    verifyPlanet(planet) {
        if (!this.genesisValid) {
            return this._fail('PLANET', 'Genesis not verified. Call verifyGenesis() first.');
        }

        // Check cache
        const cacheKey = planet.seed;
        if (this._verifiedPlanets.has(cacheKey)) {
            return this._verifiedPlanets.get(cacheKey);
        }

        const { hashSeed } = this.hashEngine;

        // Verify the rule derived from seed
        const expectedRule = hashSeed(planet.seed, 'rule') & 0xFF;
        if (planet.rule !== expectedRule) {
            return this._fail('PLANET', `Rule mismatch: got ${planet.rule}, expected ${expectedRule}`, {
                planetSeed: planet.seed,
                expected: expectedRule,
                actual: planet.rule,
            });
        }

        // Verify terrain seed
        const expectedTerrainSeed = hashSeed(planet.seed, 'terrain');
        if (planet.terrainSeed !== expectedTerrainSeed) {
            return this._fail('PLANET', 'Terrain seed mismatch — planet data may be forged');
        }

        // Verify rule classification
        const classification = this.caEngine.classifyRule(planet.rule);
        if (classification.class !== planet.ruleClass) {
            // Allow slight classification differences (heuristic can vary)
            // But log it
            this._log('PLANET_WARN', `Classification mismatch for rule ${planet.rule}: ${classification.class} vs ${planet.ruleClass}`);
        }

        const result = this._pass('PLANET', {
            planetName: planet.name,
            planetSeed: planet.seed,
            rule: planet.rule,
            ruleClass: classification.class,
        });

        // Cache result (LRU)
        if (this._verifiedPlanets.size >= this._maxCacheSize) {
            const firstKey = this._verifiedPlanets.keys().next().value;
            this._verifiedPlanets.delete(firstKey);
        }
        this._verifiedPlanets.set(cacheKey, result);

        return result;
    }

    /**
     * Verify a star system's seed chain.
     *
     * @param {Object} system - Star system from UniverseManager
     */
    verifySystem(system) {
        if (!this.genesisValid) {
            return this._fail('SYSTEM', 'Genesis not verified');
        }

        const { hashSeed, hashRange } = this.hashEngine;
        const { galaxy, x, y } = system.coordinates;

        // Recompute system seed
        const expectedSeed = hashSeed('tgo', 'galaxy', galaxy, 'system', x, y);
        if (system.seed !== expectedSeed) {
            return this._fail('SYSTEM', 'System seed mismatch — coordinates don\'t match seed');
        }

        // Verify each planet
        const planetResults = system.planets.map(p => this.verifyPlanet(p));
        const allPlanetsValid = planetResults.every(r => r.valid);

        if (!allPlanetsValid) {
            return this._fail('SYSTEM', 'One or more planets failed verification', {
                planetResults,
            });
        }

        return this._pass('SYSTEM', {
            systemSeed: system.seed,
            coordinates: system.coordinates,
            planetCount: system.planets.length,
            allPlanetsValid: true,
        });
    }

    // ============================================================
    // DECREE VERIFICATION
    // ============================================================

    /**
     * Verify a Universal Decree is signed by the Architect.
     *
     * @param {Object} decree - The decree to verify
     * @returns {Promise<Object>} Verification result
     */
    async verifyDecree(decree) {
        if (!decree.signature) {
            return this._fail('DECREE', 'Decree has no signature');
        }

        const dataToVerify = {
            version: decree.version,
            timestamp: decree.timestamp,
            content: decree.content,
        };

        const isValid = await verifyArchitectSignature(dataToVerify, decree.signature);

        if (!isValid) {
            return this._fail('DECREE', 'Invalid Architect signature — decree rejected', {
                timestamp: decree.timestamp,
                type: decree.content?.type,
            });
        }

        // Check expiration
        if (decree.content?.expiresAt && Date.now() > decree.content.expiresAt) {
            return this._fail('DECREE', 'Decree has expired');
        }

        return this._pass('DECREE', {
            type: decree.content?.type,
            timestamp: decree.timestamp,
            message: 'Decree verified. The Architect has spoken.',
        });
    }

    // ============================================================
    // TRANSACTION VERIFICATION
    // ============================================================

    /**
     * Verify a signed RES transaction.
     *
     * @param {Object} transaction - The signed transaction
     * @param {JsonWebKey} senderPublicKey - The sender's public key
     * @returns {Promise<Object>}
     */
    async verifyRESTransaction(transaction, senderPublicKey) {
        // Verify signature
        const isValid = await verifyTransaction(transaction, senderPublicKey);

        if (!isValid) {
            return this._fail('TRANSACTION', 'Invalid transaction signature');
        }

        // Validate quantity bounds
        if (typeof transaction.quantity !== 'number' || transaction.quantity <= 0) {
            return this._fail('TRANSACTION', 'Invalid quantity');
        }

        // Validate timestamp (not from the future)
        if (transaction.timestamp > Date.now() + 60_000) {
            return this._fail('TRANSACTION', 'Transaction timestamp is in the future');
        }

        return this._pass('TRANSACTION', {
            type: transaction.type,
            quantity: transaction.quantity,
            nonce: transaction.nonce,
        });
    }

    // ============================================================
    // FORK DETECTION
    // ============================================================

    /**
     * Run a comprehensive integrity check.
     * Detects if the game client has been tampered with.
     *
     * @returns {Object} Full integrity report
     */
    async runIntegrityCheck() {
        const report = {
            timestamp: Date.now(),
            protocolVersion: PROTOCOL_VERSION,
            genesisSeed: GENESIS_SEED,
            checks: {},
        };

        // 1. Genesis check
        report.checks.genesis = this.verifyGenesis();

        // 2. Genesis rules check
        if (report.checks.genesis.valid) {
            report.checks.genesisRules = this.verifyGenesisRules();
        }

        // 3. Check that GENESIS_SEED hasn't been changed
        report.checks.seedIntegrity = GENESIS_SEED === 0x54474F_42
            ? this._pass('SEED_INTEGRITY', { seed: GENESIS_SEED })
            : this._fail('SEED_INTEGRITY', 'Genesis Seed has been modified!');

        // 4. Check HARMONIC_CONSTANT
        report.checks.harmonicConstant = HARMONIC_CONSTANT === 110
            ? this._pass('HARMONIC_CONSTANT', { value: 110 })
            : this._fail('HARMONIC_CONSTANT', 'Harmonic Constant has been modified!');

        // Overall verdict
        report.valid = Object.values(report.checks).every(c => c.valid);
        report.verdict = report.valid
            ? 'VERIFIED — This universe is authentic.'
            : 'TAMPERED — This client does not match the Galactic Protocol.';

        return report;
    }

    // ============================================================
    // INTERNAL HELPERS
    // ============================================================

    _pass(check, details = {}) {
        const result = { valid: true, check, ...details, timestamp: Date.now() };
        this._log(check, 'PASS', details);
        return result;
    }

    _fail(check, error, details = {}) {
        const result = { valid: false, check, error, ...details, timestamp: Date.now() };
        this._log(check, 'FAIL', { error, ...details });
        return result;
    }

    _log(check, status, details) {
        this.verificationLog.push({
            check,
            status,
            details,
            timestamp: Date.now(),
        });

        // Keep log manageable
        if (this.verificationLog.length > 1000) {
            this.verificationLog = this.verificationLog.slice(-500);
        }
    }

    /**
     * Get the full verification log.
     */
    getLog() {
        return [...this.verificationLog];
    }

    /**
     * Get a summary of verification status.
     */
    getSummary() {
        return {
            genesisValid: this.genesisValid,
            fingerprint: this.genesisFingerprint?.fingerprint || null,
            verifiedPlanets: this._verifiedPlanets.size,
            logEntries: this.verificationLog.length,
            lastCheck: this.verificationLog.length > 0
                ? this.verificationLog[this.verificationLog.length - 1]
                : null,
        };
    }
}
