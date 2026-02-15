/**
 * THE GALACTIC ORDER - Creature System (World Manager)
 *
 * Manages all alien creatures on a planet:
 * 1. Generates species from the planet's CA rule
 * 2. Spawns creature instances at deterministic positions
 * 3. Updates AI, animation, and terrain following each frame
 * 4. Handles creature lifecycle (spawn near player, despawn far away)
 *
 * Performance budget: ~20 active creatures, each is a small Three.js Group
 * with 3-8 meshes (body + head + legs + eyes). No instancing needed since
 * creatures need individual positions/animations.
 *
 * Spawning: Creatures spawn in a ring around the player (15-40m away)
 * and despawn when > 60m away. All positions are deterministic via hashSeed.
 */

import * as THREE from 'three';
import { hashSeed, seededRandom } from '../generation/hashSeed.js';
import { generatePlanetCreatures } from './CreatureGenerator.js';
import { CreatureAI } from './CreatureAI.js';

// ============================================================
// CONFIGURATION
// ============================================================

const CREATURE_CONFIG = {
    maxCreatures: 18,          // Max simultaneous creatures
    spawnRadius: 35,           // Spawn distance from player
    despawnRadius: 65,         // Remove creatures beyond this
    minSpawnDist: 15,          // Minimum spawn distance from player
    speciesCount: 3,           // Species per planet
    spawnCheckInterval: 2.0,   // Seconds between spawn attempts
    fleeDistance: 7,           // Player proximity → flee
    // Chance a creature is hostile, by mood band
    hostileChance: {
        delta: 0.0,   // Dreamlike — all peaceful
        theta: 0.05,  // Mysterious — rare hostiles
        alpha: 0.0,   // Calm — peaceful
        beta: 0.2,    // Energetic — some hostile
        gamma: 0.5,   // Intense — many hostile
    },
    biomeDensity: {            // Creatures per biome
        2: 0.1,   // Beach
        3: 0.2,   // Desert
        4: 0.6,   // Savanna
        5: 0.8,   // Grassland
        6: 0.5,   // Forest
        7: 0.3,   // Dense Forest
        8: 0.3,   // Swamp
        9: 0.1,   // Mountain
        10: 0.05, // Snow Peak
        11: 0.05, // Ice
    },
};

// ============================================================
// CREATURE INSTANCE
// ============================================================

class CreatureInstance {
    constructor(species, mesh, ai, seed) {
        this.species = species;
        this.mesh = mesh;       // THREE.Group (cloned from species template)
        this.ai = ai;           // CreatureAI instance
        this.seed = seed;
        this.groundY = 0;
        this.time = 0;
        this.alive = true;
    }
}

// ============================================================
// CREATURE SYSTEM
// ============================================================

export class CreatureSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {Object} options
     * @param {number} options.planetRule - CA rule (0-255)
     * @param {number} options.planetSeed - Planet seed
     * @param {Function} options.getHeightAt - (x, z) => y height
     * @param {Function} [options.getBiomeAt] - (x, z) => biomeId
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        this.planetRule = options.planetRule || 110;
        this.planetSeed = options.planetSeed || 42;
        this.getHeightAt = options.getHeightAt || (() => 0);
        this.getBiomeAt = options.getBiomeAt || (() => 5); // Default: grassland
        this.moodBand = options.moodBand || 'alpha';

        // Callback when a hostile creature attacks
        this.onCreatureAttack = options.onCreatureAttack || null;

        // Generate species templates for this planet
        this.speciesTemplates = generatePlanetCreatures(
            this.planetRule, this.planetSeed, CREATURE_CONFIG.speciesCount
        );

        // Active creature instances
        this.creatures = [];

        // Spawn tracking
        this._spawnTimer = 0;
        this._spawnCounter = 0; // Deterministic spawn seed counter

        // Pre-generate spawn grid seeds for determinism
        this._gridSeeds = new Map();
    }

    /**
     * Update all creatures every frame.
     * @param {number} dt - Delta time (seconds)
     * @param {THREE.Vector3} cameraPosition - Player/camera world position
     */
    update(dt, cameraPosition) {
        const playerX = cameraPosition.x;
        const playerZ = cameraPosition.z;

        // --- UPDATE EXISTING CREATURES ---
        for (let i = this.creatures.length - 1; i >= 0; i--) {
            const creature = this.creatures[i];
            if (!creature.alive) continue;

            creature.time += dt;

            // Update AI
            const aiState = creature.ai.update(dt, playerX, playerZ);

            // Check for attack damage
            if (aiState.didAttack && this.onCreatureAttack) {
                this.onCreatureAttack(aiState.attackDamage, creature.species.archetype?.name || 'creature');
            }

            // Get terrain height at new position
            const groundY = this.getHeightAt(aiState.x, aiState.z);
            if (groundY !== null && groundY !== undefined) {
                creature.groundY = groundY;
            }

            // Apply position
            const ap = creature.species.animParams;
            const bob = Math.sin(creature.time * ap.bobSpeed) * ap.bobAmount;
            const sway = Math.sin(creature.time * ap.swaySpeed) * ap.swayAmount;
            const floatY = ap.floatHeight;

            creature.mesh.position.set(
                aiState.x + sway,
                creature.groundY + ap.groundOffset + bob + floatY,
                aiState.z
            );
            creature.mesh.rotation.y = aiState.facing;

            // Animate legs (procedural walk cycle)
            if (creature.species.legs && creature.species.legs.length > 0) {
                const cycle = aiState.walkCycle;
                for (let j = 0; j < creature.species.legs.length; j++) {
                    const leg = creature.mesh.children[j + 2]; // Offset past body+head
                    if (!leg) continue;
                    const phase = (cycle + j / creature.species.legs.length) % 1.0;
                    const swing = Math.sin(phase * Math.PI * 2) * 0.3;
                    // Only animate if walking
                    if (aiState.state === 'wander' || aiState.state === 'flee') {
                        leg.rotation.x = swing;
                    } else {
                        leg.rotation.x *= 0.9; // Decay to standing
                    }
                }
            }

            // Head bob (grazing animation)
            const headMesh = creature.mesh.children[1]; // Second child is head
            if (headMesh && headMesh.isMesh) {
                headMesh.position.y += aiState.headBob;
            }

            // Despawn check
            const distSq = (playerX - aiState.x) ** 2 + (playerZ - aiState.z) ** 2;
            if (distSq > CREATURE_CONFIG.despawnRadius ** 2) {
                this._removeCreature(i);
            }
        }

        // --- SPAWN NEW CREATURES ---
        this._spawnTimer += dt;
        if (this._spawnTimer >= CREATURE_CONFIG.spawnCheckInterval) {
            this._spawnTimer = 0;
            this._trySpawnCreatures(playerX, playerZ);
        }
    }

    // ============================================================
    // SPAWNING
    // ============================================================

    _trySpawnCreatures(playerX, playerZ) {
        if (this.creatures.length >= CREATURE_CONFIG.maxCreatures) return;

        // Try to spawn 1-3 creatures per check
        const attempts = Math.min(3, CREATURE_CONFIG.maxCreatures - this.creatures.length);

        for (let a = 0; a < attempts; a++) {
            this._spawnCounter++;
            const seed = hashSeed(this.planetSeed, 'creature_spawn', this._spawnCounter);
            const rng = seededRandom(seed, this._spawnCounter, 'spawn');

            // Random position in spawn ring
            const angle = rng() * Math.PI * 2;
            const dist = CREATURE_CONFIG.minSpawnDist +
                rng() * (CREATURE_CONFIG.spawnRadius - CREATURE_CONFIG.minSpawnDist);
            const spawnX = playerX + Math.cos(angle) * dist;
            const spawnZ = playerZ + Math.sin(angle) * dist;

            // Check terrain height (skip if underwater)
            const groundY = this.getHeightAt(spawnX, spawnZ);
            if (groundY === null || groundY === undefined || groundY < 0.1) continue;

            // Check biome suitability
            const biomeId = this.getBiomeAt(spawnX, spawnZ);
            const density = CREATURE_CONFIG.biomeDensity[biomeId] || 0;
            if (rng() > density) continue;

            // Pick a species
            const speciesIdx = Math.floor(rng() * this.speciesTemplates.length);
            const species = this.speciesTemplates[speciesIdx];

            // Clone the mesh
            const mesh = this._cloneCreatureMesh(species.mesh);
            mesh.position.set(spawnX, groundY + species.animParams.groundOffset, spawnZ);
            mesh.rotation.y = rng() * Math.PI * 2;
            this.scene.add(mesh);

            // Determine hostility based on planet mood
            const hostileChance = CREATURE_CONFIG.hostileChance[this.moodBand] || 0;
            const isHostile = rng() < hostileChance;

            // Create AI
            const ai = new CreatureAI({
                moveSpeed: species.animParams.moveSpeed,
                turnSpeed: species.animParams.turnSpeed,
                fleeDistance: CREATURE_CONFIG.fleeDistance,
                fleeSpeed: 2.0,
                wanderRadius: 15 + rng() * 15,
                seed: seed,
                hostile: isHostile,
                attackDamage: isHostile ? 6 + Math.floor(rng() * 8) : 0,
                aggroRange: 15,
                attackRange: 3,
            });
            ai.setPosition(spawnX, spawnZ);

            // Hostile creatures get a red tint
            if (isHostile) {
                mesh.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.material = child.material.clone();
                        child.material.color.lerp(new THREE.Color(0.8, 0.15, 0.1), 0.35);
                        child.material.emissive = new THREE.Color(0.3, 0.02, 0.02);
                    }
                });
            }

            const instance = new CreatureInstance(species, mesh, ai, seed);
            instance.groundY = groundY;
            this.creatures.push(instance);
        }
    }

    _cloneCreatureMesh(templateGroup) {
        const clone = new THREE.Group();
        for (const child of templateGroup.children) {
            if (child.isMesh) {
                // Share geometry + material, just new transform
                const meshClone = new THREE.Mesh(child.geometry, child.material);
                meshClone.position.copy(child.position);
                meshClone.rotation.copy(child.rotation);
                meshClone.scale.copy(child.scale);
                meshClone.castShadow = child.castShadow;
                clone.add(meshClone);
            }
        }
        return clone;
    }

    _removeCreature(index) {
        const creature = this.creatures[index];
        creature.alive = false;
        this.scene.remove(creature.mesh);
        this.creatures.splice(index, 1);
    }

    // ============================================================
    // CLEANUP
    // ============================================================

    dispose() {
        for (const creature of this.creatures) {
            this.scene.remove(creature.mesh);
        }
        this.creatures = [];

        // Dispose species template geometries
        for (const species of this.speciesTemplates) {
            species.mesh.traverse(child => {
                if (child.isMesh) {
                    child.geometry.dispose();
                    child.material.dispose();
                }
            });
        }
        this.speciesTemplates = [];
    }

    /**
     * Get info for HUD/debug display.
     */
    getInfo() {
        return {
            activeCreatures: this.creatures.length,
            maxCreatures: CREATURE_CONFIG.maxCreatures,
            speciesCount: this.speciesTemplates.length,
            speciesNames: this.speciesTemplates.map(s => s.archetype.name),
        };
    }
}
