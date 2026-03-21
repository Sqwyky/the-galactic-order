/**
 * THE GALACTIC ORDER — Server
 *
 * Express + Socket.io server with:
 *   - Static file serving (game client)
 *   - REST API (auth, player state, universe)
 *   - WebSocket (multiplayer synchronization)
 *   - SQLite database (player data, discoveries)
 *
 * Architecture:
 *   client/  → Static files served via Express
 *   /api/auth/*     → Authentication (register, login, guest)
 *   /api/player/*   → Save/load game state
 *   /api/universe/* → Shared discoveries, naming
 *   Socket.io       → Real-time multiplayer sync
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import config from './config.js';
import { initDB, closeDB } from './services/db.js';
import { initMultiplayer, getActivePlayerCount } from './ws/multiplayer.js';

// Routes
import authRoutes from './routes/auth.js';
import playerRoutes from './routes/player.js';
import universeRoutes from './routes/universe.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = join(__dirname, '..', 'client');

// --- Express App ---
const app = express();
const httpServer = createServer(app);

// --- Middleware ---
app.use(express.json());

// CORS (permissive in dev, configurable in prod)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', config.cors.origin);
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/universe', universeRoutes);

// --- Health / Status ---
app.get('/api/status', (_req, res) => {
    res.json({
        status: 'online',
        version: '0.1.0',
        players: getActivePlayerCount(),
        uptime: Math.floor(process.uptime()),
    });
});

// --- Static Files (game client) ---
app.use(express.static(CLIENT_DIR));

// SPA fallback — serve landing.html for unmatched routes
app.get('/{*splat}', (req, res) => {
    // Don't fallback for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(join(CLIENT_DIR, 'landing.html'));
});

// --- Error Handler ---
app.use((err, _req, res, _next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: config.env === 'development' ? err.message : 'Internal server error' });
});

// --- Socket.io ---
const io = new SocketIO(httpServer, {
    cors: { origin: config.cors.origin },
});

// --- Initialize ---
initDB();
initMultiplayer(io);

httpServer.listen(config.port, '0.0.0.0', () => {
    console.log(`\n  THE GALACTIC ORDER`);
    console.log(`  Environment: ${config.env}`);
    console.log(`  Server:      http://localhost:${config.port}`);
    console.log(`  API:         http://localhost:${config.port}/api/status`);
    console.log(`  Game:        http://localhost:${config.port}/landing.html`);
    console.log('');
});

// --- Graceful Shutdown ---
function shutdown() {
    console.log('\n  Shutting down...');
    io.close();
    closeDB();
    httpServer.close(() => {
        console.log('  Server closed.');
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
