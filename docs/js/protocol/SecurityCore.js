/**
 * THE GALACTIC ORDER - Security Core
 *
 * Post-Quantum-Ready Cryptographic Foundation.
 *
 * This is the "Scepter" — the mechanism by which the Architect
 * maintains control over a completely serverless, free-to-run universe.
 *
 * How it works:
 * ============
 * 1. The Architect generates a MASTER KEYPAIR. The PUBLIC key is embedded
 *    in the game code. The PRIVATE key is held ONLY by the Architect.
 *
 * 2. When the Architect issues a "Universal Decree" (economy update,
 *    rule change, new content), they SIGN it with the private key.
 *
 * 3. Every fork, every browser, every player VERIFIES the signature
 *    using the embedded public key. If it doesn't match, the decree
 *    is rejected. No server needed — pure math.
 *
 * 4. If someone forks the game and changes the public key, they've
 *    created a DIFFERENT universe. Their RES doesn't work in ours.
 *    Their planets don't match. They're outside the Nexus.
 *
 * Crypto Stack (all browser-native, ZERO dependencies):
 * - ECDSA P-256 for digital signatures (upgradeable to Dilithium PQC)
 * - AES-256-GCM for local encryption (quantum-resistant symmetric)
 * - PBKDF2 for key derivation
 * - Web Crypto API (SubtleCrypto) — built into every modern browser
 *
 * PQC Readiness:
 * - The architecture is abstracted behind sign/verify/encrypt/decrypt
 * - When browser-native PQC lands (Kyber/Dilithium), we swap the
 *   algorithm parameter. The rest of the code doesn't change.
 * - AES-256-GCM is already quantum-resistant (Grover's algorithm
 *   only reduces it to ~128-bit equivalent, still unbreakable).
 */

// ============================================================
// THE ARCHITECT'S MASTER PUBLIC KEY
// ============================================================
// This is embedded in every copy of the game.
// Only the holder of the corresponding private key can sign decrees.
// Changing this = creating a different universe.
//
// Generated once by the Architect, NEVER changes.
// Format: JWK (JSON Web Key) for Web Crypto API compatibility.
// ============================================================

const ARCHITECT_PUBLIC_KEY_JWK = {
    kty: 'EC',
    crv: 'P-256',
    // These are PLACEHOLDER values — the Architect must generate
    // the real keypair using generateArchitectKeypair() ONCE,
    // then embed the public key here permanently.
    x: 'ARCHITECT_PUBLIC_KEY_NOT_YET_GENERATED',
    y: 'ARCHITECT_PUBLIC_KEY_NOT_YET_GENERATED',
    ext: true,
};

// Will be set to true once the Architect generates and embeds the real key
let ARCHITECT_KEY_INITIALIZED = false;

// ============================================================
// WEB CRYPTO INTERFACE
// ============================================================

const crypto = globalThis.crypto;
const subtle = crypto?.subtle;

/**
 * Check if the Web Crypto API is available.
 */
export function isCryptoAvailable() {
    return !!(crypto && subtle);
}

// ============================================================
// KEY GENERATION
// ============================================================

/**
 * Generate the Architect's Master Keypair.
 *
 * THIS FUNCTION SHOULD BE CALLED EXACTLY ONCE BY THE ARCHITECT.
 * The output private key must be saved securely (offline).
 * The output public key must be embedded in ARCHITECT_PUBLIC_KEY_JWK above.
 *
 * After embedding, this function is only used for verification/testing.
 *
 * @returns {Promise<{ publicKey: JsonWebKey, privateKey: JsonWebKey, instructions: string }>}
 */
export async function generateArchitectKeypair() {
    if (!subtle) throw new Error('Web Crypto not available');

    const keypair = await subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true, // extractable — we need to export it
        ['sign', 'verify']
    );

    const publicJWK = await subtle.exportKey('jwk', keypair.publicKey);
    const privateJWK = await subtle.exportKey('jwk', keypair.privateKey);

    return {
        publicKey: publicJWK,
        privateKey: privateJWK,
        instructions: [
            '=== THE ARCHITECT\'S SCEPTER ===',
            '',
            '1. SAVE the privateKey JSON somewhere SECURE and OFFLINE.',
            '   This is YOUR control over the entire universe.',
            '   Lose it = lose control. Leak it = anyone can sign decrees.',
            '',
            '2. COPY the publicKey x and y values into',
            '   ARCHITECT_PUBLIC_KEY_JWK in SecurityCore.js',
            '',
            '3. Set ARCHITECT_KEY_INITIALIZED = true',
            '',
            '4. Commit and push. Every fork will now verify against YOUR key.',
            '',
            '5. NEVER run this function again for production.',
            '   One universe. One key. One Architect.',
        ].join('\n'),
    };
}

/**
 * Generate a Player Keypair.
 * Each player gets their own keypair for identity and local encryption.
 * This is their "Self-Sovereign Identity" — no email, no password, just math.
 *
 * @returns {Promise<{ publicKey: JsonWebKey, privateKey: JsonWebKey, playerId: string }>}
 */
export async function generatePlayerKeypair() {
    if (!subtle) throw new Error('Web Crypto not available');

    // Signing keypair (for identity/signing transactions)
    const signingPair = await subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
    );

    const publicJWK = await subtle.exportKey('jwk', signingPair.publicKey);
    const privateJWK = await subtle.exportKey('jwk', signingPair.privateKey);

    // Derive a human-readable player ID from the public key
    const idBytes = new TextEncoder().encode(publicJWK.x + publicJWK.y);
    const hashBuffer = await subtle.digest('SHA-256', idBytes);
    const hashArray = new Uint8Array(hashBuffer);
    const playerId = 'TGO-' + Array.from(hashArray.slice(0, 6))
        .map(b => b.toString(16).padStart(2, '0')).join('');

    return {
        publicKey: publicJWK,
        privateKey: privateJWK,
        playerId,
    };
}

// ============================================================
// SIGNING & VERIFICATION (The Scepter)
// ============================================================

/**
 * Import a JWK key for signing.
 * @param {JsonWebKey} jwk
 * @param {'sign'|'verify'} usage
 */
async function importSigningKey(jwk, usage) {
    return subtle.importKey(
        'jwk', jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        [usage]
    );
}

/**
 * Sign data with a private key.
 * Used by the Architect to sign Universal Decrees.
 * Used by players to sign their transactions.
 *
 * @param {Object|string} data - Data to sign (will be JSON-stringified)
 * @param {JsonWebKey} privateKeyJWK - The signer's private key
 * @returns {Promise<string>} Base64-encoded signature
 */
export async function signData(data, privateKeyJWK) {
    if (!subtle) throw new Error('Web Crypto not available');

    const key = await importSigningKey(privateKeyJWK, 'sign');
    const encoded = new TextEncoder().encode(
        typeof data === 'string' ? data : JSON.stringify(data)
    );

    const signature = await subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        encoded
    );

    // Convert to base64 for easy transport
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verify a signature against a public key.
 * Used by ALL nodes to verify the Architect's decrees.
 * Used by players to verify each other's transactions.
 *
 * @param {Object|string} data - The original data
 * @param {string} signatureBase64 - The base64-encoded signature
 * @param {JsonWebKey} publicKeyJWK - The signer's public key
 * @returns {Promise<boolean>} True if signature is valid
 */
export async function verifySignature(data, signatureBase64, publicKeyJWK) {
    if (!subtle) throw new Error('Web Crypto not available');

    try {
        const key = await importSigningKey(publicKeyJWK, 'verify');
        const encoded = new TextEncoder().encode(
            typeof data === 'string' ? data : JSON.stringify(data)
        );

        // Decode base64 signature
        const sigBytes = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));

        return await subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' },
            key,
            sigBytes,
            encoded
        );
    } catch (err) {
        console.warn('[SecurityCore] Signature verification failed:', err.message);
        return false;
    }
}

/**
 * Verify that data was signed by the Architect.
 * This is the core trust mechanism — if this returns true,
 * the data came from the real Architect. No server needed.
 *
 * @param {Object|string} data - The decree/update
 * @param {string} signatureBase64 - The Architect's signature
 * @returns {Promise<boolean>}
 */
export async function verifyArchitectSignature(data, signatureBase64) {
    if (!ARCHITECT_KEY_INITIALIZED) {
        console.warn('[SecurityCore] Architect key not initialized. Run generateArchitectKeypair() first.');
        return false;
    }
    return verifySignature(data, signatureBase64, ARCHITECT_PUBLIC_KEY_JWK);
}

// ============================================================
// ENCRYPTION (The Vault Lock)
// ============================================================

/**
 * Derive an encryption key from a password/passphrase.
 * Used to encrypt the LocalVault (player's stored data).
 *
 * @param {string} passphrase - The player's passphrase (or auto-generated)
 * @param {Uint8Array} salt - Random salt (stored alongside encrypted data)
 * @returns {Promise<CryptoKey>} AES-256-GCM key
 */
async function deriveEncryptionKey(passphrase, salt) {
    const keyMaterial = await subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 }, // AES-256 is quantum-resistant
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt data with AES-256-GCM.
 * Used to protect the player's local data (API keys, private keys, etc.).
 *
 * @param {string} plaintext - Data to encrypt
 * @param {string} passphrase - Encryption passphrase
 * @returns {Promise<{ ciphertext: string, salt: string, iv: string }>}
 */
export async function encrypt(plaintext, passphrase) {
    if (!subtle) throw new Error('Web Crypto not available');

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveEncryptionKey(passphrase, salt);

    const encrypted = await subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(plaintext)
    );

    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        salt: btoa(String.fromCharCode(...salt)),
        iv: btoa(String.fromCharCode(...iv)),
    };
}

/**
 * Decrypt data with AES-256-GCM.
 *
 * @param {{ ciphertext: string, salt: string, iv: string }} encryptedData
 * @param {string} passphrase
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decrypt(encryptedData, passphrase) {
    if (!subtle) throw new Error('Web Crypto not available');

    const salt = Uint8Array.from(atob(encryptedData.salt), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(encryptedData.ciphertext), c => c.charCodeAt(0));

    const key = await deriveEncryptionKey(passphrase, salt);

    const decrypted = await subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );

    return new TextDecoder().decode(decrypted);
}

// ============================================================
// UNIVERSAL DECREE SYSTEM
// ============================================================

/**
 * A Universal Decree — a signed message from the Architect
 * that all nodes in the universe must obey.
 *
 * Decrees can: update economy parameters, add new rules,
 * broadcast events, etc. They CANNOT change the Genesis constants
 * (those are immutable in genesis.js).
 */
export class UniversalDecree {
    /**
     * Create a new decree (only the Architect should do this).
     *
     * @param {Object} content - The decree content
     * @param {string} content.type - 'economy_update' | 'event' | 'rule_addition' | 'announcement'
     * @param {Object} content.payload - The actual data
     * @param {number} content.expiresAt - When the decree expires (0 = permanent)
     */
    constructor(content) {
        this.version = 1;
        this.timestamp = Date.now();
        this.content = content;
        this.signature = null;
    }

    /**
     * Sign this decree with the Architect's private key.
     * @param {JsonWebKey} architectPrivateKey
     */
    async sign(architectPrivateKey) {
        const dataToSign = {
            version: this.version,
            timestamp: this.timestamp,
            content: this.content,
        };
        this.signature = await signData(dataToSign, architectPrivateKey);
    }

    /**
     * Verify this decree was signed by the real Architect.
     * @returns {Promise<boolean>}
     */
    async verify() {
        if (!this.signature) return false;

        const dataToVerify = {
            version: this.version,
            timestamp: this.timestamp,
            content: this.content,
        };
        return verifyArchitectSignature(dataToVerify, this.signature);
    }

    /**
     * Check if the decree has expired.
     */
    isExpired() {
        if (!this.content.expiresAt || this.content.expiresAt === 0) return false;
        return Date.now() > this.content.expiresAt;
    }

    /**
     * Serialize for storage/transmission.
     */
    toJSON() {
        return {
            version: this.version,
            timestamp: this.timestamp,
            content: this.content,
            signature: this.signature,
        };
    }

    /**
     * Deserialize from storage/transmission.
     */
    static fromJSON(json) {
        const decree = new UniversalDecree(json.content);
        decree.version = json.version;
        decree.timestamp = json.timestamp;
        decree.signature = json.signature;
        return decree;
    }
}

// ============================================================
// TRANSACTION SIGNING
// ============================================================

/**
 * Sign a RES transaction with the player's private key.
 * This proves the player authorized the transaction.
 *
 * @param {Object} transaction - { type, elementId, quantity, metadata }
 * @param {JsonWebKey} playerPrivateKey
 * @returns {Promise<Object>} Signed transaction
 */
export async function signTransaction(transaction, playerPrivateKey) {
    const tx = {
        ...transaction,
        timestamp: Date.now(),
        nonce: crypto.getRandomValues(new Uint8Array(8))
            .reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''),
    };

    tx.signature = await signData(tx, playerPrivateKey);
    return tx;
}

/**
 * Verify a transaction was signed by the claimed player.
 *
 * @param {Object} transaction - The signed transaction
 * @param {JsonWebKey} playerPublicKey
 * @returns {Promise<boolean>}
 */
export async function verifyTransaction(transaction, playerPublicKey) {
    const { signature, ...txData } = transaction;
    return verifySignature(txData, signature, playerPublicKey);
}
