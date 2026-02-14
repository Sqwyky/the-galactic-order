/**
 * THE GALACTIC ORDER - Mining System (Molecular Deconstructor)
 *
 * The player's Multi-tool: a frequency-tuned beam that deconstructs
 * matter into raw elemental data. Inspired by No Man's Sky's Mining Beam.
 *
 * How it works:
 * 1. Player holds left-click while on foot (pointer locked)
 * 2. Raycast from camera center hits rocks/flora
 * 3. Beam visual connects player to target
 * 4. Target loses "integrity" over time
 * 5. When integrity hits 0, the mesh "glitches" into CA-pattern
 *    particles showing the "source code" of the matter
 * 6. ResourceCrystals fly out toward the player (magnetism)
 *
 * The beam frequency is derived from the planet's harmonic resonance.
 * If the beam frequency matches the element's resonance, mining is
 * faster and generates less heat. If mistuned, the tool overheats.
 */

import * as THREE from 'three';
import { hashSeed } from '../generation/hashSeed.js';
import { ELEMENTS, determineDrops, calculateMiningEfficiency } from '../generation/HarmonicElements.js';

// ============================================================
// CONFIGURATION
// ============================================================

const MINING_CONFIG = {
    range: 12,                // meters — mining reach
    beamColor: 0x00ffcc,      // Teal beam (matches ship laser aesthetic)
    beamWidth: 0.02,
    damagePerSecond: 35,      // Base integrity drain per second
    heatPerSecond: 15,        // Base heat generation per second
    maxHeat: 100,
    heatCoolRate: 25,         // Heat decay per second when not firing
    overheatCooldown: 2.0,    // Seconds locked out after overheat

    // Deconstruction particle effect
    particleCount: 40,
    particleDuration: 1.5,    // seconds
    particleSpeed: 3,
    particleSize: 0.15,

    // Rock/flora integrity
    rockIntegrity: 100,
    floraIntegrity: 60,

    // Performance limits
    maxParticleSystems: 3,    // Max concurrent deconstruction effects
    maxCrystals: 8,           // Max concurrent resource crystals

    // Beam energy particles traveling along beam
    beamParticleCount: 3,     // Bright dots traveling along beam

    // Crystal trail
    crystalTrailEnabled: true,
    crystalTrailCount: 6,     // Tiny particles trailing behind crystal
};

// ============================================================
// MINEABLE TARGET TRACKER
// ============================================================

/**
 * Wraps a rock/flora InstancedMesh instance as a mineable target.
 * Tracks per-instance integrity so individual rocks/plants can be mined.
 */
class MineableTarget {
    /**
     * @param {THREE.InstancedMesh} mesh - The InstancedMesh this instance belongs to
     * @param {number} instanceId - Index within the InstancedMesh
     * @param {'rock'|'flora'} type - What kind of object
     * @param {number} integrity - Starting health
     * @param {number} biomeId - Biome where this object lives
     * @param {THREE.Vector3} position - World position of this instance
     */
    constructor(mesh, instanceId, type, integrity, biomeId, position) {
        this.mesh = mesh;
        this.instanceId = instanceId;
        this.type = type;
        this.maxIntegrity = integrity;
        this.integrity = integrity;
        this.biomeId = biomeId;
        this.position = position.clone();
        this.isDead = false;
    }
}

// ============================================================
// MINING SYSTEM
// ============================================================

export class MiningSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     * @param {Object} options
     * @param {number} options.planetRule - CA rule number
     * @param {number} options.planetSeed - Planet seed
     * @param {number} options.planetFrequency - Planet's resonant frequency (Hz)
     * @param {import('../ui/InventoryManager.js').InventoryManager} options.inventory
     * @param {Function} options.onResourceCollected - Callback(element, quantity, bonus)
     */
    constructor(scene, camera, options = {}) {
        this.scene = scene;
        this.camera = camera;
        this.config = { ...MINING_CONFIG };

        this.planetRule = options.planetRule || 30;
        this.planetSeed = options.planetSeed || 42;
        this.planetFrequency = options.planetFrequency || 7.83;
        this.inventory = options.inventory || null;
        this.onResourceCollected = options.onResourceCollected || null;

        // Tool state
        this.enabled = false;
        this.isFiring = false;
        this.heat = 0;
        this.isOverheated = false;
        this.overheatTimer = 0;

        // Current target
        this.currentTarget = null;

        // Mining beam visual — outer dashed line + inner bright line (reused each frame)
        this._beamOuterLine = null;
        this._beamInnerLine = null;
        this._beamOuterMat = new THREE.LineDashedMaterial({
            color: this.config.beamColor,
            transparent: true,
            opacity: 0.6,
            dashSize: 0.3,
            gapSize: 0.1,
            linewidth: 1,
        });
        this._beamInnerMat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            linewidth: 1,
        });
        // Pooled geometry for beam lines (reused every frame, 2 points each)
        this._beamOuterGeo = new THREE.BufferGeometry();
        this._beamOuterGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        this._beamInnerGeo = new THREE.BufferGeometry();
        this._beamInnerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));

        // Energy particles traveling along beam (pooled)
        this._beamParticles = null;
        this._beamParticleGeo = null;
        this._beamParticleMat = null;
        this._beamParticlePhases = []; // 0..1 progress along beam per particle
        this._initBeamParticles();

        // Legacy reference kept for _hideBeam compatibility
        this._beamMesh = null;

        // Hit point light (glows at impact point)
        this._hitLight = new THREE.PointLight(this.config.beamColor, 0, 5);
        this.scene.add(this._hitLight);

        // Deconstruction particles
        this._particles = [];

        // Resource crystals (spawned on destruction)
        this._crystals = [];

        // Destruction flash light (pooled, reused)
        this._flashLight = new THREE.PointLight(0xffffff, 0, 10);
        this.scene.add(this._flashLight);
        this._flashTimer = 0;

        // Raycaster
        this._raycaster = new THREE.Raycaster();
        this._raycaster.far = this.config.range;
        this._screenCenter = new THREE.Vector2(0, 0);

        // Tracked mineable meshes (set externally)
        this._mineableMeshes = [];

        // Integrity tracking per instance (keyed by mesh.uuid + instanceId)
        this._integrityMap = new Map();

        // Input handlers
        this._mouseDown = false;
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
    }

    // ============================================================
    // ENABLE / DISABLE
    // ============================================================

    enable() {
        this.enabled = true;
        this.heat = 0;
        this.isOverheated = false;
        document.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mouseup', this._onMouseUp);
    }

    disable() {
        this.enabled = false;
        this._mouseDown = false;
        this.isFiring = false;
        this._hideBeam();
        document.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('mouseup', this._onMouseUp);
    }

    /**
     * Register mineable meshes (InstancedMesh arrays from RockScatter / AlienFlora).
     * @param {THREE.InstancedMesh[]} rockMeshes
     * @param {THREE.InstancedMesh[]} floraMeshes
     */
    setMineableMeshes(rockMeshes, floraMeshes) {
        this._mineableMeshes = [];

        for (const mesh of rockMeshes) {
            mesh.userData.mineType = 'rock';
            this._mineableMeshes.push(mesh);
        }
        for (const mesh of floraMeshes) {
            mesh.userData.mineType = 'flora';
            this._mineableMeshes.push(mesh);
        }
    }

    // ============================================================
    // BEAM PARTICLE POOL INIT
    // ============================================================

    _initBeamParticles() {
        const count = this.config.beamParticleCount;
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        this._beamParticleGeo = new THREE.BufferGeometry();
        this._beamParticleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this._beamParticleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        this._beamParticleMat = new THREE.PointsMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            size: 0.08,
            sizeAttenuation: true,
        });

        this._beamParticles = new THREE.Points(this._beamParticleGeo, this._beamParticleMat);
        this._beamParticles.frustumCulled = true;
        this._beamParticles.visible = false;
        this.scene.add(this._beamParticles);

        // Initialize phases spread evenly along beam
        this._beamParticlePhases = [];
        for (let i = 0; i < count; i++) {
            this._beamParticlePhases.push(i / count);
        }
    }

    // ============================================================
    // INPUT
    // ============================================================

    _onMouseDown(e) {
        if (e.button === 0 && document.pointerLockElement) {
            this._mouseDown = true;
        }
    }

    _onMouseUp(e) {
        if (e.button === 0) {
            this._mouseDown = false;
        }
    }

    // ============================================================
    // UPDATE (call every frame)
    // ============================================================

    update(dt) {
        if (!this.enabled) return;

        dt = Math.min(dt, 0.1);

        // Overheat cooldown
        if (this.isOverheated) {
            this.overheatTimer -= dt;
            if (this.overheatTimer <= 0) {
                this.isOverheated = false;
                this.heat = 0;
            }
            this._hideBeam();
            this._updateParticles(dt);
            this._updateCrystals(dt);
            return;
        }

        // Heat decay when not firing
        if (!this._mouseDown) {
            this.heat = Math.max(0, this.heat - this.config.heatCoolRate * dt);
            this.isFiring = false;
            this._hideBeam();
            this._updateParticles(dt);
            this._updateCrystals(dt);
            return;
        }

        // Firing — raycast from screen center
        this._raycaster.setFromCamera(this._screenCenter, this.camera);
        const intersects = this._raycaster.intersectObjects(this._mineableMeshes, false);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const mesh = hit.object;
            const instanceId = hit.instanceId;

            if (instanceId !== undefined && mesh.userData.mineType) {
                this.isFiring = true;
                this._processHit(hit, mesh, instanceId, dt);
            } else {
                this.isFiring = false;
                this._hideBeam();
            }
        } else {
            this.isFiring = false;
            this._hideBeam();
        }

        // Update particles and crystals
        this._updateParticles(dt);
        this._updateCrystals(dt);
    }

    // ============================================================
    // HIT PROCESSING
    // ============================================================

    _processHit(hit, mesh, instanceId, dt) {
        const key = `${mesh.uuid}:${instanceId}`;
        const type = mesh.userData.mineType;

        // Get or create integrity tracker
        if (!this._integrityMap.has(key)) {
            const maxHP = type === 'rock' ? this.config.rockIntegrity : this.config.floraIntegrity;

            // Extract world position of this instance
            const matrix = new THREE.Matrix4();
            mesh.getMatrixAt(instanceId, matrix);
            const position = new THREE.Vector3();
            position.setFromMatrixPosition(matrix);

            // Determine biome from position (approximate — use hash)
            const biomeId = hashSeed(Math.floor(position.x), Math.floor(position.z), 'biome') % 12;

            this._integrityMap.set(key, new MineableTarget(
                mesh, instanceId, type, maxHP, biomeId, position
            ));
        }

        const target = this._integrityMap.get(key);
        if (target.isDead) {
            this._hideBeam();
            return;
        }

        // Calculate mining efficiency based on frequency tuning
        const drops = determineDrops(type, target.biomeId, hashSeed(key), this.planetRule);
        const efficiency = calculateMiningEfficiency(this.planetFrequency, drops.element);

        // Apply damage
        const damage = this.config.damagePerSecond * efficiency.efficiency * dt;
        target.integrity -= damage;

        // Apply heat
        this.heat += this.config.heatPerSecond * efficiency.heatRate * dt;
        if (this.heat >= this.config.maxHeat) {
            this.isOverheated = true;
            this.overheatTimer = this.config.overheatCooldown;
            this._hideBeam();
            return;
        }

        // Show beam
        this._showBeam(hit.point);

        // Check if destroyed
        if (target.integrity <= 0) {
            target.isDead = true;
            this._destroyTarget(target, drops);
        }
    }

    // ============================================================
    // DESTRUCTION — CA Particle Deconstruction Effect
    // ============================================================

    _destroyTarget(target, drops) {
        // 1. Hide the instance (scale to zero)
        const matrix = new THREE.Matrix4();
        matrix.makeScale(0, 0, 0);
        target.mesh.setMatrixAt(target.instanceId, matrix);
        target.mesh.instanceMatrix.needsUpdate = true;

        // 2. Spawn deconstruction particles (CA glitch effect)
        this._spawnDeconstructionParticles(target.position, drops.element);

        // 3. Spawn resource crystal
        this._spawnResourceCrystal(target.position, drops);

        // 4. Add to inventory
        if (this.inventory) {
            const added = this.inventory.add(drops.element, drops.quantity);
            if (this.onResourceCollected) {
                this.onResourceCollected(drops.element, added, drops.bonus);
            }
        }

        // Hide beam
        this._hideBeam();
    }

    /**
     * CA-pattern deconstruction particles.
     * The object "glitches" into its source code — particles first form a
     * brief CA-grid pattern before dispersing. Mixed sizes: big "data blocks"
     * and tiny "dust" particles show the digital nature of matter.
     */
    _spawnDeconstructionParticles(position, elementId) {
        // Enforce max concurrent particle systems for performance
        while (this._particles.length >= this.config.maxParticleSystems) {
            // Fast-forward oldest system to cleanup
            const oldest = this._particles.shift();
            this.scene.remove(oldest.points);
            this.scene.remove(oldest.glow);
            oldest.geo.dispose();
            oldest.mat.dispose();
        }

        const element = ELEMENTS[elementId];
        const color = element ? new THREE.Color(element.color[0], element.color[1], element.color[2])
                              : new THREE.Color(0.5, 0.5, 0.5);

        const count = this.config.particleCount;
        const positions = new Float32Array(count * 3);
        const velocities = [];
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        // CA-grid layout: particles initially form a small 3D grid, then disperse
        const gridDim = Math.max(2, Math.ceil(Math.cbrt(count)));
        const gridSpacing = 0.3;

        for (let i = 0; i < count; i++) {
            // Initial CA-grid positions (will disperse after gridPhase)
            const gx = (i % gridDim) - gridDim / 2;
            const gy = (Math.floor(i / gridDim) % gridDim) - gridDim / 2;
            const gz = (Math.floor(i / (gridDim * gridDim)) % gridDim) - gridDim / 2;

            positions[i * 3]     = position.x + gx * gridSpacing;
            positions[i * 3 + 1] = position.y + gy * gridSpacing + 0.5;
            positions[i * 3 + 2] = position.z + gz * gridSpacing;

            // Velocity: upward + outward burst (applied after grid phase)
            const angle = Math.random() * Math.PI * 2;
            const upSpeed = 1 + Math.random() * this.config.particleSpeed;
            const outSpeed = Math.random() * this.config.particleSpeed * 0.7;
            velocities.push(new THREE.Vector3(
                Math.cos(angle) * outSpeed,
                upSpeed,
                Math.sin(angle) * outSpeed
            ));

            // CA-style binary coloring: alternate between element color and "code green"
            const isBit = Math.random() > 0.5;
            if (isBit) {
                colors[i * 3]     = 0.0;
                colors[i * 3 + 1] = 1.0;
                colors[i * 3 + 2] = 0.5; // Matrix green
            } else {
                colors[i * 3]     = color.r;
                colors[i * 3 + 1] = color.g;
                colors[i * 3 + 2] = color.b;
            }

            // Varied sizes: ~30% are big "data blocks", rest are tiny "dust"
            const isDataBlock = Math.random() < 0.3;
            sizes[i] = isDataBlock
                ? this.config.particleSize * (1.8 + Math.random() * 1.2)  // big
                : this.config.particleSize * (0.3 + Math.random() * 0.5); // tiny dust
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            size: this.config.particleSize,
            transparent: true,
            opacity: 1.0,
            vertexColors: true,
            sizeAttenuation: true,
        });

        const points = new THREE.Points(geo, mat);
        points.frustumCulled = true;
        this.scene.add(points);

        // Glow at destruction point
        const glow = new THREE.PointLight(
            new THREE.Color(element ? element.glowColor[0] : 0, element ? element.glowColor[1] : 1, element ? element.glowColor[2] : 0.5),
            3, 8
        );
        glow.position.copy(position);
        this.scene.add(glow);

        // Destruction flash — spike the shared flash light
        this._flashLight.position.copy(position);
        this._flashLight.intensity = 5;
        this._flashLight.color.set(0xffffff);
        this._flashTimer = 0.2; // decay over 0.2s

        this._particles.push({
            points,
            geo,
            mat,
            glow,
            velocities,
            baseSizes: sizes,     // Store per-particle sizes for scaling
            gridPhase: 0.15,      // Seconds particles hold CA-grid before dispersing
            lifetime: this.config.particleDuration,
            maxLifetime: this.config.particleDuration,
        });
    }

    _updateParticles(dt) {
        // Update destruction flash decay
        if (this._flashTimer > 0) {
            this._flashTimer -= dt;
            // Linear decay from 5 to 0 over 0.2s
            this._flashLight.intensity = Math.max(0, 5 * (this._flashTimer / 0.2));
        }

        for (let i = this._particles.length - 1; i >= 0; i--) {
            const p = this._particles[i];
            p.lifetime -= dt;

            const t = 1 - p.lifetime / p.maxLifetime;

            // Fade out
            p.mat.opacity = Math.max(0, 1 - t * t);

            // Scale per-particle sizes if available, otherwise uniform
            if (p.baseSizes) {
                const sizeScale = 1 + t * 2;
                p.mat.size = this.config.particleSize * sizeScale;
            } else {
                p.mat.size = this.config.particleSize * (1 + t * 2);
            }

            // Glow decay
            p.glow.intensity = 3 * (1 - t);

            // Grid phase: particles hold position briefly before dispersing
            const inGrid = p.gridPhase !== undefined && p.gridPhase > 0;
            if (inGrid) {
                p.gridPhase -= dt;
            }

            // Move particles (only after grid phase ends)
            const posArr = p.geo.getAttribute('position').array;
            if (!inGrid) {
                for (let j = 0; j < p.velocities.length; j++) {
                    posArr[j * 3]     += p.velocities[j].x * dt;
                    posArr[j * 3 + 1] += p.velocities[j].y * dt;
                    posArr[j * 3 + 2] += p.velocities[j].z * dt;

                    // Gravity + drag
                    p.velocities[j].y -= 4 * dt;
                    p.velocities[j].multiplyScalar(0.98);
                }
            }
            p.geo.getAttribute('position').needsUpdate = true;

            // CA flicker effect: randomly toggle particle colors (binary glitch)
            if (Math.random() < 0.1) {
                const colorArr = p.geo.getAttribute('color').array;
                const ri = Math.floor(Math.random() * p.velocities.length);
                // Toggle between green and dim
                colorArr[ri * 3 + 1] = colorArr[ri * 3 + 1] > 0.5 ? 0.2 : 1.0;
                p.geo.getAttribute('color').needsUpdate = true;
            }

            if (p.lifetime <= 0) {
                this.scene.remove(p.points);
                this.scene.remove(p.glow);
                p.geo.dispose();
                p.mat.dispose();
                this._particles.splice(i, 1);
            }
        }
    }

    // ============================================================
    // RESOURCE CRYSTALS (Magnetism Pickup)
    // ============================================================

    _spawnResourceCrystal(position, drops) {
        const element = ELEMENTS[drops.element];
        if (!element) return;

        // Enforce max concurrent crystals for performance
        while (this._crystals.length >= this.config.maxCrystals) {
            // Remove oldest crystal immediately
            const oldest = this._crystals.shift();
            this.scene.remove(oldest.mesh);
            oldest.geo.dispose();
            oldest.mat.dispose();
            if (oldest.trail) {
                this.scene.remove(oldest.trail);
                oldest.trailGeo.dispose();
                oldest.trailMat.dispose();
            }
        }

        const crystalColor = new THREE.Color(element.color[0], element.color[1], element.color[2]);
        const glowColor = new THREE.Color(element.glowColor[0], element.glowColor[1], element.glowColor[2]);

        // Crystal mesh — small rotating octahedron
        const geo = new THREE.OctahedronGeometry(0.2, 0);
        const mat = new THREE.MeshBasicMaterial({
            color: crystalColor,
            transparent: true,
            opacity: 0.9,
        });
        const crystal = new THREE.Mesh(geo, mat);
        crystal.position.copy(position);
        crystal.position.y += 0.5;

        // Glow
        const light = new THREE.PointLight(glowColor, 1.5, 4);
        crystal.add(light);

        this.scene.add(crystal);

        // Trail particles behind crystal (tiny points following its path)
        let trail = null;
        let trailGeo = null;
        let trailMat = null;
        if (this.config.crystalTrailEnabled) {
            const trailCount = this.config.crystalTrailCount;
            const trailPositions = new Float32Array(trailCount * 3);
            // Initialize all trail points at crystal position
            for (let i = 0; i < trailCount; i++) {
                trailPositions[i * 3]     = crystal.position.x;
                trailPositions[i * 3 + 1] = crystal.position.y;
                trailPositions[i * 3 + 2] = crystal.position.z;
            }
            trailGeo = new THREE.BufferGeometry();
            trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
            trailMat = new THREE.PointsMaterial({
                color: crystalColor,
                transparent: true,
                opacity: 0.5,
                size: 0.05,
                sizeAttenuation: true,
            });
            trail = new THREE.Points(trailGeo, trailMat);
            trail.frustumCulled = true;
            this.scene.add(trail);
        }

        this._crystals.push({
            mesh: crystal,
            geo,
            mat,
            light,
            trail,
            trailGeo,
            trailMat,
            trailIndex: 0,      // Ring buffer index for trail positions
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                2 + Math.random() * 2,
                (Math.random() - 0.5) * 2
            ),
            phase: 0,            // For bobbing
            wobblePhase: Math.random() * Math.PI * 2, // Unique wobble offset
            baseScale: 1.0,      // Starting scale
            magnetism: false,    // Starts with upward burst, then attracts
            burstTime: 0.5,      // Seconds before magnetism kicks in
            lifetime: 5.0,       // Despawn if not collected
            element: drops.element,
            quantity: drops.quantity,
            collected: false,
        });
    }

    _updateCrystals(dt) {
        const playerPos = this.camera.position;

        for (let i = this._crystals.length - 1; i >= 0; i--) {
            const c = this._crystals[i];
            c.lifetime -= dt;
            c.phase += dt * 3;
            c.wobblePhase += dt * 1.7;

            // Initial burst
            if (c.burstTime > 0) {
                c.burstTime -= dt;
                c.mesh.position.addScaledVector(c.velocity, dt);
                c.velocity.y -= 6 * dt; // Gravity
            } else {
                // Magnetism — fly toward player
                c.magnetism = true;
                const toPlayer = new THREE.Vector3().subVectors(playerPos, c.mesh.position);
                const dist = toPlayer.length();

                if (dist < 1.5) {
                    // Collected!
                    c.collected = true;
                } else if (dist < 8) {
                    // Attract toward player (stronger when closer)
                    const pullStrength = Math.max(3, 12 / dist);
                    toPlayer.normalize().multiplyScalar(pullStrength * dt);
                    c.mesh.position.add(toPlayer);

                    // Grow slightly as it approaches player (anticipation of collection)
                    const growFactor = 1.0 + (1.0 - dist / 8) * 0.6; // up to 1.6x at dist=0
                    c.mesh.scale.setScalar(c.baseScale * growFactor);
                }

                // Bob up and down
                c.mesh.position.y += Math.sin(c.phase) * 0.01;
            }

            // Rotate with slight wobble (organic feel)
            c.mesh.rotation.y += dt * 2;
            c.mesh.rotation.x += dt * 0.5 + Math.sin(c.wobblePhase) * 0.02;
            c.mesh.rotation.z = Math.sin(c.wobblePhase * 0.8) * 0.15; // Gentle tilt wobble

            // Glow pulse
            c.light.intensity = 1.0 + Math.sin(c.phase * 2) * 0.5;

            // Update trail particles (ring buffer — each frame record crystal pos)
            if (c.trail && c.trailGeo) {
                const tPos = c.trailGeo.getAttribute('position').array;
                const trailCount = this.config.crystalTrailCount;
                const idx = c.trailIndex % trailCount;
                tPos[idx * 3]     = c.mesh.position.x + (Math.random() - 0.5) * 0.05;
                tPos[idx * 3 + 1] = c.mesh.position.y + (Math.random() - 0.5) * 0.05;
                tPos[idx * 3 + 2] = c.mesh.position.z + (Math.random() - 0.5) * 0.05;
                c.trailIndex++;
                c.trailGeo.getAttribute('position').needsUpdate = true;
                // Fade trail slightly over crystal lifetime
                c.trailMat.opacity = Math.max(0.1, 0.5 * (c.lifetime / 5.0));
            }

            // Remove if collected or expired
            if (c.collected || c.lifetime <= 0) {
                this.scene.remove(c.mesh);
                c.geo.dispose();
                c.mat.dispose();
                if (c.trail) {
                    this.scene.remove(c.trail);
                    c.trailGeo.dispose();
                    c.trailMat.dispose();
                }
                this._crystals.splice(i, 1);
            }
        }
    }

    // ============================================================
    // BEAM VISUAL
    // ============================================================

    _showBeam(hitPoint) {
        // Beam start: slightly below and in front of camera (gun barrel position)
        const start = this.camera.position.clone();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        start.addScaledVector(forward, 0.5);
        start.addScaledVector(right, 0.2);
        start.y -= 0.15;

        const direction = new THREE.Vector3().subVectors(hitPoint, start);
        const length = direction.length();
        direction.normalize();

        // --- Outer dashed beam (scanning laser feel) ---
        // Slight random lateral offset for energy crackling
        const crackle = (Math.random() - 0.5) * 0.015;
        const up = new THREE.Vector3(0, 1, 0);
        const lateral = new THREE.Vector3().crossVectors(direction, up).normalize();

        const outerPosArr = this._beamOuterGeo.getAttribute('position').array;
        outerPosArr[0] = start.x + lateral.x * crackle;
        outerPosArr[1] = start.y + lateral.y * crackle;
        outerPosArr[2] = start.z + lateral.z * crackle;
        outerPosArr[3] = hitPoint.x + lateral.x * crackle * 0.5;
        outerPosArr[4] = hitPoint.y + lateral.y * crackle * 0.5;
        outerPosArr[5] = hitPoint.z + lateral.z * crackle * 0.5;
        this._beamOuterGeo.getAttribute('position').needsUpdate = true;
        this._beamOuterGeo.computeBoundingSphere();

        if (!this._beamOuterLine) {
            this._beamOuterLine = new THREE.Line(this._beamOuterGeo, this._beamOuterMat);
            this._beamOuterLine.computeLineDistances();
            this._beamOuterLine.frustumCulled = true;
            this.scene.add(this._beamOuterLine);
        }
        this._beamOuterLine.computeLineDistances();
        this._beamOuterLine.visible = true;
        this._beamOuterMat.opacity = 0.4 + Math.random() * 0.3;

        // --- Inner bright beam (thinner, brighter core) ---
        const innerPosArr = this._beamInnerGeo.getAttribute('position').array;
        innerPosArr[0] = start.x;
        innerPosArr[1] = start.y;
        innerPosArr[2] = start.z;
        innerPosArr[3] = hitPoint.x;
        innerPosArr[4] = hitPoint.y;
        innerPosArr[5] = hitPoint.z;
        this._beamInnerGeo.getAttribute('position').needsUpdate = true;
        this._beamInnerGeo.computeBoundingSphere();

        if (!this._beamInnerLine) {
            this._beamInnerLine = new THREE.Line(this._beamInnerGeo, this._beamInnerMat);
            this._beamInnerLine.frustumCulled = true;
            this.scene.add(this._beamInnerLine);
        }
        this._beamInnerLine.visible = true;
        this._beamInnerMat.opacity = 0.7 + Math.random() * 0.3;

        // --- Energy particles traveling along beam toward target ---
        if (this._beamParticles && this.config.beamParticleCount > 0) {
            const bpPosArr = this._beamParticleGeo.getAttribute('position').array;
            for (let i = 0; i < this._beamParticlePhases.length; i++) {
                // Advance phase toward target (speed ~1.5 full lengths per second)
                this._beamParticlePhases[i] += 0.025;
                if (this._beamParticlePhases[i] > 1.0) {
                    this._beamParticlePhases[i] -= 1.0;
                }
                const t = this._beamParticlePhases[i];
                bpPosArr[i * 3]     = start.x + direction.x * length * t;
                bpPosArr[i * 3 + 1] = start.y + direction.y * length * t;
                bpPosArr[i * 3 + 2] = start.z + direction.z * length * t;
            }
            this._beamParticleGeo.getAttribute('position').needsUpdate = true;
            this._beamParticleGeo.computeBoundingSphere();
            this._beamParticles.visible = true;
        }

        // Hit light at impact point
        this._hitLight.position.copy(hitPoint);
        this._hitLight.intensity = 2 + Math.random();
    }

    _hideBeam() {
        if (this._beamOuterLine) {
            this._beamOuterLine.visible = false;
        }
        if (this._beamInnerLine) {
            this._beamInnerLine.visible = false;
        }
        if (this._beamParticles) {
            this._beamParticles.visible = false;
        }
        // Legacy compat
        if (this._beamMesh) {
            this._beamMesh.visible = false;
        }
        this._hitLight.intensity = 0;
    }

    // ============================================================
    // QUALITY SETTINGS (from PerformanceManager)
    // ============================================================

    /**
     * Adjust visual quality based on performance settings.
     * Called by PerformanceManager when quality level changes.
     * @param {Object} settings - Performance settings
     * @param {number} [settings.miningParticleCount] - Particle count (default 40)
     * @param {boolean} [settings.miningBeamParticles] - Enable beam energy particles
     * @param {boolean} [settings.miningCrystalTrail] - Enable crystal trail particles
     * @param {number} [settings.miningMaxParticleSystems] - Max concurrent particle systems
     * @param {number} [settings.miningMaxCrystals] - Max concurrent crystals
     * @param {string} [settings.quality] - 'POTATO' | 'LOW' | 'MEDIUM' | 'HIGH'
     */
    setQuality(settings) {
        // settings from PerformanceManager
        // Adjust particleCount, crystal trail, beam complexity based on quality
        this.config.particleCount = settings.miningParticleCount || 40;
        this.config.maxParticleSystems = settings.miningMaxParticleSystems || 3;
        this.config.maxCrystals = settings.miningMaxCrystals || 8;

        // On POTATO: disable beam particles, reduce crystal effects
        if (settings.quality === 'POTATO') {
            this.config.beamParticleCount = 0;
            this.config.crystalTrailEnabled = false;
            this.config.particleCount = Math.min(this.config.particleCount, 15);
            this.config.maxParticleSystems = 1;
            this.config.maxCrystals = 4;
        } else if (settings.quality === 'LOW') {
            this.config.beamParticleCount = 1;
            this.config.crystalTrailEnabled = false;
            this.config.particleCount = Math.min(this.config.particleCount, 25);
            this.config.maxParticleSystems = 2;
            this.config.maxCrystals = 6;
        } else {
            // MEDIUM / HIGH — full effects
            if (settings.miningBeamParticles !== undefined) {
                this.config.beamParticleCount = settings.miningBeamParticles ? 3 : 0;
            }
            if (settings.miningCrystalTrail !== undefined) {
                this.config.crystalTrailEnabled = settings.miningCrystalTrail;
            }
        }

        // Rebuild beam particles pool with new count
        if (this._beamParticles) {
            this.scene.remove(this._beamParticles);
            this._beamParticleGeo.dispose();
            this._beamParticleMat.dispose();
        }
        this._initBeamParticles();
    }

    // ============================================================
    // HUD INFO
    // ============================================================

    getHUDInfo() {
        return {
            heat: this.heat,
            maxHeat: this.config.maxHeat,
            heatPct: this.heat / this.config.maxHeat,
            isOverheated: this.isOverheated,
            isFiring: this.isFiring,
            hasTarget: this.currentTarget !== null && !this.currentTarget.isDead,
        };
    }

    // ============================================================
    // CLEANUP
    // ============================================================

    dispose() {
        this.disable();

        // Clean up beam lines
        if (this._beamOuterLine) {
            this.scene.remove(this._beamOuterLine);
        }
        if (this._beamInnerLine) {
            this.scene.remove(this._beamInnerLine);
        }
        this._beamOuterGeo.dispose();
        this._beamInnerGeo.dispose();
        this._beamOuterMat.dispose();
        this._beamInnerMat.dispose();

        // Clean up beam energy particles
        if (this._beamParticles) {
            this.scene.remove(this._beamParticles);
            this._beamParticleGeo.dispose();
            this._beamParticleMat.dispose();
        }

        // Legacy beam mesh
        if (this._beamMesh) {
            this.scene.remove(this._beamMesh);
            this._beamMesh.geometry.dispose();
            this._beamMesh.material.dispose();
        }

        this.scene.remove(this._hitLight);
        this.scene.remove(this._flashLight);

        for (const p of this._particles) {
            this.scene.remove(p.points);
            this.scene.remove(p.glow);
            p.geo.dispose();
            p.mat.dispose();
        }

        for (const c of this._crystals) {
            this.scene.remove(c.mesh);
            c.geo.dispose();
            c.mat.dispose();
            if (c.trail) {
                this.scene.remove(c.trail);
                c.trailGeo.dispose();
                c.trailMat.dispose();
            }
        }
    }
}
