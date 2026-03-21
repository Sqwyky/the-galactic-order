/**
 * THE GALACTIC ORDER - Ambience Manager
 *
 * Continuous environmental soundscapes synthesized from filtered noise:
 *
 *   Wind:      Filtered brownian noise, intensity from WeatherSystem
 *   Ocean:     Layered filtered noise with slow amplitude modulation
 *   Rain:      High-frequency filtered noise with drip impulses
 *   Storm:     Low rumble + occasional thunder cracks
 *   Creatures: Periodic chirps/calls derived from planet frequency
 *
 * All sounds are dynamically mixed based on player state:
 * altitude, proximity to ocean, weather, time of day.
 */

import { seededRandom } from '../generation/hashSeed.js';

// ============================================================
// AMBIENCE MANAGER
// ============================================================

export class AmbienceManager {
    /**
     * @param {AudioContext} ctx
     * @param {GainNode} output
     */
    constructor(ctx, output, sharedNoiseBuffer) {
        this.ctx = ctx;
        this.output = output;

        // Noise buffer (use shared if provided, otherwise create own)
        this._noiseBuffer = sharedNoiseBuffer || this._createNoiseBuffer(4.0);

        // ---- Wind ----
        this._windSource = null;
        this._windFilter = null;
        this._windGain = null;

        // ---- Ocean ----
        this._oceanSource = null;
        this._oceanFilter = null;
        this._oceanGain = null;
        this._oceanLfo = null;

        // ---- Rain ----
        this._rainSource = null;
        this._rainFilter = null;
        this._rainGain = null;

        // ---- Storm (thunder) ----
        this._thunderTimer = 0;
        this._thunderInterval = 8; // seconds between thunders

        // ---- Creature calls ----
        this._creatureTimer = 0;
        this._creatureInterval = 6;
        this._creatureFreq = 400;

        // Planet config
        this._hasOcean = false;
        this._planetRule = 0;
        this._rng = null;

        // Current state
        this._windTarget = 0;
        this._oceanTarget = 0;
        this._rainTarget = 0;
        this._started = false;
    }

    // ============================================================
    // PLANET CONFIGURATION
    // ============================================================

    setPlanet(options) {
        this._planetRule = options.rule || 0;
        this._hasOcean = options.archetype === 'oceanic' ||
                         options.archetype === 'temperate' ||
                         options.archetype === 'lush';
        this._rng = seededRandom(options.rule, options.seed || 0, 'ambience');

        // Creature call frequency derived from planet
        if (options.frequency) {
            const f = options.frequency.frequency;
            this._creatureFreq = f * (f < 8 ? 32 : f < 30 ? 8 : 4);
        }

        // Creature call interval varies by Wolfram class
        // Class 1: rare, Class 3: frequent
        const classIntervals = { 1: 15, 2: 8, 3: 4, 4: 6 };
        this._creatureInterval = classIntervals[options.mood?.band === 'gamma' ? 3 :
                                                 options.mood?.band === 'beta' ? 3 :
                                                 options.mood?.band === 'alpha' ? 2 :
                                                 options.mood?.band === 'theta' ? 4 : 1] || 8;

        // Restart ambience layers
        this._stopAll();
        this._startLayers();
    }

    // ============================================================
    // LAYER STARTUP
    // ============================================================

    _startLayers() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // ---- WIND (always present, volume varies) ----
        {
            const source = ctx.createBufferSource();
            source.buffer = this._noiseBuffer;
            source.loop = true;

            // Brownian noise approximation: lowpass at ~300 Hz
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(300, now);
            filter.Q.setValueAtTime(0.7, now);

            // Second filter for more shaping
            const filter2 = ctx.createBiquadFilter();
            filter2.type = 'bandpass';
            filter2.frequency.setValueAtTime(200, now);
            filter2.Q.setValueAtTime(1.5, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);

            source.connect(filter);
            filter.connect(filter2);
            filter2.connect(gain);
            gain.connect(this.output);
            source.start(now);

            this._windSource = source;
            this._windFilter = filter;
            this._windGain = gain;
        }

        // ---- OCEAN (layered filtered noise with LFO amplitude) ----
        if (this._hasOcean) {
            const source = ctx.createBufferSource();
            source.buffer = this._noiseBuffer;
            source.loop = true;

            // Ocean: bandpass around 150-400 Hz for "roar"
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(250, now);
            filter.Q.setValueAtTime(0.8, now);

            // LFO for wave rhythm (~0.15 Hz = ~7 second waves)
            const lfo = ctx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.setValueAtTime(0.15, now);
            const lfoGain = ctx.createGain();
            lfoGain.gain.setValueAtTime(0.08, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            lfo.connect(lfoGain);
            lfoGain.connect(gain.gain);

            source.connect(filter);
            filter.connect(gain);
            gain.connect(this.output);
            source.start(now);
            lfo.start(now);

            this._oceanSource = source;
            this._oceanFilter = filter;
            this._oceanGain = gain;
            this._oceanLfo = lfo;
        }

        // ---- RAIN (high-frequency noise, activated by weather) ----
        {
            const source = ctx.createBufferSource();
            source.buffer = this._noiseBuffer;
            source.loop = true;

            const filter = ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(2000, now);
            filter.Q.setValueAtTime(0.3, now);

            const filter2 = ctx.createBiquadFilter();
            filter2.type = 'lowpass';
            filter2.frequency.setValueAtTime(8000, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);

            source.connect(filter);
            filter.connect(filter2);
            filter2.connect(gain);
            gain.connect(this.output);
            source.start(now);

            this._rainSource = source;
            this._rainFilter = filter;
            this._rainGain = gain;
        }

        this._started = true;
    }

    // ============================================================
    // UPDATE
    // ============================================================

    update(dt, state) {
        if (!this._started || !state) return;

        const ctx = this.ctx;
        const now = ctx.currentTime;

        // ---- Wind intensity from weather ----
        const windStrength = state.windStrength || 0.1;
        const weatherWind = this._getWeatherWindMultiplier(state.weatherState);
        const targetWindVol = Math.min(0.25, windStrength * weatherWind * 0.5);

        if (this._windGain) {
            this._windGain.gain.setTargetAtTime(targetWindVol, now, 0.5);
            // Shift filter frequency with wind strength (higher wind = higher whistling)
            this._windFilter.frequency.setTargetAtTime(
                200 + windStrength * 600, now, 0.3
            );
        }

        // ---- Ocean proximity ----
        if (this._oceanGain && state.oceanLevel !== undefined) {
            const distToOcean = Math.abs((state.playerPos?.y || 0) - state.oceanLevel);
            // Louder near ocean level, silent far above
            const oceanVol = Math.max(0, 0.2 - distToOcean * 0.004);
            this._oceanGain.gain.setTargetAtTime(oceanVol, now, 0.8);
        }

        // ---- Rain ----
        if (this._rainGain) {
            const isRaining = state.weatherState === 'rain' || state.weatherState === 'storm';
            const rainVol = isRaining ? (state.weatherState === 'storm' ? 0.2 : 0.12) : 0;
            this._rainGain.gain.setTargetAtTime(rainVol, now, 1.0);
        }

        // ---- Thunder (during storms) ----
        if (state.weatherState === 'storm') {
            this._thunderTimer += dt;
            if (this._thunderTimer >= this._thunderInterval) {
                this._thunderTimer = 0;
                this._thunderInterval = 5 + Math.random() * 10; // Randomize next
                this._playThunder();
            }
        } else {
            this._thunderTimer = 0;
        }

        // ---- Creature calls (periodic ambient calls) ----
        this._creatureTimer += dt;
        if (this._creatureTimer >= this._creatureInterval) {
            this._creatureTimer = 0;
            this._creatureInterval = 4 + Math.random() * 8;
            this._playCreatureCall();
        }
    }

    // ============================================================
    // WEATHER HELPERS
    // ============================================================

    _getWeatherWindMultiplier(weatherState) {
        const map = {
            'clear': 1.0,
            'overcast': 1.5,
            'rain': 2.0,
            'storm': 3.0,
            'snow': 1.8,
            'fog': 0.5,
        };
        return map[weatherState] || 1.0;
    }

    // ============================================================
    // THUNDER
    // ============================================================

    _playThunder() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Low rumble oscillator
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(40, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 1.5);

        // Noise crack
        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(800, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(100, now + 1.0);

        // Envelope: sharp attack, long decay
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        // Random delay (0-0.5s) for distance feel
        const delay = Math.random() * 0.5;
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(0.35, now + delay + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 2.0);

        osc.connect(gain);
        noise.connect(noiseFilter);
        noiseFilter.connect(gain);
        gain.connect(this.output);

        osc.start(now + delay);
        osc.stop(now + delay + 2.5);
        noise.start(now + delay);
        noise.stop(now + delay + 2.0);
    }

    // ============================================================
    // CREATURE CALLS
    // ============================================================

    _playCreatureCall() {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const rng = this._rng || Math.random;

        // FM synthesis creature call
        const baseFreq = this._creatureFreq * (0.8 + rng() * 0.4);

        // Modulator
        const mod = ctx.createOscillator();
        mod.type = 'sine';
        mod.frequency.setValueAtTime(baseFreq * 1.5, now);

        const modGain = ctx.createGain();
        modGain.gain.setValueAtTime(baseFreq * 0.3, now);
        // Frequency sweep for organic sound
        modGain.gain.linearRampToValueAtTime(baseFreq * 0.1, now + 0.8);

        // Carrier
        const carrier = ctx.createOscillator();
        carrier.type = 'sine';
        carrier.frequency.setValueAtTime(baseFreq, now);
        // Pitch slide
        carrier.frequency.linearRampToValueAtTime(baseFreq * (0.7 + rng() * 0.6), now + 0.6);

        mod.connect(modGain);
        modGain.connect(carrier.frequency);

        // Envelope
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
        gain.gain.setValueAtTime(0.08, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        // Pan randomly left/right for spatial feel
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime((rng() - 0.5) * 1.6, now);

        carrier.connect(gain);
        gain.connect(panner);
        panner.connect(this.output);

        mod.start(now);
        carrier.start(now);
        mod.stop(now + 0.9);
        carrier.stop(now + 0.9);
    }

    // ============================================================
    // UTILITIES
    // ============================================================

    _createNoiseBuffer(duration) {
        const sampleRate = this.ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    // ============================================================
    // CLEANUP
    // ============================================================

    _stopAll() {
        const nodes = [
            this._windSource, this._oceanSource, this._oceanLfo,
            this._rainSource,
        ];
        for (const node of nodes) {
            if (node) {
                try { node.stop(); } catch (_) {}
            }
        }
        this._windSource = null;
        this._oceanSource = null;
        this._oceanLfo = null;
        this._rainSource = null;
        this._started = false;
    }

    dispose() {
        this._stopAll();
    }
}
