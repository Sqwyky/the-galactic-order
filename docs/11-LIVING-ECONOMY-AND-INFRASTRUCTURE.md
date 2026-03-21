# 11. Living Economy & Infrastructure

> The Galactic Order as a self-sustaining, self-coding game with a real-world economy powered by player hardware.

---

## 11.1 Core Vision

The game runs 24/7, evolves its own code via AI, rewards players with real value, and costs the developer nothing out of pocket. Revenue comes from player-contributed GPU compute and organic economic activity.

---

## 11.2 Self-Coding Game (AI-Driven Evolution)

The game modifies and extends itself while running, using a combination of AI generation and evolutionary selection.

### 11.2.1 Server-Side AI Agents (Primary)

- Claude API agents run continuously on the server, generating:
  - New quest scripts
  - New creature behaviors and species
  - New biome configurations
  - New game mechanics as JS modules
  - Story events and lore expansions
- Generated code passes through an automated test suite before deployment
- Git-based pipeline: AI commits → CI tests → hot-deploy to live game
- Players experience a game that genuinely gains new features over time
- **Estimated cost**: ~$50-200/month in API calls (covered by economy revenue)

### 11.2.2 In-Browser LLM (Supplement)

- WebLLM runs small models on players' own GPUs
- Handles NPC dialogue, flavor text, local content variations
- Zero server cost
- Complements server-side generation, does not replace it

### 11.2.3 Evolutionary Selection

- Game mechanics defined as data (JSON DSL) where possible
- Player engagement metrics (time spent, retention, ratings) drive selection
- AI generates variants → evolutionary pressure keeps what players enjoy
- Parameters tuned automatically: gravity, resource density, creature aggression, weather patterns, quest difficulty

---

## 11.3 Self-Sustaining World (Runs Without Players)

### 11.3.1 Phase 1: Deterministic Catch-Up (Free)

- No persistent simulation needed initially
- When a player returns, the game computes what "would have happened" using deterministic simulation seeded by elapsed time
- Same experience from the player's perspective, zero server cost
- Works with GitHub Pages hosting
- **Limitation**: No inter-player effects while offline

### 11.3.2 Phase 2: Persistent Simulation Server (When Revenue Exists)

- Lightweight process runs the universe 24/7 on Oracle Cloud
- NPC civilizations grow, trade, war, build structures
- Ecology simulation: species populations rise/fall, resources regenerate/deplete
- Geological events: volcanoes, meteor impacts reshape terrain
- Economic simulation: market prices fluctuate, trade routes shift
- When players log in, they enter a world that has genuinely changed

---

## 11.4 Hosting Infrastructure

### 11.4.1 Oracle Cloud Always Free Tier

Oracle's Always Free tier is permanent (not a trial) and provides:

| Resource | Free Allocation |
|----------|----------------|
| ARM Ampere A1 | 4 cores, 24GB RAM (1 big VM or up to 4 small) |
| AMD instances | 2x micro (1GB RAM each) |
| Block storage | 200GB |
| Outbound bandwidth | 10TB/month |
| Object storage | 10GB |
| Autonomous Database | 2x instances (20GB each) |
| Load balancer | 1 flexible |

This is sufficient to run: game server, world simulation, economy backend, database, task queue, and compute job broker — all free, indefinitely.

### 11.4.2 GitHub Pages (Static Client)

- Game client (Three.js, HTML, CSS, JS) served from GitHub Pages
- Free, fast CDN, automatic HTTPS
- No bandwidth limits for static content

### 11.4.3 Full Hosting Layout

| Component | Host | Cost |
|-----------|------|------|
| Static game client | GitHub Pages | Free |
| Game server (Node.js) | Oracle ARM VM | Free |
| World simulation engine | Oracle ARM VM | Free |
| Economy service + task queue | Oracle ARM VM | Free |
| Compute job broker | Oracle ARM VM | Free |
| Database (player accounts, world state) | Oracle Autonomous DB | Free |
| AI-generated content cache | Oracle Object Storage | Free |
| AI content generation | Claude API | ~$50-200/month (from revenue) |

---

## 11.5 Revenue Model (Money Into the Pool)

No money comes from the developer's pocket. All revenue is generated organically.

### 11.5.1 Distributed AI Compute Network (Primary Revenue)

Players contribute GPU idle time to run AI inference jobs for paying businesses.

```
Player launches game
  → WebGPU detects GPU capability
  → While playing (or idle opt-in), GPU runs AI inference jobs
  → Jobs sourced from compute marketplaces (Akash, io.net, Render Network)
     or direct business clients
  → Revenue flows to pool → distributed to contributing players
```

**Why this works:**
- Businesses are desperate for GPU compute (AI boom)
- WebGPU is mature enough for real compute tasks
- Players already have GPUs loaded for the game
- The game itself uses some of this compute for its own AI features
- **Estimated revenue**: $0.10-0.50/GPU-hour depending on hardware. A player with an RTX 3070 playing 4 hours earns ~$0.40-2.00/day

### 11.5.2 Proof-of-Useful-Work Tasks

Players complete tasks that have real external value:
- AI training data labeling
- Content curation and quality assurance
- Bug testing of AI-generated game content
- Each verified task earns tokens backed by the work's real value

### 11.5.3 Cosmetic Sales

- Ship skins, trail effects, suit colors, custom planet markers
- Pure cosmetic, no pay-to-win
- Revenue goes to pool

### 11.5.4 Opt-In Attention Economy (Supplement)

- Rewarded ads between hyperspace jumps (opt-in only)
- Micro-surveys during ship autopilot (opt-in only)
- Revenue: ~$0.01-0.05 per interaction
- Always optional, never forced

### 11.5.5 API Licensing (Long-Term)

- Other games license the procedural generation engine
- CA engine, superformula, biome generation as a service
- Revenue stream grows as the engine matures

---

## 11.6 Player Task & Reward System

### 11.6.1 Task Types

| Task Type | Description | Reward Level |
|-----------|-------------|-------------|
| GPU Compute | Contribute idle GPU to AI inference network | Passive, per GPU-hour |
| Content Curation | Rate/vote on AI-generated creatures, quests, biomes | Per review |
| Bug Hunting | Find and report bugs in AI-generated content | Per verified report |
| Quest Design | Write quest scripts (natural language → AI converts to code) | Royalties from popularity |
| Code Contributions | Submit PRs that get merged | Proportional to impact |
| World Building | Place structures, design areas others visit | Per visitor |
| Exploration | First to discover a planet/species | Discoverer's fee from future visitors |
| Data Labeling | Label AI training data through in-game interfaces | Per task completed |

### 11.6.2 Revenue Distribution

```
REVENUE IN:                           REVENUE OUT:

Businesses pay for ──────→ ┌────────┐ ──→ GPU compute contributors (60%)
  GPU compute              │  POOL  │
                           │        │
Cosmetic sales ──────────→ │        │ ──→ Task completers (25%)
                           │        │
Opt-in ad revenue ───────→ │        │ ──→ Development fund (10%)
                           │        │
API licensing ───────────→ │        │ ──→ Infrastructure costs (5%)
                           └────────┘     (API calls, domain, etc.)
Token market activity ──→    ↑
                             │
                    Smart contract
                    handles distribution
                    automatically
```

---

## 11.7 Blockchain & Token Strategy

### 11.7.1 Decision: Use Existing L2, Don't Build Custom Chain

Building a custom blockchain is not viable:
- 2-5 years development, team of 10+ engineers
- Security audit costs $100K+
- Securities law compliance across jurisdictions
- No adoption — players won't install a wallet for an unknown chain

### 11.7.2 Recommended Chains

| Chain | Pros | Best For |
|-------|------|----------|
| **Base** (Coinbase L2) | Easy fiat on/off ramp via Coinbase, low fees | Players who want easy cash-out |
| **Solana** | Fastest, cheapest micro-transactions | High-frequency small rewards |
| **Polygon** | Most mature game ecosystem, many tools | If partnering with other games |
| **ImmutableX** | Built for game economies, zero gas for players | If item trading becomes core |

### 11.7.3 Token Design: $GALACTIC

- **Type**: ERC-20 (Base) or SPL (Solana)
- **Deployment cost**: ~$10 in gas fees
- **Supply**: Fixed or deflationary (burned on cosmetic purchases)
- **Earning**: Mined through useful work (GPU compute, tasks, play)
- **Spending**: Cosmetics, marketplace trades, premium content access
- **Cash-out**: Swap on DEX, or direct fiat via Coinbase (if Base)

### 11.7.4 Smart Contracts Needed

1. **$GALACTIC Token Contract** — ERC-20/SPL with mint authority for reward distribution
2. **Reward Distributor** — Calculates and distributes rewards based on verified contributions
3. **Marketplace** — Player-to-player trading of in-game items/cosmetics
4. **Staking** (optional) — Players stake tokens to earn passive yield from compute revenue

### 11.7.5 Wallet Integration

- Players can optionally connect a wallet (MetaMask, Coinbase Wallet, Phantom)
- In-game balance works without a wallet (custodial, stored in DB)
- Wallet connection only needed for withdrawal/on-chain trading
- Never force players to have a wallet to play

---

## 11.8 Full System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   ORACLE CLOUD (FREE TIER)                │
│                                                          │
│  ARM VM (4 cores, 24GB RAM)                              │
│  ├── Game Server (Node.js)                               │
│  ├── World Simulation Engine (runs 24/7)                 │
│  ├── AI Content Generator (calls Claude API)             │
│  ├── Task Queue + Reward Calculator                      │
│  ├── Compute Job Broker                                  │
│  │   (matches GPU inference jobs to player devices)      │
│  └── Economy Service                                     │
│                                                          │
│  Autonomous DB (free)                                    │
│  ├── Player accounts + balances                          │
│  ├── World state                                         │
│  ├── Task registry + completion logs                     │
│  └── Compute contribution logs                           │
│                                                          │
│  Object Storage (free)                                   │
│  └── AI-generated content cache                          │
├──────────────────────────────────────────────────────────┤
│                  GITHUB PAGES (FREE)                     │
│  └── Static game client (Three.js + WebGPU)              │
├──────────────────────────────────────────────────────────┤
│              PLAYER'S BROWSER                            │
│  ├── Game (WebGL/WebGPU rendering)                       │
│  ├── WebGPU Compute Worker                               │
│  │   └── Runs AI inference jobs when opted-in            │
│  ├── WebLLM (local NPC dialogue, zero server cost)       │
│  └── Wallet connection (optional, for token withdrawal)  │
├──────────────────────────────────────────────────────────┤
│              BLOCKCHAIN (Base or Solana L2)               │
│  ├── $GALACTIC token (ERC-20 / SPL)                      │
│  ├── Reward distribution smart contract                  │
│  └── Marketplace contract (player-to-player trading)     │
└──────────────────────────────────────────────────────────┘
```

---

## 11.9 Browser Crypto Mining (Considered, Low Priority)

- Monero (XMR) via RandomX in WASM is technically possible
- Revenue is very low: ~$0.01-0.05/day per player
- Ethical concerns (CoinHive was shut down partly due to abuse)
- Only viable as a tiny supplement, not primary income
- **Decision**: Deprioritize in favor of AI compute network, which earns 10-50x more

---

## 11.10 Build Order

| Phase | What | Depends On | Cost |
|-------|------|-----------|------|
| 1 | Oracle Cloud VM setup | Nothing | Free |
| 2 | Player accounts + auth + persistence | Phase 1 | Free |
| 3 | Simple task system with in-game currency | Phase 2 | Free |
| 4 | WebGPU compute worker (revenue engine) | Phase 2 | Free |
| 5 | World simulation (24/7 living world) | Phase 1 | Free |
| 6 | AI content generation pipeline | Phase 1 + Claude API | ~$50/month |
| 7 | $GALACTIC token deployment | Phase 3 working | ~$10 one-time |
| 8 | Smart contracts for automated rewards | Phase 4 + Phase 7 | ~$50 one-time |
| 9 | Marketplace + player trading | Phase 7 | ~$20 one-time |
| 10 | Cosmetic store | Phase 2 | Free |

---

## 11.11 Key Principles

1. **Zero cost to developer** — All infrastructure on free tiers, all revenue from organic sources
2. **Players earn, never pay to win** — Real rewards for real contributions
3. **Opt-in everything** — GPU compute, ads, wallet connection are always optional
4. **Game first, economy second** — The game must be fun without any economic participation
5. **Progressive decentralization** — Start centralized (DB balances), add blockchain when scale justifies it
6. **Self-sustaining loop** — Players play → GPU computes → revenue generated → players rewarded → more players attracted

---

## 11.12 Cross-References

- [00 Master Index](./00-MASTER-INDEX.md)
- [03 Game Mechanics](./03-GAME-MECHANICS-AND-QUEST-SYSTEM.md) — Task system integration
- [04 AI Integration](./04-AI-INTEGRATION-GEMINI-API.md) — AI content generation pipeline
- [05 Multiplayer](./05-MULTIPLAYER-AND-NETWORKING.md) — Player accounts, networking
- [08 Database](./08-DATABASE-AND-PLAYER-STATE.md) — Player state persistence
- [10 Development Phases](./10-DEVELOPMENT-PHASES-AND-ROADMAP.md) — Build order integration
