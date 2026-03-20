/**
 * THE GALACTIC ORDER - Planet Transition Framework
 *
 * Replaces the monolithic transitionToPlanet() function with a clean,
 * registry-based system. Each game system registers lifecycle hooks
 * (dispose, create, updateColors) and the transition orchestrates them
 * in the correct order.
 *
 * Usage:
 *   const transition = new PlanetTransition(scene, camera, { hashSeed, classifyRule, ... });
 *   transition.register('terrain', {
 *       dispose: () => terrainManager.dispose(),
 *       create: (planetData) => new TerrainManager(...),
 *       updateColors: (colors) => { ... },
 *   });
 *   transition.execute(newRule, newSeed);
 */

import { eventBus } from './EventBus.js';

export class PlanetTransition {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Camera} camera
     * @param {Object} config - Helper functions and references needed for planet identity computation
     * @param {Function} config.hashSeed
     * @param {Function} config.classifyRule
     * @param {Function} config.generatePlanetName
     * @param {Function} config.derivePlanetMood
     * @param {Function} config.derivePlanetFrequency
     * @param {Function} config.frequencyToNote
     */
    constructor(scene, camera, config) {
        this.scene = scene;
        this.camera = camera;
        this.config = config;

        /** @type {Map<string, {dispose?: Function, create?: Function, updateColors?: Function}>} */
        this._registry = new Map();
        /** @type {string[]} Registration order for deterministic iteration */
        this._order = [];
    }

    /**
     * Register a system with lifecycle hooks for planet transitions.
     * @param {string} name - Unique system name
     * @param {Object} hooks
     * @param {Function} [hooks.dispose] - Called to tear down the system (reverse order)
     * @param {Function} [hooks.create] - Called with planetData to recreate the system (registration order). May return the new system instance.
     * @param {Function} [hooks.updateColors] - Called with color data after all systems are created
     */
    register(name, hooks) {
        if (this._registry.has(name)) {
            console.warn(`[PlanetTransition] System "${name}" already registered, overwriting.`);
            // Remove from order to re-add at end
            const idx = this._order.indexOf(name);
            if (idx !== -1) this._order.splice(idx, 1);
        }
        this._registry.set(name, hooks);
        this._order.push(name);
    }

    /**
     * Compute planet identity from rule + seed.
     * Returns all derived planet characteristics in one object.
     * @param {number} rule
     * @param {number} seed
     * @returns {Object} planetData
     */
    computePlanetIdentity(rule, seed) {
        const { hashSeed, classifyRule, generatePlanetName, derivePlanetMood, derivePlanetFrequency, frequencyToNote } = this.config;

        const name = generatePlanetName(hashSeed(seed, 'planet', 0));
        const classification = classifyRule(rule);
        const mood = derivePlanetMood(rule, seed);
        const freq = derivePlanetFrequency(rule, seed);
        const note = frequencyToNote(freq.frequency);

        return {
            rule,
            seed,
            name,
            classification,
            mood,
            freq,
            note,
        };
    }

    /**
     * Execute a full planet transition.
     * @param {number} newRule - New CA rule number
     * @param {number} newSeed - New planet seed
     * @returns {Object} planetData - The computed planet identity
     */
    execute(newRule, newSeed) {
        // 1. Emit transition start
        eventBus.emit('planet:transition:start', { rule: newRule, seed: newSeed });

        // 2. Dispose all registered systems in REVERSE registration order
        for (let i = this._order.length - 1; i >= 0; i--) {
            const name = this._order[i];
            const hooks = this._registry.get(name);
            if (hooks && hooks.dispose) {
                hooks.dispose();
            }
        }

        // 3. Compute new planet identity
        const planetData = this.computePlanetIdentity(newRule, newSeed);

        // 4. Create all systems in registration order
        const results = {};
        for (const name of this._order) {
            const hooks = this._registry.get(name);
            if (hooks && hooks.create) {
                results[name] = hooks.create(planetData);
            }
        }

        // 5. Update colors on systems that need it
        const colors = {
            skyTopColor: planetData.mood.sky.topColor,
            skyBottomColor: planetData.mood.sky.bottomColor,
            fogColor: planetData.mood.sky.fogColor,
            sunColor: planetData.mood.sky.sunColor,
            fogDensity: planetData.mood.atmosphere.fogDensity,
            mood: planetData.mood,
        };
        for (const name of this._order) {
            const hooks = this._registry.get(name);
            if (hooks && hooks.updateColors) {
                hooks.updateColors(colors, planetData);
            }
        }

        // 6. Emit transition complete
        eventBus.emit('planet:transition:complete', {
            rule: newRule,
            seed: newSeed,
            name: planetData.name,
        });

        return planetData;
    }
}
