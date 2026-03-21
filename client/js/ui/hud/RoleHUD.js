/**
 * THE GALACTIC ORDER — Base Role HUD
 *
 * Abstract base class for all role-specific HUD overlays.
 * Uses the existing green monospace terminal aesthetic.
 */

export class RoleHUD {
    /**
     * @param {string} roleId
     * @param {string} roleName
     */
    constructor(roleId, roleName) {
        this.roleId = roleId;
        this.roleName = roleName;
        this.visible = false;

        this.container = document.createElement('div');
        this.container.className = `role-hud role-hud-${roleId}`;
        this.container.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            pointer-events: none;
            z-index: 12;
            font-family: 'Courier New', monospace;
            opacity: 0;
            transition: opacity 0.4s;
        `;

        // Role indicator badge (top-left)
        this.badge = document.createElement('div');
        this.badge.style.cssText = `
            position: absolute;
            top: 12px; left: 12px;
            color: #00ff88;
            font-size: 11px;
            letter-spacing: 2px;
            text-transform: uppercase;
            background: rgba(0, 20, 10, 0.6);
            padding: 4px 10px;
            border: 1px solid rgba(0, 255, 136, 0.3);
        `;
        this.badge.textContent = roleName;
        this.container.appendChild(this.badge);

        document.body.appendChild(this.container);
    }

    /** Show this HUD. */
    show() {
        this.visible = true;
        this.container.style.opacity = '1';
    }

    /** Hide this HUD. */
    hide() {
        this.visible = false;
        this.container.style.opacity = '0';
    }

    /**
     * Update HUD with current data.
     * @param {Object} data
     */
    update(data) {
        // Override in subclasses
    }

    /** Dispose DOM elements. */
    dispose() {
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }

    /**
     * Helper: create a styled panel element.
     * @param {string} position - CSS position string
     * @returns {HTMLDivElement}
     */
    _createPanel(position) {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: absolute;
            ${position}
            color: #00ff88;
            font-size: 13px;
            background: rgba(0, 20, 10, 0.5);
            padding: 8px 12px;
            border: 1px solid rgba(0, 255, 136, 0.2);
        `;
        this.container.appendChild(panel);
        return panel;
    }
}
