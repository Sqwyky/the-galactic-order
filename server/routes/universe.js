/**
 * THE GALACTIC ORDER — Universe Routes
 *
 * POST /api/universe/discover          - Record a discovery
 * GET  /api/universe/system/:rule      - Get discoveries for a system
 * GET  /api/universe/my-discoveries    - Get player's discoveries
 */

import { Router } from 'express';
import { recordDiscovery, getSystemDiscoveries, getPlayerDiscoveries } from '../services/universe.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.post('/discover', (req, res) => {
    const { type, universeSeed, systemRule, planetSeed, name, data } = req.body;

    if (!type || !universeSeed || !name) {
        return res.status(400).json({ error: 'type, universeSeed, and name are required' });
    }

    const result = recordDiscovery(req.player.id, { type, universeSeed, systemRule, planetSeed, name, data });
    res.status(result.isNew ? 201 : 200).json(result);
});

router.get('/system/:rule', (req, res) => {
    const rule = parseInt(req.params.rule, 10);
    const universeSeed = req.query.seed || '42';
    const discoveries = getSystemDiscoveries(universeSeed, rule);
    res.json(discoveries);
});

router.get('/my-discoveries', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const discoveries = getPlayerDiscoveries(req.player.id, limit);
    res.json(discoveries);
});

export default router;
