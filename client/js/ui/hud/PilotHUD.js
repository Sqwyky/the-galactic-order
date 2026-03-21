/**
 * THE GALACTIC ORDER — Pilot HUD
 *
 * Enhanced flight HUD with:
 *   - Central velocity vector crosshair
 *   - Speed + altitude readouts
 *   - Throttle gauge (vertical bar)
 *   - Fuel gauge
 *   - Minimap radar
 *   - Ship status summary icons
 */

import { RoleHUD } from './RoleHUD.js';

export class PilotHUD extends RoleHUD {
    constructor() {
        super('pilot', 'PILOT');
        this._build();
    }

    _build() {
        // Crosshair
        this.crosshair = document.createElement('div');
        this.crosshair.style.cssText = `
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            width: 44px; height: 44px;
        `;
        this.crosshair.innerHTML = `
            <svg viewBox="0 0 44 44" width="44" height="44" style="opacity: 0.7;">
                <path d="M5 2 L22 2 L22 5" fill="none" stroke="#00ff88" stroke-width="1"/>
                <path d="M39 2 L22 2 L22 5" fill="none" stroke="#00ff88" stroke-width="1" transform="scale(-1,1) translate(-44,0)"/>
                <path d="M5 42 L22 42 L22 39" fill="none" stroke="#00ff88" stroke-width="1"/>
                <path d="M39 42 L22 42 L22 39" fill="none" stroke="#00ff88" stroke-width="1" transform="scale(-1,1) translate(-44,0)"/>
                <circle cx="22" cy="22" r="1.5" fill="#00ff88" opacity="0.8"/>
                <line x1="22" y1="10" x2="22" y2="16" stroke="#00ff88" stroke-width="0.5" opacity="0.4"/>
                <line x1="22" y1="28" x2="22" y2="34" stroke="#00ff88" stroke-width="0.5" opacity="0.4"/>
                <line x1="10" y1="22" x2="16" y2="22" stroke="#00ff88" stroke-width="0.5" opacity="0.4"/>
                <line x1="28" y1="22" x2="34" y2="22" stroke="#00ff88" stroke-width="0.5" opacity="0.4"/>
            </svg>
        `;
        this.container.appendChild(this.crosshair);

        // Speed + Altitude (bottom center)
        this.speedPanel = this._createPanel('bottom: 40px; left: 50%; transform: translateX(-50%); text-align: center;');
        this.speedEl = document.createElement('div');
        this.speedEl.style.cssText = 'font-size: 28px; letter-spacing: 3px;';
        this.speedEl.textContent = '0 m/s';
        this.speedPanel.appendChild(this.speedEl);

        this.altEl = document.createElement('div');
        this.altEl.style.cssText = 'font-size: 14px; margin-top: 4px; opacity: 0.7;';
        this.altEl.textContent = 'ALT 0m';
        this.speedPanel.appendChild(this.altEl);

        // Throttle gauge (left side)
        this.throttlePanel = this._createPanel('left: 20px; top: 50%; transform: translateY(-50%);');
        this.throttlePanel.innerHTML = `
            <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 4px;">THR</div>
            <div style="width: 8px; height: 120px; background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.3); position: relative;">
                <div id="pilot-throttle-fill" style="position: absolute; bottom: 0; left: 0; right: 0; background: #00ff88; transition: height 0.1s;"></div>
            </div>
        `;
        this.throttleFill = this.throttlePanel.querySelector('#pilot-throttle-fill');

        // Fuel gauge (right side)
        this.fuelPanel = this._createPanel('right: 20px; top: 50%; transform: translateY(-50%);');
        this.fuelPanel.innerHTML = `
            <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 4px;">FUEL</div>
            <div style="width: 8px; height: 120px; background: rgba(0,255,136,0.1); border: 1px solid rgba(0,255,136,0.3); position: relative;">
                <div id="pilot-fuel-fill" style="position: absolute; bottom: 0; left: 0; right: 0; background: #00cc66; transition: height 0.2s;"></div>
            </div>
            <div id="pilot-fuel-pct" style="font-size: 10px; margin-top: 4px; text-align: center;">100%</div>
        `;
        this.fuelFill = this.fuelPanel.querySelector('#pilot-fuel-fill');
        this.fuelPct = this.fuelPanel.querySelector('#pilot-fuel-pct');

        // Weapon indicator (top right)
        this.weaponPanel = this._createPanel('top: 12px; right: 12px;');
        this.weaponPanel.innerHTML = `
            <span style="font-size: 11px; letter-spacing: 1px;">WPN: </span>
            <span id="pilot-weapon" style="font-size: 13px;">LASER</span>
        `;
        this.weaponEl = this.weaponPanel.querySelector('#pilot-weapon');

        // Ship status (bottom left)
        this.statusPanel = this._createPanel('bottom: 12px; left: 12px;');
        this.statusPanel.innerHTML = `
            <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 4px;">STATUS</div>
            <div id="pilot-hull-bar" style="font-size: 11px;">HULL ████████ 100%</div>
            <div id="pilot-shield-bar" style="font-size: 11px; color: #3399ff;">SHLD ████████ 100%</div>
        `;
        this.hullBar = this.statusPanel.querySelector('#pilot-hull-bar');
        this.shieldBar = this.statusPanel.querySelector('#pilot-shield-bar');
    }

    update(data) {
        if (!this.visible) return;

        if (data.speed !== undefined) {
            this.speedEl.textContent = `${Math.floor(data.speed)} m/s`;
        }
        if (data.altitude !== undefined) {
            this.altEl.textContent = `ALT ${Math.floor(data.altitude)}m`;
        }
        if (data.throttle !== undefined) {
            this.throttleFill.style.height = `${data.throttle * 100}%`;
        }
        if (data.fuel !== undefined) {
            const pct = Math.floor(data.fuel * 100);
            this.fuelFill.style.height = `${pct}%`;
            this.fuelPct.textContent = `${pct}%`;
            this.fuelFill.style.background = pct < 20 ? '#ff4444' : '#00cc66';
        }
        if (data.weapon !== undefined) {
            this.weaponEl.textContent = data.weapon.toUpperCase();
        }
        if (data.hull !== undefined) {
            const pct = Math.floor(data.hull * 100);
            const bars = '█'.repeat(Math.ceil(pct / 12.5)) + '░'.repeat(8 - Math.ceil(pct / 12.5));
            this.hullBar.textContent = `HULL ${bars} ${pct}%`;
            this.hullBar.style.color = pct < 30 ? '#ff4444' : '#00ff88';
        }
        if (data.shields !== undefined) {
            const pct = Math.floor(data.shields * 100);
            const bars = '█'.repeat(Math.ceil(pct / 12.5)) + '░'.repeat(8 - Math.ceil(pct / 12.5));
            this.shieldBar.textContent = `SHLD ${bars} ${pct}%`;
        }
    }
}
