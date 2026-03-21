/**
 * THE GALACTIC ORDER — Engineer HUD
 *
 * Ship management interface (FTL-inspired):
 *   - Power distribution bars (4 subsystems)
 *   - Per-subsystem health readouts
 *   - Ship schematic with damage color-coding
 *   - Repair action indicators
 */

import { RoleHUD } from './RoleHUD.js';

export class EngineerHUD extends RoleHUD {
    constructor() {
        super('engineer', 'ENGINEERING');
        this.badge.style.color = '#ffaa33';
        this.badge.style.borderColor = 'rgba(255, 170, 51, 0.3)';
        this._build();
    }

    _build() {
        // Power distribution (center-left)
        this.powerPanel = this._createPanel('left: 20px; top: 50%; transform: translateY(-50%);');
        this.powerPanel.style.color = '#ffaa33';
        this.powerPanel.style.borderColor = 'rgba(255, 170, 51, 0.2)';
        this.powerPanel.style.width = '180px';
        this.powerPanel.innerHTML = `
            <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 8px;">POWER DISTRIBUTION</div>
            <div id="eng-reactor" style="font-size: 10px; margin-bottom: 6px; opacity: 0.7;">REACTOR: 10/10</div>
            ${this._powerRow('ENG', 'engines', '↑↓: 1/2')}
            ${this._powerRow('WPN', 'weapons', '↑↓: 3/4')}
            ${this._powerRow('SHD', 'shields', '↑↓: 5/6')}
            ${this._powerRow('SNS', 'sensors', '↑↓: 7/8')}
        `;
        this.reactorEl = this.powerPanel.querySelector('#eng-reactor');

        // Component health (right side)
        this.healthPanel = this._createPanel('right: 20px; top: 50%; transform: translateY(-50%);');
        this.healthPanel.style.color = '#ffaa33';
        this.healthPanel.style.borderColor = 'rgba(255, 170, 51, 0.2)';
        this.healthPanel.style.width = '160px';
        this.healthPanel.innerHTML = `
            <div style="font-size: 10px; letter-spacing: 1px; margin-bottom: 8px;">SUBSYSTEM HEALTH</div>
            ${this._healthRow('ENGINES', 'engines')}
            ${this._healthRow('WEAPONS', 'weapons')}
            ${this._healthRow('SHIELDS', 'shields')}
            ${this._healthRow('COCKPIT', 'cockpit')}
            ${this._healthRow('CARGO', 'cargo')}
            <div style="margin-top: 10px; font-size: 10px; letter-spacing: 1px;">HULL INTEGRITY</div>
            <div style="width: 120px; height: 6px; background: rgba(255,170,51,0.15); margin-top: 4px; border: 1px solid rgba(255,170,51,0.3);">
                <div id="eng-hull-bar" style="height: 100%; background: #ffaa33; width: 100%; transition: width 0.2s;"></div>
            </div>
            <div id="eng-hull-pct" style="font-size: 10px; margin-top: 2px;">100%</div>
        `;
        this.hullBarEng = this.healthPanel.querySelector('#eng-hull-bar');
        this.hullPctEng = this.healthPanel.querySelector('#eng-hull-pct');

        // Repair hint (bottom center)
        this.repairHint = this._createPanel('bottom: 30px; left: 50%; transform: translateX(-50%);');
        this.repairHint.style.color = '#ffaa33';
        this.repairHint.style.borderColor = 'rgba(255, 170, 51, 0.2)';
        this.repairHint.innerHTML = `
            <span style="font-size: 10px; letter-spacing: 1px;">[R] REPAIR SELECTED &nbsp; [1-4] POWER PRESETS</span>
        `;
    }

    _powerRow(label, id, hint) {
        return `
            <div style="margin-bottom: 4px;">
                <span style="font-size: 11px; display: inline-block; width: 30px;">${label}</span>
                <span id="eng-power-${id}" style="font-size: 12px; letter-spacing: 2px;">██░░</span>
                <span style="font-size: 9px; opacity: 0.4; margin-left: 4px;">${hint}</span>
            </div>
        `;
    }

    _healthRow(label, id) {
        return `
            <div style="margin-bottom: 3px;">
                <span style="font-size: 10px; display: inline-block; width: 60px;">${label}</span>
                <span id="eng-health-${id}" style="font-size: 11px;">100%</span>
            </div>
        `;
    }

    update(data) {
        if (!this.visible) return;

        // Power allocation
        if (data.power) {
            for (const [sys, bars] of Object.entries(data.power)) {
                const el = this.powerPanel.querySelector(`#eng-power-${sys}`);
                if (el) {
                    el.textContent = '█'.repeat(bars) + '░'.repeat(4 - bars);
                }
            }
        }

        // Reactor status
        if (data.reactorUsed !== undefined && data.reactorMax !== undefined) {
            this.reactorEl.textContent = `REACTOR: ${data.reactorUsed}/${data.reactorMax}`;
        }

        // Component health
        if (data.components) {
            for (const [comp, health] of Object.entries(data.components)) {
                const el = this.healthPanel.querySelector(`#eng-health-${comp}`);
                if (el) {
                    const pct = Math.floor(health);
                    el.textContent = `${pct}%`;
                    el.style.color = pct > 70 ? '#00ff88' : pct > 30 ? '#ffaa33' : '#ff4444';
                }
            }
        }

        // Hull
        if (data.hull !== undefined) {
            const pct = Math.floor(data.hull * 100);
            this.hullBarEng.style.width = `${pct}%`;
            this.hullPctEng.textContent = `${pct}%`;
            this.hullBarEng.style.background = pct > 50 ? '#ffaa33' : pct > 25 ? '#ff6633' : '#ff3333';
        }
    }
}
