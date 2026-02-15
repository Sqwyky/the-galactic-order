/**
 * THE GALACTIC ORDER - Creature AI (Behavior System)
 *
 * Finite-state behavior for alien creatures:
 *   IDLE     → Standing still, looking around, occasional body animation
 *   WANDER   → Slowly walking to a random nearby point
 *   FLEE     → Running away from the player (when too close)
 *   GRAZE    → Head dipping down (eating animation), then back to idle
 *   STALK    → Hostile: slowly approaching the player from a distance
 *   ATTACK   → Hostile: lunging at the player to deal damage
 *   RETREAT  → Hostile: backing off after an attack before re-engaging
 *
 * Passive creatures flee from the player.
 * Hostile creatures stalk, attack, then retreat in a loop.
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
    STALK:   'stalk',
    ATTACK:  'attack',
    RETREAT: 'retreat',
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
     * @param {boolean} [options.hostile=false] - Whether this creature attacks
     * @param {number} [options.attackDamage=8] - Damage per attack
     * @param {number} [options.aggroRange=15] - Distance to notice player
     * @param {number} [options.attackRange=3] - Distance to lunge
     */
    constructor(options = {}) {
        this.moveSpeed = options.moveSpeed || 2.0;
        this.turnSpeed = options.turnSpeed || 2.0;
        this.fleeDistance = options.fleeDistance || 8.0;
        this.fleeSpeed = options.fleeSpeed || 2.5;
        this.wanderRadius = options.wanderRadius || 20.0;

        // Hostile behavior
        this.hostile = options.hostile || false;
        this.attackDamage = options.attackDamage || 8;
        this.aggroRange = options.aggroRange || 15;
        this.attackRange = options.attackRange || 3;
        this.attackCooldown = 1.5;     // Seconds between attacks
        this._attackTimer = 0;
        this._didAttack = false;       // Flag for damage event this frame

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
     * @returns {{ x, z, facing, walkCycle, headBob, state, didAttack, attackDamage }}
     */
    update(dt, playerX, playerZ) {
        this._didAttack = false;
        this._attackTimer = Math.max(0, this._attackTimer - dt);

        // Distance to player
        const dx = playerX - this.posX;
        const dz = playerZ - this.posZ;
        const distToPlayer = Math.sqrt(dx * dx + dz * dz);

        // State timer
        this.stateTimer += dt;

        // --- HOSTILE BEHAVIOR ---
        if (this.hostile) {
            this._updateHostile(dt, playerX, playerZ, distToPlayer);
        } else {
            // --- PASSIVE BEHAVIOR ---
            // Flee check (highest priority for passive creatures)
            if (distToPlayer < this.fleeDistance && this.state !== CREATURE_STATE.FLEE) {
                this._enterFlee(playerX, playerZ);
            }

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
        }

        // Smooth rotation toward target facing
        let angleDiff = this.targetFacing - this.facing;
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
            didAttack: this._didAttack,
            attackDamage: this.attackDamage,
        };
    }

    // ============================================================
    // HOSTILE STATE MACHINE
    // ============================================================

    _updateHostile(dt, playerX, playerZ, distToPlayer) {
        switch (this.state) {
            case CREATURE_STATE.IDLE:
            case CREATURE_STATE.WANDER:
            case CREATURE_STATE.GRAZE:
                // Check for aggro
                if (distToPlayer < this.aggroRange) {
                    this._enterStalk(playerX, playerZ);
                } else {
                    // Normal passive behavior when player is far
                    if (this.state === CREATURE_STATE.IDLE) this._updateIdle(dt);
                    else if (this.state === CREATURE_STATE.WANDER) this._updateWander(dt);
                    else this._updateGraze(dt);
                }
                break;

            case CREATURE_STATE.STALK:
                this._updateStalk(dt, playerX, playerZ, distToPlayer);
                break;

            case CREATURE_STATE.ATTACK:
                this._updateAttack(dt, playerX, playerZ, distToPlayer);
                break;

            case CREATURE_STATE.RETREAT:
                this._updateRetreat(dt, playerX, playerZ, distToPlayer);
                break;
        }
    }

    _enterStalk(playerX, playerZ) {
        this.state = CREATURE_STATE.STALK;
        this.stateTimer = 0;
        this.stateDuration = 3.0 + this._rng() * 4.0;
        this.targetFacing = Math.atan2(playerX - this.posX, playerZ - this.posZ);
    }

    _updateStalk(dt, playerX, playerZ, distToPlayer) {
        // Face the player
        this.targetFacing = Math.atan2(playerX - this.posX, playerZ - this.posZ);

        // Move toward player at reduced speed
        const dx = playerX - this.posX;
        const dz = playerZ - this.posZ;
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;

        if (distToPlayer > this.attackRange) {
            const speed = this.moveSpeed * 0.7 * dt;
            this.posX += (dx / dist) * speed;
            this.posZ += (dz / dist) * speed;
            this.walkCycle = (this.walkCycle + dt * this.moveSpeed * 2.0) % 1.0;
            this.headBob = Math.sin(this.walkCycle * Math.PI * 2) * 0.03;
        }

        // Close enough to attack?
        if (distToPlayer <= this.attackRange && this._attackTimer <= 0) {
            this._enterAttack(playerX, playerZ);
        }

        // Lost interest? (player ran far away)
        if (distToPlayer > this.aggroRange * 2) {
            this.state = CREATURE_STATE.IDLE;
            this.stateTimer = 0;
            this.stateDuration = 2.0;
        }
    }

    _enterAttack(playerX, playerZ) {
        this.state = CREATURE_STATE.ATTACK;
        this.stateTimer = 0;
        this.stateDuration = 0.4; // Quick lunge
        this.targetFacing = Math.atan2(playerX - this.posX, playerZ - this.posZ);
    }

    _updateAttack(dt, playerX, playerZ, distToPlayer) {
        // Lunge toward player
        const dx = playerX - this.posX;
        const dz = playerZ - this.posZ;
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;

        const lungeSpeed = this.moveSpeed * this.fleeSpeed * 1.5 * dt;
        if (dist > 1.0) {
            this.posX += (dx / dist) * lungeSpeed;
            this.posZ += (dz / dist) * lungeSpeed;
        }

        // Fast walk cycle (attack animation)
        this.walkCycle = (this.walkCycle + dt * 12.0) % 1.0;
        this.headBob = Math.sin(this.stateTimer * 20) * 0.1;

        // Deal damage at the midpoint of the lunge
        if (this.stateTimer >= this.stateDuration * 0.5 && !this._didAttack && distToPlayer < this.attackRange * 1.5) {
            this._didAttack = true;
            this._attackTimer = this.attackCooldown;
        }

        // Lunge complete → retreat
        if (this.stateTimer >= this.stateDuration) {
            this._enterRetreat(playerX, playerZ);
        }
    }

    _enterRetreat(playerX, playerZ) {
        this.state = CREATURE_STATE.RETREAT;
        this.stateTimer = 0;
        this.stateDuration = 1.5 + this._rng() * 1.5;

        // Move away briefly
        const dx = this.posX - playerX;
        const dz = this.posZ - playerZ;
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
        this.targetX = this.posX + (dx / dist) * 8;
        this.targetZ = this.posZ + (dz / dist) * 8;
        this.targetFacing = Math.atan2(dx, dz);
    }

    _updateRetreat(dt, playerX, playerZ, distToPlayer) {
        const dx = this.targetX - this.posX;
        const dz = this.targetZ - this.posZ;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 0.5) {
            const speed = this.moveSpeed * 1.5 * dt;
            this.posX += (dx / dist) * Math.min(speed, dist);
            this.posZ += (dz / dist) * Math.min(speed, dist);
        }

        this.walkCycle = (this.walkCycle + dt * this.moveSpeed * 3.0) % 1.0;
        this.headBob = Math.sin(this.walkCycle * Math.PI * 2) * 0.04;

        // Retreat done → stalk again or go idle
        if (this.stateTimer >= this.stateDuration) {
            if (distToPlayer < this.aggroRange) {
                this._enterStalk(playerX, playerZ);
            } else {
                this.state = CREATURE_STATE.IDLE;
                this.stateTimer = 0;
                this.stateDuration = 2.0 + this._rng() * 3.0;
            }
        }
    }

    // ============================================================
    // PASSIVE STATE BEHAVIORS
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
