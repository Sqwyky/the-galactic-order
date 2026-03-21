/**
 * THE GALACTIC ORDER - Procedural Synthesizer
 *
 * Generates an ambient drone/pad unique to each planet using the
 * harmonic resonance system's frequency derivation.
 *
 * The drone is built from:
 *   1. A sub-bass fundamental (planet's f₀, shifted up to audible range)
 *   2. Two detuned oscillators at the first overtones
 *   3. Filtered noise layer for texture
 *   4. Slow LFO modulation for organic movement
 *
 * The result is a living, breathing ambient pad that makes each
 * planet sound unique — derived directly from its CA rule.
 *
 * Wolfram class → sonic character:
 *   Class 1 (Dead/Uniform):  Deep, sparse, hollow sine tones
 *   Class 2 (Periodic):      Warm, steady, structured pads
 *   Class 3 (Chaotic):       Noisy, aggressive, unstable textures
 *   Class 4 (Complex):       Rich, evolving, shimmering harmonics
 */

import { classifyRule } from '../generation/cellularAutomata.js';
import { seededRandom } from '../generation/hashSeed.js';

// ============================================================
// PROCEDURAL SYNTH
// ============================================================

export class ProceduralSynth {
    /**
     * @param {AudioContext} ctx
     * @param {GainNode} output - Where to connect (ambienceGain)
     */
    constructor(ctx, output) {
        this.ctx = ctx;
        this.output = output;

        // Active oscillators and nodes
        this._oscillators = [];
        this._noiseSource = null;
        this._lfo = null;
        this._droneGain = null;

        // State
        this._active = false;
        this._currentFreq = null;
    }

    // ============================================================
    // PLANET CONFIGURATION
    // ============================================================

    /**
     * Set up the drone for a new planet.
     * Crossfades from old drone to new one.
     *
     * @param {number} rule - CA rule (0-255)
     * @param {number} seed - Planet seed
     * @param {Object} freqData - From derivePlanetFrequency()
     * @param {number} fadeTime - Crossfade duration
     */
    setPlanet(rule, seed, freqData, fadeTime = 2.0) {
        // Fade out existing drone
        this._fadeOutAndStop(fadeTime * 0.8);

        // Schedule new drone after brief overlap
        setTimeout(() => {
            this._buildDrone(rule, seed, freqData, fadeTime);
        }, fadeTime * 400); // ms
    }

    /**
     * Build the drone oscillator stack for this planet.
     */
    _buildDrone(rule, seed, freqData, fadeTime) {
        const ctx = this.ctx;
        const rng = seededRandom(rule, seed, 'synth');
        const cls = classifyRule(rule);
        const now = ctx.currentTime;

        // Planet frequency is in brainwave range (0.5-100 Hz).
        // Shift up to audible range: multiply to get into 40-200 Hz territory
        const baseFreq = freqData.frequency;
        const audibleBase = baseFreq * (baseFreq < 8 ? 16 : baseFreq < 30 ? 4 : 2);

        // Drone master gain (for this drone instance)
        const droneGain = ctx.createGain();
        droneGain.gain.setValueAtTime(0, now);
        droneGain.gain.linearRampToValueAtTime(0.25, now + fadeTime);
        droneGain.connect(this.output);
        this._droneGain = droneGain;

        // ---- Oscillator configuration by Wolfram class ----
        const classConfig = {
            1: { // Dead/Uniform — sparse, hollow
                waveType: 'sine',
                oscCount: 2,
                detune: 0.5,    // Hz
                noiseLevel: 0.02,
                filterFreq: 300,
                filterQ: 1.0,
                lfoRate: 0.05,  // Very slow
                lfoDepth: 3,    // Hz
            },
            2: { // Periodic — warm, structured
                waveType: 'triangle',
                oscCount: 3,
                detune: 1.5,
                noiseLevel: 0.04,
                filterFreq: 600,
                filterQ: 2.0,
                lfoRate: 0.12,
                lfoDepth: 5,
            },
            3: { // Chaotic — noisy, aggressive
                waveType: 'sawtooth',
                oscCount: 4,
                detune: 4.0,
                noiseLevel: 0.12,
                filterFreq: 1200,
                filterQ: 4.0,
                lfoRate: 0.3,
                lfoDepth: 12,
            },
            4: { // Complex — rich, shimmering
                waveType: 'triangle',
                oscCount: 4,
                detune: 2.0,
                noiseLevel: 0.06,
                filterFreq: 900,
                filterQ: 3.0,
                lfoRate: 0.08,
                lfoDepth: 8,
            },
        };

        const config = classConfig[cls.class] || classConfig[2];

        // ---- Create oscillators ----
        this._oscillators = [];
        for (let i = 0; i < config.oscCount; i++) {
            const osc = ctx.createOscillator();
            const oscGain = ctx.createGain();

            // Each oscillator at a different harmonic/detuning
            let freq;
            if (i === 0) {
                freq = audibleBase;
            } else if (i === 1) {
                freq = audibleBase * (freqData.overtones[0] / freqData.frequency);
            } else if (i === 2) {
                freq = audibleBase * 1.5 + (rng() - 0.5) * config.detune;
            } else {
                freq = audibleBase * 2.0 + (rng() - 0.5) * config.detune * 2;
            }

            osc.type = config.waveType;
            osc.frequency.setValueAtTime(freq, now);
            // Add seed-based detuning for uniqueness
            osc.detune.setValueAtTime((rng() - 0.5) * config.detune * 100, now);

            // Reduce volume for higher harmonics
            const vol = i === 0 ? 0.4 : 0.2 / i;
            oscGain.gain.setValueAtTime(vol, now);

            osc.connect(oscGain);
            oscGain.connect(droneGain);
            osc.start(now);

            this._oscillators.push({ osc, gain: oscGain });
        }

        // ---- Filtered noise layer ----
        if (config.noiseLevel > 0) {
            const noiseBuffer = this._createNoiseBuffer(2.0);
            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = noiseBuffer;
            noiseSource.loop = true;

            const noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(config.filterFreq, now);
            noiseFilter.Q.setValueAtTime(config.filterQ, now);

            const noiseGain = ctx.createGain();
            noiseGain.gain.setValueAtTime(config.noiseLevel, now);

            noiseSource.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(droneGain);
            noiseSource.start(now);

            this._noiseSource = { source: noiseSource, filter: noiseFilter, gain: noiseGain };
        }

        // ---- LFO for organic movement ----
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(config.lfoRate, now);
        lfoGain.gain.setValueAtTime(config.lfoDepth, now);

        lfo.connect(lfoGain);
        // Modulate the fundamental oscillator's frequency
        if (this._oscillators.length > 0) {
            lfoGain.connect(this._oscillators[0].osc.frequency);
        }
        lfo.start(now);
        this._lfo = { osc: lfo, gain: lfoGain };

        this._active = true;
        this._currentFreq = audibleBase;
    }

    /**
     * Create a noise buffer for the noise layer.
     */
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
    // UPDATE
    // ============================================================

    update(dt) {
        // The drone runs autonomously via Web Audio scheduling.
        // This method is available for future dynamic modulation.
    }

    // ============================================================
    // CLEANUP
    // ============================================================

    _fadeOutAndStop(duration) {
        if (!this._active) return;
        const now = this.ctx.currentTime;

        // Fade out drone gain
        if (this._droneGain) {
            this._droneGain.gain.cancelScheduledValues(now);
            this._droneGain.gain.setValueAtTime(this._droneGain.gain.value, now);
            this._droneGain.gain.linearRampToValueAtTime(0, now + duration);
        }

        // Schedule stop after fade
        const stopTime = now + duration + 0.1;
        for (const { osc } of this._oscillators) {
            try { osc.stop(stopTime); } catch (_) { /* already stopped */ }
        }
        if (this._noiseSource) {
            try { this._noiseSource.source.stop(stopTime); } catch (_) {}
        }
        if (this._lfo) {
            try { this._lfo.osc.stop(stopTime); } catch (_) {}
        }

        this._oscillators = [];
        this._noiseSource = null;
        this._lfo = null;
        this._active = false;
    }

    dispose() {
        this._fadeOutAndStop(0.1);
        this._droneGain = null;
    }
}
