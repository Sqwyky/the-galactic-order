/**
 * THE GALACTIC ORDER — Auth Routes
 *
 * POST /api/auth/register  - Create account
 * POST /api/auth/login     - Login
 * POST /api/auth/guest     - Play as guest (no signup)
 * GET  /api/auth/me        - Get current player info
 */

import { Router } from 'express';
import { createPlayer, createGuest, authenticate, authenticateGuest, getPlayerById } from '../services/player.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register', (req, res) => {
    const { username, email, password, displayName } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    if (username.length < 3 || username.length > 30) {
        return res.status(400).json({ error: 'Username must be 3-30 characters' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const player = createPlayer({ username, email, password, displayName });
        const auth = authenticate(username, password);
        res.status(201).json(auth);
    } catch (err) {
        if (err.message.includes('UNIQUE constraint')) {
            return res.status(409).json({ error: 'Username or email already taken' });
        }
        throw err;
    }
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const auth = authenticate(username, password);
    if (!auth) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json(auth);
});

router.post('/guest', (_req, res) => {
    const guest = createGuest();
    const auth = authenticateGuest(guest);
    res.status(201).json(auth);
});

router.get('/me', requireAuth, (req, res) => {
    const player = getPlayerById(req.player.id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    res.json(player);
});

export default router;
