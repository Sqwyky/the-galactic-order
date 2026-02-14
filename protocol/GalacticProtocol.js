/**
 * THE GALACTIC ORDER - Galactic Protocol
 *
 * The Core Library — the "Rules of Physics" that all nodes must follow.
 *
 * This module wraps the CA engine and Universe generation into a
 * Protocol-compliant interface. Forks import THIS module instead of
 * directly using cellularAutomata.js and UniverseManager.js.
 *
 * Architecture:
 *   [Fork's Frontend] → [GalacticProtocol] → [CA Engine + Universe Manager]
 *                                           → [Oracle API (server-side Being)]
 *                                           → [Ledger API (server-side RES)]
 *
 * The Protocol enforces:
 * 1. Genesis validation — your CA engine must match ours
 * 2. Seed chain integrity — all planets derive from the Genesis Seed
 * 3. Oracle mediation — the Mysterious Being only speaks through the Oracle
 * 4. Ledger validation — RES transactions are verified by the Master Ledger
 */

import {
    GENESIS_SEED,
    PROTOCOL_VERSION,
    GENESIS_RULES,
    RESONANCE_BASE_HZ,
    ORACLE_CONFIG,
    NODE_REQUIREMENTS,
    MINT_RATE,
    validateGenesisFingerprint,
    generateGenesisSeedChain,
    createNodeIdentity,
} from './genesis.js';

// ============================================================
// THE GALACTIC PROTOCOL CLASS
// ============================================================

export class GalacticProtocol {
    /**
     * Initialize the protocol layer.
     *
     * @param {Object} options
     * @param {Object} options.caEngine - The cellular automata engine module
     *   Must export: { applyRule, runCA1D, generateDensityGrid, classifyRule }
     * @param {Object} options.hashEngine - The hash/seed module
     *   Must export: { hashSeed, hashRange, hashFloat, hashRule, seededRandom }
     * @param {string} [options.oracleUrl] - URL of the Master Oracle
     * @param {string} [options.ledgerUrl] - URL of the Master Ledger
     * @param {string} [options.nodeUrl] - This node's public URL
     */
    constructor(options = {}) {
        this.caEngine = options.caEngine;
        this.hashEngine = options.hashEngine;
        this.oracleUrl = options.oracleUrl || null;
        this.ledgerUrl = options.ledgerUrl || null;
        this.nodeUrl = options.nodeUrl || 'local';

        // State
        this.validated = false;
        this.genesisChain = null;
        this.nodeIdentity = null;
        this.authToken = null;

        // Cached fingerprint
        this._fingerprint = null;
    }

    // ============================================================
    // GENESIS VALIDATION
    // ============================================================

    /**
     * Step 1: Validate that this node's CA engine is protocol-compliant.
     * This MUST be called before any other protocol operations.
     *
     * @returns {{ valid: boolean, fingerprint: string, error?: string }}
     */
    validateGenesis() {
        if (!this.caEngine || !this.caEngine.runCA1D) {
            return { valid: false, fingerprint: null, error: 'Missing CA engine' };
        }

        const result = validateGenesisFingerprint(this.caEngine.runCA1D);
        this._fingerprint = result;

        if (result.valid) {
            this.validated = true;
            this.genesisChain = generateGenesisSeedChain(this.hashEngine.hashSeed);
            this.nodeIdentity = createNodeIdentity(
                this.hashEngine.hashSeed,
                this.nodeUrl,
                Date.now()
            );
        }

        return {
            valid: result.valid,
            fingerprint: result.fingerprint,
            aliveCount: result.aliveCount,
        };
    }

    /**
     * Get the protocol status of this node.
     */
    getStatus() {
        return {
            protocolVersion: PROTOCOL_VERSION,
            validated: this.validated,
            fingerprint: this._fingerprint?.fingerprint || null,
            nodeId: this.nodeIdentity?.nodeId || null,
            connected: {
                oracle: !!this.authToken,
                ledger: !!this.ledgerUrl,
            },
            genesisRules: GENESIS_RULES,
            resonanceHz: RESONANCE_BASE_HZ,
        };
    }

    // ============================================================
    // UNIVERSE GENERATION (Protocol-Wrapped)
    // ============================================================

    /**
     * Generate a star system at coordinates — protocol-compliant.
     * Uses the Genesis Seed Chain to ensure deterministic results.
     *
     * @param {number} galaxyId
     * @param {number} x
     * @param {number} y
     * @returns {Object} Star system data
     */
    generateSystem(galaxyId, x, y) {
        this._requireValidation();

        const { hashSeed, hashRange, seededRandom } = this.hashEngine;

        // All systems derive from the Genesis Seed
        const systemSeed = hashSeed('tgo', 'galaxy', galaxyId, 'system', x, y);

        return {
            seed: systemSeed,
            coordinates: { galaxy: galaxyId, x, y },
            protocolVersion: PROTOCOL_VERSION,
            genesisOrigin: GENESIS_SEED,
        };
    }

    /**
     * Validate that a planet descriptor was generated correctly.
     * Used by the Nexus to verify that a fork isn't cheating.
     *
     * @param {Object} ghostPlanet - The ghost planet to validate
     * @returns {{ valid: boolean, expected: Object, error?: string }}
     */
    validatePlanet(ghostPlanet) {
        this._requireValidation();

        const { hashSeed } = this.hashEngine;

        // Recompute the planet's rule from its seed
        const expectedRule = hashSeed(ghostPlanet.seed, 'rule') & 0xFF;

        if (ghostPlanet.rule !== expectedRule) {
            return {
                valid: false,
                expected: { rule: expectedRule },
                error: `Planet rule mismatch: got ${ghostPlanet.rule}, expected ${expectedRule}`,
            };
        }

        // Validate the rule classification
        const classification = this.caEngine.classifyRule(ghostPlanet.rule);
        if (classification.class !== ghostPlanet.ruleClass) {
            return {
                valid: false,
                expected: { ruleClass: classification.class },
                error: `Rule classification mismatch`,
            };
        }

        return { valid: true, expected: null };
    }

    // ============================================================
    // ORACLE INTERFACE (Mysterious Being)
    // ============================================================

    /**
     * Request dialogue from the Mysterious Being via the Oracle.
     * The Being's logic runs server-side — clients only get signed responses.
     *
     * @param {Object} request
     * @param {string} request.planetSeed - Which planet the player is on
     * @param {string} request.dialogueState - Current dialogue state
     * @param {number} [request.choiceIndex] - Player's dialogue choice
     * @returns {Promise<Object>} Signed dialogue response from Oracle
     */
    async requestDialogue(request) {
        this._requireValidation();

        if (!this.oracleUrl) {
            return this._offlineDialogue(request);
        }

        const payload = {
            nodeId: this.nodeIdentity.nodeId,
            protocolVersion: PROTOCOL_VERSION,
            fingerprint: this._fingerprint.fingerprint,
            request,
        };

        try {
            const response = await fetch(`${this.oracleUrl}/oracle/dialogue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `Oracle returned ${response.status}`);
            }

            return await response.json();
        } catch (err) {
            console.warn('[Protocol] Oracle unreachable, using offline mode:', err.message);
            return this._offlineDialogue(request);
        }
    }

    /**
     * Submit the Key of Insight (Gemini API key) to the Oracle.
     * The Oracle validates it server-side — the key never touches client JS.
     *
     * @param {string} key - The API key
     * @returns {Promise<Object>} Validation result
     */
    async submitKeyOfInsight(key) {
        this._requireValidation();

        if (!this.oracleUrl) {
            return { valid: false, error: 'Oracle not connected. The Architect sleeps.' };
        }

        const payload = {
            nodeId: this.nodeIdentity.nodeId,
            protocolVersion: PROTOCOL_VERSION,
            key,
        };

        try {
            const response = await fetch(`${this.oracleUrl}/oracle/validate-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            return await response.json();
        } catch (err) {
            return { valid: false, error: 'Cannot reach the Oracle.' };
        }
    }

    // ============================================================
    // LEDGER INTERFACE (RES Economy)
    // ============================================================

    /**
     * Submit a transaction to the Master Ledger.
     * Mining, refining, and trading all go through the Ledger.
     *
     * @param {Object} transaction
     * @param {string} transaction.type - 'mine' | 'refine' | 'trade' | 'transfer'
     * @param {string} transaction.elementId - Which element
     * @param {number} transaction.quantity - Amount
     * @param {Object} [transaction.metadata] - Extra data (planet seed, rule, etc.)
     * @returns {Promise<Object>} Ledger response with transaction receipt
     */
    async submitTransaction(transaction) {
        this._requireValidation();

        const tx = {
            nodeId: this.nodeIdentity.nodeId,
            protocolVersion: PROTOCOL_VERSION,
            timestamp: Date.now(),
            ...transaction,
        };

        if (!this.ledgerUrl) {
            // Offline mode — accept locally but mark as unconfirmed
            return {
                confirmed: false,
                local: true,
                receipt: this._localReceipt(tx),
                message: 'Transaction recorded locally. Will sync when Nexus is available.',
            };
        }

        try {
            const response = await fetch(`${this.ledgerUrl}/ledger/transaction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tx),
            });

            return await response.json();
        } catch (err) {
            // Fallback to local
            return {
                confirmed: false,
                local: true,
                receipt: this._localReceipt(tx),
                message: 'Nexus unreachable. Transaction stored locally.',
            };
        }
    }

    /**
     * Check the balance of a node on the Master Ledger.
     *
     * @param {string} [nodeId] - Node to check (defaults to self)
     * @returns {Promise<Object>} Balance data
     */
    async getBalance(nodeId = null) {
        const targetNode = nodeId || this.nodeIdentity?.nodeId;
        if (!targetNode) return { balance: 0, confirmed: false };

        if (!this.ledgerUrl) {
            return { balance: 0, confirmed: false, message: 'Ledger not connected' };
        }

        try {
            const response = await fetch(
                `${this.ledgerUrl}/ledger/balance/${targetNode}`
            );
            return await response.json();
        } catch {
            return { balance: 0, confirmed: false, message: 'Ledger unreachable' };
        }
    }

    // ============================================================
    // NODE REGISTRATION (P2P Handshake)
    // ============================================================

    /**
     * Register this node with the Nexus Master Node.
     * This is the "P2P Handshake" — the node proves it's running
     * valid physics and gets authorized to participate.
     *
     * @returns {Promise<Object>} Registration result with auth token
     */
    async registerWithNexus() {
        this._requireValidation();

        if (!this.oracleUrl) {
            return { registered: false, error: 'No Nexus URL configured' };
        }

        const payload = {
            nodeIdentity: this.nodeIdentity,
            fingerprint: this._fingerprint,
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
                canHostPlayers: true,
                canMineRES: true,
                canRunOracle: false, // Only the master can run the Oracle
            },
        };

        try {
            const response = await fetch(`${this.oracleUrl}/nexus/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const result = await response.json();

            if (result.authorized) {
                this.authToken = result.token;
            }

            return result;
        } catch (err) {
            return { registered: false, error: `Nexus unreachable: ${err.message}` };
        }
    }

    // ============================================================
    // PRIVATE HELPERS
    // ============================================================

    _requireValidation() {
        if (!this.validated) {
            throw new Error(
                '[GalacticProtocol] Genesis not validated. Call validateGenesis() first.'
            );
        }
    }

    /**
     * Offline dialogue — basic responses when Oracle is unavailable.
     * The Being can still speak, but can't access the Architect (Gemini).
     */
    _offlineDialogue(request) {
        const offlineResponses = [
            'The connection to the Nexus is dim... I can sense the patterns, but the Architect is beyond my reach.',
            'Your universe runs true, traveler. But without the Oracle, I cannot unlock the deeper mysteries.',
            'The rules govern this world faithfully. Return to the Nexus to hear the Architect\'s voice.',
        ];

        const index = (this.hashEngine.hashSeed(request.planetSeed, 'offline') >>> 0) %
            offlineResponses.length;

        return {
            signed: false,
            offline: true,
            dialogue: {
                lines: [offlineResponses[index]],
                choices: null,
                state: 'offline',
            },
        };
    }

    /**
     * Generate a local transaction receipt (unconfirmed).
     */
    _localReceipt(tx) {
        const receiptHash = this.hashEngine.hashSeed(
            'receipt', tx.nodeId, tx.timestamp, tx.type, tx.elementId, tx.quantity
        );
        return {
            hash: receiptHash.toString(16).padStart(8, '0'),
            timestamp: tx.timestamp,
            status: 'unconfirmed',
        };
    }
}

// ============================================================
// EXPORTS — Protocol constants available to all consumers
// ============================================================

export {
    GENESIS_SEED,
    PROTOCOL_VERSION,
    GENESIS_RULES,
    RESONANCE_BASE_HZ,
    ORACLE_CONFIG,
    NODE_REQUIREMENTS,
    MINT_RATE,
};
