/**
 * THE GALACTIC ORDER — Crew Role Definitions
 *
 * Five crew roles with system authority mappings:
 *   Pilot     — controls flight, sees flight HUD
 *   Gunner    — controls weapons, gets turret camera
 *   Navigator — controls scanner + hyperspace, sees star map
 *   Engineer  — controls power + repairs, sees ship schematic
 *   Captain   — strategic overview, can issue waypoints
 */

export const ROLE_DEFINITIONS = {
    pilot: {
        id: 'pilot',
        name: 'Pilot',
        description: 'Controls ship flight and maneuvers',
        systems: ['flight', 'landing'],
        hudId: 'PilotHUD',
        minCrewForRole: 1,
        inputBindings: {
            primary: ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyR', 'KeyF', 'KeyQ', 'KeyE'],
            modifier: ['ShiftLeft'],
            mouse: true,
        },
        stationLabel: 'PILOT',
        stationColor: 0x33ff88,
    },

    gunner: {
        id: 'gunner',
        name: 'Gunner',
        description: 'Controls weapons and turret systems',
        systems: ['weapons'],
        hudId: 'GunnerHUD',
        minCrewForRole: 2,
        inputBindings: {
            primary: ['KeyG'],
            mouse: true,
            mouseButton: 0, // Left click to fire
        },
        stationLabel: 'WEAPONS',
        stationColor: 0xff3333,
    },

    navigator: {
        id: 'navigator',
        name: 'Navigator',
        description: 'Controls scanner and hyperspace navigation',
        systems: ['scanner', 'hyperspace'],
        hudId: 'NavigatorHUD',
        minCrewForRole: 2,
        inputBindings: {
            primary: ['KeyM', 'KeyN'],
            mouse: true,
        },
        stationLabel: 'NAVIGATION',
        stationColor: 0x3388ff,
    },

    engineer: {
        id: 'engineer',
        name: 'Engineer',
        description: 'Manages power distribution, shields, and repairs',
        systems: ['power', 'shields', 'repair'],
        hudId: 'EngineerHUD',
        minCrewForRole: 3,
        inputBindings: {
            primary: ['Digit1', 'Digit2', 'Digit3', 'Digit4'],
            mouse: true,
        },
        stationLabel: 'ENGINEERING',
        stationColor: 0xffaa33,
    },

    captain: {
        id: 'captain',
        name: 'Captain',
        description: 'Strategic overview and crew coordination',
        systems: ['comms', 'waypoints'],
        hudId: 'CaptainHUD',
        minCrewForRole: 4,
        inputBindings: {
            primary: ['KeyT', 'KeyY'],
            mouse: true,
        },
        stationLabel: 'COMMAND',
        stationColor: 0xffff33,
    },
};

/**
 * Get a role definition by ID.
 * @param {string} roleId
 * @returns {Object|null}
 */
export function getRoleDefinition(roleId) {
    return ROLE_DEFINITIONS[roleId] || null;
}

/**
 * Get all role IDs.
 * @returns {string[]}
 */
export function getAllRoleIds() {
    return Object.keys(ROLE_DEFINITIONS);
}
