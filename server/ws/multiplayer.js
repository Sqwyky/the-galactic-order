/**
 * THE GALACTIC ORDER — Multiplayer WebSocket Handler
 *
 * Socket.io events for real-time player synchronization.
 * Players in the same system/planet see each other.
 *
 * Rooms are structured as: "system:{rule}" or "planet:{rule}:{seed}"
 */

import { authenticateSocket } from '../middleware/auth.js';
import {
    createShip, removeShip, getShip, getShipsInRoom,
    joinCrew, leaveCrew, removePlayerFromAllShips, updateShipState,
} from './shipManager.js';

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

        // ===========================================================
        // SHIP FLEET & MULTI-CREW EVENTS
        // ===========================================================

        // --- Spawn a ship ---
        socket.on('ship:spawn', ({ classId, position }, callback) => {
            const data = activePlayers.get(player.id);
            if (!data?.location) {
                if (callback) callback({ error: 'No location' });
                return;
            }

            const room = `system:${data.location.systemRule}`;
            const ship = createShip(classId, player.id, room);

            if (position) ship.state.position = position;

            // Broadcast to room
            socket.to(room).emit('ship:spawned', {
                shipId: ship.id,
                classId: ship.classId,
                ownerId: player.id,
                ownerName: player.username,
                state: ship.state,
            });

            if (callback) callback({ shipId: ship.id });
        });

        // --- Despawn a ship ---
        socket.on('ship:despawn', ({ shipId }) => {
            const ship = getShip(shipId);
            if (!ship || ship.ownerId !== player.id) return;

            // Notify room
            for (const room of socket.rooms) {
                if (room !== socket.id) {
                    socket.to(room).emit('ship:despawned', { shipId });
                }
            }
            removeShip(shipId);
        });

        // --- Join a ship crew ---
        socket.on('crew:join', ({ shipId, roleId }, callback) => {
            const success = joinCrew(shipId, roleId, player.id, player.username);

            if (success) {
                const ship = getShip(shipId);
                // Join ship-specific room for targeted broadcasts
                socket.join(`ship:${shipId}`);

                // Notify ship crew
                socket.to(`ship:${shipId}`).emit('crew:joined', {
                    shipId,
                    roleId,
                    playerId: player.id,
                    username: player.username,
                });

                // Send roster to the joining player
                const roster = ship ? Object.fromEntries(ship.crew) : {};
                if (callback) callback({ success: true, roster, state: ship?.state });
            } else {
                if (callback) callback({ success: false, error: 'Station occupied' });
            }
        });

        // --- Leave crew station ---
        socket.on('crew:leave', ({ shipId, roleId }) => {
            leaveCrew(shipId, roleId);
            socket.leave(`ship:${shipId}`);

            socket.to(`ship:${shipId}`).emit('crew:left', {
                shipId,
                roleId,
                playerId: player.id,
            });
        });

        // --- Ship state update (from pilot, 20Hz) ---
        socket.on('ship:state', (data) => {
            if (!data.shipId) return;
            updateShipState(data.shipId, data);

            // Relay to ship crew and room observers
            for (const room of socket.rooms) {
                if (room !== socket.id) {
                    socket.to(room).emit('ship:state', {
                        shipId: data.shipId,
                        ...data,
                    });
                }
            }
        });

        // --- Crew input (non-pilot → forwarded to pilot) ---
        socket.on('ship:input', (data) => {
            if (!data.shipId) return;
            // Forward to ship crew (pilot will consume relevant inputs)
            socket.to(`ship:${data.shipId}`).emit('ship:input', {
                ...data,
                fromPlayerId: player.id,
            });
        });

        // --- System sync (5Hz, all subsystem states) ---
        socket.on('ship:systems', (data) => {
            if (!data.shipId) return;
            socket.to(`ship:${data.shipId}`).emit('ship:systems', data);
        });

        // --- Ship event (weapon fire, impacts, etc.) ---
        socket.on('ship:event', (data) => {
            if (!data.shipId) return;
            for (const room of socket.rooms) {
                if (room !== socket.id) {
                    socket.to(room).emit('ship:event', {
                        ...data,
                        fromPlayerId: player.id,
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

            // Remove player from any ship crews
            const affectedShips = removePlayerFromAllShips(player.id);
            for (const shipId of affectedShips) {
                socket.to(`ship:${shipId}`).emit('crew:left', {
                    shipId,
                    playerId: player.id,
                    reason: 'disconnect',
                });
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
