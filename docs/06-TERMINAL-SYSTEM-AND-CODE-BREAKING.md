# Part 06: Terminal System & Code-Breaking

## 1. What Is the Terminal?

The Terminal is a locked computer on the player's ship. It's the central mystery of the game. From the moment the player first sees "ACCESS DENIED" to the moment they crack the code, the Terminal is always there - waiting.

Cracking the Terminal is not a single puzzle. It's a 5-stage decryption process where each stage requires a Cipher Fragment earned through gameplay. The final answer is a **Wolfram rule number** (0-255) - the rule that generated the player's home galaxy.

The Terminal ties the game's mechanics directly to its mathematical foundation. The player isn't just solving a puzzle. They're discovering the "source code" of their universe.

---

## 2. Terminal States

The Terminal has 6 states, displayed on a screen in the ship's bridge:

### State 0: Locked (Starting State)
```
╔══════════════════════════════════════════╗
║                                          ║
║          ████████████████████             ║
║          █  T E R M I N A L  █           ║
║          ████████████████████             ║
║                                          ║
║          STATUS: LOCKED                  ║
║                                          ║
║    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓           ║
║    CIPHER KEY: 0 / 5 FRAGMENTS          ║
║    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓           ║
║                                          ║
║    "Seek the signal. The code awaits."   ║
║                                          ║
╚══════════════════════════════════════════╝
```

### States 1-4: Partially Unlocked
```
╔══════════════════════════════════════════╗
║  T E R M I N A L                         ║
║  STATUS: DECRYPTING...                   ║
║                                          ║
║  CIPHER KEY: 3 / 5 FRAGMENTS            ║
║  ████████████████░░░░░░░░  60%           ║
║                                          ║
║  FRAGMENT 1: ██░█░██░  [LOADED]          ║
║  FRAGMENT 2: █░░██░█░  [LOADED]          ║
║  FRAGMENT 3: ░██░░█░█  [LOADED]          ║
║  FRAGMENT 4: ░░░░░░░░  [MISSING]         ║
║  FRAGMENT 5: ░░░░░░░░  [MISSING]         ║
║                                          ║
║  "Three voices. Two still silent."       ║
║                                          ║
╚══════════════════════════════════════════╝
```

### State 5: All Fragments Collected - Puzzle Active
```
╔══════════════════════════════════════════╗
║  T E R M I N A L                         ║
║  STATUS: ALL FRAGMENTS LOADED            ║
║  ████████████████████████  100%          ║
║                                          ║
║  CIPHER KEY ASSEMBLED. DECRYPTION READY. ║
║                                          ║
║  [INITIATE DECRYPTION SEQUENCE]          ║
║                                          ║
╚══════════════════════════════════════════╝
```

### State 6: Cracked (Endgame)
```
╔══════════════════════════════════════════╗
║  T E R M I N A L                         ║
║  STATUS: ██ UNLOCKED ██                  ║
║                                          ║
║  THE CODE: RULE 30                       ║
║                                          ║
║  ░░░░░░░░░░░░░░░░░██░░░░░░░░░░░░░░░░░░  ║
║  ░░░░░░░░░░░░░░░░██████░░░░░░░░░░░░░░░  ║
║  ░░░░░░░░░░░░░░░██░░░░██░░░░░░░░░░░░░░  ║
║  ░░░░░░░░░░░░░░██████████░░░░░░░░░░░░░  ║
║  ░░░░░░░░░░░░░██░░░░░░░░██░░░░░░░░░░░░  ║
║                                          ║
║  "One constraint. One dot. Everything."  ║
║                                          ║
║  [EXPLORE RULES]  [GALAXY MAP]           ║
╚══════════════════════════════════════════╝
```

---

## 3. Cipher Fragments

### 3.1 What Is a Cipher Fragment?

Each fragment is a **row extracted from the CA pattern** of the player's home galaxy rule. It's a sequence of 8 bits (matching the 8-bit rule encoding).

```
EXAMPLE (Home galaxy = Rule 30 = binary 00011110):

Fragment 1:  █ ░ ░ █ █ █ █ ░    (from generation 10 of Rule 30)
Fragment 2:  ░ █ █ ░ ░ █ ░ █    (from generation 25 of Rule 30)
Fragment 3:  █ █ ░ ░ ░ ░ █ █    (from generation 40 of Rule 30)
Fragment 4:  ░ ░ █ █ █ ░ ░ ░    (from generation 55 of Rule 30)
Fragment 5:  █ ░ █ ░ ░ █ █ ░    (from generation 70 of Rule 30)
```

Each fragment is an 8-cell slice of the CA, sampled from a specific generation. The player doesn't know the rule number yet - they only see the pattern.

### 3.2 How Fragments Are Displayed

In the player's inventory, a fragment looks like a glowing crystal shard with a binary pattern etched into it. On the Terminal screen, it renders as:

```
FRAGMENT 3:  █ █ ░ ░ ░ ░ █ █
             1 1 0 0 0 0 1 1

"Found in the Crystal Caves of Veridian-7.
 The symmetry suggests an ordered rule."
```

### 3.3 Fragment Acquisition

Each fragment is obtained through a specific quest (detailed in Part 03, Acts 1-4):

| Fragment | Quest | Location | Puzzle Type |
|----------|-------|----------|-------------|
| 1 | Act 2: "Ancient Echoes" | Ancient structure, starting system | None (story reward) |
| 2 | Act 3: "The Mysterious Being" | Temple, second system | AI conversation unlocks it |
| 3 | Act 4: "The Fractal World" | Crystal cave, Rule 90 galaxy | Pattern matching puzzle |
| 4 | Act 4: "The Chaotic Shore" | Creature ecosystem, Rule 30 galaxy | Behavioral observation |
| 5 | Act 4: "The Living Code" | CA structure, Rule 110 galaxy | Rule identification |

---

## 4. The Decryption Sequence (The Puzzle)

When the player has all 5 fragments and initiates decryption, the Terminal presents a multi-stage puzzle.

### 4.1 Stage 1: "Reconstruction"

**Goal**: Arrange the 5 fragments in the correct order (by generation number).

```
╔══════════════════════════════════════════════════╗
║  DECRYPTION STAGE 1: RECONSTRUCTION              ║
║                                                  ║
║  Arrange the fragments in chronological order.   ║
║  The pattern grows from a single point.          ║
║  Earlier rows are simpler. Later rows are        ║
║  more complex.                                   ║
║                                                  ║
║  DRAG TO REORDER:                                ║
║                                                  ║
║  [ █░░██░█░ ] <- Fragment 2                      ║
║  [ █░█░░██░ ] <- Fragment 5                      ║
║  [ █░░████░ ] <- Fragment 1                      ║
║  [ ██░░░░██ ] <- Fragment 3                      ║
║  [ ░░███░░░ ] <- Fragment 4                      ║
║                                                  ║
║  [VERIFY ORDER]                                  ║
╚══════════════════════════════════════════════════╝
```

**How to solve**: The player examines the complexity/density of each fragment. Early CA generations (closer to the starting dot) have fewer active cells and simpler patterns. Later generations are denser and more complex. The player arranges from least to most complex.

**Feedback**: If wrong, the Terminal highlights which fragments are misplaced (not the solution, just "Fragment 3 is not in the right position").

### 4.2 Stage 2: "The Neighborhood"

**Goal**: Determine the rule's output for each of the 8 possible 3-cell neighborhoods.

```
╔══════════════════════════════════════════════════╗
║  DECRYPTION STAGE 2: THE NEIGHBORHOOD            ║
║                                                  ║
║  Every cell follows its neighbors.               ║
║  For each pattern of three cells, what does      ║
║  the next generation produce?                    ║
║                                                  ║
║  EXAMINE THE FRAGMENTS:                          ║
║                                                  ║
║  Row 10:  █ ░ ░ █ █ █ █ ░                       ║
║  Row 11:  ? ? ? ? ? ? ? ?                        ║
║  Row 25:  ░ █ █ ░ ░ █ ░ █                       ║
║                                                  ║
║  For the pattern [█ █ ░], the next cell is:      ║
║                                                  ║
║     [░ OFF]    [█ ON]                            ║
║                                                  ║
║  Determine all 8 patterns:                       ║
║  ███ -> ?   ██░ -> ?   █░█ -> ?   █░░ -> ?      ║
║  ░██ -> ?   ░█░ -> ?   ░░█ -> ?   ░░░ -> ?      ║
║                                                  ║
║  [SUBMIT RULE TABLE]                             ║
╚══════════════════════════════════════════════════╝
```

**How to solve**: The player has 5 sequential rows from the CA. By examining consecutive rows, they can see what output each 3-cell neighborhood produced. For example, if row 10 has `█░░` at positions 4-5-6, and row 11's position 5 is `█`, then the neighborhood `█░░` maps to `█` (ON).

The player doesn't have all row pairs (fragments are spaced apart), so they must deduce some mappings from context or ask the Being for hints.

**Help from the Being**:
```
Player: "I can't figure out what ░░░ maps to."
Being:  "When silence surrounds a cell, does it awaken or remain still?
         Look at the edges of your fragments, where the pattern meets the void."
```

### 4.3 Stage 3: "The Number"

**Goal**: Convert the 8-bit rule table into a decimal number.

```
╔══════════════════════════════════════════════════╗
║  DECRYPTION STAGE 3: THE NUMBER                  ║
║                                                  ║
║  You've decoded the rule table:                  ║
║                                                  ║
║  ███ -> 0   ██░ -> 0   █░█ -> 0   █░░ -> 1      ║
║  ░██ -> 1   ░█░ -> 1   ░░█ -> 1   ░░░ -> 0      ║
║                                                  ║
║  Read these outputs as a binary number:          ║
║  0 0 0 1 1 1 1 0                                 ║
║                                                  ║
║  What decimal number is this?                    ║
║                                                  ║
║  ENTER THE RULE NUMBER: [____]                   ║
║                                                  ║
║  [DECRYPT]                                       ║
╚══════════════════════════════════════════════════╝
```

**How to solve**: Binary to decimal conversion. `00011110` in binary = 30 in decimal. The Terminal provides a binary-to-decimal reference table for players unfamiliar with binary.

**Hint table provided in Terminal**:
```
  BINARY REFERENCE:
  Position:  128  64  32  16  8  4  2  1
  Your bits:  0    0   0   1  1  1  1  0
  Sum the positions where the bit is 1:
  16 + 8 + 4 + 2 = 30
```

### 4.4 Stage 4: "Verification"

**Goal**: Confirm the answer by running the rule and seeing it match.

```
╔══════════════════════════════════════════════════╗
║  DECRYPTION STAGE 4: VERIFICATION                ║
║                                                  ║
║  You entered: RULE 30                            ║
║                                                  ║
║  Running rule from a single point...             ║
║                                                  ║
║                    █                             ║
║                   ███                            ║
║                  ██  █                           ║
║                 ██████                           ║
║                ██    ██                          ║
║               ████  ████                         ║
║              ██  ████  █                         ║
║                   ...                            ║
║                                                  ║
║  ✓ FRAGMENT 1 MATCHES ROW 10                     ║
║  ✓ FRAGMENT 2 MATCHES ROW 25                     ║
║  ✓ FRAGMENT 3 MATCHES ROW 40                     ║
║  ✓ FRAGMENT 4 MATCHES ROW 55                     ║
║  ✓ FRAGMENT 5 MATCHES ROW 70                     ║
║                                                  ║
║  ██ DECRYPTION COMPLETE ██                       ║
║                                                  ║
║  The code of your universe is: RULE 30           ║
║  One constraint. One dot. Everything.            ║
║                                                  ║
║  [CONTINUE]                                      ║
╚══════════════════════════════════════════════════╝
```

The CA pattern animates on screen, growing from a single dot, and the player's fragments light up as their corresponding rows are reached. It's a visual payoff that connects their entire journey - from the first terminal output they saw in their own command prompt to this moment.

---

## 5. Post-Crack: The Unlocked Terminal

After cracking the code, the Terminal becomes a permanent tool with new features:

### 5.1 Rule Explorer

The player can run any rule (0-255) and see the CA pattern grow in real-time on the Terminal screen. This is essentially your `run_rule.py` ported to the game.

```
╔══════════════════════════════════════════════════╗
║  RULE EXPLORER                                   ║
║                                                  ║
║  CURRENT RULE: [110]  [RUN]                      ║
║                                                  ║
║  (CA pattern animates here)                      ║
║                                                  ║
║  CLASS: IV (Complex / Turing Complete)           ║
║  DENSITY: 0.52                                   ║
║  SYMMETRY: Asymmetric                            ║
║  GALAXY: "The Living Lattice"                    ║
║                                                  ║
║  [VISIT THIS GALAXY]                             ║
╚══════════════════════════════════════════════════╝
```

### 5.2 Galaxy Map

The full galaxy map unlocks, showing all 256 galaxies arranged by rule class:

```
╔══════════════════════════════════════════════════╗
║  GALAXY MAP                                      ║
║                                                  ║
║  CLASS I (Dead)      ○ ○ ○ ○ ○ ○ ○ ○ ...       ║
║  CLASS II (Regular)  ◐ ◐ ◐ ◐ ◐ ◐ ◐ ...        ║
║  CLASS III (Chaotic) ● ● ● ● ● ★ ● ● ...       ║
║  CLASS IV (Complex)  ◉ ◉ ◉ ◉ ◉ ...              ║
║                                                  ║
║  ★ = Your home galaxy (Rule 30)                  ║
║  ● = Visited                                     ║
║  ○ = Unvisited                                   ║
║                                                  ║
║  Select a galaxy to view details and warp.       ║
╚══════════════════════════════════════════════════╝
```

### 5.3 Deep Terminal (Endgame Content)

After cracking the main Terminal, a "Deep Terminal" mode unlocks. It generates procedural puzzles of increasing difficulty:

```
DEEP TERMINAL - LEVEL 1:
  "An unknown rule generated this pattern. Identify the rule."
  (Shows a CA pattern, player must determine the rule number)

DEEP TERMINAL - LEVEL 5:
  "Two rules were XORed together to create this pattern.
   Identify both rules."

DEEP TERMINAL - LEVEL 10:
  "This pattern was generated by a 2D cellular automaton.
   Determine the birth/survival rules." (Game of Life variants)

DEEP TERMINAL - LEVEL 20:
  "This heightmap was generated by the engine. Which rule
   and seed produced it?" (Reverse-engineer a planet)
```

Each level rewards rare resources, unique cosmetics, or lore entries. The difficulty scales infinitely - the puzzles are generated procedurally from the CA engine itself.

---

## 6. Difficulty Tuning

### 6.1 The Main Puzzle (Stages 1-4)

The main Terminal puzzle is designed to be **challenging but fair** for someone who has never seen a cellular automaton before. By the time they reach the puzzle, they've:
- Seen CA patterns in ancient structures (Acts 2-4)
- Had the Being explain "rules" and "constraints" in conversation
- Visited three different rule-class galaxies and seen the visual differences
- Collected fragments that ARE CA rows (they just didn't know it yet)

**Expected solve time**: 15-45 minutes (without AI hints), 5-15 minutes (with hints).

### 6.2 Hint Escalation

The Being provides increasingly specific hints. The game tracks:

```javascript
const hintLevel = {
    stage1_attempts: 0,  // How many wrong orderings
    stage2_attempts: 0,  // How many wrong rule table entries
    stage3_attempts: 0,  // How many wrong decimal numbers
    hints_requested: 0   // How many times player asked the Being
};

// Hint escalation:
// hints_requested 0-1: Vague, poetic hints
// hints_requested 2-3: Directional hints ("it's less than 50")
// hints_requested 4-5: Specific mathematical hints
// hints_requested 6+:  Near-solution ("The binary is 00011110")
```

A player who asks for 0 hints gets the "**Pure Logic**" achievement.
A player who uses all hints still cracks the terminal and gets the full reward. No shame in asking for help.

### 6.3 Binary Reference

Since binary-to-decimal conversion is a skill many players won't have, the Terminal always displays a reference:

```
QUICK REFERENCE:
  Binary: each digit is a power of 2
  Rightmost = 1, then 2, 4, 8, 16, 32, 64, 128
  Add up the positions that are "1" (ON/█)

  Example: 01101110
  = 0 + 64 + 32 + 0 + 8 + 4 + 2 + 0
  = 110

  Your pattern: ????????
  = ??
```

---

## 7. The Philosophical Payoff

When the Terminal cracks, the Being delivers a final message (Gemini-generated, but guided by a specific prompt):

```
SYSTEM PROMPT (for this specific moment):

The player has just cracked the Terminal and discovered that their
universe's "source code" is Rule {rule_number}. Generate a 3-5 sentence
response that:
- Acknowledges their achievement
- Connects the game's rule to the real-world question "does the universe have source code?"
- References the journey from "trapping electrons" to "running universes"
- Ends with an open question that makes them want to keep exploring
- Stay in character as the Being. Calm. Wise. Brief.
```

**Example Being response**:
```
"You found it. Rule 30. One constraint, applied endlessly.
 From this single truth, your entire sky was written.
 The ones who built me asked the same question you did:
 is the code the universe, or is the universe the code?
 They never answered it. Neither will you. But now you know
 where to look. The other 255 rules are waiting."
```

---

## 8. Technical Implementation

### 8.1 Fragment Storage

```javascript
// Each fragment is stored as:
{
    id: 1,                          // Fragment number (1-5)
    bits: [1, 0, 0, 1, 1, 1, 1, 0], // 8-bit CA row
    generation: 10,                  // Which CA generation it came from
    found: true,                     // Whether player has found it
    found_at: {                      // Where it was found (for codex)
        system: "Alpha Centauri",
        planet: "Veridian-7",
        structure: "Crystal Cave"
    }
}
```

### 8.2 Puzzle Validation

```javascript
function validateRuleGuess(playerGuess, correctRule) {
    return playerGuess === correctRule;
}

function validateFragmentOrder(playerOrder, correctOrder) {
    // correctOrder is fragments sorted by generation number
    for (let i = 0; i < playerOrder.length; i++) {
        if (playerOrder[i].id !== correctOrder[i].id) {
            return { correct: false, wrongIndex: i };
        }
    }
    return { correct: true };
}

function validateRuleTable(playerTable, correctRule) {
    // playerTable is an array of 8 outputs (0 or 1)
    // correctRule's binary gives the correct outputs
    const correctTable = [];
    for (let i = 0; i < 8; i++) {
        correctTable.push((correctRule >> i) & 1);
    }
    const wrong = [];
    for (let i = 0; i < 8; i++) {
        if (playerTable[i] !== correctTable[i]) wrong.push(i);
    }
    return { correct: wrong.length === 0, wrongPatterns: wrong };
}
```

### 8.3 CA Pattern Renderer (Terminal Screen)

The Terminal's CA display reuses the same `applyRule()` function from Part 02, rendered onto a canvas element styled to look like a CRT monitor:

```javascript
function renderCAOnTerminal(canvas, ruleNumber, width, generations) {
    const ctx = canvas.getContext('2d');
    const cellSize = canvas.width / width;

    let row = new Array(width).fill(0);
    row[Math.floor(width / 2)] = 1;

    for (let gen = 0; gen < generations; gen++) {
        for (let i = 0; i < width; i++) {
            if (row[i]) {
                ctx.fillStyle = '#00ff41'; // Matrix green
                ctx.fillRect(i * cellSize, gen * cellSize, cellSize, cellSize);
            }
        }
        const nextRow = new Array(width).fill(0);
        for (let i = 1; i < width - 1; i++) {
            nextRow[i] = applyRule(ruleNumber, row[i-1], row[i], row[i+1]);
        }
        row = nextRow;
    }
}
```

### 8.4 CRT Effect (Visual Polish)

The Terminal screen uses CSS/shader effects to look like an old computer:

```css
.terminal-screen {
    background: #0a0a0a;
    color: #00ff41;
    font-family: 'Courier New', monospace;
    text-shadow: 0 0 5px #00ff41;
    /* Scanline overlay */
    background-image: repeating-linear-gradient(
        0deg,
        rgba(0, 0, 0, 0.15) 0px,
        rgba(0, 0, 0, 0.15) 1px,
        transparent 1px,
        transparent 2px
    );
    /* Slight curve */
    border-radius: 20px;
    /* Flicker animation */
    animation: flicker 0.15s infinite;
}
```

---

## 9. What This Document Doesn't Cover

- **How the terminal UI is positioned in the 3D world (ship bridge)** -> Part 07
- **How puzzle state is saved/loaded** -> Part 08
- **The Deep Terminal's procedural puzzle generator algorithm** -> Future enhancement document

---

## Next Document: Part 07 - Frontend & Rendering (Three.js/WebGL)

How does all of this look? The 3D rendering pipeline, planet shaders, the HUD, the Tablet UI, and how to make a browser game look beautiful.
