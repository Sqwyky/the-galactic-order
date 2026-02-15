/**
 * THE GALACTIC ORDER - Survival Stats
 *
 * NMS-inspired survival system with three core stats:
 *   HEALTH           — 100 HP, damage from falls, hostile creatures, hazards
 *   STAMINA          — 100, drains when sprinting, regenerates when idle/walking
 *   HAZARD PROTECTION — 100, drains on hostile planets (gamma/beta), recharges in ship
 *
 * HUD: Three vertical bars on the left side of the screen.
 *
 * Integration:
 *   - Walker provides sprint state + fall velocity
 *   - CreatureSystem provides damage events
 *   - Planet mood (band) determines hazard drain rate
 *   - Ship provides safe haven for hazard recharge
 */

import * as THREE from 'three';

// ============================================================
// SURVIVAL STATS
// ============================================================

export class SurvivalStats {
    constructor() {
        // Stats
        this.health = 100;
        this.maxHealth = 100;
        this.stamina = 100;
        this.maxStamina = 100;
        this.hazardProtection = 100;
        this.maxHazardProtection = 100;

        // Rates (per second)
        this.staminaDrainRate = 20;    // When sprinting
        this.staminaRegenRate = 15;    // When not sprinting
        this.healthRegenRate = 2;      // Slow passive regen when safe
        this.healthRegenDelay = 5.0;   // Seconds after last damage before regen
        this.hazardDrainRate = 0;      // Set by planet mood
        this.hazardRegenRate = 8;      // When in ship

        // State
        this.isDead = false;
        this.isInShip = false;
        this.lastDamageTime = -10;
        this._time = 0;
        this._lowHealthWarning = false;
        this._lowHazardWarning = false;
        this._staminaEmpty = false;

        // Fall damage
        this._lastFallVelocity = 0;
        this._fallDamageThreshold = 8;  // velocity threshold
        this._fallDamageMultiplier = 3; // damage per m/s above threshold

        // Damage flash
        this._damageFlash = 0;

        // HUD
        this._hudEl = null;
        this._createHUD();
    }

    /**
     * Set hazard drain rate based on planet mood band.
     * @param {string} band - 'delta'|'theta'|'alpha'|'beta'|'gamma'
     */
    setPlanetHazard(band) {
        const rates = {
            delta: 0,       // Dreamlike — no hazard
            theta: 0,       // Mysterious — safe
            alpha: 0,       // Calm — safe
            beta: 2.5,      // Energetic — moderate radiation
            gamma: 6,       // Intense — dangerous radiation/toxicity
        };
        this.hazardDrainRate = rates[band] || 0;
    }

    /**
     * Deal damage to the player.
     * @param {number} amount - Damage amount
     * @param {string} [source='unknown'] - Damage source for HUD
     */
    takeDamage(amount, source = 'unknown') {
        if (this.isDead) return;

        // Hazard protection absorbs some damage from environmental sources
        if (source === 'hazard' && this.hazardProtection > 0) {
            const absorbed = Math.min(amount * 0.7, this.hazardProtection);
            this.hazardProtection -= absorbed;
            amount -= absorbed;
        }

        this.health = Math.max(0, this.health - amount);
        this.lastDamageTime = this._time;
        this._damageFlash = 1.0;

        if (this.health <= 0) {
            this.isDead = true;
            this._onDeath();
        }
    }

    /**
     * Update every frame.
     * @param {number} dt - Delta time
     * @param {Object} info - { isSprinting, isGrounded, fallVelocity, isInShip }
     */
    update(dt, info = {}) {
        if (this.isDead) return;

        this._time += dt;

        // ---- STAMINA ----
        if (info.isSprinting && this.stamina > 0) {
            this.stamina = Math.max(0, this.stamina - this.staminaDrainRate * dt);
            if (this.stamina <= 0) this._staminaEmpty = true;
        } else {
            this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * dt);
            if (this.stamina > 20) this._staminaEmpty = false;
        }

        // ---- HAZARD PROTECTION ----
        this.isInShip = !!info.isInShip;
        if (this.isInShip) {
            // Recharge in ship
            this.hazardProtection = Math.min(
                this.maxHazardProtection,
                this.hazardProtection + this.hazardRegenRate * dt
            );
        } else if (this.hazardDrainRate > 0) {
            this.hazardProtection = Math.max(0, this.hazardProtection - this.hazardDrainRate * dt);

            // When protection is depleted, start taking health damage
            if (this.hazardProtection <= 0) {
                this.takeDamage(this.hazardDrainRate * 0.3 * dt, 'hazard');
            }
        }

        // ---- HEALTH REGEN ----
        const timeSinceDamage = this._time - this.lastDamageTime;
        if (timeSinceDamage > this.healthRegenDelay && this.health < this.maxHealth) {
            this.health = Math.min(this.maxHealth, this.health + this.healthRegenRate * dt);
        }

        // ---- FALL DAMAGE ----
        if (info.isGrounded && this._lastFallVelocity < -this._fallDamageThreshold) {
            const excess = Math.abs(this._lastFallVelocity) - this._fallDamageThreshold;
            this.takeDamage(excess * this._fallDamageMultiplier, 'fall');
        }
        this._lastFallVelocity = info.isGrounded ? 0 : (info.fallVelocity || 0);

        // ---- DAMAGE FLASH ----
        this._damageFlash *= 0.92;
        if (this._damageFlash < 0.01) this._damageFlash = 0;

        // ---- WARNINGS ----
        this._lowHealthWarning = this.health < 25;
        this._lowHazardWarning = this.hazardProtection < 15 && this.hazardDrainRate > 0;

        // ---- UPDATE HUD ----
        this._updateHUD();
    }

    /**
     * Check if player can sprint (has stamina).
     */
    canSprint() {
        return this.stamina > 0 && !this._staminaEmpty;
    }

    /**
     * Respawn the player (reset all stats).
     */
    respawn() {
        this.health = this.maxHealth;
        this.stamina = this.maxStamina;
        this.hazardProtection = this.maxHazardProtection;
        this.isDead = false;
        this._damageFlash = 0;
        this._deathEl.style.display = 'none';
    }

    // ============================================================
    // HUD
    // ============================================================

    _createHUD() {
        const el = document.createElement('div');
        el.id = 'survival-hud';
        el.style.cssText = `
            position: fixed;
            left: 16px;
            bottom: 80px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-family: 'Courier New', monospace;
            font-size: 9px;
            letter-spacing: 1px;
            pointer-events: none;
            z-index: 15;
            opacity: 0;
            transition: opacity 0.5s;
        `;

        // Health bar
        el.innerHTML = `
            <div class="stat-row" id="stat-health">
                <span class="stat-label" style="color: #ff4444;">HP</span>
                <div class="stat-bar-bg">
                    <div class="stat-bar-fill" id="health-fill" style="background: linear-gradient(90deg, #cc2222, #ff4444);"></div>
                </div>
                <span class="stat-val" id="health-val">100</span>
            </div>
            <div class="stat-row" id="stat-stamina">
                <span class="stat-label" style="color: #44aaff;">ST</span>
                <div class="stat-bar-bg">
                    <div class="stat-bar-fill" id="stamina-fill" style="background: linear-gradient(90deg, #2266cc, #44aaff);"></div>
                </div>
                <span class="stat-val" id="stamina-val">100</span>
            </div>
            <div class="stat-row" id="stat-hazard" style="display: none;">
                <span class="stat-label" style="color: #ffaa22;">HZ</span>
                <div class="stat-bar-bg">
                    <div class="stat-bar-fill" id="hazard-fill" style="background: linear-gradient(90deg, #cc8800, #ffaa22);"></div>
                </div>
                <span class="stat-val" id="hazard-val">100</span>
            </div>
        `;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .stat-row {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .stat-label {
                width: 16px;
                text-align: right;
                font-weight: bold;
            }
            .stat-bar-bg {
                width: 80px;
                height: 4px;
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.12);
            }
            .stat-bar-fill {
                height: 100%;
                width: 100%;
                transition: width 0.2s;
            }
            .stat-val {
                width: 24px;
                color: rgba(255,255,255,0.5);
                text-align: right;
            }
            #damage-flash {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                pointer-events: none;
                z-index: 50;
                background: radial-gradient(ellipse at center, transparent 40%, rgba(200,0,0,0.4));
                opacity: 0;
                transition: opacity 0.1s;
            }
            #death-screen {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.85);
                display: none;
                justify-content: center;
                align-items: center;
                flex-direction: column;
                z-index: 200;
                font-family: 'Courier New', monospace;
                color: #ff4444;
                letter-spacing: 3px;
            }
            #death-screen h2 {
                font-size: 28px;
                margin-bottom: 10px;
            }
            #death-screen p {
                color: #666;
                font-size: 11px;
                letter-spacing: 2px;
            }
            .stat-warning {
                animation: stat-pulse 0.8s ease-in-out infinite alternate;
            }
            @keyframes stat-pulse {
                from { opacity: 0.5; }
                to { opacity: 1.0; }
            }
        `;
        document.head.appendChild(style);

        // Damage flash overlay
        this._flashEl = document.createElement('div');
        this._flashEl.id = 'damage-flash';
        document.body.appendChild(this._flashEl);

        // Death screen
        this._deathEl = document.createElement('div');
        this._deathEl.id = 'death-screen';
        this._deathEl.innerHTML = `
            <h2>SIGNAL LOST</h2>
            <p>RESPAWNING AT SHIP...</p>
        `;
        document.body.appendChild(this._deathEl);

        document.body.appendChild(el);
        this._hudEl = el;
    }

    show() {
        this._hudEl.style.opacity = '1';
    }

    hide() {
        this._hudEl.style.opacity = '0';
    }

    _updateHUD() {
        // Bar widths
        const hf = document.getElementById('health-fill');
        const sf = document.getElementById('stamina-fill');
        const zf = document.getElementById('hazard-fill');
        if (hf) hf.style.width = `${(this.health / this.maxHealth) * 100}%`;
        if (sf) sf.style.width = `${(this.stamina / this.maxStamina) * 100}%`;
        if (zf) zf.style.width = `${(this.hazardProtection / this.maxHazardProtection) * 100}%`;

        // Values
        const hv = document.getElementById('health-val');
        const sv = document.getElementById('stamina-val');
        const zv = document.getElementById('hazard-val');
        if (hv) hv.textContent = Math.round(this.health);
        if (sv) sv.textContent = Math.round(this.stamina);
        if (zv) zv.textContent = Math.round(this.hazardProtection);

        // Show/hide hazard bar
        const hazardRow = document.getElementById('stat-hazard');
        if (hazardRow) {
            hazardRow.style.display = this.hazardDrainRate > 0 ? 'flex' : 'none';
        }

        // Warnings
        const healthRow = document.getElementById('stat-health');
        if (healthRow) {
            healthRow.classList.toggle('stat-warning', this._lowHealthWarning);
        }
        const hazardRowEl = document.getElementById('stat-hazard');
        if (hazardRowEl) {
            hazardRowEl.classList.toggle('stat-warning', this._lowHazardWarning);
        }

        // Damage flash
        if (this._flashEl) {
            this._flashEl.style.opacity = this._damageFlash;
        }
    }

    _onDeath() {
        // Show death screen
        this._deathEl.style.display = 'flex';

        // Auto-respawn after 3 seconds
        setTimeout(() => {
            if (this.onRespawn) this.onRespawn();
            this.respawn();
        }, 3000);
    }

    dispose() {
        if (this._hudEl && this._hudEl.parentNode) this._hudEl.parentNode.removeChild(this._hudEl);
        if (this._flashEl && this._flashEl.parentNode) this._flashEl.parentNode.removeChild(this._flashEl);
        if (this._deathEl && this._deathEl.parentNode) this._deathEl.parentNode.removeChild(this._deathEl);
    }
}
