/**
 * THE GALACTIC ORDER — Supernode Server
 *
 * This server is OPTIONAL. The game runs entirely in the browser via GitHub Pages.
 * But if you want to run a Supernode (enhanced experience), this provides:
 *
 * 1. Static file serving (the game client)
 * 2. Oracle API (Mysterious Being dialogue — server-side)
 * 3. Ledger API (RES economy validation)
 * 4. Nexus API (Node registration and P2P relay)
 *
 * Architecture:
 *   [GitHub Pages]  → Serves the game (free, serverless)
 *   [This Server]   → OPTIONAL Supernode for Oracle + Ledger + Relay
 *   [Player Browser] → Runs the full game, connects to mesh P2P
 *
 * The game works WITHOUT this server. The mesh network handles P2P.
 * This server adds: AI dialogue (Gemini), economy validation, faster relay.
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

// Protocol components (optional — server still works as static if imports fail)
let oracle, ledger, nodeValidator;
try {
    oracle = await import('./oracle.js');
    ledger = await import('./ledger.js');
    nodeValidator = await import('./nodeValidator.js');
    console.log('[Supernode] Protocol modules loaded.');
} catch (err) {
    console.warn('[Supernode] Protocol modules not available. Running as static server only.');
    console.warn('  ', err.message);
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CLIENT_DIR = join(__dirname, '..', 'docs');
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.mjs':  'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.glb':  'model/gltf-binary',
    '.gltf': 'model/gltf+json',
};

// ============================================================
// API ROUTE HANDLER
// ============================================================

/**
 * Parse JSON body from a request.
 */
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            } catch {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

/**
 * Send a JSON response.
 */
function sendJSON(res, data, status = 200) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}

/**
 * Handle API routes.
 * Returns true if the route was handled, false if it should fall through to static files.
 */
async function handleAPIRoute(req, res, urlPath) {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return true;
    }

    // ---- ORACLE ROUTES ----
    if (oracle) {
        if (urlPath === '/oracle/dialogue' && req.method === 'POST') {
            const body = await parseBody(req);
            sendJSON(res, oracle.handleDialogue(body));
            return true;
        }
        if (urlPath === '/oracle/validate-key' && req.method === 'POST') {
            const body = await parseBody(req);
            sendJSON(res, oracle.handleKeyValidation(body));
            return true;
        }
        if (urlPath === '/oracle/architect' && req.method === 'POST') {
            const body = await parseBody(req);
            sendJSON(res, oracle.handleArchitectQuery(body));
            return true;
        }
        if (urlPath === '/oracle/info' && req.method === 'GET') {
            sendJSON(res, oracle.getOracleInfo());
            return true;
        }
    }

    // ---- LEDGER ROUTES ----
    if (ledger) {
        if (urlPath === '/ledger/transaction' && req.method === 'POST') {
            const body = await parseBody(req);
            sendJSON(res, ledger.handleTransaction(body));
            return true;
        }
        if (urlPath === '/ledger/transfer' && req.method === 'POST') {
            const body = await parseBody(req);
            sendJSON(res, ledger.handleTransfer(body));
            return true;
        }
        if (urlPath.startsWith('/ledger/balance/') && req.method === 'GET') {
            const nodeId = urlPath.split('/ledger/balance/')[1];
            sendJSON(res, ledger.getBalance(nodeId));
            return true;
        }
        if (urlPath.startsWith('/ledger/transactions/') && req.method === 'GET') {
            const nodeId = urlPath.split('/ledger/transactions/')[1];
            sendJSON(res, ledger.getTransactions(nodeId));
            return true;
        }
        if (urlPath === '/ledger/stats' && req.method === 'GET') {
            sendJSON(res, ledger.getLedgerStats());
            return true;
        }
    }

    // ---- NEXUS ROUTES (Node Registration) ----
    if (nodeValidator) {
        if (urlPath === '/nexus/register' && req.method === 'POST') {
            const body = await parseBody(req);
            sendJSON(res, nodeValidator.handleRegistration(body));
            return true;
        }
        if (urlPath === '/nexus/heartbeat' && req.method === 'POST') {
            const body = await parseBody(req);
            sendJSON(res, nodeValidator.handleHeartbeat(body));
            return true;
        }
        if (urlPath === '/nexus/nodes' && req.method === 'GET') {
            sendJSON(res, nodeValidator.getConnectedNodes());
            return true;
        }
    }

    // ---- PROTOCOL STATUS ----
    if (urlPath === '/protocol/status' && req.method === 'GET') {
        sendJSON(res, {
            name: 'The Galactic Order — Supernode',
            mode: oracle ? 'supernode' : 'static',
            services: {
                oracle: !!oracle,
                ledger: !!ledger,
                nexus: !!nodeValidator,
            },
            endpoints: {
                oracle: oracle ? ['/oracle/dialogue', '/oracle/validate-key', '/oracle/architect', '/oracle/info'] : [],
                ledger: ledger ? ['/ledger/transaction', '/ledger/transfer', '/ledger/balance/:id', '/ledger/stats'] : [],
                nexus: nodeValidator ? ['/nexus/register', '/nexus/heartbeat', '/nexus/nodes'] : [],
            },
        });
        return true;
    }

    return false; // Not an API route
}

// ============================================================
// MAIN SERVER
// ============================================================

const server = createServer(async (req, res) => {
    try {
        let urlPath = req.url.split('?')[0];

        // Try API routes first
        const handled = await handleAPIRoute(req, res, urlPath);
        if (handled) return;

        // Fall through to static file serving
        if (urlPath === '/') urlPath = '/index.html';

        const filePath = join(CLIENT_DIR, urlPath);

        // Security: prevent directory traversal
        if (!filePath.startsWith(CLIENT_DIR)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        const data = await readFile(filePath);
        const ext = extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.writeHead(404);
            res.end('Not found');
        } else if (err.message === 'Invalid JSON') {
            sendJSON(res, { error: 'Invalid JSON in request body' }, 400);
        } else {
            console.error(err);
            res.writeHead(500);
            res.end('Internal server error');
        }
    }
});

// ============================================================
// PERIODIC TASKS
// ============================================================

// Prune stale nodes every 2 minutes
if (nodeValidator) {
    setInterval(() => {
        const result = nodeValidator.pruneStaleNodes();
        if (result.pruned > 0) {
            console.log(`[Nexus] Pruned ${result.pruned} stale nodes. ${result.remaining} active.`);
        }
    }, 120_000);
}

// Advance ledger block every 60 seconds
if (ledger) {
    setInterval(() => {
        ledger.advanceBlock();
    }, 60_000);
}

// ============================================================
// START
// ============================================================

server.listen(PORT, '0.0.0.0', () => {
    const mode = oracle ? 'SUPERNODE' : 'STATIC';
    console.log(`\n  THE GALACTIC ORDER — ${mode}`);
    console.log(`  ===================================`);
    console.log(`  Server:   http://localhost:${PORT}`);
    console.log(`  Landing:  http://localhost:${PORT}/landing.html`);
    console.log(`  Protocol: http://localhost:${PORT}/protocol/status`);
    if (oracle) {
        console.log(`  Oracle:   http://localhost:${PORT}/oracle/info`);
        console.log(`  Ledger:   http://localhost:${PORT}/ledger/stats`);
        console.log(`  Nexus:    http://localhost:${PORT}/nexus/nodes`);
    }
    console.log(`  ===================================\n`);
});
