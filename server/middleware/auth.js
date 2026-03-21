/**
 * THE GALACTIC ORDER — Auth Middleware
 *
 * JWT verification for protected routes.
 */

import jwt from 'jsonwebtoken';
import config from '../config.js';

/**
 * Require a valid JWT. Sets req.player = { id, username }.
 */
export function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const token = header.slice(7);
        const decoded = jwt.verify(token, config.jwt.secret);
        req.player = { id: decoded.id, username: decoded.username, isGuest: !!decoded.isGuest };
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/**
 * Optional auth — sets req.player if token present, but doesn't block.
 */
export function optionalAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        req.player = null;
        return next();
    }

    try {
        const token = header.slice(7);
        const decoded = jwt.verify(token, config.jwt.secret);
        req.player = { id: decoded.id, username: decoded.username, isGuest: !!decoded.isGuest };
    } catch {
        req.player = null;
    }
    next();
}

/**
 * Authenticate a Socket.io connection via token in handshake.
 */
export function authenticateSocket(socket, next) {
    const token = socket.handshake.auth?.token;
    if (!token) {
        return next(new Error('Authentication required'));
    }

    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        socket.player = { id: decoded.id, username: decoded.username, isGuest: !!decoded.isGuest };
        next();
    } catch {
        next(new Error('Invalid token'));
    }
}
