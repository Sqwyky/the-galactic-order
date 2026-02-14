# Part 02: Fractal Foundation & Procedural Generation

## The Central Question

How does this:
```
def apply_rule(rule_number, left, center, right):
    pattern = (left << 2) | (center << 1) | right
    return (rule_number >> pattern) & 1
```

...become a planet you can walk on?

This document answers that question in full mathematical detail.

---

## 1. The Foundation: What We Already Have

### 1.1 The Wolfram Elementary Cellular Automaton

From `rule30.py` and `run_rule.py`, we have a 1D cellular automaton engine:

- **Input**: A rule number (0-255), a row of cells (0 or 1), width, generations
- **Process**: Each cell's next state is determined by itself and its two neighbors (3-bit neighborhood = 8 possible patterns, rule number's bits encode the output for each pattern)
- **Output**: A 2D grid of 0s and 1s (width x generations)

```
Rule 30 in binary: 00011110

Neighborhood:  111  110  101  100  011  010  001  000
Output:          0    0    0    1    1    1    1    0
```

This gives us a WIDTH x GENERATIONS grid of bits. That grid IS our raw universe data.

### 1.2 What the Rules Produce (Classification)

Stephen Wolfram classified all 256 rules into 4 classes:

| Class | Behavior | Example Rules | Game Use |
|-------|----------|---------------|----------|
| I | Dies / uniform | 0, 8, 32, 128 | Dead worlds, void space, barren moons |
| II | Simple repeating | 4, 50, 108 | Crystal formations, regular terrain, ice worlds |
| III | Chaotic / random | 30, 45, 73, 105 | Complex terrain, organic worlds, dense atmospheres |
| IV | Complex / computational | 110, 54, 124 | Living worlds, dense ecosystems, "intelligent" biomes |

**Key insight**: The rule class determines the FEEL of a planet before any rendering happens.

---

## 2. Layer 1: From 1D Rule to 2D Heightmap

### 2.1 The Grid Generation

The first step is running a 1D CA for enough generations to fill a 2D grid.

```
Input:  Rule 30, Width = 256, Generations = 256, Seed = single center cell
Output: 256x256 grid of 0s and 1s
```

This grid is our **raw data layer**. But a grid of 0s and 1s is too sharp for terrain. We need to smooth it.

### 2.2 The Density Kernel (Smoothing)

For each cell (x, y) in the raw grid, compute a **local density** - the average value in a surrounding window:

```
density(x, y) = sum of all cells in a RADIUS around (x,y) / total cells in window

where RADIUS determines smoothness:
  RADIUS = 1  -> very sharp, rocky terrain
  RADIUS = 4  -> rolling hills
  RADIUS = 8  -> smooth plains
  RADIUS = 16 -> broad continental shapes
```

This gives us a float between 0.0 and 1.0 at each point. That float IS the height.

### 2.3 Multi-Scale Overlay (Octave Stacking)

One density pass at one scale produces bland terrain. Real terrain has detail at every scale - mountains AND boulders AND pebbles. We do what noise-based generators do: **stack multiple octaves**.

```
heightmap(x, y) =
    0.50 * density(x, y, RADIUS=16)   // Continental shapes (big features)
  + 0.25 * density(x, y, RADIUS=8)    // Mountain ranges
  + 0.12 * density(x, y, RADIUS=4)    // Hills and valleys
  + 0.06 * density(x, y, RADIUS=2)    // Rocky detail
  + 0.03 * density(x, y, RADIUS=1)    // Fine grain (boulders, cracks)
  + 0.04 * raw_cell(x, y)             // Raw CA output (sharp fractal detail)
```

The weights (0.50, 0.25, 0.12...) follow a roughly geometric falloff. Each octave adds finer detail at lower amplitude. The final raw CA value adds the characteristic "fractal fingerprint" of the specific rule.

### 2.4 The Result

A 256x256 (or larger) float array where each value is 0.0 to 1.0. This is our **heightmap**. It can be directly used as:
- Terrain elevation (multiply by max height)
- The source for biome classification
- UV data for texture blending

**Why this works**: The CA rule ensures that every planet generated from Rule 30 FEELS chaotic and organic, while every planet from Rule 90 FEELS fractal and crystalline. The rule's mathematical character survives the smoothing process.

---

## 3. Layer 2: From 2D Heightmap to Planet Sphere

### 3.1 Sphere Mapping

A flat heightmap needs to wrap around a sphere to become a planet. We use **cube-sphere projection**:

1. Start with a unit cube (6 faces)
2. Normalize each vertex to project it onto a unit sphere
3. Each face of the cube maps to a section of the heightmap
4. Apply height displacement along the normal at each vertex

```
For each vertex V on the cube-sphere:
  1. Convert V to spherical coordinates (longitude, latitude)
  2. Map (lon, lat) to heightmap UV coordinates (u, v)
  3. Sample heightmap at (u, v) to get height H
  4. Displace vertex: V_final = V_normalized * (planet_radius + H * max_elevation)
```

### 3.2 Face Layout

The 6 faces of the cube map to 6 regions of heightmap data. Each face can use a different CA generation pass (different starting row offset) to avoid visible seams:

```
HEIGHTMAP GENERATION PER FACE:

Face 0 (Front):   Rule N, seed offset 0,    generations 0-255
Face 1 (Back):    Rule N, seed offset 256,  generations 0-255
Face 2 (Left):    Rule N, seed offset 512,  generations 0-255
Face 3 (Right):   Rule N, seed offset 768,  generations 0-255
Face 4 (Top):     Rule N, seed offset 1024, generations 0-255
Face 5 (Bottom):  Rule N, seed offset 1280, generations 0-255
```

"Seed offset" means we run the CA for extra generations before recording, so each face starts from a different evolved state of the same rule. This ensures:
- All faces come from the SAME rule (visual consistency)
- No two faces are identical (no visible repetition)
- Seams can be blended at edges (adjacent faces share evolved state)

### 3.3 Level of Detail (LOD)

We don't need 256x256 heightmap resolution when viewing a planet from orbit. LOD levels:

| LOD | Vertex Grid Per Face | Total Vertices | When Used |
|-----|---------------------|----------------|-----------|
| 0 | 8x8 | ~384 | Far orbit (tiny dot) |
| 1 | 32x32 | ~6,144 | Near orbit (can see terrain shapes) |
| 2 | 64x64 | ~24,576 | Low orbit (mountains visible) |
| 3 | 128x128 | ~98,304 | Surface approach (detail visible) |
| 4 | 256x256 | ~393,216 | On surface (max detail, only loaded chunks) |

LOD 4 is only used for the **area around the player**. A chunking system loads/unloads terrain patches as the player moves.

---

## 4. Layer 3: Biome Classification

### 4.1 The Two-Axis System

Biome is determined by two values at each point:

1. **Elevation** (from the heightmap): 0.0 = ocean floor, 1.0 = mountain peak
2. **Moisture** (from a SECOND CA run with a different seed): 0.0 = desert dry, 1.0 = tropical wet

```
MOISTURE GENERATION:
  Run the SAME rule number but with a DIFFERENT initial seed.
  Same smoothing pipeline as elevation.
  This gives us a second 256x256 float grid.
```

### 4.2 The Biome Grid

```
                    MOISTURE
                Low         Mid         High
           +------------+------------+------------+
    High   |  Snow Peak | Alpine     | Cloud      |
ELEVATION  |            | Meadow     | Forest     |
           +------------+------------+------------+
    Mid    |  Desert    | Grassland  | Jungle     |
           |  Plateau   | / Savanna  | / Swamp    |
           +------------+------------+------------+
    Low    |  Dry Basin | Coast /    | Ocean /    |
           |  / Crater  | Beach      | Deep Sea   |
           +------------+------------+------------+
```

Each biome maps to:
- A **color palette** (shader uniforms)
- A **flora set** (which L-system trees/plants spawn)
- A **fauna set** (which creature types appear)
- A **resource distribution** (what you can mine here)
- An **atmosphere effect** (fog density, sky color)

### 4.3 Rule Character -> Planet Character

The rule's Wolfram class influences the biome distribution:

| Rule Class | Elevation Character | Moisture Character | Planet Feel |
|------------|--------------------|--------------------|-------------|
| Class I | Flat, dead | Uniform (all dry or all wet) | Barren moon, empty void |
| Class II | Regular ridges, repeating valleys | Striped moisture bands | Crystal world, ice planet |
| Class III | Chaotic mountains, deep canyons | Scattered, unpredictable | Organic, alive, Earth-like |
| Class IV | Complex structures, "architecture" | Patchy, complex borders | Ancient, mysterious, lore-rich |

---

## 5. Layer 4: Flora Generation (L-Systems)

### 5.1 What is an L-System?

An L-system (Lindenmayer system) generates branching structures from simple string-rewriting rules. Perfect for trees, plants, coral, alien growths.

```
EXAMPLE - Simple Tree:
  Axiom:   F
  Rules:   F -> F[+F]F[-F]F

  Where:
    F = draw forward
    + = turn right 25 degrees
    - = turn left 25 degrees
    [ = save position (push)
    ] = restore position (pop)

  Generation 0: F
  Generation 1: F[+F]F[-F]F
  Generation 2: F[+F]F[-F]F[+F[+F]F[-F]F]F[+F]F[-F]F[-F[+F]F[-F]F]F[+F]F[-F]F
```

Each generation adds branching. After 4-5 generations you get a realistic tree shape.

### 5.2 CA-Driven L-System Parameters

The cellular automaton rule determines the L-system parameters, so flora matches the planet's mathematical character:

```
FLORA PARAMETERS FROM CA:

  branch_angle    = 15 + (rule_density * 50)       // 15-65 degrees
  branch_ratio    = 0.5 + (rule_symmetry * 0.3)    // How much branches shrink
  iterations      = 3 + floor(rule_complexity * 4)  // 3-7 branching depth
  trunk_width     = based on biome (desert=thin, jungle=thick)
  leaf_density    = moisture value at plant location
  color_hue       = derived from rule number (rule % 360)

Where:
  rule_density    = average cell value across full CA grid (0.0 to 1.0)
  rule_symmetry   = correlation between left/right halves of CA pattern
  rule_complexity = entropy measurement of CA output
```

### 5.3 Flora Types Per Biome

| Biome | Flora Type | L-System Character |
|-------|-----------|-------------------|
| Jungle | Towering trees, dense canopy | Deep iteration (6-7), wide angles, thick |
| Desert | Cacti, sparse shrubs | Shallow iteration (2-3), narrow, spiky |
| Alpine | Pine-like conifers | Medium iteration (4-5), narrow angle, tall |
| Ocean Floor | Coral, kelp | Wide angles, undulating, short |
| Crystal | Geometric growths | Perfect symmetry, sharp angles, metallic |
| Void/Dead | Nothing or single spires | Iteration 1, bare sticks |

---

## 6. Layer 5: Star System Generation

### 6.1 The Galaxy Seed

Each of the 256 rule numbers defines a galaxy. A galaxy contains thousands of star systems. Each star system is generated by:

```
star_system_seed = hash(rule_number, system_x, system_y, system_z)
```

Where `(system_x, system_y, system_z)` is the star's position in the galaxy grid.

### 6.2 Star Properties

Derived deterministically from the seed:

```
STAR GENERATION:

  star_type = seed % 7
    0: Red Dwarf      (small, cool, common)
    1: Orange          (medium, warm)
    2: Yellow          (Sun-like)
    3: White           (hot, bright)
    4: Blue Giant      (massive, rare)
    5: Neutron Star    (tiny, extreme)
    6: Binary System   (two stars orbiting each other)

  star_luminosity = function(star_type, seed)
  star_color      = function(star_type)
  star_radius     = function(star_type, seed)
  habitable_zone  = function(star_luminosity)  // distance range for liquid water
```

### 6.3 Planet Count and Orbits

```
PLANET GENERATION:

  num_planets = 1 + (seed % 8)   // 1 to 8 planets

  For each planet i (0 to num_planets-1):
    orbit_radius   = habitable_zone * (0.3 + i * 0.4) + noise(seed, i)
    planet_size    = 0.3 + hash(seed, i, "size") * 2.7  // 0.3 to 3.0 Earth radii
    planet_rule    = rule_number  // Same rule as parent galaxy
    planet_seed    = hash(seed, i, "terrain")  // Unique terrain per planet
    has_atmosphere = orbit_radius within habitable_zone AND planet_size > 0.5
    has_water      = has_atmosphere AND hash(seed, i, "water") > 0.4
    has_rings      = hash(seed, i, "rings") > 0.85  // 15% chance
    has_moon       = hash(seed, i, "moon") > 0.5    // 50% chance
```

### 6.4 The Determinism Guarantee

**Critical for multiplayer**: Every function above is purely deterministic. Given the same `rule_number` and `system_x, system_y, system_z`, every player's client generates the EXACT same star system, planets, terrain, biomes, and flora placement. No server needs to store terrain data - it's all computed from the rule.

The only things stored server-side are:
- Player-created names for discoveries
- Player-placed structures
- Resource depletion state
- Quest progression

---

## 7. Layer 6: Creature Generation (Behavioral CA)

### 7.1 Creature Body Plan

Creatures are generated from a **2D cellular automaton** (not 1D). A small 2D CA grid (16x16) is run for a few generations, and the resulting pattern defines a body plan:

```
BODY PLAN FROM 2D CA:

  1. Run 2D CA (16x16 grid, rule derived from planet seed)
  2. The resulting pattern of 1s and 0s becomes a voxel blob
  3. Apply bilateral symmetry (mirror left half to right)
  4. Identify largest connected component = body
  5. Protrusions from body = limbs
  6. Topmost protrusion = head
  7. Smooth with marching cubes -> low-poly mesh
```

### 7.2 Creature Behavior (1D CA)

Each creature has a simple 1D CA running as its "brain":

```
BEHAVIOR CA:

  Input:  [is_hungry, sees_player, sees_predator, health_low, near_water, is_night]
  Rule:   Derived from creature seed (0-255)
  Output: [move_toward, flee, idle, eat, sleep, attack]

  Every game tick:
    - Read environment inputs
    - Apply CA rule to current behavior state
    - Execute output behavior
```

This means creature behavior is deterministic and unique per species, but produces complex emergent patterns. Some creatures will be docile, some aggressive, some will only attack at night - all from the same simple rule mechanism.

### 7.3 Creature Distribution

```
creatures_per_biome = floor(rule_complexity * biome_moisture * 10)

  Jungle biome + chaotic rule  = many creatures (up to 10 species)
  Desert biome + simple rule   = few creatures (0-2 species)
  Ocean biome                  = swimming variants
  Dead world                   = 0 creatures
```

---

## 8. Layer 7: Resource Distribution

### 8.1 Resource Types

| Resource | Found In | Use |
|----------|----------|-----|
| Carbon | Plants (all biomes) | Basic crafting, life support fuel |
| Ferrite | Rocks (all biomes) | Ship repair, building |
| Sodium | Yellow plants (desert/dry biomes) | Hazard protection |
| Cobalt | Caves | Advanced crafting |
| Chromatic | Rare mineral deposits | High-tech upgrades |
| Cipher Fragment | Quest locations only | Terminal code-breaking |

### 8.2 Placement Algorithm

Resources aren't random - they follow the CA pattern:

```
RESOURCE PLACEMENT:

  For each chunk of terrain (32x32 meters):
    1. Sample raw CA grid at this chunk's coordinates
    2. If raw_cell == 1 AND biome == appropriate:
       Place resource node at this location
    3. Resource TYPE determined by:
       - Elevation (high = rare minerals)
       - Biome type (jungle = carbon-rich)
       - Distance from spawn (further = rarer)
    4. Resource AMOUNT determined by:
       - Local CA density (denser pattern = richer deposit)
```

This creates a distribution where resources cluster in CA-characteristic patterns. On a Rule 30 planet, resource veins follow chaotic branching paths. On a Rule 90 planet, resources appear in fractal triangular formations.

---

## 9. The Seed Chain (Putting It All Together)

Here's the complete deterministic chain from a single number to a full planet:

```
UNIVERSE SEED: 42 (arbitrary starting number)
       |
       v
GALAXY RULE = hash(42, galaxy_index) % 256 = 30
       |
       v
STAR SYSTEM SEED = hash(30, x=14, y=7, z=22) = 98472361
       |
       v
STAR TYPE = 98472361 % 7 = 2 (Yellow star, Sun-like)
       |
       v
NUM PLANETS = 1 + (98472361 % 8) = 4
       |
       v
PLANET 2 SEED = hash(98472361, 2, "terrain") = 55109283
       |
       v
PLANET 2 RULE = 30 (inherited from galaxy)
       |
       v
TERRAIN HEIGHTMAP:
  Run Rule 30, width=256, 256 generations, initial seed from planet_seed
  Apply density smoothing at 6 octaves
  -> 256x256 float heightmap
       |
       v
MOISTURE MAP:
  Run Rule 30, width=256, 256 generations, DIFFERENT initial seed
  Apply same smoothing
  -> 256x256 float moisture map
       |
       v
BIOME MAP:
  Classify each point by (elevation, moisture) -> biome type
  -> 256x256 biome ID grid
       |
       v
FLORA PLACEMENT:
  For each biome region, generate L-system parameters from rule character
  Place trees/plants at CA-driven positions
       |
       v
CREATURE SPECIES:
  Generate N species from 2D CA body plans
  Assign behavior rules
       |
       v
RESOURCE DISTRIBUTION:
  Place resources following raw CA pattern
       |
       v
PLAYABLE PLANET
  Every player running this chain with seed 42
  sees the EXACT same planet.
```

---

## 10. JavaScript Port (From Python to Game Engine)

### 10.1 The Core CA Function

The Python version:
```python
def apply_rule(rule_number, left, center, right):
    pattern = (left << 2) | (center << 1) | right
    return (rule_number >> pattern) & 1
```

The JavaScript version (for the game engine):
```javascript
function applyRule(ruleNumber, left, center, right) {
    const pattern = (left << 2) | (center << 1) | right;
    return (ruleNumber >> pattern) & 1;
}
```

Identical logic. The bit manipulation works the same in both languages.

### 10.2 GPU Acceleration

For real-time planet generation, the CA + smoothing pipeline runs on the GPU via a WebGL compute shader (or a render-to-texture pass):

```
SHADER PIPELINE:

Pass 1: CA Generation (Fragment Shader)
  - Input: rule number (uniform), previous row (texture)
  - Output: next row (texture)
  - Run for N generations -> full CA grid in a texture

Pass 2: Density Smoothing (Fragment Shader)
  - Input: CA grid texture
  - For each pixel, sample surrounding area at multiple radii
  - Output: smoothed heightmap texture

Pass 3: Biome Classification (Fragment Shader)
  - Input: elevation texture, moisture texture
  - Output: biome ID texture (encoded as color channels)

Pass 4: Normal Map Generation (Fragment Shader)
  - Input: heightmap texture
  - Output: normal map for lighting

All 4 passes run on GPU.
Planet generates in < 100ms on mid-range hardware.
```

### 10.3 Deterministic Hash Function

We need a hash function that produces the same result in JavaScript as it would in any language, for multiplayer sync:

```javascript
// Simple deterministic hash (no external dependencies)
function hashSeed(...args) {
    let hash = 0x811c9dc5; // FNV offset basis
    for (const arg of args) {
        const str = String(arg);
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = (hash * 0x01000193) >>> 0; // FNV prime, unsigned 32-bit
        }
    }
    return hash;
}

// Usage:
const systemSeed = hashSeed(ruleNumber, systemX, systemY, systemZ);
const planetSeed = hashSeed(systemSeed, planetIndex, "terrain");
```

FNV-1a is fast, deterministic, has good distribution, and works identically across all platforms.

---

## 11. Performance Budget

### 11.1 Generation Times (Target)

| Operation | Target Time | Method |
|-----------|-------------|--------|
| Star system layout (positions, types) | < 1ms | CPU, simple hash math |
| Planet heightmap (256x256) | < 50ms | GPU shader passes |
| Planet biome map | < 10ms | GPU shader pass |
| Planet mesh (LOD 2, near orbit) | < 100ms | CPU, geometry builder |
| Planet mesh (LOD 4, surface detail) | < 200ms | CPU, chunked loading |
| Flora placement (visible area) | < 50ms | CPU, instanced rendering |
| Full planet from seed | < 500ms | Combined pipeline |

### 11.2 Memory Budget

| Data | Size | Notes |
|------|------|-------|
| CA grid (256x256) | 64 KB | Bit-packed or Uint8 |
| Heightmap texture (256x256 float) | 256 KB | Single channel float |
| Moisture texture | 256 KB | Single channel float |
| Biome map | 64 KB | Uint8 per cell |
| Planet mesh (LOD 2) | ~400 KB | Vertex + index buffers |
| Planet mesh (LOD 4 chunk) | ~100 KB | Per-chunk, loaded on demand |
| **Total per loaded planet** | **~1.2 MB** | Well within browser limits |

---

## 12. What This Document Doesn't Cover

- **How the 3D mesh is actually rendered** -> Part 07 (Rendering)
- **How the heightmap becomes walkable with collision** -> Part 07
- **What quests happen on these planets** -> Part 03 (Game Mechanics)
- **How two players see the same planet** -> Part 05 (Multiplayer)
- **The shader code itself** -> Part 07 (Rendering)

---

## 13. Summary

The entire procedural generation pipeline is:

1. **A rule number** (0-255) defines a galaxy's mathematical character
2. **Deterministic hashing** creates unique seeds for each star system and planet
3. **1D cellular automata** run from those seeds produce raw binary grids
4. **Multi-scale density smoothing** converts binary grids to smooth heightmaps
5. **Dual heightmaps** (elevation + moisture) classify biomes
6. **Cube-sphere projection** wraps flat maps onto 3D planets
7. **L-systems** grow flora with parameters derived from the CA rule character
8. **2D CA** generates creature body plans; **1D CA** drives their behavior
9. **Resources follow CA patterns**, creating rule-characteristic distributions
10. **Everything is deterministic** - same seed = same world, always

The universe of The Galactic Order isn't randomly generated. It's **grown from constraints**, exactly like the terminal patterns that started this project.

---

## Next Document: Part 03 - Game Mechanics & Quest System

How do players actually PLAY in this universe? What do they do, what do they collect, and how does the quest system lead them to the Terminal?
