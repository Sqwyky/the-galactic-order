/**
 * THE GALACTIC ORDER — Multiplayer WebSocket Handler
 *
 * Socket.io events for real-time player synchronization.
 * Players in the same system/planet see each other.
 *
 * Rooms are structured as: "system:{rule}" or "planet:{rule}:{seed}"
 */

import { authenticateSocket } from '../middleware/auth.js';

/** @type {Map<number, {socketId: string, player: object, location: object}>} */
const activePlayers = new Map();

/**
 * Initialize Socket.io event handlers.
 * @param {import('socket.io').Server} io
 */
export function initMultiplayer(io) {
    // Require authentication for all socket connections
    io.use(authenticateSocket);

    io.on('connection', (socket) => {
        const { player } = socket;
        console.log(`  Player connected: ${player.username} (${socket.id})`);

        activePlayers.set(player.id, {
            socketId: socket.id,
            player,
            location: null,
        });

        // --- Join a location (system or planet surface) ---
        socket.on('join:location', ({ systemRule, planetSeed }) => {
            // Leave all previous rooms
            for (const room of socket.rooms) {
                if (room !== socket.id) socket.leave(room);
            }

            const systemRoom = `system:${systemRule}`;
            socket.join(systemRoom);

            if (planetSeed !== undefined) {
                const planetRoom = `planet:${systemRule}:${planetSeed}`;
                socket.join(planetRoom);
            }

            const location = { systemRule, planetSeed };
            activePlayers.get(player.id).location = location;

            // Notify others in the room
            socket.to(systemRoom).emit('player:joined', {
                id: player.id,
                username: player.username,
                location,
            });

            // Send back who's already here
            const playersHere = [];
            for (const [id, data] of activePlayers) {
                if (id !== player.id && data.location?.systemRule === systemRule) {
                    playersHere.push({ id, username: data.player.username, location: data.location });
                }
            }
            socket.emit('location:players', playersHere);
        });

        // --- Broadcast position/state to nearby players ---
        socket.on('player:update', (state) => {
            // Broadcast to all rooms this socket is in (except itself)
            for (const room of socket.rooms) {
                if (room !== socket.id) {
                    socket.to(room).emit('player:state', {
                        id: player.id,
                        ...state,
                    });
                }
            }
        });

        // --- Chat message ---
        socket.on('chat:message', ({ text }) => {
            if (!text || text.length > 500) return;

            for (const room of socket.rooms) {
                if (room !== socket.id) {
                    socket.to(room).emit('chat:message', {
                        from: player.username,
                        text,
                        timestamp: Date.now(),
                    });
                }
            }
        });

        // --- Disconnect ---
        socket.on('disconnect', () => {
            const data = activePlayers.get(player.id);
            if (data?.location) {
                const room = `system:${data.location.systemRule}`;
                socket.to(room).emit('player:left', { id: player.id, username: player.username });
            }
            activePlayers.delete(player.id);
            console.log(`  Player disconnected: ${player.username}`);
        });
    });
}

/**
 * Get active player count.
 */
export function getActivePlayerCount() {
    return activePlayers.size;
}
