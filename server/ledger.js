/**
 * THE GALACTIC ORDER - Master Ledger
 *
 * The Private Ledger — the economic backbone of the universe.
 *
 * Even if someone forks the game, they CANNOT fork this ledger.
 * If they create "Fake RES," it won't be recognized by the Nexus.
 * Every mine, every refine, every trade is validated here.
 *
 * Architecture:
 *   [Node mines resource] → POST /ledger/transaction → [Ledger validates] → Receipt
 *   [Node checks balance] → GET /ledger/balance/:nodeId → Confirmed balance
 *   [Node transfers RES]  → POST /ledger/transfer → [Ledger validates both parties]
 *
 * The Mint:
 *   Only this ledger can create ("mint") new RES.
 *   RES is minted when nodes contribute compute power to the universe.
 *   The rate follows a deflationary curve (like Bitcoin's halving).
 */

import { createHmac } from 'crypto';
import {
    PROTOCOL_VERSION,
    MINT_RATE,
    GENESIS_SEED,
    RESONANCE_BASE_HZ,
} from '../protocol/genesis.js';

// ============================================================
// LEDGER STATE
// ============================================================

const ledger = {
    // Account balances (nodeId → { res: number, elements: {} })
    accounts: new Map(),

    // Transaction log (ordered list of all transactions)
    transactions: [],

    // Total RES ever minted
    totalMinted: 0,

    // Block counter (each "block" is a batch of transactions)
    blockHeight: 0,

    // Genesis timestamp
    genesisTime: Date.now(),
};

// ============================================================
// ACCOUNT MANAGEMENT
// ============================================================

/**
 * Get or create an account for a node.
 */
function getAccount(nodeId) {
    if (!ledger.accounts.has(nodeId)) {
        ledger.accounts.set(nodeId, {
            nodeId,
            res: 0,
            elements: {},
            transactionCount: 0,
            createdAt: Date.now(),
            lastActivity: Date.now(),
        });
    }
    return ledger.accounts.get(nodeId);
}

// ============================================================
// TRANSACTION VALIDATION
// ============================================================

/**
 * Validate an element quantity against game rules.
 * Prevents nodes from injecting impossibly large amounts.
 */
const MAX_SINGLE_MINE = 50;    // Max elements per single mine action
const MAX_SINGLE_REFINE = 100; // Max elements per refine output

function validateQuantity(type, quantity) {
    if (typeof quantity !== 'number' || quantity <= 0 || !Number.isFinite(quantity)) {
        return { valid: false, error: 'Invalid quantity' };
    }

    if (!Number.isInteger(quantity)) {
        return { valid: false, error: 'Quantity must be integer' };
    }

    switch (type) {
        case 'mine':
            if (quantity > MAX_SINGLE_MINE) {
                return { valid: false, error: `Mining more than ${MAX_SINGLE_MINE} at once is impossible` };
            }
            break;
        case 'refine':
            if (quantity > MAX_SINGLE_REFINE) {
                return { valid: false, error: `Refinery output exceeds maximum` };
            }
            break;
    }

    return { valid: true };
}

/**
 * Generate a transaction hash (receipt).
 */
function hashTransaction(tx) {
    const data = `${tx.nodeId}:${tx.type}:${tx.elementId}:${tx.quantity}:${tx.timestamp}:${ledger.transactions.length}`;
    const hash = createHmac('sha256', 'tgo-ledger-v1')
        .update(data)
        .digest('hex');
    return hash.slice(0, 16);
}

// ============================================================
// MINTING (RES Generation)
// ============================================================

/**
 * Calculate the current mint rate based on total supply.
 * Follows a deflationary curve — the more RES exists, the less is minted.
 */
function getCurrentMintRate() {
    if (ledger.totalMinted >= MINT_RATE.maxSupply) {
        return 0; // Max supply reached
    }

    // Decay: each cycle produces slightly less RES
    const cycleNumber = ledger.transactions.length;
    const decayedRate = MINT_RATE.basePerCycle * Math.pow(MINT_RATE.decayFactor, cycleNumber);

    return Math.max(0.001, decayedRate); // Minimum mint of 0.001 RES
}

/**
 * Mint RES for compute contribution.
 * Called when a node contributes compute power (e.g., generating terrain for other players).
 *
 * @param {string} nodeId - The contributing node
 * @param {number} computeUnits - Amount of compute contributed
 * @returns {Object} Mint result
 */
export function mintRES(nodeId, computeUnits) {
    if (ledger.totalMinted >= MINT_RATE.maxSupply) {
        return { minted: 0, error: 'Maximum RES supply reached' };
    }

    const rate = getCurrentMintRate();
    const amount = Math.min(
        computeUnits * rate,
        MINT_RATE.maxSupply - ledger.totalMinted
    );

    const account = getAccount(nodeId);
    account.res += amount;
    ledger.totalMinted += amount;

    const tx = {
        type: 'mint',
        nodeId,
        amount,
        computeUnits,
        timestamp: Date.now(),
        blockHeight: ledger.blockHeight,
    };
    tx.hash = hashTransaction(tx);
    ledger.transactions.push(tx);

    return {
        minted: amount,
        totalBalance: account.res,
        totalSupply: ledger.totalMinted,
        receipt: tx.hash,
    };
}

// ============================================================
// ROUTE HANDLERS
// ============================================================

/**
 * Handle a transaction submission.
 *
 * POST /ledger/transaction
 * Body: { nodeId, protocolVersion, type, elementId, quantity, timestamp, metadata }
 */
export function handleTransaction(body) {
    const { nodeId, protocolVersion, type, elementId, quantity, timestamp, metadata } = body;

    // Validate protocol
    if (protocolVersion !== PROTOCOL_VERSION) {
        return { confirmed: false, error: 'Protocol version mismatch' };
    }

    // Validate transaction type
    const validTypes = ['mine', 'refine', 'trade', 'transfer', 'consume'];
    if (!validTypes.includes(type)) {
        return { confirmed: false, error: `Invalid transaction type: ${type}` };
    }

    // Validate quantity
    const qtyCheck = validateQuantity(type, quantity);
    if (!qtyCheck.valid) {
        return { confirmed: false, error: qtyCheck.error };
    }

    // Validate timestamp (reject transactions from the future or too far in the past)
    const now = Date.now();
    if (timestamp > now + 60_000) {
        return { confirmed: false, error: 'Transaction timestamp is in the future' };
    }
    if (timestamp < now - 300_000) {
        return { confirmed: false, error: 'Transaction is too old (>5 minutes)' };
    }

    // Process transaction
    const account = getAccount(nodeId);
    account.lastActivity = now;
    account.transactionCount++;

    switch (type) {
        case 'mine': {
            // Mining adds elements to the account
            account.elements[elementId] = (account.elements[elementId] || 0) + quantity;
            break;
        }
        case 'refine': {
            // Refining transforms elements (input consumed on client, output added here)
            account.elements[elementId] = (account.elements[elementId] || 0) + quantity;

            // Mint a small amount of RES for the refining compute
            mintRES(nodeId, 0.1);
            break;
        }
        case 'consume': {
            // Consuming removes elements
            const current = account.elements[elementId] || 0;
            if (current < quantity) {
                return { confirmed: false, error: 'Insufficient elements' };
            }
            account.elements[elementId] = current - quantity;
            break;
        }
        case 'trade': {
            // Trading between nodes (requires both parties)
            // For now, record the intent; full trade needs both sides
            break;
        }
    }

    // Record transaction
    const tx = {
        nodeId,
        type,
        elementId,
        quantity,
        timestamp,
        metadata: metadata || {},
        blockHeight: ledger.blockHeight,
        processedAt: now,
    };
    tx.hash = hashTransaction(tx);
    ledger.transactions.push(tx);

    return {
        confirmed: true,
        receipt: {
            hash: tx.hash,
            blockHeight: ledger.blockHeight,
            timestamp: tx.processedAt,
            status: 'confirmed',
        },
    };
}

/**
 * Get account balance.
 *
 * GET /ledger/balance/:nodeId
 */
export function getBalance(nodeId) {
    const account = ledger.accounts.get(nodeId);

    if (!account) {
        return {
            nodeId,
            res: 0,
            elements: {},
            confirmed: true,
            message: 'No account found — mine some resources to start.',
        };
    }

    return {
        nodeId,
        res: account.res,
        elements: { ...account.elements },
        transactionCount: account.transactionCount,
        confirmed: true,
    };
}

/**
 * Handle RES transfer between nodes.
 *
 * POST /ledger/transfer
 * Body: { fromNodeId, toNodeId, amount, protocolVersion }
 */
export function handleTransfer(body) {
    const { fromNodeId, toNodeId, amount, protocolVersion } = body;

    if (protocolVersion !== PROTOCOL_VERSION) {
        return { confirmed: false, error: 'Protocol version mismatch' };
    }

    if (typeof amount !== 'number' || amount <= 0) {
        return { confirmed: false, error: 'Invalid transfer amount' };
    }

    const fromAccount = getAccount(fromNodeId);
    if (fromAccount.res < amount) {
        return { confirmed: false, error: 'Insufficient RES balance' };
    }

    const toAccount = getAccount(toNodeId);

    fromAccount.res -= amount;
    toAccount.res += amount;

    const tx = {
        type: 'transfer',
        fromNodeId,
        toNodeId,
        amount,
        timestamp: Date.now(),
        blockHeight: ledger.blockHeight,
    };
    tx.hash = hashTransaction(tx);
    ledger.transactions.push(tx);

    return {
        confirmed: true,
        receipt: {
            hash: tx.hash,
            from: { nodeId: fromNodeId, newBalance: fromAccount.res },
            to: { nodeId: toNodeId, newBalance: toAccount.res },
        },
    };
}

/**
 * Get ledger statistics (public).
 *
 * GET /ledger/stats
 */
export function getLedgerStats() {
    return {
        protocolVersion: PROTOCOL_VERSION,
        totalAccounts: ledger.accounts.size,
        totalTransactions: ledger.transactions.length,
        totalRESMinted: ledger.totalMinted,
        maxRESSupply: MINT_RATE.maxSupply,
        currentMintRate: getCurrentMintRate(),
        blockHeight: ledger.blockHeight,
        genesisTime: ledger.genesisTime,
        resonanceBaseHz: RESONANCE_BASE_HZ,
    };
}

/**
 * Get recent transactions for a node.
 *
 * GET /ledger/transactions/:nodeId
 */
export function getTransactions(nodeId, limit = 50) {
    const txs = ledger.transactions
        .filter(tx => tx.nodeId === nodeId || tx.fromNodeId === nodeId || tx.toNodeId === nodeId)
        .slice(-limit);

    return {
        nodeId,
        transactions: txs,
        count: txs.length,
    };
}

/**
 * Advance the block height (call periodically, e.g., every 60 seconds).
 */
export function advanceBlock() {
    ledger.blockHeight++;
    return { blockHeight: ledger.blockHeight };
}
