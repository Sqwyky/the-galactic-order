/**
 * THE GALACTIC ORDER - Creature AI (Behavior System)
 *
 * Simple finite-state behavior for alien creatures:
 *   IDLE     → Standing still, looking around, occasional body animation
 *   WANDER   → Slowly walking to a random nearby point
 *   FLEE     → Running away from the player (when too close)
 *   GRAZE    → Head dipping down (eating animation), then back to idle
 *
 * State transitions are probabilistic + proximity-driven.
 * All movement is smooth (lerped) for organic feel.
 *
 * Performance: Pure JS state machine, no physics engine.
 * ~20 creatures at 60fps is the target.
 */

import { hashSeed } from '../generation/hashSeed.js';

// ============================================================
// BEHAVIOR STATES
// ============================================================

export const CREATURE_STATE = {
    IDLE:    'idle',
    WANDER:  'wander',
    FLEE:    'flee',
    GRAZE:   'graze',
    CURIOUS: 'curious',  // Approaches player cautiously (Class 4)
    HUNT:    'hunt',      // Pursues smaller creatures (Class 3)
    HERD:    'herd',      // Moves toward nearest peer (Class 4)
};

// ============================================================
// WOLFRAM CLASS BEHAVIOR PROFILES
// ============================================================
// Maps CA Wolfram class to creature behavior weights and parameters

const CLASS_PROFILES = {
    1: { // Uniform — docile, slow, long idles
        idleWeight: 0.6, wanderWeight: 0.2, grazeWeight: 0.2, curiousWeight: 0,
        idleDurationMin: 3, idleDurationMax: 8,
        fleeMultiplier: 0.6,    // Barely reacts to player
        moveSpeedMult: 0.5,
        wanderRadiusMult: 0.5,
    },
    2: { // Periodic — territorial, predictable patrol, returns to spawn
        idleWeight: 0.3, wanderWeight: 0.5, grazeWeight: 0.2, curiousWeight: 0,
        idleDurationMin: 1, idleDurationMax: 3,
        fleeMultiplier: 1.0,
        moveSpeedMult: 1.0,
        wanderRadiusMult: 0.7,  // Stays closer to spawn
    },
    3: { // Chaotic — aggressive, erratic movement, fast flee
        idleWeight: 0.15, wanderWeight: 0.5, grazeWeight: 0.1, curiousWeight: 0.05,
        huntWeight: 0.2,        // Can hunt
        idleDurationMin: 0.5, idleDurationMax: 1.5,
        fleeMultiplier: 1.5,
        moveSpeedMult: 1.4,
        wanderRadiusMult: 1.5,  // Erratic, wanders far
    },
    4: { // Complex — curious about player, herding behavior
        idleWeight: 0.2, wanderWeight: 0.25, grazeWeight: 0.15, curiousWeight: 0.25,
        herdWeight: 0.15,
        idleDurationMin: 1, idleDurationMax: 4,
        fleeMultiplier: 1.2,
        moveSpeedMult: 1.0,
        wanderRadiusMult: 1.0,
    },
};

// ============================================================
// CREATURE AI CONTROLLER
// ============================================================

export class CreatureAI {
    /**
     * @param {Object} options
     * @param {number} options.moveSpeed - Base movement speed (world units/sec)
     * @param {number} options.turnSpeed - Rotation speed (radians/sec)
     * @param {number} options.fleeDistance - Distance at which creature flees player
     * @param {number} options.fleeSpeed - Speed multiplier when fleeing
     * @param {number} options.wanderRadius - Max wander distance from spawn
     * @param {number} options.seed - Per-creature seed for deterministic behavior
     */
    constructor(options = {}) {
        // Wolfram class determines behavior profile
        this.wolframClass = options.wolframClass || 2;
        this.profile = CLASS_PROFILES[this.wolframClass] || CLASS_PROFILES[2];

        this.moveSpeed = (options.moveSpeed || 2.0) * this.profile.moveSpeedMult;
        this.turnSpeed = options.turnSpeed || 2.0;
        this.fleeDistance = (options.fleeDistance || 8.0) * this.profile.fleeMultiplier;
        this.fleeSpeed = options.fleeSpeed || 2.5;
        this.wanderRadius = (options.wanderRadius || 20.0) * this.profile.wanderRadiusMult;

        // State
        this.state = CREATURE_STATE.IDLE;
        this.stateTimer = 0;
        this.stateDuration = 2.0;

        // Position / movement
        this.posX = 0;
        this.posZ = 0;
        this.targetX = 0;
        this.targetZ = 0;
        this.facing = 0;
        this.targetFacing = 0;
        this.spawnX = 0;
        this.spawnZ = 0;

        // Biome tracking
        this.spawnBiome = options.spawnBiome || null;
        this.getBiomeAt = options.getBiomeAt || null;

        // Animation state
        this.walkCycle = 0;
        this.headBob = 0;

        // Seeded RNG for deterministic behavior
        this._seed = options.seed || 0;
        this._rngCounter = 0;

        // Curious state tracking
        this._curiousApproachDist = 5 + (this._seed % 5); // How close to get
        this._curiousRetreatDist = 3;
    }

    _rng() {
        this._rngCounter++;
        const h = hashSeed(this._seed, this._rngCounter, 'ai');
        return (h & 0xFFFF) / 0x10000;
    }

    /**
     * Set initial spawn position.
     */
    setPosition(x, z) {
        this.posX = x;
        this.posZ = z;
        this.spawnX = x;
        this.spawnZ = z;
        this.targetX = x;
        this.targetZ = z;
        this.facing = this._rng() * Math.PI * 2;
    }

    /**
     * Update AI every frame.
     * @param {number} dt - Delta time (seconds)
     * @param {number} playerX - Player world X
     * @param {number} playerZ - Player world Z
     * @returns {{ x: number, z: number, facing: number, walkCycle: number, state: string }}
     */
    update(dt, playerX, playerZ) {
        // Distance to player
        const dx = playerX - this.posX;
        const dz = playerZ - this.posZ;
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);

        // State timer
        this.stateTimer += dt;

        // --- FLEE CHECK (highest priority) ---
        if (distToPlayer < this.fleeDistance && this.state !== CREATURE_STATE.FLEE) {
            this._enterFlee(playerX, playerZ);
        }

        // --- STATE MACHINE ---
        switch (this.state) {
            case CREATURE_STATE.IDLE:
                this._updateIdle(dt);
                break;
            case CREATURE_STATE.WANDER:
                this._updateWander(dt);
                break;
            case CREATURE_STATE.FLEE:
                this._updateFlee(dt, playerX, playerZ);
                break;
            case CREATURE_STATE.GRAZE:
                this._updateGraze(dt);
                break;
            case CREATURE_STATE.CURIOUS:
                this._updateCurious(dt, playerX, playerZ);
                break;
            case CREATURE_STATE.HERD:
                this._updateHerd(dt);
                break;
        }

        // Smooth rotation toward target facing
        let angleDiff = this.targetFacing - this.facing;
        // Normalize to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        this.facing += angleDiff * Math.min(1, this.turnSpeed * dt);

        return {
            x: this.posX,
            z: this.posZ,
            facing: this.facing,
            walkCycle: this.walkCycle,
            headBob: this.headBob,
            state: this.state,
        };
    }

    // ============================================================
    // STATE BEHAVIORS
    // ============================================================

    _updateIdle(dt) {
        this.walkCycle *= 0.9; // Decay walk cycle
        this.headBob = Math.sin(this.stateTimer * 0.5) * 0.02;

        if (this.stateTimer >= this.stateDuration) {
            // Transition based on Wolfram class profile weights
            const p = this.profile;
            const roll = this._rng();
            let cumulative = 0;

            cumulative += p.wanderWeight;
            if (roll < cumulative) {
                this._enterWander();
                return;
            }
            cumulative += p.grazeWeight;
            if (roll < cumulative) {
                this._enterGraze();
                return;
            }
            cumulative += p.curiousWeight || 0;
            if (roll < cumulative) {
                this._enterCurious();
                return;
            }
            cumulative += p.herdWeight || 0;
            if (roll < cumulative) {
                this._enterHerd();
                return;
            }
            // Remain idle
            this.stateTimer = 0;
            this.stateDuration = p.idleDurationMin + this._rng() * (p.idleDurationMax - p.idleDurationMin);
        }
    }

    _enterWander() {
        this.state = CREATURE_STATE.WANDER;
        this.stateTimer = 0;
        this.stateDuration = 3.0 + this._rng() * 5.0;

        // Pick random target within wander radius of spawn
        // Try up to 3 times to stay in spawn biome
        let bestX = this.spawnX;
        let bestZ = this.spawnZ;
        for (let attempt = 0; attempt < 3; attempt++) {
            const angle = this._rng() * Math.PI * 2;
            const dist = this._rng() * this.wanderRadius;
            const tx = this.spawnX + Math.cos(angle) * dist;
            const tz = this.spawnZ + Math.sin(angle) * dist;

            // If we have biome tracking, prefer staying in spawn biome
            if (this.getBiomeAt && this.spawnBiome !== null) {
                const targetBiome = this.getBiomeAt(tx, tz);
                if (targetBiome === this.spawnBiome) {
                    bestX = tx;
                    bestZ = tz;
                    break;
                }
            } else {
                bestX = tx;
                bestZ = tz;
                break;
            }
            // Keep trying, use last attempt as fallback
            bestX = tx;
            bestZ = tz;
        }

        this.targetX = bestX;
        this.targetZ = bestZ;

        // Face toward target
        this.targetFacing = Math.atan2(
            this.targetX - this.posX,
            this.targetZ - this.posZ
        );
    }

    _updateWander(dt) {
        const dx = this.targetX - this.posX;
        const dz = this.targetZ - this.posZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 0.5 || this.stateTimer >= this.stateDuration) {
            // Arrived or timeout — go idle
            this.state = CREATURE_STATE.IDLE;
            this.stateTimer = 0;
            this.stateDuration = 1.0 + this._rng() * 3.0;
            return;
        }

        // Move toward target
        const speed = this.moveSpeed * dt;
        const moveX = (dx / dist) * Math.min(speed, dist);
        const moveZ = (dz / dist) * Math.min(speed, dist);
        this.posX += moveX;
        this.posZ += moveZ;

        // Face movement direction
        this.targetFacing = Math.atan2(dx, dz);

        // Walk cycle
        this.walkCycle = (this.walkCycle + dt * this.moveSpeed * 3.0) % 1.0;
        this.headBob = Math.sin(this.walkCycle * Math.PI * 2) * 0.04;
    }

    _enterFlee(playerX, playerZ) {
        this.state = CREATURE_STATE.FLEE;
        this.stateTimer = 0;
        this.stateDuration = 2.0 + this._rng() * 2.0;

        // Flee direction: away from player
        const dx = this.posX - playerX;
        const dz = this.posZ - playerZ;
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
        const fleeDist = this.fleeDistance * 2;
        this.targetX = this.posX + (dx / dist) * fleeDist;
        this.targetZ = this.posZ + (dz / dist) * fleeDist;
        this.targetFacing = Math.atan2(dx, dz);
    }

    _updateFlee(dt, playerX, playerZ) {
        const dx = this.targetX - this.posX;
        const dz = this.targetZ - this.posZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Check if safe distance reached or timeout
        const distToPlayer = Math.sqrt(
            (playerX - this.posX) ** 2 + (playerZ - this.posZ) ** 2
        );

        if (distToPlayer > this.fleeDistance * 2.5 || this.stateTimer >= this.stateDuration) {
            this.state = CREATURE_STATE.IDLE;
            this.stateTimer = 0;
            this.stateDuration = 2.0 + this._rng() * 2.0;
            return;
        }

        // Run away fast
        if (dist > 0.3) {
            const speed = this.moveSpeed * this.fleeSpeed * dt;
            this.posX += (dx / dist) * Math.min(speed, dist);
            this.posZ += (dz / dist) * Math.min(speed, dist);
        }

        // Keep fleeing direction updated
        const pdx = this.posX - playerX;
        const pdz = this.posZ - playerZ;
        this.targetFacing = Math.atan2(pdx, pdz);

        // Fast walk cycle
        this.walkCycle = (this.walkCycle + dt * this.moveSpeed * this.fleeSpeed * 4.0) % 1.0;
        this.headBob = Math.sin(this.walkCycle * Math.PI * 2) * 0.06;
    }

    _enterGraze() {
        this.state = CREATURE_STATE.GRAZE;
        this.stateTimer = 0;
        this.stateDuration = 2.0 + this._rng() * 3.0;
    }

    _updateGraze(dt) {
        this.walkCycle *= 0.9;
        // Head dips down during grazing
        const grazePhase = this.stateTimer / this.stateDuration;
        this.headBob = -0.08 * Math.sin(grazePhase * Math.PI); // Dip down then up

        if (this.stateTimer >= this.stateDuration) {
            this.state = CREATURE_STATE.IDLE;
            this.stateTimer = 0;
            this.stateDuration = 1.0 + this._rng() * 2.0;
        }
    }

    // ============================================================
    // CURIOUS — approaches player, then retreats (Class 4)
    // ============================================================

    _enterCurious() {
        this.state = CREATURE_STATE.CURIOUS;
        this.stateTimer = 0;
        this.stateDuration = 4.0 + this._rng() * 4.0;
    }

    _updateCurious(dt, playerX, playerZ) {
        const dx = playerX - this.posX;
        const dz = playerZ - this.posZ;
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);

        // Look at player
        this.targetFacing = Math.atan2(dx, dz);

        if (distToPlayer > this._curiousApproachDist) {
            // Approach cautiously (half speed)
            const speed = this.moveSpeed * 0.5 * dt;
            const dist = Math.sqrt(dx * dx + dz * dz) || 1;
            this.posX += (dx / dist) * Math.min(speed, dist);
            this.posZ += (dz / dist) * Math.min(speed, dist);
            this.walkCycle = (this.walkCycle + dt * this.moveSpeed * 1.5) % 1.0;
            this.headBob = Math.sin(this.walkCycle * Math.PI * 2) * 0.03;
        } else if (distToPlayer < this._curiousRetreatDist) {
            // Too close — back away slowly
            const speed = this.moveSpeed * 0.3 * dt;
            const dist = Math.sqrt(dx * dx + dz * dz) || 1;
            this.posX -= (dx / dist) * speed;
            this.posZ -= (dz / dist) * speed;
            this.walkCycle = (this.walkCycle + dt * this.moveSpeed * 1.0) % 1.0;
        } else {
            // Just stand and watch
            this.walkCycle *= 0.9;
            this.headBob = Math.sin(this.stateTimer * 1.5) * 0.03; // Tilting head
        }

        if (this.stateTimer >= this.stateDuration) {
            this.state = CREATURE_STATE.IDLE;
            this.stateTimer = 0;
            this.stateDuration = 1.0 + this._rng() * 2.0;
        }
    }

    // ============================================================
    // HERD — moves toward a nearby herd position (Class 4)
    // ============================================================

    _enterHerd() {
        this.state = CREATURE_STATE.HERD;
        this.stateTimer = 0;
        this.stateDuration = 3.0 + this._rng() * 4.0;

        // Move toward a position between spawn and current position
        // (simulates moving toward herd center)
        const midX = (this.spawnX + this.posX) * 0.5 + (this._rng() - 0.5) * 8;
        const midZ = (this.spawnZ + this.posZ) * 0.5 + (this._rng() - 0.5) * 8;
        this.targetX = midX;
        this.targetZ = midZ;
        this.targetFacing = Math.atan2(this.targetX - this.posX, this.targetZ - this.posZ);
    }

    _updateHerd(dt) {
        // Same movement as wander, just toward herd center
        const dx = this.targetX - this.posX;
        const dz = this.targetZ - this.posZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < 1.0 || this.stateTimer >= this.stateDuration) {
            this.state = CREATURE_STATE.IDLE;
            this.stateTimer = 0;
            this.stateDuration = 1.0 + this._rng() * 2.0;
            return;
        }

        const speed = this.moveSpeed * 0.8 * dt;
        this.posX += (dx / dist) * Math.min(speed, dist);
        this.posZ += (dz / dist) * Math.min(speed, dist);
        this.targetFacing = Math.atan2(dx, dz);
        this.walkCycle = (this.walkCycle + dt * this.moveSpeed * 2.0) % 1.0;
        this.headBob = Math.sin(this.walkCycle * Math.PI * 2) * 0.03;
    }
}
