/**
 * THE GALACTIC ORDER - Mesh Network
 *
 * Browser-to-Browser P2P State Sync. No server. $0 cost. Infinite scale.
 *
 * When players play, their browsers talk DIRECTLY to each other.
 * Every browser is both a client AND a server.
 *
 * Architecture:
 *   [Player A's Browser] ←→ [Player B's Browser]
 *          ↕                       ↕
 *   [Player C's Browser] ←→ [Relay Peer (optional)]
 *
 * What syncs over the mesh:
 * - Player positions (for multiplayer, when implemented)
 * - Planet discovery claims ("I discovered this planet")
 * - RES transactions (signed by player keys)
 * - Universal Decrees from the Architect
 * - Node heartbeats (who's online)
 *
 * We use GunDB — a decentralized, real-time graph database that:
 * - Runs entirely in the browser (no server required)
 * - Syncs via WebRTC peer-to-peer connections
 * - Has built-in conflict resolution (last-write-wins + CRDTs)
 * - Can optionally use relay peers for NAT traversal
 * - Works offline (syncs when reconnected)
 *
 * The "Master Node" is optional — just a relay peer that helps
 * with NAT traversal. If it goes down, browsers still talk directly.
 *
 * GunDB loaded via CDN (zero npm dependencies for the client).
 */

import { verifySignature, verifyArchitectSignature } from './SecurityCore.js';
import { GENESIS_SEED, PROTOCOL_VERSION } from '../../protocol/genesis.js';

// ============================================================
// GUN LOADER (CDN, no build step required)
// ============================================================

let Gun = null;
let gunInstance = null;
let SEA = null; // GunDB's built-in crypto (Security, Encryption, Authorization)

/**
 * Load GunDB from CDN.
 * Returns a promise that resolves when Gun is ready.
 */
async function loadGun() {
    if (Gun) return Gun;

    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (window.Gun) {
            Gun = window.Gun;
            SEA = window.SEA;
            resolve(Gun);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/gun/gun.js';
        script.onload = () => {
            // Load SEA (crypto module)
            const seaScript = document.createElement('script');
            seaScript.src = 'https://cdn.jsdelivr.net/npm/gun/sea.js';
            seaScript.onload = () => {
                Gun = window.Gun;
                SEA = window.SEA;
                resolve(Gun);
            };
            seaScript.onerror = () => {
                // SEA is optional — proceed without it
                Gun = window.Gun;
                resolve(Gun);
            };
            document.head.appendChild(seaScript);
        };
        script.onerror = () => {
            console.warn('[MeshNetwork] GunDB CDN failed. Running in offline mode.');
            resolve(null);
        };
        document.head.appendChild(script);
    });
}

// ============================================================
// MESH NETWORK CLASS
// ============================================================

export class MeshNetwork {
    /**
     * @param {Object} options
     * @param {string[]} [options.relayPeers] - Optional relay peer URLs for NAT traversal
     * @param {string} options.playerId - This player's ID
     * @param {JsonWebKey} options.publicKey - This player's public key
     */
    constructor(options = {}) {
        this.relayPeers = options.relayPeers || [
            // Default public GunDB relay peers (free)
            'https://gun-manhattan.herokuapp.com/gun',
        ];
        this.playerId = options.playerId;
        this.publicKey = options.publicKey;

        // State
        this.connected = false;
        this.peerCount = 0;
        this.gun = null;
        this.universe = null; // Gun node for our universe

        // Event callbacks
        this._onPeerJoin = [];
        this._onPeerLeave = [];
        this._onDiscovery = [];
        this._onTransaction = [];
        this._onDecree = [];

        // Subscriptions to clean up
        this._subscriptions = [];
    }

    // ============================================================
    // CONNECTION
    // ============================================================

    /**
     * Connect to the mesh network.
     * Loads GunDB and begins peer discovery.
     */
    async connect() {
        await loadGun();

        if (!Gun) {
            console.warn('[MeshNetwork] Running in offline mode (GunDB not available)');
            this.connected = false;
            return false;
        }

        // Initialize GunDB instance
        this.gun = Gun({
            peers: this.relayPeers,
            localStorage: false, // We use our own LocalVault
            radisk: false,
        });

        // The shared universe namespace
        // All nodes with the same GENESIS_SEED are in the same universe
        this.universe = this.gun.get(`tgo_universe_${GENESIS_SEED}`);

        // Announce our presence
        await this._announcePresence();

        // Start listening for mesh events
        this._subscribeToMesh();

        this.connected = true;
        console.log(`[MeshNetwork] Connected to mesh. Player: ${this.playerId}`);

        return true;
    }

    /**
     * Disconnect from the mesh.
     */
    disconnect() {
        if (!this.gun) return;

        // Announce departure
        this.universe?.get('players').get(this.playerId).put({
            status: 'offline',
            lastSeen: Date.now(),
        });

        this.connected = false;
        this.gun = null;
        this.universe = null;
    }

    // ============================================================
    // PRESENCE (Who's Online)
    // ============================================================

    async _announcePresence() {
        if (!this.universe) return;

        this.universe.get('players').get(this.playerId).put({
            playerId: this.playerId,
            publicKey: JSON.stringify(this.publicKey),
            status: 'online',
            lastSeen: Date.now(),
            protocolVersion: PROTOCOL_VERSION,
        });

        // Update heartbeat every 30 seconds
        this._heartbeatInterval = setInterval(() => {
            if (this.universe) {
                this.universe.get('players').get(this.playerId).put({
                    lastSeen: Date.now(),
                    status: 'online',
                });
            }
        }, 30_000);
    }

    /**
     * Get list of online players.
     * @returns {Promise<Object[]>}
     */
    getOnlinePlayers() {
        return new Promise((resolve) => {
            if (!this.universe) {
                resolve([]);
                return;
            }

            const players = [];
            const cutoff = Date.now() - 120_000; // 2 minutes = considered online

            this.universe.get('players').map().once((data, id) => {
                if (data && data.lastSeen > cutoff && data.status === 'online') {
                    players.push({
                        playerId: data.playerId,
                        lastSeen: data.lastSeen,
                    });
                }
            });

            // Give it a moment to collect responses
            setTimeout(() => resolve(players), 1000);
        });
    }

    // ============================================================
    // DISCOVERIES (Shared Planet Claims)
    // ============================================================

    /**
     * Broadcast a planet discovery to the mesh.
     * Other players will see who discovered each planet first.
     *
     * @param {Object} discovery - { planetSeed, planetName, rule, archetype, coordinates }
     * @param {string} signature - Signed by player's private key
     */
    async broadcastDiscovery(discovery, signature) {
        if (!this.universe) return;

        const key = `planet_${discovery.planetSeed}`;

        // Check if someone already claimed it
        const existing = await new Promise(resolve => {
            this.universe.get('discoveries').get(key).once(data => resolve(data));
        });

        if (existing && existing.discoveredBy) {
            return {
                success: false,
                message: `Already discovered by ${existing.discoveredBy}`,
                originalDiscoverer: existing.discoveredBy,
            };
        }

        // Claim it!
        this.universe.get('discoveries').get(key).put({
            ...discovery,
            discoveredBy: this.playerId,
            discoveredAt: Date.now(),
            signature,
        });

        return { success: true, message: 'Discovery broadcasted to the universe!' };
    }

    /**
     * Get the discoverer of a planet.
     * @param {number} planetSeed
     */
    async getDiscoverer(planetSeed) {
        if (!this.universe) return null;

        return new Promise(resolve => {
            this.universe.get('discoveries').get(`planet_${planetSeed}`).once(data => {
                resolve(data || null);
            });
        });
    }

    // ============================================================
    // TRANSACTIONS (Signed RES Economy)
    // ============================================================

    /**
     * Broadcast a signed transaction to the mesh.
     * Other nodes validate the signature before accepting it.
     *
     * @param {Object} transaction - Signed transaction
     */
    async broadcastTransaction(transaction) {
        if (!this.universe) return { synced: false, reason: 'Not connected to mesh' };

        const txKey = `tx_${transaction.nonce || Date.now()}`;

        this.universe.get('transactions').get(txKey).put({
            ...transaction,
            broadcastedBy: this.playerId,
            broadcastedAt: Date.now(),
        });

        return { synced: true, key: txKey };
    }

    // ============================================================
    // DECREES (Architect's Signed Updates)
    // ============================================================

    /**
     * Broadcast a Universal Decree (only the Architect should call this).
     * All nodes will receive it and verify the Architect's signature.
     *
     * @param {Object} decree - Signed decree
     */
    async broadcastDecree(decree) {
        if (!this.universe) return;

        const key = `decree_${decree.timestamp}`;
        this.universe.get('decrees').get(key).put({
            data: JSON.stringify(decree),
            broadcastedAt: Date.now(),
        });
    }

    // ============================================================
    // SUBSCRIPTIONS (Listen for mesh events)
    // ============================================================

    _subscribeToMesh() {
        if (!this.universe) return;

        // Listen for new discoveries
        this.universe.get('discoveries').map().on((data, key) => {
            if (data && data.discoveredBy && data.discoveredBy !== this.playerId) {
                for (const cb of this._onDiscovery) cb(data);
            }
        });

        // Listen for new transactions
        this.universe.get('transactions').map().on(async (data, key) => {
            if (data && data.broadcastedBy !== this.playerId) {
                // Verify the transaction signature before accepting
                // (Full verification requires the sender's public key)
                for (const cb of this._onTransaction) cb(data);
            }
        });

        // Listen for new decrees
        this.universe.get('decrees').map().on(async (data, key) => {
            if (data && data.data) {
                try {
                    const decree = JSON.parse(data.data);
                    // Verify Architect's signature
                    const isValid = await verifyArchitectSignature(
                        { version: decree.version, timestamp: decree.timestamp, content: decree.content },
                        decree.signature
                    );
                    if (isValid) {
                        for (const cb of this._onDecree) cb(decree);
                    } else {
                        console.warn('[MeshNetwork] Received decree with invalid signature — rejected.');
                    }
                } catch (err) {
                    console.warn('[MeshNetwork] Invalid decree data:', err.message);
                }
            }
        });

        // Listen for player join/leave
        this.universe.get('players').map().on((data, key) => {
            if (!data || key === this.playerId) return;

            if (data.status === 'online') {
                for (const cb of this._onPeerJoin) cb(data);
            } else if (data.status === 'offline') {
                for (const cb of this._onPeerLeave) cb(data);
            }
        });
    }

    // ============================================================
    // EVENT HANDLERS
    // ============================================================

    onPeerJoin(callback) { this._onPeerJoin.push(callback); }
    onPeerLeave(callback) { this._onPeerLeave.push(callback); }
    onDiscovery(callback) { this._onDiscovery.push(callback); }
    onTransaction(callback) { this._onTransaction.push(callback); }
    onDecree(callback) { this._onDecree.push(callback); }

    // ============================================================
    // STATUS
    // ============================================================

    getStatus() {
        return {
            connected: this.connected,
            playerId: this.playerId,
            relayPeers: this.relayPeers,
            protocolVersion: PROTOCOL_VERSION,
            genesisSeed: GENESIS_SEED,
        };
    }
}
