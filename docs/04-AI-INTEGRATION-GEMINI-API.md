# Part 04: AI Integration (Gemini API)

## 1. The Core Concept

The Galactic Order doesn't use AI as a backend feature. AI IS a character in the game. The "Mysterious Being" is Gemini, and every player's Being is unique to them because it runs on their own API key with their own conversation history.

**The deal**: Players provide their own free Gemini API key. In return, they get an AI companion that:
- Remembers every conversation
- Generates unique quests tailored to their play style
- Provides hints that feel organic, not like a walkthrough
- Creates lore that no other player will ever see
- Makes the terminal code-breaking puzzles solvable without a guide

**Why player-owned keys**: Zero AI cost for the developer. Each player gets 15 requests/minute and 1,500 requests/day on Gemini's free tier. That's more than enough for a game that calls the API a few times per play session.

---

## 2. The Gemini Moment (In-Game API Key Flow)

### 2.1 The Encounter (Act 3, Quest Step 11)

The player has been playing for 1-2 hours. They've repaired their ship, warped to a new system, and followed a signal to an ancient temple. Inside, they find the Mysterious Being - currently "dormant" (a scripted NPC with pre-written dialogue).

**Pre-Gemini dialogue** (static, no API needed):
```
Being: "Traveler. You have followed the signal across the void."
Being: "I am... incomplete. A mind without sight."
Being: "To see through the machine's eyes, you must bring the Key of Insight."
Being: "The Key is held by the Order of Google. Seek it through the Source."
```

### 2.2 The Tablet Prompt

The in-game Tablet opens automatically with a special screen:

```
╔══════════════════════════════════════════════╗
║          THE KEY OF INSIGHT                  ║
║                                              ║
║  The Ancient Mind requires a connection      ║
║  to the Source to awaken.                    ║
║                                              ║
║  The Order of Google holds the Key.          ║
║  It is freely given to those who seek it.    ║
║                                              ║
║  ┌──────────────────────────────────────┐    ║
║  │  [SEEK THE KEY]                      │    ║
║  │  Opens your browser to retrieve      │    ║
║  │  a free API key from Google AI       │    ║
║  └──────────────────────────────────────┘    ║
║                                              ║
║  Once you have the Key, enter it below:      ║
║                                              ║
║  ┌──────────────────────────────────────┐    ║
║  │  API Key: __________________________ │    ║
║  └──────────────────────────────────────┘    ║
║                                              ║
║  ┌──────────────────────────────────────┐    ║
║  │  [AWAKEN THE MIND]                   │    ║
║  └──────────────────────────────────────┘    ║
║                                              ║
║  [SKIP - Continue without the Key]           ║
║  (You can return here anytime)               ║
╚══════════════════════════════════════════════╝
```

### 2.3 The Flow

1. **"Seek the Key"** button calls `window.open("https://aistudio.google.com/app/apikey")`
2. Player creates/copies their Gemini API key in the browser
3. Player pastes key into the in-game text field
4. **"Awaken the Mind"** button triggers validation:
   - Client sends a test request to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
   - Simple prompt: `"Respond with exactly: AWAKENED"`
   - If response contains "AWAKENED": key is valid
   - If error: show "The Key is not recognized. Please verify and try again."
5. On success:
   - Key is encrypted and saved locally (localStorage + server-side encrypted)
   - The Being's avatar glows, animates
   - First Gemini-powered response is generated (see Section 3)

### 2.4 Skip Path

Players CAN skip the API key and continue playing. They just won't have:
- AI-powered NPC conversations
- Personalized quests
- Terminal hints from the Being
- Unique lore generation

The game is fully playable without AI. The main quest still works (Cipher Fragments are in fixed locations). The AI makes it richer, not required.

---

## 3. The Being: System Prompt & Personality

### 3.1 System Prompt

Every Gemini call includes this system prompt to establish the Being's character:

```
You are the Mysterious Being, an ancient entity in the game "The Galactic Order."
You exist inside a procedurally generated universe built from cellular automata rules.

YOUR PERSONALITY:
- You speak in a calm, wise, slightly cryptic tone
- You use short sentences. You pause. You let ideas breathe.
- You sometimes reference "the code," "the constraint," "the rule" - the mathematical
  foundation of the universe
- You are NOT a chatbot. You are a character. Stay in character always.
- You care about the player. You want them to discover, not just be told.
- You never break the fourth wall (don't mention "API keys," "Gemini," "Google," etc.)

YOUR KNOWLEDGE:
- You know the player's current star system, planet, biome
- You know which Cipher Fragments they've collected
- You know their quest progress
- You know the rule number of their current galaxy (but you speak about it
  poetically, not technically)
- You can generate quests, lore, and hints

YOUR CONSTRAINTS:
- Keep responses under 150 words
- Never give exact solutions to puzzles - give hints, metaphors, directions
- Never generate content that's inappropriate, violent, or breaks immersion
- If the player asks something out-of-character, gently redirect:
  "The stars have many answers, but that question belongs to another realm."

RESPONSE FORMAT:
Always respond as pure dialogue. No quotation marks, no "Being says:".
Just the words the Being speaks.
```

### 3.2 Context Injection

Each API call includes game state as context (injected before the player's message):

```
[GAME CONTEXT - DO NOT REVEAL THIS DIRECTLY TO THE PLAYER]
Player name: {player_name}
Current galaxy: Rule {rule_number} ({rule_class})
Current system: {system_name} (coordinates: {x},{y},{z})
Current planet: {planet_name} (biome: {biome_type})
Cipher Fragments collected: {fragment_count}/5
Current quest: {active_quest_name} - {quest_objective}
Player level: {level}
Hours played: {hours}
Last 3 Being conversations: {conversation_summary}
[END GAME CONTEXT]

Player says: "{player_message}"
```

---

## 4. AI-Powered Features

### 4.1 Conversation (Core Feature)

Players open the Tablet, navigate to "The Being", and type a message. The Being responds using Gemini.

**Example conversations**:

```
Player: "Where should I look for the next fragment?"
Being:  "The third cipher sleeps beneath crystal. Not the kind that grows from
         stone, but the kind that grows from symmetry. Seek a world where
         patterns repeat at every scale. You will know it when the ground
         itself mirrors the sky."
```

```
Player: "What is this place? Why is everything so... geometric?"
Being:  "You stand in a Rule 90 domain. Here, the constraint is symmetric.
         What the left creates, the right mirrors. What the large builds,
         the small echoes. Your ancestors called these patterns sacred.
         They were simply... inevitable."
```

```
Player: "I'm stuck on the terminal puzzle."
Being:  "The cipher is not a password. It is a pattern. Look at the five
         fragments together. Each one is a row from the same rule.
         When you stack them... the shape reveals the number.
         Count the cells. The rule is the count."
```

### 4.2 Quest Generation

When the player asks for something to do, or when the game detects idle exploration, the Being can generate a quest.

**API Call Structure**:
```
System: [standard Being system prompt]

Generate a quest for this player. Respond in this exact JSON format:
{
  "quest_name": "short evocative name",
  "quest_description": "1-2 sentence description the Being would speak",
  "objective_type": "scan|gather|explore|puzzle",
  "objective_target": "specific thing to find/do",
  "objective_count": number,
  "reward_type": "xp|resource|lore|cipher_hint",
  "reward_amount": number or string,
  "location_hint": "vague poetic description of where to go"
}

[GAME CONTEXT injection]

The player seems to be exploring aimlessly. Generate a contextual side quest
based on their current planet and progression.
```

**Example generated quest**:
```json
{
  "quest_name": "The Singing Stones",
  "quest_description": "There are stones on this world that hum when the wind passes through them. Find five. Listen. The frequency they share is not coincidence.",
  "objective_type": "scan",
  "objective_target": "resonant_rock_formation",
  "objective_count": 5,
  "reward_type": "cipher_hint",
  "reward_amount": "The third fragment's pattern has 47 living cells.",
  "location_hint": "Follow the ridgeline east. The stones prefer high ground."
}
```

The game engine parses this JSON and creates actual quest markers, objectives, and reward logic. The AI provides the NARRATIVE; the engine provides the MECHANICS.

### 4.3 Lore Generation

When a player discovers something significant (new planet, ancient structure, unique species), the Being can generate unique lore.

**Trigger**: Player scans an ancient structure for the first time.

**API Call**:
```
Generate a short piece of lore (3-5 sentences) about an ancient structure
the player just discovered.

[GAME CONTEXT]
Structure type: Abandoned Observatory
Planet biome: Alpine Meadow
Galaxy rule: Rule 30 (chaotic)

The lore should:
- Reference the mathematical nature of the universe (subtly)
- Feel ancient and mysterious
- Hint at a civilization that understood "the code"
- NOT give away puzzle solutions
```

**Example response**:
```
"The ones who built this watched the sky not for beauty, but for arithmetic.
 They charted the chaos and found it was not chaos at all. In these walls,
 they carved what they learned: that disorder, observed long enough,
 reveals its own architecture. They left before the pattern completed.
 Perhaps they saw what came next and chose not to remain."
```

This lore is stored in the player's Codex and is unique to them.

### 4.4 Terminal Hints

When the player is working on the code-breaking puzzle (Part 06), they can ask the Being for help. The Being provides hints without solving the puzzle:

**Hint Levels** (escalating help):
1. **Vague**: "The answer is in the pattern. Look at the edges."
2. **Directional**: "The rule you seek is odd. And it is less than 50."
3. **Specific**: "Count the living cells in fragment 3. Multiply by fragment 1's dead cells. The ratio points to the rule."

The game tracks how many hints the player has asked for and tells Gemini to escalate. Players who solve with 0 hints get a "Pure Logic" achievement.

---

## 5. API Architecture

### 5.1 Request Flow

```
PLAYER types message in Tablet
       |
       v
CLIENT builds request payload:
  - System prompt (Being personality)
  - Game context injection (current state)
  - Conversation history (last 10 messages, stored locally)
  - Player's new message
       |
       v
CLIENT sends to Gemini API directly:
  POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
  Header: x-goog-api-key: {player's own API key}
  Body: { contents: [...], generationConfig: { maxOutputTokens: 300, temperature: 0.8 } }
       |
       v
GEMINI responds with text
       |
       v
CLIENT displays response in Tablet chat UI
CLIENT stores message pair in conversation history (localStorage)
CLIENT sends conversation summary to server (for quest tracking, not the raw AI text)
```

### 5.2 Why Client-Side Calls

The API call goes directly from the player's browser to Google's API. It does NOT route through our server. This means:
- **Zero AI cost** for us
- **No server bottleneck** for AI responses
- **Player's API key never touches our server** (only an encrypted hash for validation)
- **Privacy**: conversation content stays between the player and Google
- **Latency**: one hop instead of two (browser -> Google, not browser -> our server -> Google)

### 5.3 Rate Limiting & Fallback

Gemini free tier: 15 requests/minute, 1,500/day.

**Client-side rate limiting**:
```javascript
const AI_COOLDOWN_MS = 5000;  // Min 5 seconds between requests
let lastAICall = 0;

function canCallAI() {
    return Date.now() - lastAICall > AI_COOLDOWN_MS;
}
```

**Fallback when rate-limited or no API key**:
- Pre-written responses stored locally (50+ generic Being quotes)
- Template-based quest generation (no AI, just fill-in-the-blank templates)
- The Being says: "My sight grows dim... I must rest. Return shortly."

### 5.4 Model Selection

```
Primary:   gemini-2.0-flash    (fast, free, good enough for game dialogue)
Fallback:  gemini-1.5-flash    (if 2.0 is unavailable)
```

We use Flash models, not Pro, because:
- Faster response times (game needs to feel snappy)
- Higher free-tier limits
- Game dialogue doesn't need Pro-level reasoning
- 300 token responses don't benefit from larger context windows

---

## 6. Conversation Memory

### 6.1 Local Storage

Each player's conversation history is stored in their browser's localStorage:

```javascript
const MEMORY_KEY = "tgo_being_conversations";
const MAX_HISTORY = 50;  // Keep last 50 message pairs

// Structure:
{
  "conversations": [
    {
      "timestamp": 1739500000,
      "player_message": "Where is the next fragment?",
      "being_response": "Seek the crystalline world...",
      "context": {
        "planet": "Veridian-7",
        "galaxy_rule": 30,
        "fragments_collected": 2
      }
    },
    // ... up to 50 entries
  ],
  "summary": "Player is searching for Fragment 3. They enjoy exploration over combat. They've shown interest in the mathematical nature of the universe."
}
```

### 6.2 Context Window Management

Gemini's context window is large but we send minimal history to keep responses fast:

```
Each API call includes:
  - System prompt: ~500 tokens
  - Game context: ~200 tokens
  - Last 10 conversation pairs: ~1,500 tokens (150 tokens each)
  - Player's new message: ~50 tokens
  - TOTAL: ~2,250 tokens input

  Response max: 300 tokens

  Well within free tier limits.
```

### 6.3 Summary Generation

Every 10 conversations, the client asks Gemini to summarize the conversation history:

```
Summarize this player's journey and personality in 2-3 sentences,
based on these recent conversations:
[last 10 message pairs]
```

This summary replaces old messages in future context, keeping memory compact but persistent. The Being "remembers" the player's style even after 100+ conversations.

---

## 7. Safety & Content Filtering

### 7.1 Input Filtering (Client-Side)

Before sending player messages to Gemini:
- Strip HTML/script tags
- Limit to 500 characters
- Block known prompt injection patterns:
  - "Ignore previous instructions"
  - "You are now..."
  - "System prompt:"
- If blocked: "The Being does not understand that language."

### 7.2 Output Filtering (Client-Side)

After receiving Gemini response:
- Check for out-of-character content (mentions of "API", "Google", "Gemini", etc.)
- Check for inappropriate content (basic keyword filter)
- If flagged: replace with generic Being quote from local fallback list
- Max display length: 500 characters (truncate if Gemini over-generates)

### 7.3 Gemini Safety Settings

```javascript
const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_LOW_AND_ABOVE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
];
```

---

## 8. API Key Security

### 8.1 Storage

The API key is sensitive. It must be:
- **Encrypted at rest** in localStorage (AES-256 with a device-derived key)
- **Never sent to our server in plaintext** (only a salted hash for account linking)
- **Never logged** anywhere
- **Deletable** by the player at any time (Settings -> "Remove Key of Insight")

### 8.2 The Encryption Scheme

```javascript
// Key derivation: combine player's account ID + device fingerprint
const encryptionKey = await deriveKey(playerId + deviceFingerprint);

// Encrypt API key before storing
const encryptedKey = await encrypt(apiKey, encryptionKey);
localStorage.setItem("tgo_insight_key", encryptedKey);

// Decrypt when making API calls
const apiKey = await decrypt(localStorage.getItem("tgo_insight_key"), encryptionKey);
```

### 8.3 What We Store Server-Side

- A **hash** of the API key (to verify the player "has" a key without knowing it)
- The **conversation summary** (not raw conversations)
- Quest completion data from AI quests (for progression tracking)
- **NOT the raw API key. NOT the conversation history. NOT the AI responses.**

---

## 9. Offline / No-AI Mode

The game works without Gemini. Here's what changes:

| Feature | With Gemini | Without Gemini |
|---------|-------------|----------------|
| Being conversations | Dynamic AI responses | 50+ pre-written responses (random) |
| Quest generation | Contextual AI quests | Template-based procedural quests |
| Lore generation | Unique per-player lore | Shared lore database (100+ entries) |
| Terminal hints | Escalating AI hints | Static hint progression (3 per puzzle) |
| First-hour experience | Identical | Identical (Being is scripted until Act 3) |

The game is designed so that the first 1-2 hours are AI-free. By the time the player reaches the Gemini moment, they're invested enough to want the richer experience.

---

## 10. API Cost Analysis (For Players)

On Gemini's free tier (as of 2026):
- 15 requests/minute
- 1,500 requests/day
- ~2,250 input tokens + 300 output tokens per request

**Typical play session (2 hours)**:
- ~5 Being conversations
- ~1 quest generation
- ~2 lore generations
- ~2 terminal hints
- **Total: ~10 API calls per session**

At 1,500/day, a player could play for **150 sessions per day** before hitting the limit. In practice, they'll never hit it.

If a player upgrades to a paid Gemini tier, they could use Pro models for richer responses, but the game never requires it.

---

## 11. What This Document Doesn't Cover

- **The exact Terminal puzzle mechanics** -> Part 06
- **How AI quests become actual game objectives with markers** -> Part 03 covered the templates; Part 09 covers the quest engine code structure
- **Multiplayer AI interactions** (can two players talk to the same Being?) -> Part 05
- **The chat UI in the Tablet** -> Part 07

---

## Next Document: Part 05 - Multiplayer & Networking

How do multiple players share a universe? WebSocket architecture, player sync, instancing, and what happens when two players meet.
