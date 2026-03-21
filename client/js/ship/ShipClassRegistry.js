/**
 * THE GALACTIC ORDER — Ship Class Registry
 *
 * Data-driven definitions for all 6 ship classes.
 * Each entry defines crew capacity, station layout, stats,
 * visual builder reference, and weapon hardpoints.
 *
 * Classes (inspired by Star Wars silhouettes + NMS modularity):
 *   Scout     — Whisper: 1 crew, fast sensor platform
 *   Fighter   — Voidmoth Mk-II: 1-2 crew, agile combat ship
 *   Hauler    — Ironbelly: 1-3 crew, heavy cargo transport
 *   Corvette  — Tempest: 2-4 crew, multi-role warship
 *   Frigate   — Leviathan: 3-5 crew, capital escort with hangar
 *   Capital   — Sovereign: 4-6 crew, fleet flagship
 */

// ============================================================
// CREW ROLES
// ============================================================

export const CREW_ROLES = {
    PILOT:     'pilot',
    GUNNER:    'gunner',
    NAVIGATOR: 'navigator',
    ENGINEER:  'engineer',
    CAPTAIN:   'captain',
};

// ============================================================
// SHIP CLASSES
// ============================================================

export const SHIP_CLASSES = {

    // ---- SCOUT: Whisper ----
    whisper: {
        id: 'whisper',
        name: 'Whisper',
        class: 'scout',
        tier: 'C',
        crew: { min: 1, max: 1 },
        stations: [CREW_ROLES.PILOT],
        hasWalkableInterior: false,
        stats: {
            hull: 60,
            shields: 30,
            speed: 100,
            maneuverability: 1.0,
            cargo: 10,
            fuelCapacity: 120,
            reactorOutput: 6,
        },
        thrusterOverrides: {
            main:    { force: 60.0, fuelRate: 0.8, spoolTime: 0.1 },
            retro:   { force: 50.0, fuelRate: 0.6, spoolTime: 0.08 },
            lateral: { force: 40.0, fuelRate: 0.4, spoolTime: 0.05 },
        },
        weaponSlots: [
            { type: 'fixed', position: [0, 0, 3], allowedWeapons: ['laser'] },
        ],
        visual: {
            builder: 'WhisperBuilder',
            scale: 1.2,
            defaultColors: { hull: 0x4a5a6e, accent: 0x3388bb, engine: 0x44eeff },
        },
    },

    // ---- FIGHTER: Voidmoth Mk-II ----
    voidmoth: {
        id: 'voidmoth',
        name: 'Voidmoth Mk-II',
        class: 'fighter',
        tier: 'B',
        crew: { min: 1, max: 2 },
        stations: [CREW_ROLES.PILOT, CREW_ROLES.GUNNER],
        hasWalkableInterior: false,
        stats: {
            hull: 100,
            shields: 50,
            speed: 80,
            maneuverability: 0.8,
            cargo: 20,
            fuelCapacity: 100,
            reactorOutput: 10,
        },
        thrusterOverrides: null, // Uses default THRUSTER_CONFIG
        weaponSlots: [
            { type: 'fixed', position: [0, 0, 3], allowedWeapons: ['laser', 'plasma'] },
            { type: 'turret', position: [0, 0.5, -1], allowedWeapons: ['laser', 'rocket'] },
        ],
        visual: {
            builder: 'VoidmothBuilder',
            scale: 1.5,
            defaultColors: { hull: 0x5a6577, accent: 0xb83232, engine: 0x33ddff },
        },
    },

    // ---- HAULER: Ironbelly ----
    ironbelly: {
        id: 'ironbelly',
        name: 'Ironbelly',
        class: 'hauler',
        tier: 'B',
        crew: { min: 1, max: 3 },
        stations: [CREW_ROLES.PILOT, CREW_ROLES.GUNNER, CREW_ROLES.ENGINEER],
        hasWalkableInterior: true,
        stats: {
            hull: 180,
            shields: 60,
            speed: 45,
            maneuverability: 0.4,
            cargo: 120,
            fuelCapacity: 150,
            reactorOutput: 12,
        },
        thrusterOverrides: {
            main:    { force: 35.0, fuelRate: 1.5, spoolTime: 0.3 },
            retro:   { force: 28.0, fuelRate: 1.2, spoolTime: 0.2 },
            lateral: { force: 20.0, fuelRate: 0.8, spoolTime: 0.15 },
        },
        weaponSlots: [
            { type: 'turret', position: [0, 1.0, 0], allowedWeapons: ['laser', 'rocket'] },
            { type: 'turret', position: [0, -0.5, -2], allowedWeapons: ['laser'] },
        ],
        visual: {
            builder: 'IronbellyBuilder',
            scale: 2.5,
            defaultColors: { hull: 0x6b5e4a, accent: 0xcc8833, engine: 0xffaa33 },
        },
    },

    // ---- CORVETTE: Tempest ----
    tempest: {
        id: 'tempest',
        name: 'Tempest',
        class: 'corvette',
        tier: 'A',
        crew: { min: 2, max: 4 },
        stations: [CREW_ROLES.PILOT, CREW_ROLES.GUNNER, CREW_ROLES.NAVIGATOR, CREW_ROLES.ENGINEER],
        hasWalkableInterior: true,
        stats: {
            hull: 250,
            shields: 120,
            speed: 55,
            maneuverability: 0.5,
            cargo: 60,
            fuelCapacity: 200,
            reactorOutput: 16,
        },
        thrusterOverrides: {
            main:    { force: 45.0, fuelRate: 1.8, spoolTime: 0.25 },
            retro:   { force: 35.0, fuelRate: 1.4, spoolTime: 0.15 },
            lateral: { force: 25.0, fuelRate: 1.0, spoolTime: 0.12 },
        },
        weaponSlots: [
            { type: 'fixed', position: [0, 0, 5], allowedWeapons: ['laser', 'plasma'] },
            { type: 'turret', position: [1.5, 0.8, 0], allowedWeapons: ['laser', 'rocket'] },
            { type: 'turret', position: [-1.5, 0.8, 0], allowedWeapons: ['laser', 'rocket'] },
        ],
        visual: {
            builder: 'TempestBuilder',
            scale: 3.0,
            defaultColors: { hull: 0x556677, accent: 0xdd4422, engine: 0x33ccff },
        },
    },

    // ---- FRIGATE: Leviathan ----
    leviathan: {
        id: 'leviathan',
        name: 'Leviathan',
        class: 'frigate',
        tier: 'A',
        crew: { min: 3, max: 5 },
        stations: [
            CREW_ROLES.PILOT, CREW_ROLES.GUNNER, CREW_ROLES.NAVIGATOR,
            CREW_ROLES.ENGINEER, CREW_ROLES.CAPTAIN,
        ],
        hasWalkableInterior: true,
        stats: {
            hull: 400,
            shields: 200,
            speed: 35,
            maneuverability: 0.3,
            cargo: 100,
            fuelCapacity: 300,
            reactorOutput: 20,
        },
        thrusterOverrides: {
            main:    { force: 40.0, fuelRate: 2.5, spoolTime: 0.35 },
            retro:   { force: 30.0, fuelRate: 2.0, spoolTime: 0.25 },
            lateral: { force: 18.0, fuelRate: 1.2, spoolTime: 0.2 },
        },
        weaponSlots: [
            { type: 'fixed', position: [0, 0, 7], allowedWeapons: ['laser', 'plasma'] },
            { type: 'turret', position: [2.0, 1.0, 2], allowedWeapons: ['laser', 'rocket'] },
            { type: 'turret', position: [-2.0, 1.0, 2], allowedWeapons: ['laser', 'rocket'] },
            { type: 'turret', position: [0, 1.5, -3], allowedWeapons: ['rocket'] },
        ],
        visual: {
            builder: 'LeviathanBuilder',
            scale: 5.0,
            defaultColors: { hull: 0x4a5566, accent: 0x2266cc, engine: 0x22bbff },
        },
    },

    // ---- CAPITAL: Sovereign ----
    sovereign: {
        id: 'sovereign',
        name: 'Sovereign',
        class: 'capital',
        tier: 'S',
        crew: { min: 4, max: 6 },
        stations: [
            CREW_ROLES.PILOT, CREW_ROLES.GUNNER, CREW_ROLES.NAVIGATOR,
            CREW_ROLES.ENGINEER, CREW_ROLES.CAPTAIN,
        ],
        hasWalkableInterior: true,
        stats: {
            hull: 600,
            shields: 350,
            speed: 25,
            maneuverability: 0.2,
            cargo: 250,
            fuelCapacity: 500,
            reactorOutput: 28,
        },
        thrusterOverrides: {
            main:    { force: 35.0, fuelRate: 3.5, spoolTime: 0.5 },
            retro:   { force: 25.0, fuelRate: 2.8, spoolTime: 0.35 },
            lateral: { force: 15.0, fuelRate: 1.5, spoolTime: 0.25 },
        },
        weaponSlots: [
            { type: 'fixed', position: [0, 0, 10], allowedWeapons: ['plasma'] },
            { type: 'turret', position: [3.0, 1.5, 3], allowedWeapons: ['laser', 'rocket'] },
            { type: 'turret', position: [-3.0, 1.5, 3], allowedWeapons: ['laser', 'rocket'] },
            { type: 'turret', position: [2.0, 2.0, -4], allowedWeapons: ['laser', 'rocket'] },
            { type: 'turret', position: [-2.0, 2.0, -4], allowedWeapons: ['laser', 'rocket'] },
            { type: 'turret', position: [0, -1.0, 0], allowedWeapons: ['rocket'] },
        ],
        visual: {
            builder: 'SovereignBuilder',
            scale: 8.0,
            defaultColors: { hull: 0x3a4455, accent: 0xaa2222, engine: 0x4488ff },
        },
    },
};

// ============================================================
// REGISTRY API
// ============================================================

/**
 * Get a ship class definition by ID.
 * @param {string} classId
 * @returns {Object|null}
 */
export function getShipClass(classId) {
    return SHIP_CLASSES[classId] || null;
}

/**
 * Get all ship class IDs.
 * @returns {string[]}
 */
export function getShipClassIds() {
    return Object.keys(SHIP_CLASSES);
}

/**
 * Get ship classes filtered by type.
 * @param {string} shipClass - 'scout', 'fighter', 'hauler', 'corvette', 'frigate', 'capital'
 * @returns {Object[]}
 */
export function getShipClassesByType(shipClass) {
    return Object.values(SHIP_CLASSES).filter(c => c.class === shipClass);
}
