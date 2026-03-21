/**
 * THE GALACTIC ORDER — Captain HUD
 *
 * Strategic overview interface:
 *   - Crew roster (who is at which station)
 *   - Summary of all station metrics
 *   - Waypoint/order system
 *   - Communication panel
 */

import { RoleHUD } from './RoleHUD.js';

export class CaptainHUD extends RoleHUD {
    constructor() {
        super('captain', 'COMMAND');
        this.badge.style.color = '#ffff33';
        this.badge.style.borderColor = 'rgba(255, 255, 51, 0.3)';
        this._build();
    }

    _build() {
        // Crew roster (top right)
        this.rosterPanel = this._createPanel('top: 50px; right: 20px;');
        this.rosterPanel.style.color = '#ffff33';
        this.rosterPanel.style.borderColor = 'rgba(255, 255, 51, 0.2)';
        this.rosterPanel.style.width = '180px';
        this.rosterPanel.innerHTML = `
            <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 6px;">CREW ROSTER</div>
            <div id="cap-roster" style="font-size: 11px;"></div>
        `;
        this.rosterEl = this.rosterPanel.querySelector('#cap-roster');

        // Status overview (left side)
        this.overviewPanel = this._createPanel('left: 20px; top: 50%; transform: translateY(-50%);');
        this.overviewPanel.style.color = '#ffff33';
        this.overviewPanel.style.borderColor = 'rgba(255, 255, 51, 0.2)';
        this.overviewPanel.style.width = '200px';
        this.overviewPanel.innerHTML = `
            <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 8px;">SHIP OVERVIEW</div>
            <div id="cap-hull" style="font-size: 11px; margin-bottom: 3px;">HULL: 100%</div>
            <div id="cap-shields" style="font-size: 11px; margin-bottom: 3px; color: #3399ff;">SHLD: 100%</div>
            <div id="cap-speed" style="font-size: 11px; margin-bottom: 3px;">SPD: 0 m/s</div>
            <div id="cap-fuel" style="font-size: 11px; margin-bottom: 3px;">FUEL: 100%</div>
            <hr style="border-color: rgba(255,255,51,0.2); margin: 6px 0;">
            <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 4px;">POWER</div>
            <div id="cap-power" style="font-size: 10px; white-space: pre;"></div>
        `;
        this.hullEl = this.overviewPanel.querySelector('#cap-hull');
        this.shieldsEl = this.overviewPanel.querySelector('#cap-shields');
        this.speedEl = this.overviewPanel.querySelector('#cap-speed');
        this.fuelEl = this.overviewPanel.querySelector('#cap-fuel');
        this.powerEl = this.overviewPanel.querySelector('#cap-power');

        // Orders (bottom center)
        this.orderPanel = this._createPanel('bottom: 30px; left: 50%; transform: translateX(-50%);');
        this.orderPanel.style.color = '#ffff33';
        this.orderPanel.style.borderColor = 'rgba(255, 255, 51, 0.2)';
        this.orderPanel.innerHTML = `
            <span style="font-size: 10px; letter-spacing: 1px;">[T] SET WAYPOINT &nbsp; [Y] BROADCAST ORDER &nbsp; [TAB] SWITCH STATION</span>
        `;

        // Minimal crosshair
        this.crosshair = document.createElement('div');
        this.crosshair.style.cssText = `
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
        `;
        this.crosshair.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" style="opacity: 0.4;">
                <circle cx="12" cy="12" r="1" fill="#ffff33"/>
                <circle cx="12" cy="12" r="8" fill="none" stroke="#ffff33" stroke-width="0.5"/>
            </svg>
        `;
        this.container.appendChild(this.crosshair);
    }

    update(data) {
        if (!this.visible) return;

        // Crew roster
        if (data.roster) {
            let html = '';
            for (const entry of data.roster) {
                const status = entry.occupied ? `<span style="color: #00ff88;">${entry.player}</span>` : '<span style="opacity: 0.4;">EMPTY</span>';
                const indicator = entry.isLocal ? '▸ ' : '  ';
                html += `<div>${indicator}${entry.role}: ${status}</div>`;
            }
            this.rosterEl.innerHTML = html;
        }

        // Ship overview
        if (data.hull !== undefined) {
            const pct = Math.floor(data.hull * 100);
            this.hullEl.textContent = `HULL: ${pct}%`;
            this.hullEl.style.color = pct > 50 ? '#00ff88' : pct > 25 ? '#ffaa33' : '#ff4444';
        }
        if (data.shields !== undefined) {
            this.shieldsEl.textContent = `SHLD: ${Math.floor(data.shields * 100)}%`;
        }
        if (data.speed !== undefined) {
            this.speedEl.textContent = `SPD: ${Math.floor(data.speed)} m/s`;
        }
        if (data.fuel !== undefined) {
            this.fuelEl.textContent = `FUEL: ${Math.floor(data.fuel * 100)}%`;
        }
        if (data.power) {
            let text = '';
            for (const [sys, bars] of Object.entries(data.power)) {
                const label = sys.substring(0, 3).toUpperCase();
                text += `${label}: ${'█'.repeat(bars)}${'░'.repeat(4 - bars)}\n`;
            }
            this.powerEl.textContent = text;
        }
    }
}
