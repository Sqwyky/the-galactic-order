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
    IDLE:   'idle',
    WANDER: 'wander',
    FLEE:   'flee',
    GRAZE:  'graze',
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
        this.moveSpeed = options.moveSpeed || 2.0;
        this.turnSpeed = options.turnSpeed || 2.0;
        this.fleeDistance = options.fleeDistance || 8.0;
        this.fleeSpeed = options.fleeSpeed || 2.5;
        this.wanderRadius = options.wanderRadius || 20.0;

        // State
        this.state = CREATURE_STATE.IDLE;
        this.stateTimer = 0;
        this.stateDuration = 2.0; // How long to stay in current state

        // Position / movement
        this.posX = 0;
        this.posZ = 0;
        this.targetX = 0;
        this.targetZ = 0;
        this.facing = 0; // Radians (Y rotation)
        this.targetFacing = 0;
        this.spawnX = 0;
        this.spawnZ = 0;

        // Animation state
        this.walkCycle = 0; // 0-1 repeating for leg animation
        this.headBob = 0;

        // Seeded RNG for deterministic behavior
        this._seed = options.seed || 0;
        this._rngCounter = 0;
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
            // Transition: 50% wander, 30% graze, 20% stay idle
            const roll = this._rng();
            if (roll < 0.5) {
                this._enterWander();
            } else if (roll < 0.8) {
                this._enterGraze();
            } else {
                this.stateTimer = 0;
                this.stateDuration = 1.0 + this._rng() * 3.0;
            }
        }
    }

    _enterWander() {
        this.state = CREATURE_STATE.WANDER;
        this.stateTimer = 0;
        this.stateDuration = 3.0 + this._rng() * 5.0;

        // Pick random target within wander radius of spawn
        const angle = this._rng() * Math.PI * 2;
        const dist = this._rng() * this.wanderRadius;
        this.targetX = this.spawnX + Math.cos(angle) * dist;
        this.targetZ = this.spawnZ + Math.sin(angle) * dist;

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
}
