/**
 * THE GALACTIC ORDER - SFX Manager
 *
 * Procedurally synthesized sound effects — no audio files needed.
 * Every sound is generated in real-time from oscillators, noise,
 * and envelopes.
 *
 * Sound effects:
 *   - Footsteps:  Filtered noise bursts, character varies by biome
 *   - Mining beam: Resonant buzz tied to planet frequency
 *   - Destruction: Impact burst + crumble
 *   - Resource collected: Musical ping (harmonic of planet f₀)
 *   - Scanner pulse: Rising sweep
 *   - UI sounds:  Simple tones
 */

// ============================================================
// BIOME SOUND PROFILES
// ============================================================

const BIOME_FOOTSTEP = {
    // filterFreq, filterQ, volume, duration, noiseCharacter
    'deep_ocean':  { freq: 200, q: 1,  vol: 0.15, dur: 0.12, type: 'lowpass' },
    'ocean':       { freq: 250, q: 1,  vol: 0.15, dur: 0.12, type: 'lowpass' },
    'beach':       { freq: 3000, q: 0.5, vol: 0.2, dur: 0.08, type: 'highpass' },  // Crunchy sand
    'desert':      { freq: 2500, q: 0.8, vol: 0.18, dur: 0.07, type: 'highpass' }, // Dry sand
    'savanna':     { freq: 800, q: 2,  vol: 0.12, dur: 0.10, type: 'bandpass' },   // Dry grass
    'grassland':   { freq: 600, q: 2,  vol: 0.10, dur: 0.10, type: 'bandpass' },   // Soft grass
    'forest':      { freq: 500, q: 3,  vol: 0.14, dur: 0.11, type: 'bandpass' },   // Leaves/twigs
    'dense_forest':{ freq: 400, q: 3,  vol: 0.14, dur: 0.12, type: 'bandpass' },
    'swamp':       { freq: 300, q: 1,  vol: 0.18, dur: 0.15, type: 'lowpass' },    // Wet squelch
    'mountain':    { freq: 2000, q: 1, vol: 0.22, dur: 0.06, type: 'highpass' },   // Hard rock
    'snow_peak':   { freq: 4000, q: 0.3, vol: 0.08, dur: 0.09, type: 'highpass' }, // Crunchy snow
    'ice':         { freq: 5000, q: 0.5, vol: 0.12, dur: 0.05, type: 'highpass' }, // Hard ice
};

const DEFAULT_FOOTSTEP = { freq: 800, q: 2, vol: 0.12, dur: 0.10, type: 'bandpass' };

// ============================================================
// SFX MANAGER
// ============================================================

export class SFXManager {
    /**
     * @param {AudioContext} ctx
     * @param {GainNode} output
     */
    constructor(ctx, output, sharedNoiseBuffer) {
        this.ctx = ctx;
        this.output = output;

        // Planet-specific tuning
        this._planetFreq = 440;
        this._planetRule = 0;

        // Footstep timing
        this._footstepTimer = 0;
        this._footstepInterval = 0.45; // seconds between footsteps
        this._sprintInterval = 0.30;

        // Mining beam state
        this._miningOsc = null;
        this._miningGain = null;
        this._isMining = false;

        // Reusable noise buffer (use shared if provided)
        this._noiseBuffer = sharedNoiseBuffer || this._createNoiseBuffer(0.3);
    }

    // ============================================================
    // PLANET CONFIGURATION
    // ============================================================

    setPlanet(options) {
        if (options.frequency) {
            // Shift to audible range
            const f = options.frequency.frequency;
            this._planetFreq = f * (f < 8 ? 16 : f < 30 ? 4 : 2);
        }
        this._planetRule = options.rule || 0;
    }

    // ============================================================
    // FOOTSTEPS
    // ============================================================

    /**
     * Play a single footstep sound.
     * @param {string} biome - Current biome name
     * @param {boolean} isSprinting
     */
    footstep(biome, isSprinting) {
        const ctx = this.ctx;
        const now = ctx.currentTime;
        const profile = BIOME_FOOTSTEP[biome] || DEFAULT_FOOTSTEP;

        // Create noise burst
        const source = ctx.createBufferSource();
        source.buffer = this._noiseBuffer;

        // Filter for biome character
        const filter = ctx.createBiquadFilter();
        filter.type = profile.type;
        filter.frequency.setValueAtTime(profile.freq, now);
        filter.Q.setValueAtTime(profile.q, now);

        // Envelope
        const gain = ctx.createGain();
        const vol = isSprinting ? profile.vol * 1.3 : profile.vol;
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + profile.dur);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.output);

        source.start(now);
        source.stop(now + profile.dur + 0.01);
    }

    // ============================================================
    // MINING BEAM
    // ============================================================

    miningStart() {
        if (this._isMining) return;
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Resonant buzz based on planet frequency
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(this._planetFreq * 2, now);

        // Secondary oscillator for thickness
        const osc2 = ctx.createOscillator();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(this._planetFreq * 2.01, now); // slight detune = beating

        // Filter for sci-fi character
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(this._planetFreq * 4, now);
        filter.Q.setValueAtTime(8, now);

        // LFO for pulsing
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(6, now); // 6 Hz pulse
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0.15, now);
        lfo.connect(lfoGain);

        // Main gain with fade-in
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.15);
        lfoGain.connect(gain.gain);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.output);

        osc.start(now);
        osc2.start(now);
        lfo.start(now);

        this._miningOsc = [osc, osc2, lfo];
        this._miningGain = gain;
        this._isMining = true;
    }

    miningStop() {
        if (!this._isMining) return;
        const now = this.ctx.currentTime;

        if (this._miningGain) {
            this._miningGain.gain.cancelScheduledValues(now);
            this._miningGain.gain.setValueAtTime(this._miningGain.gain.value, now);
            this._miningGain.gain.linearRampToValueAtTime(0, now + 0.1);
        }

        const stopTime = now + 0.15;
        if (this._miningOsc) {
            for (const osc of this._miningOsc) {
                try { osc.stop(stopTime); } catch (_) {}
            }
        }

        this._miningOsc = null;
        this._miningGain = null;
        this._isMining = false;
    }

    // ============================================================
    // DESTRUCTION (rock/flora destroyed)
    // ============================================================

    destruction() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Low impact thud
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(this.output);
        osc.start(now);
        osc.stop(now + 0.45);

        // Crumble noise
        const noise = ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1500, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.4);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.25, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.output);
        noise.start(now);
        noise.stop(now + 0.4);
    }

    // ============================================================
    // RESOURCE COLLECTED (musical ping)
    // ============================================================

    resourceCollected(element) {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Musical ping — harmonic of planet frequency
        const freq = this._planetFreq * 4; // Two octaves up for bright ping

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        // Rising pitch for satisfaction
        osc.frequency.linearRampToValueAtTime(freq * 1.5, now + 0.15);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        gain.connect(this.output);
        osc.start(now);
        osc.stop(now + 0.55);

        // Second tone for harmony (a fifth up)
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq * 1.5, now + 0.08);

        const gain2 = ctx.createGain();
        gain2.gain.setValueAtTime(0, now);
        gain2.gain.linearRampToValueAtTime(0.15, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc2.connect(gain2);
        gain2.connect(this.output);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.65);
    }

    // ============================================================
    // SCANNER PULSE
    // ============================================================

    scannerPulse() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Rising sweep
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(2000, now + 0.3);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.8);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.3);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        osc.connect(gain);
        gain.connect(this.output);
        osc.start(now);
        osc.stop(now + 1.3);

        // Echo ping
        const ping = ctx.createOscillator();
        ping.type = 'sine';
        ping.frequency.setValueAtTime(1200, now + 0.3);

        const pingGain = ctx.createGain();
        pingGain.gain.setValueAtTime(0, now);
        pingGain.gain.linearRampToValueAtTime(0.15, now + 0.32);
        pingGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

        ping.connect(pingGain);
        pingGain.connect(this.output);
        ping.start(now + 0.3);
        ping.stop(now + 1.1);
    }

    // ============================================================
    // UPDATE (handles timed footsteps)
    // ============================================================

    update(dt, state) {
        if (!state) return;

        // Auto-footsteps while walking
        if (state.isGrounded && state.isMoving) {
            const interval = state.isSprinting ? this._sprintInterval : this._footstepInterval;
            this._footstepTimer += dt;
            if (this._footstepTimer >= interval) {
                this._footstepTimer -= interval;
                this.footstep(state.biome || 'grassland', state.isSprinting);
            }
        } else {
            this._footstepTimer = 0;
        }

        // Mining beam sound follows mining state
        if (state.isMining && !this._isMining) {
            this.miningStart();
        } else if (!state.isMining && this._isMining) {
            this.miningStop();
        }

        // Modulate mining beam pitch with heat
        if (this._isMining && this._miningOsc && this._miningOsc[0] && state.miningHeat !== undefined) {
            const heatPitch = 1.0 + state.miningHeat * 0.5; // pitch rises with heat
            const now = this.ctx.currentTime;
            try {
                this._miningOsc[0].frequency.setTargetAtTime(
                    this._planetFreq * 2 * heatPitch, now, 0.1
                );
            } catch (_) { /* oscillator may have been stopped */ }
        }
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
        this.miningStop();
    }
}
