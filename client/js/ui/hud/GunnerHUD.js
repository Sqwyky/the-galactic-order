/**
 * THE GALACTIC ORDER — Gunner HUD
 *
 * Turret-focused interface:
 *   - Large crosshair with lead indicator
 *   - Weapon selection + cooldown bars
 *   - Turret rotation arc indicator
 *   - Hit confirmation flash
 */

import { RoleHUD } from './RoleHUD.js';

export class GunnerHUD extends RoleHUD {
    constructor() {
        super('gunner', 'WEAPONS');
        this.badge.style.color = '#ff3333';
        this.badge.style.borderColor = 'rgba(255, 51, 51, 0.3)';
        this._build();
    }

    _build() {
        // Large targeting crosshair
        this.crosshair = document.createElement('div');
        this.crosshair.style.cssText = `
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 80px; height: 80px;
        `;
        this.crosshair.innerHTML = `
            <svg viewBox="0 0 80 80" width="80" height="80" style="opacity: 0.8;">
                <!-- Outer ring -->
                <circle cx="40" cy="40" r="35" fill="none" stroke="#ff3333" stroke-width="1" stroke-dasharray="4,4"/>
                <!-- Inner diamond -->
                <path d="M40 25 L55 40 L40 55 L25 40 Z" fill="none" stroke="#ff3333" stroke-width="1.5"/>
                <!-- Center dot -->
                <circle cx="40" cy="40" r="2" fill="#ff3333"/>
                <!-- Tick marks -->
                <line x1="40" y1="5" x2="40" y2="15" stroke="#ff3333" stroke-width="1" opacity="0.5"/>
                <line x1="40" y1="65" x2="40" y2="75" stroke="#ff3333" stroke-width="1" opacity="0.5"/>
                <line x1="5" y1="40" x2="15" y2="40" stroke="#ff3333" stroke-width="1" opacity="0.5"/>
                <line x1="65" y1="40" x2="75" y2="40" stroke="#ff3333" stroke-width="1" opacity="0.5"/>
            </svg>
        `;
        this.container.appendChild(this.crosshair);

        // Weapon info (right side)
        this.weaponPanel = this._createPanel('right: 20px; top: 50%; transform: translateY(-50%);');
        this.weaponPanel.style.color = '#ff3333';
        this.weaponPanel.style.borderColor = 'rgba(255, 51, 51, 0.2)';
        this.weaponPanel.innerHTML = `
            <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 6px;">WEAPONS</div>
            <div id="gunner-weapon-1" style="font-size: 12px; margin-bottom: 4px;">▸ LASER</div>
            <div id="gunner-weapon-2" style="font-size: 12px; opacity: 0.5;">  ROCKET</div>
            <div style="margin-top: 8px; font-size: 10px;">COOLDOWN</div>
            <div style="width: 60px; height: 4px; background: rgba(255,51,51,0.2); margin-top: 3px;">
                <div id="gunner-cooldown" style="height: 100%; background: #ff3333; width: 0%; transition: width 0.05s;"></div>
            </div>
        `;
        this.cooldownBar = this.weaponPanel.querySelector('#gunner-cooldown');
        this.weapon1 = this.weaponPanel.querySelector('#gunner-weapon-1');
        this.weapon2 = this.weaponPanel.querySelector('#gunner-weapon-2');

        // Hit confirmation (center, flashes briefly)
        this.hitFlash = document.createElement('div');
        this.hitFlash.style.cssText = `
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            color: #ff3333;
            font-size: 18px;
            font-weight: bold;
            opacity: 0;
            transition: opacity 0.1s;
        `;
        this.hitFlash.textContent = '◆ HIT ◆';
        this.container.appendChild(this.hitFlash);
        this._hitTimer = 0;

        // Turret arc indicator (bottom center)
        this.arcPanel = this._createPanel('bottom: 30px; left: 50%; transform: translateX(-50%);');
        this.arcPanel.style.color = '#ff3333';
        this.arcPanel.style.borderColor = 'rgba(255, 51, 51, 0.2)';
        this.arcPanel.innerHTML = `
            <svg viewBox="0 0 120 30" width="120" height="30" style="opacity: 0.6;">
                <path d="M10 25 A50 50 0 0 1 110 25" fill="none" stroke="#ff3333" stroke-width="1"/>
                <line id="gunner-arc-needle" x1="60" y1="25" x2="60" y2="5" stroke="#ff5555" stroke-width="2"/>
            </svg>
        `;
        this.arcNeedle = this.arcPanel.querySelector('#gunner-arc-needle');
    }

    update(data) {
        if (!this.visible) return;

        if (data.cooldown !== undefined) {
            this.cooldownBar.style.width = `${(1 - data.cooldown) * 100}%`;
        }
        if (data.currentWeapon !== undefined) {
            const isLaser = data.currentWeapon === 'laser';
            this.weapon1.textContent = isLaser ? '▸ LASER' : '  LASER';
            this.weapon1.style.opacity = isLaser ? '1' : '0.5';
            this.weapon2.textContent = isLaser ? '  ROCKET' : '▸ ROCKET';
            this.weapon2.style.opacity = isLaser ? '0.5' : '1';
        }
        if (data.hit) {
            this.hitFlash.style.opacity = '1';
            this._hitTimer = 0.3;
        }
        if (this._hitTimer > 0) {
            this._hitTimer -= 1 / 60;
            if (this._hitTimer <= 0) {
                this.hitFlash.style.opacity = '0';
            }
        }
        if (data.turretAngle !== undefined) {
            // Rotate needle (-1 to 1 range maps to arc)
            const angle = data.turretAngle * 50;
            const x2 = 60 + Math.sin(angle * Math.PI / 180) * 20;
            const y2 = 25 - Math.cos(angle * Math.PI / 180) * 20;
            this.arcNeedle.setAttribute('x2', x2);
            this.arcNeedle.setAttribute('y2', y2);
        }
    }
}
