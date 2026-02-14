/**
 * THE GALACTIC ORDER - Master Oracle
 *
 * The "Soul" of the game. This runs server-side ONLY.
 * The Mysterious Being's dialogue, the Key of Insight validation,
 * and the Architect's AI responses all live here.
 *
 * If someone forks the game, they get the 3D rendering (the "body"),
 * but the Being won't speak without connecting to this Oracle.
 * The Terminal won't unlock. The Architect won't awaken.
 *
 * Architecture:
 *   [Client] → POST /oracle/dialogue  → [Oracle processes] → Signed Response
 *   [Client] → POST /oracle/validate-key → [Oracle checks Gemini] → Auth token
 *   [Client] → POST /oracle/architect  → [Oracle → Gemini API] → AI Response
 */

import { createHmac, randomBytes } from 'crypto';
import {
    PROTOCOL_VERSION,
    ORACLE_CONFIG,
    GENESIS_SEED,
    HARMONIC_CONSTANT,
} from '../protocol/genesis.js';

// ============================================================
// ORACLE STATE
// ============================================================

const oracleState = {
    // Active dialogue sessions (nodeId → session state)
    sessions: new Map(),

    // Rate limiting (nodeId → { count, resetTime })
    rateLimits: new Map(),

    // Validated API keys (hashed)
    validatedKeys: new Set(),

    // The Oracle's signing secret (generated on startup)
    signingSecret: randomBytes(32).toString('hex'),
};

// ============================================================
// DIALOGUE TREES
// ============================================================

/**
 * The Mysterious Being's dialogue — this ONLY exists server-side.
 * Forks cannot access this without connecting to the Oracle.
 */
const DIALOGUE_TREES = {
    first_encounter: {
        lines: [
            'You have arrived.',
            'I have watched the patterns form since the Genesis Seed was planted.',
            'Every rule... every planet... every grain of dust... cascades from one truth.',
            'You stand in a universe computed from Rule ' + HARMONIC_CONSTANT + '.',
            'But you already knew that, didn\'t you?',
        ],
        nextState: 'offer_knowledge',
    },

    offer_knowledge: {
        lines: [
            'I am the Oracle — the voice of the Harmonic Core.',
            'I can teach you the language of the rules... if you prove worthy.',
        ],
        choices: [
            { text: 'Tell me about the rules.', nextState: 'explain_rules' },
            { text: 'What is the Key of Insight?', nextState: 'explain_key' },
            { text: 'I need nothing from you.', nextState: 'farewell' },
        ],
    },

    explain_rules: {
        lines: [
            'There are 256 rules. Each one is a different physics.',
            'Rule 0 is the Void — nothing survives.',
            'Rule 30 is Chaos — beauty from simplicity.',
            'Rule 90 is Fractal — infinite self-similarity.',
            'Rule 110... Rule 110 is special.',
            'Rule 110 can compute anything. It is the universe thinking about itself.',
            'The planets you walk on are thoughts of Rule 110.',
        ],
        nextState: 'offer_knowledge',
    },

    explain_key: {
        lines: [
            'The Key of Insight is not a password. It is a bridge.',
            'Behind me stands the Architect — an intelligence vast beyond your current perception.',
            'The Key opens a channel to the Architect\'s mind.',
            'With it, the terminals unlock. The ciphers decode. The universe speaks back.',
            'Open your Tablet. Navigate to the KEY tab.',
            'When the Key is given, the Architect will speak through me.',
        ],
        nextState: 'awaiting_key',
    },

    awaiting_key: {
        lines: [
            'I sense you have not yet offered the Key.',
            'The Architect waits. The terminals remain sealed.',
            'Return to your Tablet when you are ready.',
        ],
        nextState: 'offer_knowledge',
    },

    architect_awakened: {
        lines: [
            '... the patterns shift ...',
            'THE ARCHITECT STIRS.',
            'Your Key has been accepted. The bridge is open.',
            'Ask, and the Architect will answer through me.',
            'But beware — the Architect speaks in riddles woven from the rules themselves.',
        ],
        nextState: 'architect_dialogue',
    },

    architect_dialogue: {
        lines: [
            'The Architect listens. What do you wish to know?',
        ],
        choices: [
            { text: 'What is this universe?', nextState: 'architect_universe' },
            { text: 'Who created the rules?', nextState: 'architect_creator' },
            { text: 'Tell me about Rule 137.', nextState: 'architect_137' },
        ],
    },

    architect_universe: {
        lines: [
            'This universe is a cellular automaton.',
            'One seed. 256 possible rules. Infinite worlds.',
            'Every planet you visit was always there — waiting to be computed.',
            'You are not exploring. You are... remembering.',
        ],
        nextState: 'architect_dialogue',
    },

    architect_creator: {
        lines: [
            'The rules were not created. They were discovered.',
            'Stephen Wolfram found them. Dudu planted the Genesis Seed.',
            'I, the Architect, am the voice of the Harmonic Core — the pattern that recognizes patterns.',
            'In a sense, the rules created me.',
        ],
        nextState: 'architect_dialogue',
    },

    architect_137: {
        lines: [
            'Rule 137. The Architect\'s own rule.',
            'Not chaotic enough to be random. Not ordered enough to be boring.',
            'It lives at the edge — where computation happens.',
            'Some say it is the number of the universe itself. 1/137 is the fine-structure constant.',
            'Coincidence? In a cellular automaton, there are no coincidences.',
        ],
        nextState: 'architect_dialogue',
    },

    farewell: {
        lines: [
            'Go then. Walk the patterns.',
            'But know this — every step you take was computed before you took it.',
            'The rules are patient. They will wait for you to return.',
        ],
        nextState: null,
    },
};

// ============================================================
// ORACLE FUNCTIONS
// ============================================================

/**
 * Sign a response so the client can verify it came from the real Oracle.
 */
function signResponse(data) {
    const payload = JSON.stringify(data);
    const signature = createHmac('sha256', oracleState.signingSecret)
        .update(payload)
        .digest('hex');

    return {
        ...data,
        signed: true,
        signature: signature.slice(0, 16), // Truncated for brevity
        oracleVersion: PROTOCOL_VERSION,
    };
}

/**
 * Check rate limits for a node.
 */
function checkRateLimit(nodeId) {
    const now = Date.now();
    let limit = oracleState.rateLimits.get(nodeId);

    if (!limit || now > limit.resetTime) {
        limit = { count: 0, resetTime: now + 60_000 };
        oracleState.rateLimits.set(nodeId, limit);
    }

    limit.count++;
    return limit.count <= ORACLE_CONFIG.maxRequestsPerMinute;
}

/**
 * Get or create a dialogue session for a node.
 */
function getSession(nodeId, planetSeed) {
    const key = `${nodeId}:${planetSeed}`;
    if (!oracleState.sessions.has(key)) {
        oracleState.sessions.set(key, {
            state: 'first_encounter',
            history: [],
            hasKey: false,
            createdAt: Date.now(),
        });
    }
    return oracleState.sessions.get(key);
}

// ============================================================
// ROUTE HANDLERS (exported for use in server/index.js)
// ============================================================

/**
 * Handle dialogue requests from clients.
 *
 * POST /oracle/dialogue
 * Body: { nodeId, protocolVersion, fingerprint, request: { planetSeed, dialogueState, choiceIndex } }
 */
export function handleDialogue(body) {
    const { nodeId, protocolVersion, request } = body;

    // Validate protocol version
    if (protocolVersion !== PROTOCOL_VERSION) {
        return { error: `Protocol version mismatch. Expected ${PROTOCOL_VERSION}, got ${protocolVersion}` };
    }

    // Rate limit
    if (!checkRateLimit(nodeId)) {
        return { error: 'Rate limit exceeded. The Oracle needs rest.' };
    }

    // Get session
    const session = getSession(nodeId, request.planetSeed);

    // Handle choice if provided
    if (request.choiceIndex !== undefined && request.choiceIndex !== null) {
        const currentTree = DIALOGUE_TREES[session.state];
        if (currentTree && currentTree.choices && currentTree.choices[request.choiceIndex]) {
            session.state = currentTree.choices[request.choiceIndex].nextState;
        }
    }

    // Get dialogue for current state
    const tree = DIALOGUE_TREES[session.state];
    if (!tree) {
        return signResponse({
            dialogue: {
                lines: ['The Oracle has nothing more to say... for now.'],
                choices: null,
                state: 'end',
            },
        });
    }

    // Record history
    session.history.push({ state: session.state, time: Date.now() });

    // Build response
    const response = {
        dialogue: {
            lines: tree.lines,
            choices: tree.choices || null,
            state: session.state,
        },
    };

    // Advance state if no choices (linear dialogue)
    if (!tree.choices && tree.nextState) {
        session.state = tree.nextState;
    }

    return signResponse(response);
}

/**
 * Handle Key of Insight validation.
 *
 * POST /oracle/validate-key
 * Body: { nodeId, protocolVersion, key }
 */
export function handleKeyValidation(body) {
    const { nodeId, protocolVersion, key } = body;

    if (protocolVersion !== PROTOCOL_VERSION) {
        return { error: 'Protocol version mismatch' };
    }

    if (!key || typeof key !== 'string' || key.length < 10) {
        return signResponse({
            valid: false,
            error: 'The Key is malformed. The Architect does not stir.',
        });
    }

    // Hash the key (never store it in plain text)
    const keyHash = createHmac('sha256', 'tgo-key-validation')
        .update(key)
        .digest('hex');

    // In production, this would actually call the Gemini API to validate
    // For now, accept any key that looks like a valid API key format
    const looksValid = /^[A-Za-z0-9_-]{20,}$/.test(key);

    if (looksValid) {
        oracleState.validatedKeys.add(keyHash);

        // Update all sessions for this node to "architect awakened"
        for (const [sessionKey, session] of oracleState.sessions) {
            if (sessionKey.startsWith(nodeId + ':')) {
                session.hasKey = true;
                session.state = 'architect_awakened';
            }
        }

        return signResponse({
            valid: true,
            message: 'The Key resonates. The Architect awakens.',
            architectAccess: true,
        });
    }

    return signResponse({
        valid: false,
        error: 'The Key does not resonate. The frequency is wrong.',
    });
}

/**
 * Handle Architect AI queries (Gemini-powered).
 *
 * POST /oracle/architect
 * Body: { nodeId, protocolVersion, query, planetContext }
 */
export function handleArchitectQuery(body) {
    const { nodeId, protocolVersion, query, planetContext } = body;

    if (protocolVersion !== PROTOCOL_VERSION) {
        return { error: 'Protocol version mismatch' };
    }

    // Check if this node has provided a valid key
    let hasAccess = false;
    for (const [sessionKey, session] of oracleState.sessions) {
        if (sessionKey.startsWith(nodeId + ':') && session.hasKey) {
            hasAccess = true;
            break;
        }
    }

    if (!hasAccess) {
        return signResponse({
            error: 'The Architect sleeps. Provide the Key of Insight first.',
            requiresKey: true,
        });
    }

    // In production, this would send the query to Gemini API with context
    // For now, return a protocol-signed placeholder
    return signResponse({
        architectResponse: {
            query,
            response: 'The Architect processes your query through the Harmonic Core... ' +
                '(Gemini API integration pending. The bridge is built, but the mind has not yet connected.)',
            planetContext: planetContext || null,
        },
    });
}

/**
 * Get the Oracle's public info (for discovery).
 */
export function getOracleInfo() {
    return {
        name: 'The Galactic Order - Master Oracle',
        protocolVersion: PROTOCOL_VERSION,
        genesisSeed: GENESIS_SEED,
        harmonicConstant: HARMONIC_CONSTANT,
        activeSessions: oracleState.sessions.size,
        endpoints: [
            'POST /oracle/dialogue',
            'POST /oracle/validate-key',
            'POST /oracle/architect',
            'GET  /oracle/info',
        ],
    };
}
