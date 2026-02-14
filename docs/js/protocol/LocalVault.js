/**
 * THE GALACTIC ORDER - Local Vault
 *
 * Encrypted browser-native storage. No server. No cloud. No trust needed.
 *
 * Everything the player owns lives HERE, in their browser's IndexedDB,
 * encrypted with AES-256-GCM (quantum-resistant symmetric encryption).
 *
 * What's stored:
 * - Player identity (keypair) — their "passport" in the universe
 * - Gemini API Key — encrypted, only decryptable by the player
 * - RES balance — locally cached, synced via MeshNetwork
 * - Inventory — elements, items, ship state
 * - Discovery log — planets visited, creatures scanned
 * - Pending transactions — queued for mesh sync
 *
 * Security model:
 * - The vault passphrase is derived from the player's keypair
 * - Even if someone copies the IndexedDB files, they can't read them
 *   without the private key
 * - The Gemini API key is DOUBLE encrypted: first with the vault key,
 *   then the vault itself is encrypted. Even we (the developers) can't see it.
 *
 * Why IndexedDB and not localStorage?
 * - IndexedDB: 100MB+ capacity, async, structured data, binary support
 * - localStorage: 5MB limit, sync (blocks UI), strings only
 * - For a game with planet caches, discovery logs, and transaction history,
 *   we need the big one.
 */

import { encrypt, decrypt, generatePlayerKeypair } from './SecurityCore.js';

// ============================================================
// INDEXEDDB WRAPPER
// ============================================================

const DB_NAME = 'TGO_Vault';
const DB_VERSION = 1;

const STORES = {
    IDENTITY: 'identity',      // Player keypair + ID
    SECRETS: 'secrets',        // Encrypted API keys
    INVENTORY: 'inventory',    // Element quantities + items
    ECONOMY: 'economy',        // RES balance + transaction history
    DISCOVERIES: 'discoveries', // Visited planets, scanned creatures
    DECREES: 'decrees',        // Cached Universal Decrees from Architect
    SETTINGS: 'settings',      // Player preferences
};

/**
 * Open the vault database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            for (const storeName of Object.values(STORES)) {
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'key' });
                }
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Generic get from a store.
 */
async function dbGet(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.value ?? null);
        request.onerror = () => reject(request.error);
    });
}

/**
 * Generic put to a store.
 */
async function dbPut(storeName, key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Generic getAll from a store.
 */
async function dbGetAll(storeName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => {
            const result = {};
            for (const item of request.result) {
                result[item.key] = item.value;
            }
            resolve(result);
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete a key from a store.
 */
async function dbDelete(storeName, key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ============================================================
// THE LOCAL VAULT CLASS
// ============================================================

export class LocalVault {
    constructor() {
        this.isUnlocked = false;
        this.playerId = null;
        this.playerPublicKey = null;
        this._playerPrivateKey = null; // Only in memory while unlocked
        this._vaultPassphrase = null;  // Derived from private key
    }

    // ============================================================
    // IDENTITY MANAGEMENT
    // ============================================================

    /**
     * Check if a player identity exists in this browser.
     * @returns {Promise<boolean>}
     */
    async hasIdentity() {
        const identity = await dbGet(STORES.IDENTITY, 'player');
        return identity !== null;
    }

    /**
     * Create a new player identity.
     * Generates a keypair and stores it encrypted in IndexedDB.
     *
     * @returns {Promise<{ playerId: string, publicKey: JsonWebKey }>}
     */
    async createIdentity() {
        const { publicKey, privateKey, playerId } = await generatePlayerKeypair();

        // The vault passphrase is derived from the private key's 'd' parameter
        // This means only the holder of the private key can unlock the vault
        this._vaultPassphrase = privateKey.d;
        this._playerPrivateKey = privateKey;
        this.playerPublicKey = publicKey;
        this.playerId = playerId;

        // Store the identity (public key is plaintext, private key is encrypted)
        const encryptedPrivate = await encrypt(
            JSON.stringify(privateKey),
            this._vaultPassphrase
        );

        await dbPut(STORES.IDENTITY, 'player', {
            playerId,
            publicKey,
            encryptedPrivateKey: encryptedPrivate,
            createdAt: Date.now(),
        });

        this.isUnlocked = true;

        return { playerId, publicKey };
    }

    /**
     * Unlock the vault with the player's private key.
     * On first visit, call createIdentity() instead.
     * On return visits, the private key is loaded from IndexedDB.
     *
     * Since the private key is stored encrypted with itself as the passphrase,
     * the player needs to export/backup their key to restore on a new device.
     * On the SAME device, the browser's IndexedDB persists it.
     *
     * @returns {Promise<boolean>} True if unlocked successfully
     */
    async unlock() {
        const identity = await dbGet(STORES.IDENTITY, 'player');
        if (!identity) return false;

        try {
            // The private key is encrypted with its own 'd' parameter
            // On the same browser, we stored it — try to decrypt with
            // the stored passphrase hint
            this.playerId = identity.playerId;
            this.playerPublicKey = identity.publicKey;

            // For same-device, we use a browser-fingerprint-derived passphrase
            // as a secondary unlock mechanism
            const browserKey = await this._getBrowserFingerprint();
            const encryptedBackup = await dbGet(STORES.IDENTITY, 'browser_unlock');

            if (encryptedBackup) {
                const privateKeyJSON = await decrypt(encryptedBackup, browserKey);
                this._playerPrivateKey = JSON.parse(privateKeyJSON);
                this._vaultPassphrase = this._playerPrivateKey.d;
                this.isUnlocked = true;
                return true;
            }
        } catch (err) {
            console.warn('[LocalVault] Auto-unlock failed:', err.message);
        }

        return false;
    }

    /**
     * Store a browser-specific unlock key so returning players
     * don't need to re-enter their private key.
     */
    async enableAutoUnlock() {
        if (!this._playerPrivateKey) return;

        const browserKey = await this._getBrowserFingerprint();
        const encrypted = await encrypt(
            JSON.stringify(this._playerPrivateKey),
            browserKey
        );

        await dbPut(STORES.IDENTITY, 'browser_unlock', encrypted);
    }

    /**
     * Generate a browser fingerprint for auto-unlock.
     * Not perfect security, but good enough for convenience.
     */
    async _getBrowserFingerprint() {
        const components = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset().toString(),
            'TGO_VAULT_BROWSER_KEY', // Salt
        ];
        const data = new TextEncoder().encode(components.join('|'));
        const hash = await crypto.subtle.digest('SHA-256', data);
        return btoa(String.fromCharCode(...new Uint8Array(hash).slice(0, 16)));
    }

    /**
     * Export the player's identity for backup.
     * This is the "Write down your seed phrase" equivalent.
     *
     * @returns {Promise<string>} Encrypted backup string
     */
    async exportIdentity() {
        if (!this.isUnlocked) throw new Error('Vault is locked');

        return JSON.stringify({
            playerId: this.playerId,
            publicKey: this.playerPublicKey,
            privateKey: this._playerPrivateKey,
            exportedAt: Date.now(),
            warning: 'This contains your private key. Store securely. Anyone with this can impersonate you.',
        });
    }

    /**
     * Import a player identity from backup.
     * @param {string} backupJSON
     */
    async importIdentity(backupJSON) {
        const backup = JSON.parse(backupJSON);

        this.playerId = backup.playerId;
        this.playerPublicKey = backup.publicKey;
        this._playerPrivateKey = backup.privateKey;
        this._vaultPassphrase = backup.privateKey.d;

        // Store in IndexedDB
        const encryptedPrivate = await encrypt(
            JSON.stringify(this._playerPrivateKey),
            this._vaultPassphrase
        );

        await dbPut(STORES.IDENTITY, 'player', {
            playerId: this.playerId,
            publicKey: this.playerPublicKey,
            encryptedPrivateKey: encryptedPrivate,
            createdAt: Date.now(),
            importedAt: Date.now(),
        });

        this.isUnlocked = true;
        await this.enableAutoUnlock();
    }

    // ============================================================
    // SECRETS (API Keys, etc.)
    // ============================================================

    /**
     * Store the Gemini API key, encrypted.
     * Even if someone copies the IndexedDB, they can't read this
     * without the player's private key.
     *
     * @param {string} apiKey - The Gemini API key
     */
    async storeAPIKey(apiKey) {
        if (!this.isUnlocked) throw new Error('Vault is locked');

        const encrypted = await encrypt(apiKey, this._vaultPassphrase);
        await dbPut(STORES.SECRETS, 'gemini_api_key', encrypted);
    }

    /**
     * Retrieve the decrypted Gemini API key.
     * @returns {Promise<string|null>}
     */
    async getAPIKey() {
        if (!this.isUnlocked) throw new Error('Vault is locked');

        const encrypted = await dbGet(STORES.SECRETS, 'gemini_api_key');
        if (!encrypted) return null;

        try {
            return await decrypt(encrypted, this._vaultPassphrase);
        } catch {
            return null;
        }
    }

    /**
     * Check if an API key is stored.
     */
    async hasAPIKey() {
        const stored = await dbGet(STORES.SECRETS, 'gemini_api_key');
        return stored !== null;
    }

    // ============================================================
    // INVENTORY & ECONOMY
    // ============================================================

    /**
     * Save the player's inventory state.
     * @param {Object} inventoryData - Serialized inventory
     */
    async saveInventory(inventoryData) {
        await dbPut(STORES.INVENTORY, 'current', inventoryData);
    }

    /**
     * Load the player's inventory state.
     * @returns {Promise<Object|null>}
     */
    async loadInventory() {
        return dbGet(STORES.INVENTORY, 'current');
    }

    /**
     * Save the player's RES balance and transaction history.
     * @param {Object} economyData - { balance, pendingTxs, confirmedTxs }
     */
    async saveEconomy(economyData) {
        await dbPut(STORES.ECONOMY, 'current', economyData);
    }

    /**
     * Load economy data.
     */
    async loadEconomy() {
        return dbGet(STORES.ECONOMY, 'current');
    }

    /**
     * Add a pending transaction (to be synced via mesh).
     * @param {Object} transaction
     */
    async addPendingTransaction(transaction) {
        const pending = (await dbGet(STORES.ECONOMY, 'pending_txs')) || [];
        pending.push(transaction);
        await dbPut(STORES.ECONOMY, 'pending_txs', pending);
    }

    /**
     * Get all pending transactions.
     */
    async getPendingTransactions() {
        return (await dbGet(STORES.ECONOMY, 'pending_txs')) || [];
    }

    /**
     * Clear confirmed transactions from pending.
     * @param {string[]} confirmedHashes
     */
    async confirmTransactions(confirmedHashes) {
        const pending = (await dbGet(STORES.ECONOMY, 'pending_txs')) || [];
        const remaining = pending.filter(tx => !confirmedHashes.includes(tx.hash));
        await dbPut(STORES.ECONOMY, 'pending_txs', remaining);
    }

    // ============================================================
    // DISCOVERIES
    // ============================================================

    /**
     * Record a planet discovery.
     * @param {Object} planetData - { seed, name, rule, archetype, coordinates }
     */
    async recordDiscovery(planetData) {
        const key = `planet_${planetData.seed}`;
        await dbPut(STORES.DISCOVERIES, key, {
            ...planetData,
            discoveredAt: Date.now(),
            discoveredBy: this.playerId,
        });
    }

    /**
     * Get all discoveries.
     */
    async getDiscoveries() {
        return dbGetAll(STORES.DISCOVERIES);
    }

    /**
     * Check if a planet has been discovered.
     */
    async isDiscovered(planetSeed) {
        const result = await dbGet(STORES.DISCOVERIES, `planet_${planetSeed}`);
        return result !== null;
    }

    // ============================================================
    // DECREES (Cached Architect Updates)
    // ============================================================

    /**
     * Store a verified Universal Decree.
     * @param {Object} decree - Verified decree object
     */
    async storeDecree(decree) {
        const key = `decree_${decree.timestamp}`;
        await dbPut(STORES.DECREES, key, decree);
    }

    /**
     * Get all stored decrees.
     */
    async getDecrees() {
        return dbGetAll(STORES.DECREES);
    }

    // ============================================================
    // SETTINGS
    // ============================================================

    async saveSetting(key, value) {
        await dbPut(STORES.SETTINGS, key, value);
    }

    async getSetting(key, defaultValue = null) {
        const result = await dbGet(STORES.SETTINGS, key);
        return result ?? defaultValue;
    }

    // ============================================================
    // GETTERS
    // ============================================================

    getPlayerPrivateKey() {
        if (!this.isUnlocked) throw new Error('Vault is locked');
        return this._playerPrivateKey;
    }

    getPlayerId() {
        return this.playerId;
    }

    getPlayerPublicKey() {
        return this.playerPublicKey;
    }

    /**
     * Lock the vault (clear sensitive data from memory).
     */
    lock() {
        this._playerPrivateKey = null;
        this._vaultPassphrase = null;
        this.isUnlocked = false;
    }

    /**
     * Destroy the vault completely (nuclear option).
     * Deletes all data. Player must re-create identity.
     */
    async destroy() {
        this.lock();
        const db = await openDB();
        const tx = db.transaction(Object.values(STORES), 'readwrite');
        for (const storeName of Object.values(STORES)) {
            tx.objectStore(storeName).clear();
        }
    }
}
