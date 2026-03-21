/**
 * THE GALACTIC ORDER - Audio System
 *
 * Core orchestrator for all game audio using Web Audio API.
 * No audio files — everything is procedurally synthesized from
 * the planet's CA rule and harmonic frequency.
 *
 * Architecture:
 *   AudioContext
 *     → masterGain (global volume)
 *       → ambienceGain → ProceduralSynth (ambient drone)
 *       → ambienceGain → AmbienceManager (wind, ocean, weather)
 *       → sfxGain → SFXManager (footsteps, mining, UI)
 *       → shipGain → ShipAudio (engines, hyperspace)
 *
 * The system auto-resumes AudioContext on first user interaction
 * (required by browser autoplay policy).
 *
 * Usage:
 *   const audio = new AudioSystem();
 *   audio.init();  // Call after first user click
 *   audio.setPlanet(rule, seed, mood);
 *   audio.update(dt, playerState);
 */

import { eventBus } from '../core/EventBus.js';
import { ProceduralSynth } from './ProceduralSynth.js';
import { SFXManager } from './SFXManager.js';
import { AmbienceManager } from './AmbienceManager.js';
import { ShipAudio } from './ShipAudio.js';

// ============================================================
// CONFIGURATION
// ============================================================

const AUDIO_CONFIG = {
    masterVolume: 0.7,
    ambienceVolume: 0.5,
    sfxVolume: 0.6,
    shipVolume: 0.5,
    fadeTime: 2.0,        // seconds for crossfade on planet change
};

// ============================================================
// AUDIO SYSTEM
// ============================================================

export class AudioSystem {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;

        // Gain nodes (routing)
        this.masterGain = null;
        this.ambienceGain = null;
        this.sfxGain = null;
        this.shipGain = null;

        // Sub-systems
        this.synth = null;
        this.sfx = null;
        this.ambience = null;
        this.shipAudio = null;

        // State
        this._initialized = false;
        this._resumed = false;
        this._currentPlanet = null;

        // Resume handler (browser autoplay policy)
        this._resumeHandler = this._resumeAudioContext.bind(this);
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================

    /**
     * Initialize the audio system.
     * Creates AudioContext and sub-systems.
     * Must be called once — the context will be resumed on first user gesture.
     */
    init() {
        if (this._initialized) return;

        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('[Audio] Web Audio API not supported:', e);
            return;
        }

        // Master gain → destination
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = AUDIO_CONFIG.masterVolume;
        this.masterGain.connect(this.ctx.destination);

        // Category gains → master
        this.ambienceGain = this.ctx.createGain();
        this.ambienceGain.gain.value = AUDIO_CONFIG.ambienceVolume;
        this.ambienceGain.connect(this.masterGain);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = AUDIO_CONFIG.sfxVolume;
        this.sfxGain.connect(this.masterGain);

        this.shipGain = this.ctx.createGain();
        this.shipGain.gain.value = AUDIO_CONFIG.shipVolume;
        this.shipGain.connect(this.masterGain);

        // Create sub-systems
        this.synth = new ProceduralSynth(this.ctx, this.ambienceGain);
        this.ambience = new AmbienceManager(this.ctx, this.ambienceGain);
        this.sfx = new SFXManager(this.ctx, this.sfxGain);
        this.shipAudio = new ShipAudio(this.ctx, this.shipGain);

        // Listen for browser autoplay resume
        document.addEventListener('click', this._resumeHandler, { once: true });
        document.addEventListener('keydown', this._resumeHandler, { once: true });

        // EventBus integration
        eventBus.on('phase:change', (data) => this._onPhaseChange(data));

        this._initialized = true;
        console.log('[Audio] System initialized');
    }

    /**
     * Resume AudioContext on first user gesture (browser autoplay policy).
     */
    _resumeAudioContext() {
        if (!this.ctx || this._resumed) return;

        if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                this._resumed = true;
                console.log('[Audio] Context resumed');
            });
        } else {
            this._resumed = true;
        }
    }

    // ============================================================
    // PLANET CONFIGURATION
    // ============================================================

    /**
     * Configure audio for a new planet.
     * Crossfades the ambient drone and reconfigures all sub-systems.
     *
     * @param {Object} options
     * @param {number} options.rule - CA rule number (0-255)
     * @param {number} options.seed - Planet seed
     * @param {Object} options.mood - From derivePlanetMood()
     * @param {Object} options.frequency - From derivePlanetFrequency()
     * @param {string} options.archetype - Planet archetype (e.g. 'oceanic', 'volcanic')
     */
    setPlanet(options) {
        if (!this._initialized) return;

        this._currentPlanet = options;

        // Crossfade ambient drone
        const fadeTime = AUDIO_CONFIG.fadeTime;
        this.synth.setPlanet(options.rule, options.seed, options.frequency, fadeTime);
        this.ambience.setPlanet(options);
        this.sfx.setPlanet(options);
    }

    // ============================================================
    // FRAME UPDATE
    // ============================================================

    /**
     * Update audio every frame.
     * @param {number} dt - Delta time in seconds
     * @param {Object} state - Current game state
     * @param {Object} state.playerPos - THREE.Vector3 player position
     * @param {boolean} state.isGrounded - Is player on ground
     * @param {boolean} state.isMoving - Is player walking/running
     * @param {boolean} state.isSprinting - Is player sprinting
     * @param {boolean} state.isMining - Is mining beam active
     * @param {number} state.miningHeat - Current mining heat (0-1)
     * @param {string} state.weatherState - Current weather ('clear', 'rain', etc.)
     * @param {number} state.windStrength - Wind strength (0-1)
     * @param {number} state.altitude - Altitude above ground
     * @param {number} state.oceanLevel - Ocean surface height
     */
    update(dt, state) {
        if (!this._initialized || !this._resumed) return;

        this.synth.update(dt);
        this.ambience.update(dt, state);
        this.sfx.update(dt, state);
        this.shipAudio.update(dt, state);
    }

    // ============================================================
    // PHASE TRANSITIONS
    // ============================================================

    _onPhaseChange({ from, to }) {
        if (!this._initialized) return;

        if (to === 'SURFACE') {
            // Fade in ambience, fade out ship
            this._fadeGain(this.ambienceGain, AUDIO_CONFIG.ambienceVolume, 1.5);
            this._fadeGain(this.sfxGain, AUDIO_CONFIG.sfxVolume, 0.5);
            this._fadeGain(this.shipGain, 0, 1.0);
            this.shipAudio.stop();
        } else if (to === 'FLIGHT') {
            // Fade in ship, reduce ambience
            this._fadeGain(this.shipGain, AUDIO_CONFIG.shipVolume, 0.5);
            this._fadeGain(this.ambienceGain, AUDIO_CONFIG.ambienceVolume * 0.3, 1.5);
            this._fadeGain(this.sfxGain, AUDIO_CONFIG.sfxVolume * 0.3, 0.5);
            this.shipAudio.start();
        } else if (to === 'DESCENT') {
            // Atmospheric entry — rumble + wind
            this._fadeGain(this.ambienceGain, AUDIO_CONFIG.ambienceVolume * 0.5, 2.0);
            this._fadeGain(this.shipGain, 0, 0.5);
        }
    }

    /**
     * Smoothly fade a gain node to a target value.
     */
    _fadeGain(gainNode, targetValue, duration) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(targetValue, now + duration);
    }

    // ============================================================
    // ONE-SHOT TRIGGERS (called by game systems)
    // ============================================================

    /** Play a footstep sound */
    footstep(biome, isSprinting) {
        if (this.sfx) this.sfx.footstep(biome, isSprinting);
    }

    /** Play mining beam start/stop */
    miningStart() { if (this.sfx) this.sfx.miningStart(); }
    miningStop() { if (this.sfx) this.sfx.miningStop(); }

    /** Play resource collection ping */
    resourceCollected(element) { if (this.sfx) this.sfx.resourceCollected(element); }

    /** Play rock/flora destruction */
    destruction() { if (this.sfx) this.sfx.destruction(); }

    /** Play hyperspace charge and jump */
    hyperspaceCharge(progress) { if (this.shipAudio) this.shipAudio.hyperspaceCharge(progress); }
    hyperspaceJump() { if (this.shipAudio) this.shipAudio.hyperspaceJump(); }

    /** Play scanner pulse */
    scannerPulse() { if (this.sfx) this.sfx.scannerPulse(); }

    // ============================================================
    // VOLUME CONTROLS
    // ============================================================

    setMasterVolume(v) {
        if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v));
    }
    setAmbienceVolume(v) {
        if (this.ambienceGain) this.ambienceGain.gain.value = Math.max(0, Math.min(1, v));
    }
    setSFXVolume(v) {
        if (this.sfxGain) this.sfxGain.gain.value = Math.max(0, Math.min(1, v));
    }

    // ============================================================
    // CLEANUP
    // ============================================================

    dispose() {
        if (this.synth) this.synth.dispose();
        if (this.ambience) this.ambience.dispose();
        if (this.sfx) this.sfx.dispose();
        if (this.shipAudio) this.shipAudio.dispose();

        if (this.ctx && this.ctx.state !== 'closed') {
            this.ctx.close();
        }

        document.removeEventListener('click', this._resumeHandler);
        document.removeEventListener('keydown', this._resumeHandler);

        this._initialized = false;
        console.log('[Audio] System disposed');
    }
}
