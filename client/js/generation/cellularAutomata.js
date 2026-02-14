/**
 * THE GALACTIC ORDER - Cellular Automata Engine
 *
 * The foundation of the universe. Every planet, creature, and mountain
 * in the game grows from these functions.
 *
 * Ported from Dudu's Python scripts (rule30.py, run_rule.py, universe_rules.py).
 * Bitwise-compatible: same rule + same width + same initial state = same output.
 *
 * The core insight: 256 possible rules (0-255), each a different "universe."
 * Rule 30 = chaos. Rule 90 = fractals. Rule 110 = computation. Rule 0 = death.
 */

// ============================================================
// CORE: The universal rule applier
// ============================================================

/**
 * Apply a Wolfram elementary cellular automaton rule.
 *
 * This is the EXACT port of the Python function:
 *   def apply_rule(rule_number, left, center, right):
 *       pattern = (left << 2) | (center << 1) | right
 *       return (rule_number >> pattern) & 1
 *
 * How it works:
 * - 3 cells (left, center, right) form a 3-bit pattern (0-7)
 * - The rule number (0-255) is an 8-bit lookup table
 * - Each bit of the rule number is the output for one of the 8 patterns
 *
 * Example: Rule 30 = 00011110 in binary
 *   Pattern 111 (7) → bit 7 → 0
 *   Pattern 110 (6) → bit 6 → 0
 *   Pattern 101 (5) → bit 5 → 0
 *   Pattern 100 (4) → bit 4 → 1
 *   Pattern 011 (3) → bit 3 → 1
 *   Pattern 010 (2) → bit 2 → 1
 *   Pattern 001 (1) → bit 1 → 1
 *   Pattern 000 (0) → bit 0 → 0
 *
 * @param {number} ruleNumber - The rule (0-255)
 * @param {number} left - Left neighbor (0 or 1)
 * @param {number} center - Current cell (0 or 1)
 * @param {number} right - Right neighbor (0 or 1)
 * @returns {number} The next state (0 or 1)
 */
export function applyRule(ruleNumber, left, center, right) {
    const pattern = (left << 2) | (center << 1) | right;
    return (ruleNumber >> pattern) & 1;
}

// ============================================================
// GRID GENERATION: 1D CA → 2D grid
// ============================================================

/**
 * Run a 1D cellular automaton for N generations.
 *
 * Matches the Python behavior exactly:
 * - Boundaries are fixed at 0 (cells at index 0 and width-1 stay dead)
 * - Each generation is computed from the previous one
 * - Returns the full grid including the initial state
 *
 * @param {number} ruleNumber - The rule (0-255)
 * @param {number} width - Width of the row
 * @param {number} generations - Number of generations to run
 * @param {number[]} [initialCells] - Positions to set to 1.
 *   Default: single dot at center (like rule30.py / universe_rules.py).
 *   Use [center, quarter] for dual-dot (like run_rule.py's "two Big Bangs").
 * @returns {Uint8Array[]} Array of generations, each a Uint8Array of 0s and 1s
 */
export function runCA1D(ruleNumber, width, generations, initialCells = null) {
    const grid = [];

    // Initialize first row
    let row = new Uint8Array(width);
    if (initialCells !== null && initialCells.length > 0) {
        for (const pos of initialCells) {
            if (pos >= 0 && pos < width) {
                row[pos] = 1;
            }
        }
    } else {
        // Default: single center dot (matches rule30.py and universe_rules.py)
        row[Math.floor(width / 2)] = 1;
    }

    for (let gen = 0; gen < generations; gen++) {
        // Store this generation
        grid.push(row.slice()); // .slice() to copy, not reference

        // Calculate next generation
        const next = new Uint8Array(width);
        for (let i = 1; i < width - 1; i++) {
            next[i] = applyRule(ruleNumber, row[i - 1], row[i], row[i + 1]);
        }
        // Boundaries stay 0 (same as Python: range(1, WIDTH - 1))
        row = next;
    }

    return grid;
}

/**
 * Run a 1D CA with the dual-dot "two Big Bangs" initial condition
 * from run_rule.py (center + quarter positions).
 *
 * @param {number} ruleNumber - The rule (0-255)
 * @param {number} width - Width of the row
 * @param {number} generations - Number of generations to run
 * @returns {Uint8Array[]} The CA grid
 */
export function runCA1DDual(ruleNumber, width, generations) {
    const center = Math.floor(width / 2);
    const quarter = Math.floor(width / 4);
    return runCA1D(ruleNumber, width, generations, [center, quarter]);
}

// ============================================================
// 2D GRID: Stack 1D runs into a 2D density map
// ============================================================

/**
 * Generate a 2D CA grid by running the same rule with different initial conditions.
 *
 * This is how we turn 1D rules into 2D terrain:
 * - Run the CA multiple times, each with a different starting position
 * - Stack the results into a 2D density map
 * - Each cell value = how many runs produced a 1 at that position
 *
 * The seed determines which starting positions are used,
 * making the output deterministic for any given (rule, seed) pair.
 *
 * @param {number} ruleNumber - The rule (0-255)
 * @param {number} width - Width of the grid
 * @param {number} height - Height of the grid (= generations per run)
 * @param {number} seed - Seed for initial condition variation
 * @param {number} [numRuns=8] - Number of CA runs to overlay
 * @returns {Float32Array} Flat array [height * width], values normalized to [0, 1]
 */
export function generateDensityGrid(ruleNumber, width, height, seed, numRuns = 8) {
    const density = new Float32Array(width * height);

    for (let run = 0; run < numRuns; run++) {
        // Deterministic starting position from seed + run index
        // Simple hash: multiply, XOR, modulo
        const startPos = ((seed * 2654435761 + run * 340573321) >>> 0) % width;

        const grid = runCA1D(ruleNumber, width, height, [startPos]);

        // Accumulate density
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                density[y * width + x] += grid[y][x];
            }
        }
    }

    // Normalize to [0, 1]
    const max = numRuns; // Maximum possible value = all runs had a 1
    for (let i = 0; i < density.length; i++) {
        density[i] /= max;
    }

    return density;
}

// ============================================================
// RULE CLASSIFICATION (Wolfram's 4 classes)
// ============================================================

/**
 * Classify a rule into one of Wolfram's 4 complexity classes.
 *
 * Class I:   Uniform (rule dies to all 0s or all 1s)
 * Class II:  Periodic (simple repeating patterns)
 * Class III: Chaotic (complex, aperiodic, random-looking)
 * Class IV:  Complex (structures that interact — edge of chaos)
 *
 * This is an empirical classification based on running the rule
 * and analyzing the output. Not all rules are cleanly classified,
 * but this gives a good approximation.
 *
 * @param {number} ruleNumber - The rule (0-255)
 * @returns {{ class: number, label: string, entropy: number, density: number }}
 */
export function classifyRule(ruleNumber) {
    const width = 101;
    const generations = 100;
    const grid = runCA1D(ruleNumber, width, generations);

    // Measure final generation density (ratio of 1s)
    const lastGen = grid[generations - 1];
    let ones = 0;
    for (let i = 0; i < width; i++) {
        if (lastGen[i] === 1) ones++;
    }
    const density = ones / width;

    // Measure entropy across last 20 generations
    // Count unique row patterns (as strings)
    const recentRows = new Set();
    for (let g = generations - 20; g < generations; g++) {
        recentRows.add(grid[g].join(''));
    }
    const uniquePatterns = recentRows.size;

    // Measure change between consecutive generations
    let totalChange = 0;
    for (let g = 1; g < generations; g++) {
        let changed = 0;
        for (let x = 0; x < width; x++) {
            if (grid[g][x] !== grid[g - 1][x]) changed++;
        }
        totalChange += changed / width;
    }
    const avgChange = totalChange / (generations - 1);

    // Classification heuristic
    let ruleClass, label;

    if (density === 0 || density === 1) {
        // All dead or all alive = uniform
        ruleClass = 1;
        label = 'Uniform';
    } else if (uniquePatterns <= 4) {
        // Very few unique patterns = periodic
        ruleClass = 2;
        label = 'Periodic';
    } else if (avgChange > 0.3 && uniquePatterns >= 18) {
        // High change rate + high variety = chaotic
        ruleClass = 3;
        label = 'Chaotic';
    } else if (uniquePatterns > 10 && avgChange > 0.1 && avgChange <= 0.3) {
        // Moderate change with some structure = complex
        ruleClass = 4;
        label = 'Complex';
    } else if (avgChange <= 0.1) {
        ruleClass = 2;
        label = 'Periodic';
    } else {
        // Default: somewhere between periodic and chaotic
        ruleClass = 3;
        label = 'Chaotic';
    }

    return {
        class: ruleClass,
        label,
        entropy: uniquePatterns / 20,  // 0-1, 1 = all unique
        density,
        avgChange
    };
}

// ============================================================
// RULE TABLE: Decode a rule number into its 8 outputs
// ============================================================

/**
 * Get the full rule table for a given rule number.
 * Shows what each of the 8 possible neighborhoods maps to.
 *
 * @param {number} ruleNumber - The rule (0-255)
 * @returns {Object[]} Array of 8 entries: { pattern, left, center, right, output }
 */
export function getRuleTable(ruleNumber) {
    const table = [];
    for (let pattern = 7; pattern >= 0; pattern--) {
        const left = (pattern >> 2) & 1;
        const center = (pattern >> 1) & 1;
        const right = pattern & 1;
        const output = (ruleNumber >> pattern) & 1;
        table.push({ pattern, left, center, right, output });
    }
    return table;
}

/**
 * Convert a rule number to its binary representation.
 * @param {number} ruleNumber - The rule (0-255)
 * @returns {string} 8-bit binary string (e.g., "00011110" for Rule 30)
 */
export function ruleToBinary(ruleNumber) {
    return ruleNumber.toString(2).padStart(8, '0');
}
