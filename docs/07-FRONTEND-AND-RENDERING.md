# Part 07: Frontend & Rendering (Three.js / WebGL)

## 1. Rendering Philosophy

We're not competing with No Man's Sky's graphics. We're making a browser game that looks **distinctive**, not photorealistic. The art style is "Geometric Cosmos" - low-poly meshes, sharp edges, glowing wireframes, and color palettes derived from the CA rules themselves.

The target: a player opens the game URL and thinks "this looks cool" within 3 seconds.

---

## 2. Technology Stack (Frontend)

| Component | Technology | Why |
|-----------|-----------|-----|
| 3D Engine | Three.js (r160+) | Industry standard for WebGL, huge ecosystem |
| Shaders | GLSL via Three.js ShaderMaterial | Custom planet/sky/atmosphere shaders |
| UI Overlay | HTML/CSS (not in WebGL) | Tablet, HUD, menus are DOM elements overlaying the canvas |
| Audio | Tone.js + Web Audio API | Procedural ambient music, spatial effects |
| Build Tool | Vite | Fast dev server, efficient bundling, native ES modules |
| Language | Vanilla JavaScript (ES2022) | No framework overhead, max performance |

### Why Not React/Vue/Svelte for UI?

The game HUD changes infrequently (stat bars update a few times per second, not 60fps). DOM manipulation via vanilla JS is faster than any reactive framework for this use case. We avoid the bundle size and overhead entirely.

---

## 3. Scene Architecture

```
THREE.Scene
├── SkyboxGroup
│   └── StarfieldMesh (particle system, 10,000 stars)
│
├── SpaceGroup (visible in space flight)
│   ├── StarMesh (central star, emissive shader)
│   ├── PlanetGroup[] (up to 8 planets in orbit)
│   │   ├── PlanetMesh (sphere LOD 0-1)
│   │   ├── AtmosphereMesh (transparent shell)
│   │   └── RingMesh (if planet has rings)
│   ├── StationMesh (space station)
│   └── OtherShipMesh[] (other players' ships)
│
├── PlanetSurfaceGroup (visible on planet surface)
│   ├── TerrainChunk[] (LOD 2-4 chunks around player)
│   ├── WaterPlaneMesh (if planet has water)
│   ├── FloraInstances[] (instanced meshes for trees/plants)
│   ├── CreatureMesh[] (animated entities)
│   ├── ResourceNodeMesh[] (mineable deposits)
│   ├── StructureMesh[] (ancient structures, bases)
│   └── OtherPlayerMesh[] (other players on surface)
│
├── ShipInteriorGroup (visible in ship)
│   ├── CockpitMesh
│   ├── TerminalScreenMesh (the Terminal)
│   └── DashboardMesh (ship HUD instruments)
│
├── LightingGroup
│   ├── DirectionalLight (star light)
│   ├── AmbientLight (fill light)
│   └── PointLight[] (player torch, structures)
│
└── Camera (PerspectiveCamera, attached to player)
```

---

## 4. Planet Rendering Pipeline

### 4.1 From Seed to Screen

```
PLAYER APPROACHES PLANET
         |
         v
GENERATE HEIGHTMAP (GPU - see Part 02)
  - Run CA rule in texture
  - Multi-pass density smoothing
  - Generate normal map
         |
         v
BUILD SPHERE MESH (CPU)
  - Cube-sphere projection
  - Apply heightmap displacement
  - Calculate per-vertex biome color
         |
         v
APPLY SHADERS (GPU)
  - Biome color blending
  - Atmosphere rim lighting
  - Distance fog
         |
         v
RENDER TO SCREEN
```

### 4.2 Planet Shader

The planet surface uses a single custom ShaderMaterial:

```glsl
// VERTEX SHADER (planet_surface.vert)
uniform sampler2D u_heightmap;
uniform sampler2D u_moisturemap;
uniform float u_maxElevation;
uniform float u_planetRadius;

varying vec3 v_worldPos;
varying vec3 v_normal;
varying float v_height;
varying float v_moisture;

void main() {
    vec2 uv = uv; // sphere UV from geometry
    float height = texture2D(u_heightmap, uv).r;
    float moisture = texture2D(u_moisturemap, uv).r;

    // Displace vertex along normal
    vec3 displaced = position + normal * height * u_maxElevation;

    v_worldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;
    v_normal = normalize(normalMatrix * normal);
    v_height = height;
    v_moisture = moisture;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
```

```glsl
// FRAGMENT SHADER (planet_surface.frag)
uniform vec3 u_sunDirection;
uniform vec3 u_biomeColors[9]; // 9 biome types, indexed by classification
uniform float u_time;

varying vec3 v_worldPos;
varying vec3 v_normal;
varying float v_height;
varying float v_moisture;

// Biome classification (matches Part 02 biome grid)
int getBiome(float height, float moisture) {
    int h = int(clamp(height * 3.0, 0.0, 2.0)); // 0=low, 1=mid, 2=high
    int m = int(clamp(moisture * 3.0, 0.0, 2.0));
    return h * 3 + m; // 0-8 index
}

void main() {
    int biome = getBiome(v_height, v_moisture);
    vec3 baseColor = u_biomeColors[biome];

    // Simple diffuse lighting
    float light = max(dot(v_normal, u_sunDirection), 0.0);
    float ambient = 0.15;
    vec3 lit = baseColor * (ambient + light * 0.85);

    // Height-based fog (low areas are hazier)
    float fogFactor = smoothstep(0.0, 0.3, v_height);
    vec3 fogColor = u_biomeColors[biome] * 0.3;
    lit = mix(fogColor, lit, fogFactor);

    gl_FragColor = vec4(lit, 1.0);
}
```

### 4.3 Atmosphere Shader

A transparent sphere slightly larger than the planet provides the atmosphere glow:

```glsl
// atmosphere.frag
uniform vec3 u_atmosphereColor;
uniform vec3 u_cameraPos;

varying vec3 v_worldPos;
varying vec3 v_normal;

void main() {
    vec3 viewDir = normalize(u_cameraPos - v_worldPos);
    float rim = 1.0 - max(dot(viewDir, v_normal), 0.0);
    rim = pow(rim, 3.0); // Sharpen the rim

    float alpha = rim * 0.6;
    gl_FragColor = vec4(u_atmosphereColor, alpha);
}
```

### 4.4 Biome Color Palettes Per Rule Class

```javascript
const BIOME_PALETTES = {
    // Class III rules (chaotic) - warm, organic
    chaotic: [
        '#1a3a2a', // Low/Dry   - dark basin
        '#4a7a5a', // Low/Mid   - coast
        '#1a4a6a', // Low/Wet   - ocean
        '#8a6a3a', // Mid/Dry   - desert
        '#5a8a4a', // Mid/Mid   - grassland
        '#2a5a2a', // Mid/Wet   - jungle
        '#aaaaaa', // High/Dry  - snow
        '#6a8a6a', // High/Mid  - alpine
        '#8a9aaa', // High/Wet  - cloud forest
    ],
    // Class II rules (regular) - cool, crystalline
    regular: [
        '#2a2a4a', '#4a6a8a', '#1a3a5a',
        '#5a5a7a', '#6a8aaa', '#3a5a7a',
        '#ccddef', '#8aaabb', '#aabbdd',
    ],
    // Class IV rules (complex) - green, alive
    complex: [
        '#1a2a1a', '#3a5a3a', '#0a3a4a',
        '#6a4a2a', '#4a7a3a', '#1a5a1a',
        '#bbbbbb', '#5a7a5a', '#7a9a8a',
    ],
    // Class I rules (dead) - gray, barren
    dead: [
        '#2a2a2a', '#3a3a3a', '#1a1a1a',
        '#4a4a4a', '#5a5a5a', '#3a3a3a',
        '#6a6a6a', '#5a5a5a', '#4a4a4a',
    ],
};
```

---

## 5. LOD (Level of Detail) System

### 5.1 Planet LOD Transitions

| LOD | Distance | Mesh | Visual |
|-----|----------|------|--------|
| 0 | > 100 km | 8x8 sphere (384 verts) | Colored dot with atmosphere halo |
| 1 | 20-100 km | 32x32 sphere (6K verts) | Visible continent shapes |
| 2 | 5-20 km | 64x64 sphere (24K verts) | Mountain ranges, biome colors |
| 3 | 0.5-5 km | 128x128 sphere, single mesh | Detailed terrain visible |
| 4 | < 0.5 km | Chunked terrain (256x256 per chunk) | Surface walking, full detail |

### 5.2 Terrain Chunking (LOD 4 - On Surface)

When the player is on the surface, only nearby terrain is loaded at full detail:

```
CHUNK GRID (player at center):

    [2] [2] [2] [2] [2]       LOD levels:
    [2] [3] [3] [3] [2]       [4] = full detail (256x256)
    [2] [3] [4] [3] [2]       [3] = medium (64x64)
    [2] [3] [3] [3] [2]       [2] = low (16x16)
    [2] [2] [2] [2] [2]

Each chunk = 500m x 500m
Player sees: ~2.5km in each direction at mixed LOD
Total vertex count: ~100K (within budget)
```

As the player moves, chunks are generated/destroyed. A pool of reusable `BufferGeometry` objects prevents garbage collection spikes.

### 5.3 Flora LOD

| Distance | Rendering |
|----------|-----------|
| < 100m | Full 3D L-system mesh |
| 100-300m | Billboard sprite (2D image facing camera) |
| 300-500m | Colored dots |
| > 500m | Not rendered |

Flora uses **instanced rendering** - one draw call for all instances of the same plant type. This is critical for performance when a jungle biome has thousands of trees.

---

## 6. Space Rendering

### 6.1 Starfield

A particle system with 10,000 points, rendered as `THREE.Points`:

```javascript
const starGeometry = new THREE.BufferGeometry();
const positions = new Float32Array(10000 * 3);
const colors = new Float32Array(10000 * 3);

for (let i = 0; i < 10000; i++) {
    // Uniform sphere distribution
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 5000; // Far enough to never clip

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    // Star color: mostly white, some blue/orange
    const temp = Math.random();
    colors[i * 3] = 0.8 + temp * 0.2;
    colors[i * 3 + 1] = 0.8 + (1 - temp) * 0.2;
    colors[i * 3 + 2] = 1.0;
}
```

### 6.2 Star (Sun)

The central star uses an emissive sphere with a glow effect (bloom post-processing):

```javascript
const starMaterial = new THREE.ShaderMaterial({
    uniforms: {
        u_time: { value: 0 },
        u_color: { value: new THREE.Color(starColor) }
    },
    vertexShader: `...`, // Simple pass-through
    fragmentShader: `
        uniform vec3 u_color;
        uniform float u_time;
        varying vec2 v_uv;
        void main() {
            float pulse = 0.9 + 0.1 * sin(u_time * 0.5);
            float center = 1.0 - length(v_uv - 0.5) * 2.0;
            center = pow(max(center, 0.0), 0.5);
            gl_FragColor = vec4(u_color * center * pulse, 1.0);
        }
    `
});
```

### 6.3 Ship Models

Ships are low-poly meshes (500-2000 triangles):

```
SHIP POLYGON BUDGETS:

  Starter Ship:  800 triangles
  Explorer:      1,200 triangles
  Fighter:       1,500 triangles
  Freighter:     3,000 triangles
  Other players: Same as their ship type
```

Ship models are loaded once and reused. In space, you rarely see more than 5 ships simultaneously.

---

## 7. UI System (DOM Overlay)

### 7.1 Architecture

The UI is NOT rendered in WebGL. It's standard HTML/CSS positioned absolutely over the Three.js canvas. This gives us:
- Full CSS styling (fonts, gradients, borders)
- Native text rendering (no bitmap fonts)
- Accessibility (screen readers can read the UI)
- Easy to update without touching the 3D pipeline

```html
<body>
    <canvas id="game-canvas"></canvas>  <!-- Three.js renders here -->

    <div id="hud">                      <!-- Always visible during gameplay -->
        <div id="health-bar"></div>
        <div id="oxygen-bar"></div>
        <div id="energy-bar"></div>
        <div id="hazard-bar"></div>
        <div id="compass"></div>
        <div id="crosshair"></div>
        <div id="quick-menu"></div>
    </div>

    <div id="tablet" class="hidden">   <!-- Toggled with TAB -->
        <div id="tablet-frame">
            <div id="tablet-nav">...</div>
            <div id="tablet-content">...</div>
        </div>
    </div>

    <div id="terminal" class="hidden">  <!-- Terminal puzzle screen -->
        <div id="terminal-screen">...</div>
    </div>

    <div id="menus" class="hidden">     <!-- Pause, settings, etc. -->
        ...
    </div>
</body>
```

### 7.2 HUD Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [HP ████████████]  [O2 ████████████]                    N   │
│  [EN ████████████]  [HZ ████████████]                  W + E │
│                                                          S   │
│                                                              │
│                                                              │
│                                                              │
│                                                              │
│                            +                                 │
│                        (crosshair)                           │
│                                                              │
│                                                              │
│                                                              │
│                                                              │
│                                                              │
│  [Quest: Mine 30 Ferrite]         [1][2][3][4] quick slots   │
│  [Ferrite: 12/30]                 [TAB] Tablet               │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 The Tablet UI

The Tablet is a 2D panel styled to look like a sci-fi data pad:

```css
#tablet {
    position: fixed;
    top: 5vh;
    left: 10vw;
    width: 80vw;
    height: 90vh;
    background: rgba(5, 10, 20, 0.95);
    border: 1px solid rgba(0, 180, 255, 0.3);
    border-radius: 12px;
    backdrop-filter: blur(10px);
    z-index: 100;
}

#tablet-nav {
    display: flex;
    gap: 0;
    border-bottom: 1px solid rgba(0, 180, 255, 0.2);
}

#tablet-nav button {
    background: transparent;
    color: rgba(0, 180, 255, 0.6);
    border: none;
    padding: 12px 20px;
    font-family: 'Courier New', monospace;
    cursor: pointer;
}

#tablet-nav button.active {
    color: #00ff41;
    border-bottom: 2px solid #00ff41;
}
```

Tablet tabs:
```
[MAP]  [STAR CHART]  [QUESTS]  [TERMINAL]  [BEING]  [CODEX]  [SETTINGS]
```

---

## 8. Post-Processing & Advanced Rendering

### 8.1 Effects Pipeline (Implemented)

The rendering pipeline has grown far beyond the original design. The current post-processing stack includes 15+ passes managed by Three.js EffectComposer:

| Pass | File | Description | Quality Tier |
|------|------|-------------|-------------|
| Auto Exposure | `AutoExposurePass.js` | Dynamic exposure adjustment based on scene luminance | HIGH+ |
| Cascade Shadows | `CascadeShadowManager.js` | Multi-cascade shadow maps for large distance ranges | MEDIUM+ |
| Screen-Space Reflections | `SSRPass.js` | Reflections on water and metallic surfaces | HIGH+ |
| Screen-Space GI | `SSGIPass.js` | Approximate global illumination from screen data | ULTRA |
| Temporal Anti-Aliasing | `TAAPass.js` | Sub-pixel jitter-based anti-aliasing with history buffer | HIGH+ |
| FXAA | `FXAAPass.js` | Fast approximate anti-aliasing (fallback for TAA) | LOW+ |
| Depth of Field | `DOFPass.js` | Bokeh blur based on focal distance | HIGH+ |
| Motion Blur | `MotionBlurPass.js` | Velocity-based per-pixel motion blur | HIGH+ |
| Contact Shadows | `ContactShadowPass.js` | Fine-detail contact shadows for small objects | ULTRA |
| Lens Flare | `LensFlarePass.js` | Star-based lens flares from bright light sources | MEDIUM+ |
| Lens Dirt | `LensDirtPass.js` | Lens dirt/grime overlay triggered by bright sources | MEDIUM+ |
| Volumetric Clouds | `VolumetricClouds.js` | 3D ray-marched cloud volumes | HIGH+ |
| Bloom | Three.js UnrealBloomPass | Glow on emissive surfaces, stars, atmosphere | LOW+ |
| Color Grading | Custom ShaderPass | Per-biome color palette adjustment | LOW+ |
| Film Grain | Custom ShaderPass | Subtle noise for cinematic feel | MEDIUM+ |

### 8.2 Advanced Materials & Shaders

| System | File | Description |
|--------|------|-------------|
| Triplanar Terrain | `TriplanarTerrainMaterial.js` | PBR terrain with 3-axis texture blending, parallax mapping, subsurface scattering |
| Sky Dome | `SkyDome.js` | NMS-style procedural sky with Rayleigh/Mie scattering and FBM clouds |
| Ocean Shader | `OceanShader.js` | Animated water with wave simulation, Fresnel, specular highlights, shore foam |
| Atmosphere | `AtmosphereShader.js` + `RayMarchedAtmosphere.js` | Dual atmosphere system: simple Fresnel rim + volumetric ray-marched scattering |
| Procedural Environment Map | `ProceduralEnvMap.js` | Dynamic skybox generation for reflections |
| Shared GLSL | `shaders/CommonGLSL.js` | Shared noise functions, utilities across all shaders |

### 8.3 Environmental Systems

| System | File | Description |
|--------|------|-------------|
| Weather | `WeatherSystem.js` | Dynamic weather with rain, snow, fog transitions |
| Wind | `WindField.js` | Wind simulation affecting grass, flora, particles |
| Atmospheric Particles | `AtmosphericParticles.js` | Dust, pollen, snow particles in atmosphere |

### 8.4 Performance Manager

`PerformanceManager.js` provides adaptive quality scaling across 5 tiers:

| Tier | Resolution | Post-FX | Shadows | Flora Distance |
|------|-----------|---------|---------|----------------|
| ULTRA | 1.0x | All passes enabled | Cascade (4 levels) | 500m |
| HIGH | 1.0x | Most passes | Cascade (3 levels) | 400m |
| MEDIUM | 0.85x | Core passes only | Single shadow map | 300m |
| LOW | 0.7x | Bloom + color grade only | Disabled | 150m |
| POTATO | 0.5x | None | Disabled | 50m |

`ResolutionScaler.js` handles dynamic resolution scaling (0.25x to 2.0x) by adjusting the renderer pixel ratio and draw buffer size without affecting CSS layout.

### 8.5 Terrain LOD (Quadtree System)

The original doc described a simple chunk grid. The actual implementation uses a **Pioneer Space Sim-inspired quadtree LOD** system:

- `TerrainChunk.js` (1069 lines) — hierarchical quadtree terrain node
- `QuadtreeNode.js` — tree structure with split/merge based on camera distance
- 5 LOD levels: Level 0 (512m chunks) down to Level 4 (32m chunks)
- Hysteresis-based split/merge to prevent LOD popping
- Max 250 active chunks
- Web Worker (`TerrainWorker.js`) for async terrain generation

---

## 9. Camera System

### 9.1 Camera Modes

| Mode | When | Behavior |
|------|------|----------|
| First Person | On foot (default) | Locked to player head, mouse look |
| Third Person | On foot (toggle) | Behind/above player, mouse orbits |
| Cockpit | In ship (default) | Inside cockpit, mouse steers |
| Orbit | In ship (zoomed out) | Camera orbits ship, shows surroundings |
| Cinematic | Photo mode (future) | Free-flying camera, time control |

### 9.2 Transition Between Modes

When entering/exiting the ship, the camera smoothly interpolates:

```javascript
function transitionCamera(from, to, duration) {
    const startPos = from.position.clone();
    const startRot = from.quaternion.clone();
    const endPos = to.position.clone();
    const endRot = to.quaternion.clone();

    let elapsed = 0;
    function animate(dt) {
        elapsed += dt;
        const t = Math.min(elapsed / duration, 1);
        const ease = t * t * (3 - 2 * t); // smoothstep

        camera.position.lerpVectors(startPos, endPos, ease);
        camera.quaternion.slerpQuaternions(startRot, endRot, ease);

        if (t < 1) requestAnimationFrame(() => animate(1/60));
    }
    animate(0);
}
```

---

## 10. Game Loop

```javascript
const clock = new THREE.Clock();

function gameLoop() {
    requestAnimationFrame(gameLoop);
    const dt = clock.getDelta();

    // 1. Input
    inputManager.update();

    // 2. Physics / movement
    playerController.update(dt);
    creatureManager.update(dt);

    // 3. World generation (async, non-blocking)
    worldGenerator.updateChunks(player.position);

    // 4. Network (send position, receive others)
    networkManager.update(dt);

    // 5. UI updates (only when dirty)
    hudManager.update(player);

    // 6. Render
    composer.render(dt);
}

gameLoop();
```

**Target**: 60fps on desktop, 30fps on laptop. The game loop runs at display refresh rate via `requestAnimationFrame`. Heavy work (terrain generation, flora placement) is done in Web Workers to avoid frame drops.

---

## 11. Web Workers (Background Threads)

### 11.1 Terrain Generation Worker

```javascript
// main thread
const terrainWorker = new Worker('workers/terrain.js');

terrainWorker.postMessage({
    type: 'generate',
    ruleNumber: 30,
    seed: 55109283,
    chunkX: 14,
    chunkZ: -7,
    lod: 4
});

terrainWorker.onmessage = (e) => {
    const { vertices, normals, colors, chunkX, chunkZ } = e.data;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    chunkManager.addChunk(chunkX, chunkZ, geometry);
};
```

### 11.2 Worker Pool

We run 2-4 terrain workers simultaneously (based on `navigator.hardwareConcurrency`). Chunk requests are queued and distributed round-robin.

---

## 12. Audio (Brief)

Audio is not the focus of MVP but the architecture supports it:

- **Ambient**: Procedural drone based on biome type (Tone.js oscillators)
- **SFX**: Mining laser, footsteps, ship engine, UI clicks (preloaded samples)
- **Spatial**: Other players' footsteps/ships use Web Audio API `PannerNode`
- **Music**: Generative ambient music - slow pads and arpeggios that shift with biome
- All audio is optional and off by default on mobile

---

## 13. What This Document Doesn't Cover

- **The exact geometry generation algorithm** -> Part 02 covers the math
- **Server-side rendering (none - everything is client-side)** -> Part 05
- **Mobile/touch controls** -> Future enhancement
- **Asset pipeline (model creation tools)** -> Part 09

---

## 14. Implementation Status

> **Last updated:** March 2026

### Implementation: ~95% — Exceeds Original Design

The rendering pipeline is the most developed part of the codebase, with 25+ rendering files totaling thousands of lines. The implementation significantly exceeds the original design document, which described only basic bloom, color grading, and vignette post-processing.

**Beyond the original design:**
- 15+ post-processing passes (original doc described 3)
- PBR triplanar terrain material with subsurface scattering
- Full weather and wind simulation
- Volumetric cloud rendering
- Dynamic resolution scaling with 5 quality tiers
- Quadtree LOD terrain (vs simple chunk grid in docs)
- Ray-marched atmosphere

**What's NOT built from this doc:**
- Audio system (Section 12) — no audio implementation exists
- Ship interior rendering (cockpit, terminal screen mesh)
- Photo mode / cinematic camera
- Mobile-specific optimizations (touch controls exist via `TouchControls.js`)

---

## Next Document: Part 08 - Database & Player State

How player data is stored, what the database schema looks like, authentication, save system, and how discoveries persist across all players.
