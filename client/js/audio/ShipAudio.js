/**
 * THE GALACTIC ORDER - Ship Audio
 *
 * Procedural ship engine sounds using oscillators and filtered noise:
 *
 *   Idle:        Low-frequency hum (sawtooth + sub-bass)
 *   Thrust:      Noise burst layered on hum, pitch rises with throttle
 *   Afterburner: Intense high-pass noise + distortion overtones
 *   Hyperspace:  Rising sweep → white noise explosion → silence
 *
 * Engine pitch and volume track the ship's actual thrust level
 * from FlightController, creating a direct tactile connection
 * between input and audio feedback.
 */

// ============================================================
// SHIP AUDIO
// ============================================================

export class ShipAudio {
    /**
     * @param {AudioContext} ctx
     * @param {GainNode} output
     */
    constructor(ctx, output) {
        this.ctx = ctx;
        this.output = output;

        // Engine layers
        this._engineOsc = null;     // Sub-bass hum
        this._engineOsc2 = null;    // Harmonic layer
        this._thrustNoise = null;   // Thrust noise
        this._thrustFilter = null;
        this._engineGain = null;
        this._thrustGain = null;

        // Hyperspace
        this._hyperOsc = null;
        this._hyperGain = null;

        // State
        this._running = false;
        this._currentThrottle = 0;

        // Noise buffer
        this._noiseBuffer = this._createNoiseBuffer(3.0);
    }

    // ============================================================
    // START / STOP ENGINE
    // ============================================================

    start() {
        if (this._running) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // ---- Engine base hum (sub-bass sawtooth) ----
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(55, now); // A1 — deep hum

        // Filter to tame harmonics
        const engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.setValueAtTime(200, now);
        engineFilter.Q.setValueAtTime(2, now);

        const engineGain = ctx.createGain();
        engineGain.gain.setValueAtTime(0, now);
        engineGain.gain.linearRampToValueAtTime(0.15, now + 0.5);

        osc.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(this.output);
        osc.start(now);

        // ---- Harmonic layer (adds body) ----
        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(110, now); // A2

        const osc2Gain = ctx.createGain();
        osc2Gain.gain.setValueAtTime(0.06, now);

        osc2.connect(osc2Gain);
        osc2Gain.connect(engineGain);
        osc2.start(now);

        // ---- Thrust noise (filtered, volume tracks throttle) ----
        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;
        noise.loop = true;

        const thrustFilter = ctx.createBiquadFilter();
        thrustFilter.type = 'bandpass';
        thrustFilter.frequency.setValueAtTime(400, now);
        thrustFilter.Q.setValueAtTime(1.5, now);

        const thrustGain = ctx.createGain();
        thrustGain.gain.setValueAtTime(0, now);

        noise.connect(thrustFilter);
        thrustFilter.connect(thrustGain);
        thrustGain.connect(this.output);
        noise.start(now);

        this._engineOsc = osc;
        this._engineOsc2 = osc2;
        this._engineGain = engineGain;
        this._thrustNoise = noise;
        this._thrustFilter = thrustFilter;
        this._thrustGain = thrustGain;

        this._running = true;
    }

    stop() {
        if (!this._running) return;
        const now = this.ctx.currentTime;

        // Fade out
        if (this._engineGain) {
            this._engineGain.gain.cancelScheduledValues(now);
            this._engineGain.gain.setValueAtTime(this._engineGain.gain.value, now);
            this._engineGain.gain.linearRampToValueAtTime(0, now + 0.5);
        }
        if (this._thrustGain) {
            this._thrustGain.gain.cancelScheduledValues(now);
            this._thrustGain.gain.setValueAtTime(this._thrustGain.gain.value, now);
            this._thrustGain.gain.linearRampToValueAtTime(0, now + 0.3);
        }

        const stopTime = now + 0.6;
        const nodes = [this._engineOsc, this._engineOsc2, this._thrustNoise];
        for (const node of nodes) {
            if (node) try { node.stop(stopTime); } catch (_) {}
        }

        this._engineOsc = null;
        this._engineOsc2 = null;
        this._thrustNoise = null;
        this._engineGain = null;
        this._thrustGain = null;
        this._running = false;
    }

    // ============================================================
    // UPDATE
    // ============================================================

    /**
     * @param {number} dt
     * @param {Object} state
     * @param {number} [state.shipThrottle] - 0-1 throttle level
     * @param {boolean} [state.afterburner] - Afterburner active
     * @param {number} [state.shipSpeed] - Current speed
     */
    update(dt, state) {
        if (!this._running || !state) return;

        const now = this.ctx.currentTime;
        const throttle = state.shipThrottle || 0;
        const afterburner = state.afterburner || false;

        // Engine pitch follows throttle
        const basePitch = 55 + throttle * 40; // 55-95 Hz
        if (this._engineOsc) {
            this._engineOsc.frequency.setTargetAtTime(basePitch, now, 0.1);
        }
        if (this._engineOsc2) {
            this._engineOsc2.frequency.setTargetAtTime(basePitch * 2, now, 0.1);
        }

        // Thrust noise volume + filter follow throttle
        const thrustVol = throttle * (afterburner ? 0.25 : 0.12);
        if (this._thrustGain) {
            this._thrustGain.gain.setTargetAtTime(thrustVol, now, 0.08);
        }
        if (this._thrustFilter) {
            const filterFreq = 300 + throttle * 800 + (afterburner ? 1000 : 0);
            this._thrustFilter.frequency.setTargetAtTime(filterFreq, now, 0.1);
        }

        // Engine gain increases slightly with throttle
        if (this._engineGain) {
            const engVol = 0.12 + throttle * 0.08;
            this._engineGain.gain.setTargetAtTime(engVol, now, 0.2);
        }
    }

    // ============================================================
    // HYPERSPACE EFFECTS
    // ============================================================

    /**
     * Charge sound — rising pitch that follows charge progress.
     * @param {number} progress - 0 to 1
     */
    hyperspaceCharge(progress) {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        if (!this._hyperOsc) {
            // Create the charge oscillator on first call
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(100, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);

            osc.connect(gain);
            gain.connect(this.output);
            osc.start(now);

            this._hyperOsc = osc;
            this._hyperGain = gain;
        }

        // Rising pitch and volume with charge progress
        const freq = 100 + progress * progress * 1500; // Exponential rise
        this._hyperOsc.frequency.setTargetAtTime(freq, now, 0.05);
        this._hyperGain.gain.setTargetAtTime(progress * 0.3, now, 0.05);
    }

    /**
     * Jump sound — white noise explosion + sweep down.
     */
    hyperspaceJump() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Kill charge oscillator
        if (this._hyperOsc) {
            try { this._hyperOsc.stop(now + 0.05); } catch (_) {}
            this._hyperOsc = null;
            this._hyperGain = null;
        }

        // ---- White noise explosion ----
        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.5, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(8000, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + 1.5);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.output);
        noise.start(now);
        noise.stop(now + 1.6);

        // ---- Bass impact ----
        const impact = ctx.createOscillator();
        impact.type = 'sine';
        impact.frequency.setValueAtTime(60, now);
        impact.frequency.exponentialRampToValueAtTime(20, now + 0.8);

        const impactGain = ctx.createGain();
        impactGain.gain.setValueAtTime(0.4, now);
        impactGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

        impact.connect(impactGain);
        impactGain.connect(this.output);
        impact.start(now);
        impact.stop(now + 1.1);

        // ---- High sweep down ----
        const sweep = ctx.createOscillator();
        sweep.type = 'sawtooth';
        sweep.frequency.setValueAtTime(3000, now);
        sweep.frequency.exponentialRampToValueAtTime(50, now + 0.6);

        const sweepFilter = ctx.createBiquadFilter();
        sweepFilter.type = 'lowpass';
        sweepFilter.frequency.setValueAtTime(4000, now);
        sweepFilter.frequency.exponentialRampToValueAtTime(200, now + 0.5);

        const sweepGain = ctx.createGain();
        sweepGain.gain.setValueAtTime(0.2, now);
        sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        sweep.connect(sweepFilter);
        sweepFilter.connect(sweepGain);
        sweepGain.connect(this.output);
        sweep.start(now);
        sweep.stop(now + 0.7);
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

    dispose() {
        this.stop();
        if (this._hyperOsc) {
            try { this._hyperOsc.stop(); } catch (_) {}
        }
    }
}
