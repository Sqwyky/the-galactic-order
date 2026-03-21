/**
 * THE GALACTIC ORDER — Navigator HUD
 *
 * Information-dense scanning interface:
 *   - Expanded scanner readout
 *   - Waypoint creation tool
 *   - Jump calculator (fuel cost, distance)
 *   - Hyperspace charge bar
 */

import { RoleHUD } from './RoleHUD.js';

export class NavigatorHUD extends RoleHUD {
    constructor() {
        super('navigator', 'NAVIGATION');
        this.badge.style.color = '#3388ff';
        this.badge.style.borderColor = 'rgba(51, 136, 255, 0.3)';
        this._build();
    }

    _build() {
        // Scanner display (center-left)
        this.scannerPanel = this._createPanel('left: 20px; top: 50%; transform: translateY(-50%);');
        this.scannerPanel.style.color = '#3388ff';
        this.scannerPanel.style.borderColor = 'rgba(51, 136, 255, 0.2)';
        this.scannerPanel.style.width = '180px';
        this.scannerPanel.innerHTML = `
            <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 6px;">SCANNER</div>
            <div id="nav-scan-status" style="font-size: 11px; margin-bottom: 4px;">IDLE</div>
            <div id="nav-scan-target" style="font-size: 12px; color: #55aaff;"></div>
            <div id="nav-scan-data" style="font-size: 10px; margin-top: 4px; opacity: 0.7; white-space: pre;"></div>
        `;
        this.scanStatus = this.scannerPanel.querySelector('#nav-scan-status');
        this.scanTarget = this.scannerPanel.querySelector('#nav-scan-target');
        this.scanData = this.scannerPanel.querySelector('#nav-scan-data');

        // Jump calculator (right side)
        this.jumpPanel = this._createPanel('right: 20px; top: 50%; transform: translateY(-50%);');
        this.jumpPanel.style.color = '#3388ff';
        this.jumpPanel.style.borderColor = 'rgba(51, 136, 255, 0.2)';
        this.jumpPanel.style.width = '160px';
        this.jumpPanel.innerHTML = `
            <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 6px;">HYPERSPACE</div>
            <div id="nav-jump-dest" style="font-size: 12px;">No destination</div>
            <div id="nav-jump-dist" style="font-size: 10px; margin-top: 4px; opacity: 0.7;">DIST: --</div>
            <div id="nav-jump-fuel" style="font-size: 10px; opacity: 0.7;">FUEL: --</div>
            <div style="margin-top: 8px; font-size: 10px;">CHARGE</div>
            <div style="width: 120px; height: 6px; background: rgba(51,136,255,0.15); margin-top: 3px; border: 1px solid rgba(51,136,255,0.3);">
                <div id="nav-charge-bar" style="height: 100%; background: #3388ff; width: 0%; transition: width 0.1s;"></div>
            </div>
            <div id="nav-charge-pct" style="font-size: 10px; margin-top: 2px;">0%</div>
        `;
        this.jumpDest = this.jumpPanel.querySelector('#nav-jump-dest');
        this.jumpDist = this.jumpPanel.querySelector('#nav-jump-dist');
        this.jumpFuel = this.jumpPanel.querySelector('#nav-jump-fuel');
        this.chargeBar = this.jumpPanel.querySelector('#nav-charge-bar');
        this.chargePct = this.jumpPanel.querySelector('#nav-charge-pct');

        // Waypoint tool hint (bottom center)
        this.waypointHint = this._createPanel('bottom: 30px; left: 50%; transform: translateX(-50%);');
        this.waypointHint.style.color = '#3388ff';
        this.waypointHint.style.borderColor = 'rgba(51, 136, 255, 0.2)';
        this.waypointHint.innerHTML = `
            <span style="font-size: 10px; letter-spacing: 1px;">[M] STAR MAP &nbsp; [N] SET WAYPOINT</span>
        `;

        // Minimal crosshair
        this.crosshair = document.createElement('div');
        this.crosshair.style.cssText = `
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
        `;
        this.crosshair.innerHTML = `
            <svg viewBox="0 0 20 20" width="20" height="20" style="opacity: 0.4;">
                <circle cx="10" cy="10" r="1" fill="#3388ff"/>
            </svg>
        `;
        this.container.appendChild(this.crosshair);
    }

    update(data) {
        if (!this.visible) return;

        if (data.scanStatus !== undefined) {
            this.scanStatus.textContent = data.scanStatus;
        }
        if (data.scanTarget !== undefined) {
            this.scanTarget.textContent = data.scanTarget;
        }
        if (data.scanData !== undefined) {
            this.scanData.textContent = data.scanData;
        }
        if (data.jumpDestination !== undefined) {
            this.jumpDest.textContent = data.jumpDestination || 'No destination';
        }
        if (data.jumpDistance !== undefined) {
            this.jumpDist.textContent = `DIST: ${data.jumpDistance.toFixed(1)} ly`;
        }
        if (data.jumpFuelCost !== undefined) {
            this.jumpFuel.textContent = `FUEL: ${data.jumpFuelCost.toFixed(0)} units`;
        }
        if (data.chargeProgress !== undefined) {
            const pct = Math.floor(data.chargeProgress * 100);
            this.chargeBar.style.width = `${pct}%`;
            this.chargePct.textContent = `${pct}%`;
        }
    }
}
