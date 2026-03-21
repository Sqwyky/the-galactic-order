/**
 * THE GALACTIC ORDER — HUD Manager
 *
 * Role-aware HUD switcher. Listens to station:localChanged events
 * and swaps the active HUD overlay based on the player's current role.
 *
 * Each role has a dedicated HUD class inheriting from RoleHUD.
 * Only one HUD is visible at a time.
 */

import { eventBus } from '../../core/EventBus.js';
import { PilotHUD } from './PilotHUD.js';
import { GunnerHUD } from './GunnerHUD.js';
import { NavigatorHUD } from './NavigatorHUD.js';
import { EngineerHUD } from './EngineerHUD.js';
import { CaptainHUD } from './CaptainHUD.js';

const HUD_MAP = {
    pilot: PilotHUD,
    gunner: GunnerHUD,
    navigator: NavigatorHUD,
    engineer: EngineerHUD,
    captain: CaptainHUD,
};

export class HUDManager {
    constructor() {
        /** @type {Map<string, RoleHUD>} */
        this.huds = new Map();
        this.activeHUD = null;
        this.activeRole = null;

        // Create all HUDs (hidden)
        for (const [role, HUDClass] of Object.entries(HUD_MAP)) {
            const hud = new HUDClass();
            hud.hide();
            this.huds.set(role, hud);
        }

        // Listen for role changes
        this._unsubscribe = eventBus.on('station:localChanged', (data) => {
            if (data.seated) {
                this.switchTo(data.roleId);
            } else {
                this.hideAll();
            }
        });
    }

    /**
     * Switch to a specific role's HUD.
     * @param {string} roleId
     */
    switchTo(roleId) {
        // Hide current
        if (this.activeHUD) {
            this.activeHUD.hide();
        }

        // Show new
        const hud = this.huds.get(roleId);
        if (hud) {
            hud.show();
            this.activeHUD = hud;
            this.activeRole = roleId;
        }
    }

    /** Hide all HUDs. */
    hideAll() {
        for (const hud of this.huds.values()) {
            hud.hide();
        }
        this.activeHUD = null;
        this.activeRole = null;
    }

    /**
     * Update the active HUD.
     * @param {Object} data - Update data (role-specific)
     */
    update(data) {
        if (this.activeHUD) {
            this.activeHUD.update(data);
        }
    }

    /** Dispose all HUDs. */
    dispose() {
        if (this._unsubscribe) this._unsubscribe();
        for (const hud of this.huds.values()) {
            hud.dispose();
        }
        this.huds.clear();
    }
}
