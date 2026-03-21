/**
 * THE GALACTIC ORDER — Ship Model (Orchestrator)
 *
 * Thin wrapper that delegates to class-specific procedural builders
 * for geometry construction and uses PBR materials from ShipMaterials.
 *
 * Supports all 6 ship classes via the ShipClassRegistry.
 * Maintains the same public API as the original monolithic ShipModel
 * for backwards compatibility with FlightController, WeaponSystem, etc.
 *
 * New capabilities:
 *   - PBR materials with procedural panel-line normal maps
 *   - Engine particle effects (EngineEffects)
 *   - Hexagonal shield effect (ShieldEffect)
 *   - Ship class data (crew stations, weapon hardpoints, stats)
 */

import * as THREE from 'three';
import { createShipMaterials, disposeShipMaterials } from './ShipMaterials.js';
import { getShipClass } from './ShipClassRegistry.js';
import { EngineEffects } from './EngineEffects.js';
import { ShieldEffect } from './ShieldEffect.js';

// Builder imports — lazy map to avoid circular deps
const BUILDERS = {};

async function getBuilder(builderName) {
    if (BUILDERS[builderName]) return BUILDERS[builderName];

    const modules = {
        VoidmothBuilder:  () => import('./builders/VoidmothBuilder.js'),
        WhisperBuilder:   () => import('./builders/WhisperBuilder.js'),
        IronbellyBuilder: () => import('./builders/IronbellyBuilder.js'),
        TempestBuilder:   () => import('./builders/TempestBuilder.js'),
        LeviathanBuilder: () => import('./builders/LeviathanBuilder.js'),
        SovereignBuilder: () => import('./builders/SovereignBuilder.js'),
    };

    if (!modules[builderName]) {
        console.warn(`Unknown builder: ${builderName}, falling back to VoidmothBuilder`);
        const mod = await modules.VoidmothBuilder();
        BUILDERS[builderName] = mod.VoidmothBuilder;
        return BUILDERS[builderName];
    }

    const mod = await modules[builderName]();
    BUILDERS[builderName] = mod[builderName];
    return BUILDERS[builderName];
}

// Synchronous builder registry for ships that are created synchronously
import { VoidmothBuilder } from './builders/VoidmothBuilder.js';
const SYNC_BUILDERS = {
    VoidmothBuilder,
};

// ============================================================
// SHIP MODEL
// ============================================================

export class ShipModel {
    /**
     * @param {Object} opts
     * @param {string}            [opts.classId='voidmoth']  Ship class from registry
     * @param {THREE.Color|number} [opts.hullColor]          Main hull plating
     * @param {THREE.Color|number} [opts.accentColor]        Wing / trim accents
     * @param {THREE.Color|number} [opts.engineColor]        Engine glow tint
     * @param {Object}            [opts.qualitySettings]     Performance tier settings
     */
    constructor(opts = {}) {
        this.classId = opts.classId || 'voidmoth';
        this.classData = getShipClass(this.classId);

        // Colors: use class defaults if not specified
        const defaults = this.classData?.visual?.defaultColors || {};
        this.hullColor   = new THREE.Color(opts.hullColor   ?? defaults.hull   ?? 0x5a6577);
        this.accentColor = new THREE.Color(opts.accentColor ?? defaults.accent ?? 0xb83232);
        this.engineColor = new THREE.Color(opts.engineColor ?? defaults.engine ?? 0x33ddff);

        this.group        = new THREE.Group();
        this.engineGlows  = [];
        this.runningLights = [];
        this.landingGear  = null;

        // New systems
        this.engineEffects = null;
        this.shieldEffect  = null;
        this.builder       = null;
        this._materials    = null;

        // Quality settings
        this._qualitySettings = opts.qualitySettings || {};

        this._build();
    }

    _build() {
        // Create PBR materials
        this._materials = createShipMaterials({
            hullColor: this.hullColor,
            accentColor: this.accentColor,
            engineColor: this.engineColor,
            usePanelNormals: this._qualitySettings.shipPanelNormalMaps !== false,
        });

        // Get builder class
        const builderName = this.classData?.visual?.builder || 'VoidmothBuilder';
        const BuilderClass = SYNC_BUILDERS[builderName];

        if (!BuilderClass) {
            // Fallback: load async, use Voidmoth immediately
            console.warn(`Builder ${builderName} not loaded synchronously, using VoidmothBuilder`);
            this.builder = new VoidmothBuilder();
        } else {
            this.builder = new BuilderClass();
        }

        // Build geometry
        this.builder.build(this._materials);

        // Transfer references for backwards compat
        this.engineGlows = this.builder.engineGlows;
        this.runningLights = this.builder.runningLights;
        this.landingGear = this.builder.landingGear;

        // Add hull to group
        this.group.add(this.builder.hull);

        // Scale the whole ship per class
        const scale = this.classData?.visual?.scale || 1.5;
        this.group.scale.setScalar(scale);

        // Create engine effects
        if (this.builder.enginePositions.length > 0) {
            this.engineEffects = new EngineEffects(
                this.builder.hull,
                this.builder.enginePositions,
                this.engineColor,
                this._qualitySettings
            );
        }

        // Create shield effect
        const shieldRadius = this.builder.getBoundingRadius();
        this.shieldEffect = new ShieldEffect(
            this.builder.hull,
            shieldRadius,
            0x33aaff
        );
        this.shieldEffect.setQuality(this._qualitySettings.shipShieldDetail || 'high');
    }

    // ============================================================
    // PUBLIC API (backwards compatible)
    // ============================================================

    /**
     * Animate engine glow based on thrust level.
     * @param {number} thrust 0–1
     * @param {number} time   elapsed seconds (for pulse)
     * @param {boolean} [afterburner=false]
     */
    updateEngines(thrust, time, afterburner = false) {
        // Legacy glow disc animation
        for (let i = 0; i < this.engineGlows.length; i++) {
            const glow = this.engineGlows[i];
            const isCore = i % 2 === 1;
            const pulse = 0.7 + Math.sin(time * 12 + i * 0.5) * 0.15;
            const intensity = thrust * pulse;
            glow.material.opacity = (isCore ? 0.4 : 0.25) + intensity * 0.6;
            glow.scale.setScalar((isCore ? 0.6 : 0.8) + intensity * 0.5);
        }

        // New engine effects
        if (this.engineEffects) {
            this.engineEffects.update(thrust, 1 / 60, time, afterburner);
        }
    }

    /**
     * Update shield effect.
     * @param {number} dt - Delta time
     * @param {number} time - Elapsed time
     * @param {number} [shieldStrength=1.0] - Shield HP ratio 0-1
     */
    updateShield(dt, time, shieldStrength = 1.0) {
        if (this.shieldEffect) {
            this.shieldEffect.update(dt, time, shieldStrength);
        }
    }

    /**
     * Register a shield hit.
     * @param {THREE.Vector3} worldPoint
     * @param {number} [intensity=1.0]
     */
    shieldHit(worldPoint, intensity = 1.0) {
        if (this.shieldEffect) {
            this.shieldEffect.hit(worldPoint, intensity);
        }
    }

    /** Show / hide landing gear. */
    setLandingGear(deployed) {
        if (this.landingGear) this.landingGear.visible = deployed;
    }

    /** Add ship group to a Three.js scene. */
    addToScene(scene) { scene.add(this.group); }

    /** Remove ship group from scene. */
    removeFromScene(scene) { scene.remove(this.group); }

    // ============================================================
    // NEW API
    // ============================================================

    /** Get weapon hardpoint definitions from class data. */
    getHardpoints() {
        return this.classData?.weaponSlots || [];
    }

    /** Get station positions from builder. */
    getStationPositions() {
        return this.builder?.stationPositions || [];
    }

    /** Get crew capacity from class data. */
    getCrewCapacity() {
        return this.classData?.crew || { min: 1, max: 1 };
    }

    /** Get ship class stats. */
    getStats() {
        return this.classData?.stats || {};
    }

    /** Whether this ship has a walkable interior. */
    hasWalkableInterior() {
        return this.classData?.hasWalkableInterior || false;
    }

    /**
     * Set quality tier settings.
     * @param {Object} settings
     */
    setQuality(settings) {
        this._qualitySettings = settings;
        if (this.engineEffects) this.engineEffects.setQuality(settings);
        if (this.shieldEffect) this.shieldEffect.setQuality(settings.shipShieldDetail || 'high');
    }

    /** Dispose all geometry, materials, and effects. */
    dispose() {
        if (this.engineEffects) this.engineEffects.dispose();
        if (this.shieldEffect) this.shieldEffect.dispose();

        this.group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material !== this._materials?.hull &&
                    child.material !== this._materials?.hullDark) {
                    // Don't double-dispose shared materials
                }
                child.material.dispose();
            }
        });

        if (this._materials) disposeShipMaterials(this._materials);
    }
}
