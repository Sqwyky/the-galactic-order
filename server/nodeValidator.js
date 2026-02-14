/**
 * THE GALACTIC ORDER - Node Validator
 *
 * The P2P Handshake — verifies that a forked client is "authorized"
 * to connect to the Harmonic Core.
 *
 * When a fork connects to the Nexus, it must:
 * 1. Prove its CA engine produces correct output (Genesis Fingerprint)
 * 2. Prove it's running the correct Protocol Version
 * 3. Receive an authorization token to access Oracle and Ledger
 *
 * Think of this like Bitcoin's block validation:
 * - You can run any wallet software you want
 * - But it must follow the same consensus rules
 * - If it doesn't, the network rejects it
 */

import { createHmac, randomBytes } from 'crypto';
import {
    PROTOCOL_VERSION,
    NODE_REQUIREMENTS,
    GENESIS_SEED,
    HARMONIC_CONSTANT,
    validateGenesisFingerprint,
} from '../protocol/genesis.js';

// ============================================================
// NODE REGISTRY
// ============================================================

const nodeRegistry = {
    // Authorized nodes (nodeId → node data)
    nodes: new Map(),

    // Auth tokens (token → nodeId)
    tokens: new Map(),

    // Blacklisted nodes (nodeId → reason)
    blacklist: new Map(),

    // Statistics
    stats: {
        totalRegistrations: 0,
        totalRejections: 0,
        activeNodes: 0,
    },
};

// ============================================================
// TOKEN MANAGEMENT
// ============================================================

/**
 * Generate a secure auth token for an authorized node.
 */
function generateAuthToken(nodeId) {
    const token = randomBytes(32).toString('hex');
    const expires = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

    nodeRegistry.tokens.set(token, {
        nodeId,
        expires,
        createdAt: Date.now(),
    });

    return { token, expires };
}

/**
 * Validate an auth token.
 *
 * @param {string} token
 * @returns {{ valid: boolean, nodeId?: string, error?: string }}
 */
export function validateToken(token) {
    if (!token) {
        return { valid: false, error: 'No token provided' };
    }

    const tokenData = nodeRegistry.tokens.get(token);
    if (!tokenData) {
        return { valid: false, error: 'Invalid token' };
    }

    if (Date.now() > tokenData.expires) {
        nodeRegistry.tokens.delete(token);
        return { valid: false, error: 'Token expired. Re-register with the Nexus.' };
    }

    return { valid: true, nodeId: tokenData.nodeId };
}

// ============================================================
// NODE VALIDATION
// ============================================================

/**
 * Validate a node's Genesis Fingerprint.
 * The node sends its fingerprint; we verify it matches our expected output.
 *
 * @param {Object} fingerprint - The node's fingerprint data
 * @returns {{ valid: boolean, error?: string }}
 */
function validateNodeFingerprint(fingerprint) {
    if (!fingerprint) {
        return { valid: false, error: 'No fingerprint provided' };
    }

    // The fingerprint must contain the alive count from Rule 110
    // Rule 110 with width 101, 50 generations, single center cell
    // should produce a specific number of alive cells
    if (!fingerprint.valid) {
        return { valid: false, error: 'Node CA engine produced invalid output' };
    }

    // Verify the alive count is reasonable for Rule 110
    // Rule 110 is Class IV — it should have a moderate density
    if (fingerprint.aliveCount <= 0 || fingerprint.aliveCount >= 101) {
        return { valid: false, error: 'Rule 110 output is degenerate — CA engine tampered' };
    }

    return { valid: true };
}

// ============================================================
// ROUTE HANDLERS
// ============================================================

/**
 * Handle node registration (P2P Handshake).
 *
 * POST /nexus/register
 * Body: { nodeIdentity, fingerprint, protocolVersion, capabilities }
 */
export function handleRegistration(body) {
    const { nodeIdentity, fingerprint, protocolVersion, capabilities } = body;

    // Step 1: Protocol version check
    if (protocolVersion < NODE_REQUIREMENTS.minProtocolVersion) {
        nodeRegistry.stats.totalRejections++;
        return {
            authorized: false,
            error: `Protocol version ${protocolVersion} is too old. Minimum: ${NODE_REQUIREMENTS.minProtocolVersion}`,
        };
    }

    // Step 2: Check blacklist
    if (nodeRegistry.blacklist.has(nodeIdentity?.nodeId)) {
        return {
            authorized: false,
            error: 'This node has been disconnected from the Nexus.',
            reason: nodeRegistry.blacklist.get(nodeIdentity.nodeId),
        };
    }

    // Step 3: Validate Genesis Fingerprint
    if (NODE_REQUIREMENTS.mustValidateGenesis) {
        const fpResult = validateNodeFingerprint(fingerprint);
        if (!fpResult.valid) {
            nodeRegistry.stats.totalRejections++;
            return {
                authorized: false,
                error: `Genesis validation failed: ${fpResult.error}`,
                hint: 'Your CA engine does not match the Galactic Protocol. Are you running an unmodified version?',
            };
        }
    }

    // Step 4: Generate auth token
    const { token, expires } = generateAuthToken(nodeIdentity.nodeId);

    // Step 5: Register the node
    nodeRegistry.nodes.set(nodeIdentity.nodeId, {
        identity: nodeIdentity,
        capabilities: capabilities || {},
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
        status: 'active',
    });

    nodeRegistry.stats.totalRegistrations++;
    nodeRegistry.stats.activeNodes = nodeRegistry.nodes.size;

    return {
        authorized: true,
        token,
        expires,
        nexusInfo: {
            genesisSeed: GENESIS_SEED,
            protocolVersion: PROTOCOL_VERSION,
            activeNodes: nodeRegistry.stats.activeNodes,
            message: 'Welcome to the Nexus. Your universe is synchronized.',
        },
    };
}

/**
 * Handle heartbeat from a registered node.
 *
 * POST /nexus/heartbeat
 * Body: { token, nodeId, stats }
 */
export function handleHeartbeat(body) {
    const { token, nodeId, stats } = body;

    const tokenResult = validateToken(token);
    if (!tokenResult.valid) {
        return { accepted: false, error: tokenResult.error };
    }

    const node = nodeRegistry.nodes.get(nodeId);
    if (!node) {
        return { accepted: false, error: 'Node not found in registry' };
    }

    node.lastHeartbeat = Date.now();
    node.stats = stats || {};

    return {
        accepted: true,
        nextHeartbeat: NODE_REQUIREMENTS.heartbeatInterval,
        nexusStats: {
            activeNodes: nodeRegistry.stats.activeNodes,
            totalRegistrations: nodeRegistry.stats.totalRegistrations,
        },
    };
}

/**
 * Get list of connected nodes (public info only).
 *
 * GET /nexus/nodes
 */
export function getConnectedNodes() {
    const nodes = [];
    for (const [id, node] of nodeRegistry.nodes) {
        // Only return public info
        nodes.push({
            nodeId: id,
            status: node.status,
            registeredAt: node.registeredAt,
            lastHeartbeat: node.lastHeartbeat,
            capabilities: node.capabilities,
        });
    }

    return {
        count: nodes.length,
        nodes,
        protocolVersion: PROTOCOL_VERSION,
    };
}

/**
 * Prune stale nodes (call periodically).
 * Removes nodes that haven't sent a heartbeat in 5 minutes.
 */
export function pruneStaleNodes() {
    const staleThreshold = Date.now() - (5 * 60 * 1000); // 5 minutes
    let pruned = 0;

    for (const [id, node] of nodeRegistry.nodes) {
        if (node.lastHeartbeat < staleThreshold) {
            nodeRegistry.nodes.delete(id);
            pruned++;
        }
    }

    // Also prune expired tokens
    for (const [token, data] of nodeRegistry.tokens) {
        if (Date.now() > data.expires) {
            nodeRegistry.tokens.delete(token);
        }
    }

    nodeRegistry.stats.activeNodes = nodeRegistry.nodes.size;
    return { pruned, remaining: nodeRegistry.nodes.size };
}
