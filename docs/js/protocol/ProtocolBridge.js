/**
 * THE GALACTIC ORDER - Protocol Bridge
 *
 * The Master Connector — wires together the entire serverless architecture.
 *
 * This is the ONE module the game imports. It initializes and orchestrates:
 *   SecurityCore → LocalVault → MeshNetwork → HolographicVerifier
 *
 * Startup sequence:
 * ================
 * 1. Check Web Crypto availability
 * 2. Open the LocalVault (IndexedDB)
 * 3. Create or restore player identity
 * 4. Verify Genesis (CA engine integrity)
 * 5. Connect to the Mesh Network (P2P)
 * 6. Run integrity check
 * 7. Load cached Architect Decrees
 * 8. Ready to play — zero servers contacted.
 *
 * For the game code, usage is simple:
 *
 *   import { ProtocolBridge } from './protocol/ProtocolBridge.js';
 *
 *   const protocol = new ProtocolBridge();
 *   await protocol.initialize(caEngine, hashEngine);
 *
 *   // Now the player has an identity, the CA engine is verified,
 *   // and the mesh is connected. Everything is encrypted and P2P.
 *
 *   protocol.mine('carbon', 25, planetSeed);     // Records locally + syncs
 *   protocol.refine('refine_carbon', 30);         // Validates + records
 *   protocol.discoverPlanet(ghostPlanet);         // Claims on the mesh
 *   const key = await protocol.getAPIKey();        // Decrypted from vault
 */

import { isCryptoAvailable, signTransaction, signData } from './SecurityCore.js';
import { LocalVault } from './LocalVault.js';
import { MeshNetwork } from './MeshNetwork.js';
import { HolographicVerifier } from './HolographicVerifier.js';
import { PROTOCOL_VERSION, GENESIS_SEED } from '../../protocol/genesis.js';

// ============================================================
// PROTOCOL BRIDGE
// ============================================================

export class ProtocolBridge {
    constructor() {
        // Sub-systems
        this.vault = new LocalVault();
        this.mesh = null;
        this.verifier = null;

        // State
        this.initialized = false;
        this.playerId = null;
        this.genesisValid = false;
        this.meshConnected = false;
        this.integrityReport = null;

        // Economy (local cache, synced via mesh)
        this.resBalance = 0;
        this.pendingTransactions = [];
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================

    /**
     * Initialize the entire protocol stack.
     * This is called ONCE when the game starts.
     *
     * @param {Object} caEngine - cellularAutomata module
     * @param {Object} hashEngine - hashSeed module
     * @param {Object} [options]
     * @param {string[]} [options.relayPeers] - Custom GunDB relay peers
     * @param {boolean} [options.connectMesh=true] - Whether to connect to P2P mesh
     * @returns {Promise<Object>} Initialization report
     */
    async initialize(caEngine, hashEngine, options = {}) {
        const report = {
            steps: [],
            success: false,
            playerId: null,
            error: null,
        };

        try {
            // Step 1: Check crypto
            if (!isCryptoAvailable()) {
                throw new Error('Web Crypto API not available. Use a modern browser (HTTPS required).');
            }
            report.steps.push({ step: 'crypto_check', status: 'ok' });

            // Step 2: Initialize the Verifier
            this.verifier = new HolographicVerifier({ caEngine, hashEngine });
            report.steps.push({ step: 'verifier_init', status: 'ok' });

            // Step 3: Verify Genesis (CA engine integrity)
            const genesisResult = this.verifier.verifyGenesis();
            this.genesisValid = genesisResult.valid;
            report.steps.push({
                step: 'genesis_verify',
                status: genesisResult.valid ? 'ok' : 'FAILED',
                fingerprint: genesisResult.fingerprint,
            });

            if (!genesisResult.valid) {
                throw new Error('Genesis verification failed. CA engine may be tampered with.');
            }

            // Step 4: Open the Vault
            const hasIdentity = await this.vault.hasIdentity();

            if (hasIdentity) {
                // Returning player — try auto-unlock
                const unlocked = await this.vault.unlock();
                if (unlocked) {
                    this.playerId = this.vault.getPlayerId();
                    report.steps.push({ step: 'vault_unlock', status: 'ok', returning: true });
                } else {
                    // Auto-unlock failed — create new identity
                    const identity = await this.vault.createIdentity();
                    await this.vault.enableAutoUnlock();
                    this.playerId = identity.playerId;
                    report.steps.push({ step: 'vault_create', status: 'ok', newPlayer: true });
                }
            } else {
                // New player — create identity
                const identity = await this.vault.createIdentity();
                await this.vault.enableAutoUnlock();
                this.playerId = identity.playerId;
                report.steps.push({ step: 'vault_create', status: 'ok', newPlayer: true });
            }

            // Step 5: Load economy data
            const economy = await this.vault.loadEconomy();
            if (economy) {
                this.resBalance = economy.balance || 0;
                this.pendingTransactions = economy.pendingTxs || [];
            }
            report.steps.push({ step: 'economy_load', status: 'ok', balance: this.resBalance });

            // Step 6: Connect to Mesh (optional)
            if (options.connectMesh !== false) {
                this.mesh = new MeshNetwork({
                    relayPeers: options.relayPeers,
                    playerId: this.playerId,
                    publicKey: this.vault.getPlayerPublicKey(),
                });

                const meshResult = await this.mesh.connect();
                this.meshConnected = meshResult;
                report.steps.push({
                    step: 'mesh_connect',
                    status: meshResult ? 'ok' : 'offline',
                });

                // Set up mesh event handlers
                this._setupMeshHandlers();
            } else {
                report.steps.push({ step: 'mesh_connect', status: 'skipped' });
            }

            // Step 7: Run full integrity check
            this.integrityReport = await this.verifier.runIntegrityCheck();
            report.steps.push({
                step: 'integrity_check',
                status: this.integrityReport.valid ? 'ok' : 'WARNING',
                verdict: this.integrityReport.verdict,
            });

            // Done!
            this.initialized = true;
            report.success = true;
            report.playerId = this.playerId;

            console.log(`[ProtocolBridge] Initialized. Player: ${this.playerId}`);
            console.log(`[ProtocolBridge] Genesis: ${genesisResult.fingerprint}`);
            console.log(`[ProtocolBridge] Mesh: ${this.meshConnected ? 'Connected' : 'Offline'}`);
            console.log(`[ProtocolBridge] Integrity: ${this.integrityReport.verdict}`);

        } catch (err) {
            report.success = false;
            report.error = err.message;
            console.error('[ProtocolBridge] Initialization failed:', err);
        }

        return report;
    }

    // ============================================================
    // ECONOMY OPERATIONS (Mine, Refine, Trade)
    // ============================================================

    /**
     * Record a mining operation.
     * Stores locally in vault + broadcasts to mesh.
     *
     * @param {string} elementId - What was mined
     * @param {number} quantity - How much
     * @param {number} planetSeed - Where it was mined
     * @param {number} planetRule - The planet's CA rule (for validation)
     * @returns {Promise<Object>} Transaction receipt
     */
    async mine(elementId, quantity, planetSeed, planetRule) {
        this._requireInit();

        const tx = {
            type: 'mine',
            elementId,
            quantity,
            planetSeed,
            planetRule,
            playerId: this.playerId,
        };

        // Sign the transaction
        const signedTx = await signTransaction(tx, this.vault.getPlayerPrivateKey());

        // Store locally
        await this.vault.addPendingTransaction(signedTx);

        // Broadcast to mesh
        if (this.meshConnected) {
            await this.mesh.broadcastTransaction(signedTx);
        }

        return { success: true, receipt: signedTx.nonce };
    }

    /**
     * Record a refinery operation.
     */
    async refine(recipeId, chosenRule, outputElement, outputQuantity) {
        this._requireInit();

        const tx = {
            type: 'refine',
            recipeId,
            chosenRule,
            elementId: outputElement,
            quantity: outputQuantity,
            playerId: this.playerId,
        };

        const signedTx = await signTransaction(tx, this.vault.getPlayerPrivateKey());
        await this.vault.addPendingTransaction(signedTx);

        if (this.meshConnected) {
            await this.mesh.broadcastTransaction(signedTx);
        }

        return { success: true, receipt: signedTx.nonce };
    }

    // ============================================================
    // DISCOVERY SYSTEM
    // ============================================================

    /**
     * Claim a planet discovery.
     * Records locally and broadcasts to the mesh.
     * First player to broadcast claims the discovery.
     *
     * @param {Object} ghostPlanet - The planet descriptor
     * @returns {Promise<Object>}
     */
    async discoverPlanet(ghostPlanet) {
        this._requireInit();

        // Verify the planet first
        const verification = this.verifier.verifyPlanet(ghostPlanet);
        if (!verification.valid) {
            return { success: false, error: 'Planet failed verification: ' + verification.error };
        }

        const discovery = {
            planetSeed: ghostPlanet.seed,
            planetName: ghostPlanet.name,
            rule: ghostPlanet.rule,
            archetype: ghostPlanet.archetype?.name,
            ruleClass: ghostPlanet.ruleClass,
        };

        // Record locally
        await this.vault.recordDiscovery(discovery);

        // Sign and broadcast to mesh
        const signature = await signData(discovery, this.vault.getPlayerPrivateKey());

        if (this.meshConnected) {
            return await this.mesh.broadcastDiscovery(discovery, signature);
        }

        return { success: true, message: 'Discovery recorded locally (offline).' };
    }

    /**
     * Check who discovered a planet.
     * @param {number} planetSeed
     */
    async getDiscoverer(planetSeed) {
        // Check mesh first
        if (this.meshConnected) {
            const meshResult = await this.mesh.getDiscoverer(planetSeed);
            if (meshResult) return meshResult;
        }

        // Fall back to local vault
        const local = await this.vault.isDiscovered(planetSeed);
        if (local) {
            return { discoveredBy: this.playerId, source: 'local' };
        }

        return null;
    }

    // ============================================================
    // API KEY MANAGEMENT
    // ============================================================

    /**
     * Store the Gemini API key securely in the vault.
     * Encrypted with AES-256-GCM. Even we can't read it.
     *
     * @param {string} apiKey
     */
    async storeAPIKey(apiKey) {
        this._requireInit();
        await this.vault.storeAPIKey(apiKey);
    }

    /**
     * Retrieve the decrypted API key.
     * @returns {Promise<string|null>}
     */
    async getAPIKey() {
        this._requireInit();
        return this.vault.getAPIKey();
    }

    /**
     * Check if an API key is stored.
     */
    async hasAPIKey() {
        return this.vault.hasAPIKey();
    }

    // ============================================================
    // INVENTORY PERSISTENCE
    // ============================================================

    /**
     * Save inventory to the vault.
     * @param {Object} inventoryData
     */
    async saveInventory(inventoryData) {
        await this.vault.saveInventory(inventoryData);
    }

    /**
     * Load inventory from the vault.
     */
    async loadInventory() {
        return this.vault.loadInventory();
    }

    // ============================================================
    // VERIFICATION PASS-THROUGH
    // ============================================================

    /**
     * Verify a planet's integrity.
     */
    verifyPlanet(ghostPlanet) {
        return this.verifier?.verifyPlanet(ghostPlanet) || { valid: false, error: 'Not initialized' };
    }

    /**
     * Verify a star system.
     */
    verifySystem(system) {
        return this.verifier?.verifySystem(system) || { valid: false, error: 'Not initialized' };
    }

    /**
     * Get the full integrity report.
     */
    getIntegrityReport() {
        return this.integrityReport;
    }

    // ============================================================
    // MESH PASS-THROUGH
    // ============================================================

    /**
     * Get online players.
     */
    async getOnlinePlayers() {
        if (!this.meshConnected) return [];
        return this.mesh.getOnlinePlayers();
    }

    /**
     * Listen for mesh events.
     */
    onPeerJoin(cb) { this.mesh?.onPeerJoin(cb); }
    onPeerLeave(cb) { this.mesh?.onPeerLeave(cb); }
    onDiscovery(cb) { this.mesh?.onDiscovery(cb); }
    onDecree(cb) { this.mesh?.onDecree(cb); }

    // ============================================================
    // STATUS
    // ============================================================

    /**
     * Get the full protocol status.
     */
    getStatus() {
        return {
            initialized: this.initialized,
            protocolVersion: PROTOCOL_VERSION,
            genesisSeed: GENESIS_SEED,
            playerId: this.playerId,
            genesisValid: this.genesisValid,
            meshConnected: this.meshConnected,
            vaultUnlocked: this.vault.isUnlocked,
            resBalance: this.resBalance,
            pendingTransactions: this.pendingTransactions.length,
            integrity: this.integrityReport?.valid ?? null,
            verdict: this.integrityReport?.verdict ?? 'Not checked',
        };
    }

    // ============================================================
    // PRIVATE HELPERS
    // ============================================================

    _requireInit() {
        if (!this.initialized) {
            throw new Error('[ProtocolBridge] Not initialized. Call initialize() first.');
        }
    }

    _setupMeshHandlers() {
        if (!this.mesh) return;

        // When another player discovers a planet
        this.mesh.onDiscovery((discovery) => {
            console.log(`[Mesh] Planet discovered by ${discovery.discoveredBy}: ${discovery.planetName}`);
        });

        // When an Architect decree arrives
        this.mesh.onDecree(async (decree) => {
            console.log(`[Mesh] Architect Decree received: ${decree.content?.type}`);
            // Verify and store
            const result = await this.verifier.verifyDecree(decree);
            if (result.valid) {
                await this.vault.storeDecree(decree);
                console.log('[Mesh] Decree verified and stored.');
            } else {
                console.warn('[Mesh] Decree verification FAILED — rejected.');
            }
        });

        // When a peer joins
        this.mesh.onPeerJoin((peer) => {
            console.log(`[Mesh] Peer joined: ${peer.playerId}`);
        });
    }

    /**
     * Gracefully shut down.
     */
    async shutdown() {
        // Save current state
        if (this.vault.isUnlocked) {
            await this.vault.saveEconomy({
                balance: this.resBalance,
                pendingTxs: this.pendingTransactions,
            });
        }

        // Disconnect mesh
        if (this.mesh) {
            this.mesh.disconnect();
        }

        // Lock vault
        this.vault.lock();
        this.initialized = false;
    }
}

// ============================================================
// SINGLETON EXPORT
// The entire game uses ONE ProtocolBridge instance.
// ============================================================

export const protocol = new ProtocolBridge();
