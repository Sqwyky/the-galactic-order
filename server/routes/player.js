/**
 * THE GALACTIC ORDER — Player Routes
 *
 * POST /api/player/save       - Save game state
 * GET  /api/player/load/:slot - Load game state
 * GET  /api/player/saves      - List all save slots
 */

import { Router } from 'express';
import { savePlayerState, loadPlayerState, listSaves } from '../services/player.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// All player routes require authentication
router.use(requireAuth);

router.post('/save', (req, res) => {
    const { slot = 0, ...state } = req.body;

    if (slot < 0 || slot > 9) {
        return res.status(400).json({ error: 'Save slot must be 0-9' });
    }

    savePlayerState(req.player.id, slot, state);
    res.json({ ok: true, slot, savedAt: new Date().toISOString() });
});

router.get('/load/:slot', (req, res) => {
    const slot = parseInt(req.params.slot, 10);
    if (isNaN(slot) || slot < 0 || slot > 9) {
        return res.status(400).json({ error: 'Invalid save slot' });
    }

    const save = loadPlayerState(req.player.id, slot);
    if (!save) return res.status(404).json({ error: 'No save in this slot' });

    res.json(save);
});

router.get('/saves', (req, res) => {
    const saves = listSaves(req.player.id);
    res.json(saves);
});

export default router;
