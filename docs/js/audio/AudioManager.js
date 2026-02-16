/**
 * THE GALACTIC ORDER — Procedural Audio System
 *
 * Inspired by Pioneer Space Sim's ambient space music, engine drones,
 * and atmospheric sound design.
 *
 * 100% procedural — no audio files. Everything generated via Web Audio API.
 * Driven by the planet's harmonic frequency from harmonicResonance.js.
 *
 * Layers:
 *   1. Ambient Music  — generative pad chords evolving over time
 *   2. Atmosphere      — wind, air, environmental noise shaped by planet mood
 *   3. Engine          — ship engine hum with dynamic throttle response
 *   4. SFX             — hyperspace, mining, UI, footsteps, re-entry
 *
 * Each phase crossfades between appropriate layers:
 *   DESCENT    → rumble + atmosphere fading in
 *   SURFACE    → ambient music + wind + footstep triggers
 *   FLIGHT     → engine drone + ambient music (distant) + space wind
 *   GALAXY_MAP → terminal hum + electronic ambience
 *   SYSTEM_VIEW → orbital pads + celestial tones
 */

// ============================================================
// AUDIO MANAGER
// ============================================================

export class AudioManager {
    constructor() {
        this.ctx = null;        // AudioContext (created on user gesture)
        this.masterGain = null;
        this.initialized = false;
        this.muted = false;

        // Current planet parameters (updated on warp)
        this.planetFreq = 7.83;   // Hz (Schumann default)
        this.planetBand = 'alpha'; // brainwave band
        this.planetMood = 'calm';

        // Phase tracking
        this.currentPhase = 'descent';

        // Layer nodes
        this.layers = {};

        // Active oscillators / generators (for cleanup)
        this._activeNodes = [];

        // Music state
        this._musicTimer = 0;
        this._chordIndex = 0;
        this._noteSchedule = [];

        // SFX cooldowns
        this._lastFootstep = 0;
        this._footstepInterval = 0.45; // seconds between steps
    }

    /**
     * Initialize the audio context. Must be called from a user gesture.
     */
    init() {
        if (this.initialized) return;

        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('[TGO Audio] Web Audio API not available:', e.message);
            return;
        }

        // Master output
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.6;
        this.masterGain.connect(this.ctx.destination);

        // Create layer buses
        this.layers = {
            music:      this._createBus(0.35),
            atmosphere: this._createBus(0.25),
            engine:     this._createBus(0.0),
            sfx:        this._createBus(0.5),
            terminal:   this._createBus(0.0),
        };

        this.initialized = true;
        console.log('[TGO Audio] Initialized');

        // Start ambient generators
        this._startAtmosphere();
        this._startMusic();
        this._startTerminalHum();
    }

    _createBus(volume) {
        const gain = this.ctx.createGain();
        gain.gain.value = volume;
        gain.connect(this.masterGain);
        return { gain, targetVolume: volume };
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    /**
     * Set the planet's harmonic parameters (called on warp).
     */
    setPlanet(frequency, band, mood) {
        this.planetFreq = frequency;
        this.planetBand = band;
        this.planetMood = mood;

        if (!this.initialized) return;

        // Rebuild ambient generators for new planet
        this._rebuildForPlanet();
    }

    /**
     * Set the current game phase — crossfades audio layers.
     */
    setPhase(phase) {
        this.currentPhase = phase;
        if (!this.initialized) return;
        this._crossfadeForPhase(phase);
    }

    /**
     * Called every frame from the game loop.
     * @param {number} dt — delta time in seconds
     * @param {Object} info — { speed, altitude, isCharging, chargeProgress, isMining }
     */
    update(dt, info = {}) {
        if (!this.initialized || this.muted) return;

        // Update engine pitch/volume based on speed
        if (this._engineOsc && info.speed !== undefined) {
            const speedNorm = Math.min(info.speed / 200, 1);
            const pitch = 55 + speedNorm * 80; // 55Hz idle → 135Hz boost
            this._engineOsc.frequency.setTargetAtTime(pitch, this.ctx.currentTime, 0.1);

            if (this._engineNoiseGain) {
                this._engineNoiseGain.gain.setTargetAtTime(
                    0.03 + speedNorm * 0.08, this.ctx.currentTime, 0.1
                );
            }
        }

        // Update hyperspace charge sound
        if (info.isCharging && info.chargeProgress !== undefined) {
            this._updateHyperspaceCharge(info.chargeProgress);
        }

        // Evolve ambient music over time
        this._musicTimer += dt;
        if (this._musicTimer > 4.0) {
            this._musicTimer = 0;
            this._evolveMusic();
        }
    }

    /**
     * Trigger a one-shot sound effect.
     */
    playSFX(name, params = {}) {
        if (!this.initialized || this.muted) return;

        switch (name) {
            case 'footstep':     this._playFootstep(); break;
            case 'mining_start': this._playMiningStart(); break;
            case 'mining_stop':  this._playMiningStop(); break;
            case 'hyperspace_jump': this._playHyperspaceJump(); break;
            case 'hyperspace_charge_start': this._startHyperspaceCharge(); break;
            case 'hyperspace_charge_cancel': this._stopHyperspaceCharge(); break;
            case 'ui_click':     this._playUIClick(); break;
            case 'ui_open':      this._playUIOpen(); break;
            case 'ui_close':     this._playUIClose(); break;
            case 'warp_flash':   this._playWarpFlash(); break;
            case 'scan_ping':    this._playScanPing(); break;
            case 'weapon_fire':  this._playWeaponFire(); break;
            case 'landing':      this._playLanding(); break;
            case 'reentry':      this._playReentry(); break;
        }
    }

    /**
     * Trigger footstep at a rate tied to movement speed.
     * @param {number} speed - Player movement speed
     * @param {number} [biomeId=5] - Current biome (affects sound character)
     */
    triggerFootstep(speed, biomeId = 5) {
        if (!this.initialized || this.muted) return;
        if (speed < 0.5) return; // Not moving

        const now = this.ctx.currentTime;
        const interval = speed > 8 ? 0.3 : this._footstepInterval;
        if (now - this._lastFootstep < interval) return;

        this._lastFootstep = now;
        this._playFootstep(biomeId);
    }

    toggleMute() {
        this.muted = !this.muted;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(
                this.muted ? 0 : 0.6, this.ctx.currentTime, 0.1
            );
        }
        return this.muted;
    }

    setVolume(v) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
        }
    }

    // ============================================================
    // LAYER: AMBIENT MUSIC (generative pads)
    // ============================================================

    _startMusic() {
        // Generative ambient music — slow evolving pad chords
        // Uses planet frequency to derive a musical scale

        this._musicPads = [];
        this._buildChordProgression();
        this._playNextChord();
    }

    _buildChordProgression() {
        // Derive a root note from planet frequency
        // Scale up to audible range (multiply by powers of 2)
        let root = this.planetFreq;
        while (root < 60) root *= 2;
        while (root > 200) root /= 2;

        // Build a scale based on mood
        const intervals = {
            dreamlike:  [1, 9/8, 6/5, 4/3, 3/2, 8/5, 15/8],  // Phrygian-ish (dark, dreamy)
            mysterious: [1, 9/8, 6/5, 4/3, 3/2, 5/3, 15/8],   // Natural minor
            calm:       [1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8],   // Major
            energetic:  [1, 9/8, 5/4, 45/32, 3/2, 5/3, 15/8], // Lydian (bright, soaring)
            intense:    [1, 16/15, 6/5, 4/3, 7/5, 8/5, 7/4],  // Locrian (dark, tense)
        };

        const scale = intervals[this.planetMood] || intervals.calm;
        this._scale = scale.map(r => root * r);

        // Build 4-chord progression
        this._chords = [
            [this._scale[0], this._scale[2], this._scale[4]],          // i
            [this._scale[3], this._scale[5], this._scale[0] * 2],     // iv
            [this._scale[4], this._scale[6], this._scale[1] * 2],     // v
            [this._scale[5], this._scale[0] * 2, this._scale[2] * 2], // vi
        ];
        this._chordIndex = 0;
    }

    _playNextChord() {
        if (!this.initialized) return;

        const chord = this._chords[this._chordIndex % this._chords.length];
        const now = this.ctx.currentTime;

        // Fade out any existing pads
        for (const pad of this._musicPads) {
            pad.gain.gain.setTargetAtTime(0, now, 1.5);
            // Auto-cleanup
            setTimeout(() => {
                try { pad.osc.stop(); } catch(e) {}
                try { pad.osc2.stop(); } catch(e) {}
            }, 5000);
        }
        this._musicPads = [];

        // Create new pad voices for each chord tone
        for (let i = 0; i < chord.length; i++) {
            const freq = chord[i];
            const pad = this._createPadVoice(freq, now, i);
            this._musicPads.push(pad);
        }

        this._chordIndex++;
    }

    _createPadVoice(freq, startTime, voiceIndex) {
        const ctx = this.ctx;

        // Main oscillator — soft sine/triangle mix
        const osc = ctx.createOscillator();
        osc.type = voiceIndex === 0 ? 'sine' : 'triangle';
        osc.frequency.value = freq;

        // Detuned second oscillator for richness
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 1.002; // Slight detune for chorus

        // LFO for vibrato
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.3 + voiceIndex * 0.1;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = freq * 0.003; // Subtle vibrato
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        // Low-pass filter for warmth
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800 + voiceIndex * 200;
        filter.Q.value = 0.5;

        // Envelope
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(0.06, startTime, 2.0); // Slow fade in

        // Connect
        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.layers.music.gain);

        osc.start(startTime);
        osc2.start(startTime);
        lfo.start(startTime);

        return { osc, osc2, lfo, gain, filter };
    }

    _evolveMusic() {
        this._playNextChord();
    }

    // ============================================================
    // LAYER: ATMOSPHERE (wind, environmental noise)
    // ============================================================

    _startAtmosphere() {
        const ctx = this.ctx;

        // Wind noise — filtered white noise
        const noiseBuffer = this._createNoiseBuffer(3);
        this._windSource = ctx.createBufferSource();
        this._windSource.buffer = noiseBuffer;
        this._windSource.loop = true;

        // Band-pass filter to shape wind
        this._windFilter = ctx.createBiquadFilter();
        this._windFilter.type = 'bandpass';
        this._windFilter.frequency.value = 400;
        this._windFilter.Q.value = 0.8;

        // Second filter for movement
        const windFilter2 = ctx.createBiquadFilter();
        windFilter2.type = 'lowpass';
        windFilter2.frequency.value = 1200;

        // LFO to modulate wind filter (gusting)
        this._windLFO = ctx.createOscillator();
        this._windLFO.type = 'sine';
        this._windLFO.frequency.value = 0.15; // Slow gusting
        const windLFOGain = ctx.createGain();
        windLFOGain.gain.value = 300;
        this._windLFO.connect(windLFOGain);
        windLFOGain.connect(this._windFilter.frequency);

        this._windGain = ctx.createGain();
        this._windGain.gain.value = 0.15;

        this._windSource.connect(this._windFilter);
        this._windFilter.connect(windFilter2);
        windFilter2.connect(this._windGain);
        this._windGain.connect(this.layers.atmosphere.gain);

        this._windSource.start();
        this._windLFO.start();

        // Deep sub-bass rumble — planet hum
        this._planetHum = ctx.createOscillator();
        this._planetHum.type = 'sine';
        // Use the actual planet frequency (sub-bass, felt more than heard)
        let humFreq = this.planetFreq;
        while (humFreq < 20) humFreq *= 2; // Bring into barely audible range
        this._planetHum.frequency.value = humFreq;

        this._planetHumGain = ctx.createGain();
        this._planetHumGain.gain.value = 0.04; // Very subtle

        const humFilter = ctx.createBiquadFilter();
        humFilter.type = 'lowpass';
        humFilter.frequency.value = 80;

        this._planetHum.connect(humFilter);
        humFilter.connect(this._planetHumGain);
        this._planetHumGain.connect(this.layers.atmosphere.gain);
        this._planetHum.start();
    }

    // ============================================================
    // LAYER: ENGINE (ship flight drone)
    // ============================================================

    _startEngine() {
        if (this._engineOsc) return;
        const ctx = this.ctx;

        // Main engine oscillator — low sawtooth
        this._engineOsc = ctx.createOscillator();
        this._engineOsc.type = 'sawtooth';
        this._engineOsc.frequency.value = 55; // Idle frequency

        // Filter to soften the saw
        this._engineFilter = ctx.createBiquadFilter();
        this._engineFilter.type = 'lowpass';
        this._engineFilter.frequency.value = 200;
        this._engineFilter.Q.value = 2;

        // Engine gain
        this._engineGainNode = ctx.createGain();
        this._engineGainNode.gain.value = 0.12;

        // Second voice — sub oscillator
        this._engineSub = ctx.createOscillator();
        this._engineSub.type = 'sine';
        this._engineSub.frequency.value = 27.5; // Sub bass

        const subGain = ctx.createGain();
        subGain.gain.value = 0.08;

        // Engine noise (exhaust/thrust)
        const noiseBuffer = this._createNoiseBuffer(2);
        this._engineNoise = ctx.createBufferSource();
        this._engineNoise.buffer = noiseBuffer;
        this._engineNoise.loop = true;

        this._engineNoiseFilter = ctx.createBiquadFilter();
        this._engineNoiseFilter.type = 'bandpass';
        this._engineNoiseFilter.frequency.value = 150;
        this._engineNoiseFilter.Q.value = 1.5;

        this._engineNoiseGain = ctx.createGain();
        this._engineNoiseGain.gain.value = 0.05;

        // Connect engine chain
        this._engineOsc.connect(this._engineFilter);
        this._engineFilter.connect(this._engineGainNode);
        this._engineGainNode.connect(this.layers.engine.gain);

        this._engineSub.connect(subGain);
        subGain.connect(this.layers.engine.gain);

        this._engineNoise.connect(this._engineNoiseFilter);
        this._engineNoiseFilter.connect(this._engineNoiseGain);
        this._engineNoiseGain.connect(this.layers.engine.gain);

        this._engineOsc.start();
        this._engineSub.start();
        this._engineNoise.start();
    }

    _stopEngine() {
        try {
            if (this._engineOsc) { this._engineOsc.stop(); this._engineOsc = null; }
            if (this._engineSub) { this._engineSub.stop(); this._engineSub = null; }
            if (this._engineNoise) { this._engineNoise.stop(); this._engineNoise = null; }
        } catch (e) {}
    }

    // ============================================================
    // LAYER: TERMINAL HUM (galaxy map / system view)
    // ============================================================

    _startTerminalHum() {
        const ctx = this.ctx;

        // CRT monitor hum — 60Hz + harmonics
        this._termOsc = ctx.createOscillator();
        this._termOsc.type = 'sine';
        this._termOsc.frequency.value = 60;

        this._termOsc2 = ctx.createOscillator();
        this._termOsc2.type = 'sine';
        this._termOsc2.frequency.value = 120; // 2nd harmonic

        const termGain1 = ctx.createGain();
        termGain1.gain.value = 0.04;
        const termGain2 = ctx.createGain();
        termGain2.gain.value = 0.015;

        // Soft noise — data processing ambience
        const noiseBuffer = this._createNoiseBuffer(2);
        this._termNoise = ctx.createBufferSource();
        this._termNoise.buffer = noiseBuffer;
        this._termNoise.loop = true;

        const termNoiseFilter = ctx.createBiquadFilter();
        termNoiseFilter.type = 'highpass';
        termNoiseFilter.frequency.value = 2000;

        const termNoiseGain = ctx.createGain();
        termNoiseGain.gain.value = 0.008;

        this._termOsc.connect(termGain1);
        this._termOsc2.connect(termGain2);
        termGain1.connect(this.layers.terminal.gain);
        termGain2.connect(this.layers.terminal.gain);

        this._termNoise.connect(termNoiseFilter);
        termNoiseFilter.connect(termNoiseGain);
        termNoiseGain.connect(this.layers.terminal.gain);

        this._termOsc.start();
        this._termOsc2.start();
        this._termNoise.start();
    }

    // ============================================================
    // PHASE CROSSFADING
    // ============================================================

    _crossfadeForPhase(phase) {
        const now = this.ctx.currentTime;
        const fade = 1.5; // seconds

        // Define target volumes for each layer per phase
        const targets = {
            descent:     { music: 0.10, atmosphere: 0.30, engine: 0.0,  terminal: 0.0 },
            surface:     { music: 0.35, atmosphere: 0.25, engine: 0.0,  terminal: 0.0 },
            flight:      { music: 0.15, atmosphere: 0.08, engine: 0.30, terminal: 0.0 },
            galaxy_map:  { music: 0.08, atmosphere: 0.03, engine: 0.0,  terminal: 0.25 },
            system_view: { music: 0.20, atmosphere: 0.05, engine: 0.0,  terminal: 0.15 },
        };

        const t = targets[phase] || targets.surface;

        for (const [name, layer] of Object.entries(this.layers)) {
            if (t[name] !== undefined) {
                layer.gain.gain.setTargetAtTime(t[name], now, fade);
                layer.targetVolume = t[name];
            }
        }

        // Start/stop engine as needed
        if (phase === 'flight') {
            this._startEngine();
        } else if (this._engineOsc) {
            // Let it fade out then stop
            setTimeout(() => {
                if (this.currentPhase !== 'flight') {
                    this._stopEngine();
                }
            }, 3000);
        }

        // Adjust atmosphere characteristics per phase
        if (this._windFilter) {
            const windFreqs = {
                descent: 600,
                surface: 400,
                flight: 800,
                galaxy_map: 200,
                system_view: 300,
            };
            this._windFilter.frequency.setTargetAtTime(
                windFreqs[phase] || 400, now, fade
            );
        }
    }

    // ============================================================
    // SFX: ONE-SHOT SOUNDS
    // ============================================================

    _playFootstep(biomeId = 5) {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Biome-specific footstep parameters:
        // filterFreq: higher = brighter/crunchier, lower = softer/muffled
        // decay: longer = more reverberant (like a cave), shorter = tight/dry
        // volume: louder on hard surfaces
        // pitch: optional thud oscillator frequency
        const biomeSound = {
            2:  { freq: 1200, decay: 0.02, vol: 0.06, pitch: 80,  type: 'highpass' }, // Beach — crunchy sand
            3:  { freq: 1400, decay: 0.015, vol: 0.07, pitch: 100, type: 'highpass' }, // Desert — gritty
            4:  { freq: 700,  decay: 0.025, vol: 0.07, pitch: 60,  type: 'lowpass' },  // Savanna — dry grass
            5:  { freq: 500,  decay: 0.03,  vol: 0.06, pitch: 50,  type: 'lowpass' },  // Grassland — soft
            6:  { freq: 400,  decay: 0.04,  vol: 0.05, pitch: 45,  type: 'lowpass' },  // Forest — leafy, muffled
            7:  { freq: 350,  decay: 0.045, vol: 0.05, pitch: 40,  type: 'lowpass' },  // Dense Forest — very muffled
            8:  { freq: 300,  decay: 0.05,  vol: 0.06, pitch: 35,  type: 'lowpass' },  // Swamp — wet squelch
            9:  { freq: 900,  decay: 0.015, vol: 0.09, pitch: 90,  type: 'lowpass' },  // Mountain — hard rock
            10: { freq: 1000, decay: 0.02,  vol: 0.08, pitch: 85,  type: 'highpass' }, // Snow — crunchy
            11: { freq: 1100, decay: 0.015, vol: 0.08, pitch: 95,  type: 'highpass' }, // Ice — crisp
        };
        const params = biomeSound[biomeId] || { freq: 600, decay: 0.03, vol: 0.08, pitch: 60, type: 'lowpass' };

        // Noise burst (surface texture)
        const noiseBuffer = this._createNoiseBuffer(0.08);
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = params.type;
        filter.frequency.value = params.freq + Math.random() * 300;

        const gain = ctx.createGain();
        gain.gain.value = params.vol;
        gain.gain.setTargetAtTime(0, now + params.decay, 0.03);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.layers.sfx.gain);
        src.start(now);

        // Low-frequency thud (foot impact)
        const thud = ctx.createOscillator();
        thud.type = 'sine';
        thud.frequency.value = params.pitch + Math.random() * 20;
        const thudGain = ctx.createGain();
        thudGain.gain.value = params.vol * 0.5;
        thudGain.gain.setTargetAtTime(0, now + 0.02, 0.02);
        thud.connect(thudGain);
        thudGain.connect(this.layers.sfx.gain);
        thud.start(now);
        thud.stop(now + 0.08);
    }

    _playMiningStart() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Rising laser tone
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 200;
        osc.frequency.linearRampToValueAtTime(800, now + 0.3);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1500;

        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(0.06, now + 0.1);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.layers.sfx.gain);
        osc.start(now);
        osc.stop(now + 0.4);

        // Hold tone — continuous mining drone
        this._miningOsc = ctx.createOscillator();
        this._miningOsc.type = 'triangle';
        this._miningOsc.frequency.value = 440;

        // LFO for pulsing
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 8;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 60;
        lfo.connect(lfoGain);
        lfoGain.connect(this._miningOsc.frequency);

        this._miningGain = ctx.createGain();
        this._miningGain.gain.value = 0;
        this._miningGain.gain.setTargetAtTime(0.04, now + 0.2, 0.3);

        const mFilter = ctx.createBiquadFilter();
        mFilter.type = 'bandpass';
        mFilter.frequency.value = 500;
        mFilter.Q.value = 2;

        this._miningOsc.connect(mFilter);
        mFilter.connect(this._miningGain);
        this._miningGain.connect(this.layers.sfx.gain);
        this._miningOsc.start(now + 0.2);
        lfo.start(now + 0.2);
        this._miningLFO = lfo;
    }

    _playMiningStop() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        if (this._miningGain) {
            this._miningGain.gain.setTargetAtTime(0, now, 0.1);
        }
        setTimeout(() => {
            try { if (this._miningOsc) this._miningOsc.stop(); } catch(e) {}
            try { if (this._miningLFO) this._miningLFO.stop(); } catch(e) {}
            this._miningOsc = null;
            this._miningLFO = null;
        }, 500);

        // Falling "power down" tone
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 600;
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);

        const gain = ctx.createGain();
        gain.gain.value = 0.05;
        gain.gain.setTargetAtTime(0, now + 0.1, 0.1);

        osc.connect(gain);
        gain.connect(this.layers.sfx.gain);
        osc.start(now);
        osc.stop(now + 0.4);
    }

    _startHyperspaceCharge() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Rising drone that builds tension
        this._hyperChargeOsc = ctx.createOscillator();
        this._hyperChargeOsc.type = 'sawtooth';
        this._hyperChargeOsc.frequency.value = 40;

        this._hyperChargeFilter = ctx.createBiquadFilter();
        this._hyperChargeFilter.type = 'lowpass';
        this._hyperChargeFilter.frequency.value = 100;

        this._hyperChargeGain = ctx.createGain();
        this._hyperChargeGain.gain.value = 0;
        this._hyperChargeGain.gain.linearRampToValueAtTime(0.1, now + 0.5);

        // Noise layer
        const noise = ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(4);
        noise.loop = true;
        this._hyperChargeNoise = noise;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 200;
        noiseFilter.Q.value = 3;
        this._hyperChargeNoiseFilter = noiseFilter;

        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0;
        noiseGain.gain.linearRampToValueAtTime(0.04, now + 1);
        this._hyperChargeNoiseGain = noiseGain;

        this._hyperChargeOsc.connect(this._hyperChargeFilter);
        this._hyperChargeFilter.connect(this._hyperChargeGain);
        this._hyperChargeGain.connect(this.layers.sfx.gain);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.layers.sfx.gain);

        this._hyperChargeOsc.start(now);
        noise.start(now);
    }

    _updateHyperspaceCharge(progress) {
        if (!this._hyperChargeOsc) return;
        const now = this.ctx.currentTime;

        // Pitch rises with charge
        this._hyperChargeOsc.frequency.setTargetAtTime(
            40 + progress * 200, now, 0.1
        );

        // Filter opens up
        this._hyperChargeFilter.frequency.setTargetAtTime(
            100 + progress * 2000, now, 0.1
        );

        // Volume increases
        this._hyperChargeGain.gain.setTargetAtTime(
            0.05 + progress * 0.12, now, 0.1
        );

        // Noise gets louder and brighter
        if (this._hyperChargeNoiseFilter) {
            this._hyperChargeNoiseFilter.frequency.setTargetAtTime(
                200 + progress * 3000, now, 0.1
            );
        }
        if (this._hyperChargeNoiseGain) {
            this._hyperChargeNoiseGain.gain.setTargetAtTime(
                0.02 + progress * 0.08, now, 0.1
            );
        }
    }

    _stopHyperspaceCharge() {
        const now = this.ctx.currentTime;
        if (this._hyperChargeGain) {
            this._hyperChargeGain.gain.setTargetAtTime(0, now, 0.1);
        }
        if (this._hyperChargeNoiseGain) {
            this._hyperChargeNoiseGain.gain.setTargetAtTime(0, now, 0.1);
        }
        setTimeout(() => {
            try { if (this._hyperChargeOsc) this._hyperChargeOsc.stop(); } catch(e) {}
            try { if (this._hyperChargeNoise) this._hyperChargeNoise.stop(); } catch(e) {}
            this._hyperChargeOsc = null;
            this._hyperChargeNoise = null;
        }, 400);
    }

    _playHyperspaceJump() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Stop charge sounds
        this._stopHyperspaceCharge();

        // Massive whoosh — descending noise sweep
        const noise = ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(3);

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 4000;
        filter.frequency.exponentialRampToValueAtTime(100, now + 2.5);
        filter.Q.value = 3;

        const gain = ctx.createGain();
        gain.gain.value = 0.2;
        gain.gain.setTargetAtTime(0, now + 0.5, 0.8);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.layers.sfx.gain);
        noise.start(now);

        // Deep impact boom
        const boom = ctx.createOscillator();
        boom.type = 'sine';
        boom.frequency.value = 30;
        boom.frequency.exponentialRampToValueAtTime(10, now + 1.5);

        const boomGain = ctx.createGain();
        boomGain.gain.value = 0.25;
        boomGain.gain.setTargetAtTime(0, now + 0.2, 0.5);

        boom.connect(boomGain);
        boomGain.connect(this.layers.sfx.gain);
        boom.start(now);
        boom.stop(now + 2);

        // High shimmer — crystalline warp effect
        const shimmer = ctx.createOscillator();
        shimmer.type = 'sine';
        shimmer.frequency.value = 2000;
        shimmer.frequency.exponentialRampToValueAtTime(200, now + 2);

        const shimmerGain = ctx.createGain();
        shimmerGain.gain.value = 0.06;
        shimmerGain.gain.setTargetAtTime(0, now + 0.3, 0.6);

        shimmer.connect(shimmerGain);
        shimmerGain.connect(this.layers.sfx.gain);
        shimmer.start(now);
        shimmer.stop(now + 2.5);
    }

    _playWarpFlash() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Quick white-out impact
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 100;

        const gain = ctx.createGain();
        gain.gain.value = 0.2;
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        const noise = ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(1);

        const nFilter = ctx.createBiquadFilter();
        nFilter.type = 'lowpass';
        nFilter.frequency.value = 800;
        nFilter.frequency.exponentialRampToValueAtTime(100, now + 0.8);

        const nGain = ctx.createGain();
        nGain.gain.value = 0.15;
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        osc.connect(gain); gain.connect(this.layers.sfx.gain);
        noise.connect(nFilter); nFilter.connect(nGain); nGain.connect(this.layers.sfx.gain);

        osc.start(now); osc.stop(now + 1);
        noise.start(now);
    }

    _playUIClick() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 800 + Math.random() * 400;

        const gain = ctx.createGain();
        gain.gain.value = 0.03;
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2000;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.layers.sfx.gain);
        osc.start(now);
        osc.stop(now + 0.06);
    }

    _playUIOpen() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Ascending two-tone beep
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 400;
        osc.frequency.setValueAtTime(600, now + 0.08);

        const gain = ctx.createGain();
        gain.gain.value = 0.04;
        gain.gain.setValueAtTime(0.04, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(this.layers.sfx.gain);
        osc.start(now);
        osc.stop(now + 0.2);
    }

    _playUIClose() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Descending two-tone beep
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 600;
        osc.frequency.setValueAtTime(400, now + 0.08);

        const gain = ctx.createGain();
        gain.gain.value = 0.04;
        gain.gain.setValueAtTime(0.04, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(gain);
        gain.connect(this.layers.sfx.gain);
        osc.start(now);
        osc.stop(now + 0.2);
    }

    _playScanPing() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Sonar-like ping
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 1200;

        const gain = ctx.createGain();
        gain.gain.value = 0.06;
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        // Reverb-like delay
        const delay = ctx.createDelay();
        delay.delayTime.value = 0.15;
        const delayGain = ctx.createGain();
        delayGain.gain.value = 0.3;

        osc.connect(gain);
        gain.connect(this.layers.sfx.gain);
        gain.connect(delay);
        delay.connect(delayGain);
        delayGain.connect(this.layers.sfx.gain);

        osc.start(now);
        osc.stop(now + 0.7);
    }

    _playWeaponFire() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Sharp laser burst
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 300;
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000;
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.15);

        const gain = ctx.createGain();
        gain.gain.value = 0.08;
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        // Noise burst for texture
        const noise = ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(0.1);
        const nGain = ctx.createGain();
        nGain.gain.value = 0.06;
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(filter); filter.connect(gain); gain.connect(this.layers.sfx.gain);
        noise.connect(nGain); nGain.connect(this.layers.sfx.gain);

        osc.start(now); osc.stop(now + 0.2);
        noise.start(now);
    }

    _playLanding() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Thud + settling noise
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 60;

        const gain = ctx.createGain();
        gain.gain.value = 0.15;
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        // Hydraulic hiss
        const noise = ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(1);
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = 'highpass';
        nFilter.frequency.value = 3000;
        const nGain = ctx.createGain();
        nGain.gain.value = 0;
        nGain.gain.linearRampToValueAtTime(0.04, now + 0.3);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 1);

        osc.connect(gain); gain.connect(this.layers.sfx.gain);
        noise.connect(nFilter); nFilter.connect(nGain); nGain.connect(this.layers.sfx.gain);

        osc.start(now); osc.stop(now + 0.6);
        noise.start(now);
    }

    _playReentry() {
        const ctx = this.ctx;
        const now = ctx.currentTime;

        // Building roar — filtered noise
        const noise = ctx.createBufferSource();
        noise.buffer = this._createNoiseBuffer(6);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;
        filter.frequency.linearRampToValueAtTime(2000, now + 2);
        filter.frequency.linearRampToValueAtTime(300, now + 5);

        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(0.15, now + 1);
        gain.gain.linearRampToValueAtTime(0.2, now + 2.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 5.5);

        // Rumble oscillator
        const rumble = ctx.createOscillator();
        rumble.type = 'sine';
        rumble.frequency.value = 25;

        const rumbleGain = ctx.createGain();
        rumbleGain.gain.value = 0;
        rumbleGain.gain.linearRampToValueAtTime(0.1, now + 1);
        rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 5);

        noise.connect(filter); filter.connect(gain); gain.connect(this.layers.sfx.gain);
        rumble.connect(rumbleGain); rumbleGain.connect(this.layers.sfx.gain);

        noise.start(now);
        rumble.start(now); rumble.stop(now + 6);
    }

    // ============================================================
    // PLANET REBUILD — update generators for new planet
    // ============================================================

    _rebuildForPlanet() {
        // Update planet hum frequency
        if (this._planetHum) {
            let humFreq = this.planetFreq;
            while (humFreq < 20) humFreq *= 2;
            this._planetHum.frequency.setTargetAtTime(humFreq, this.ctx.currentTime, 2.0);
        }

        // Update wind character per mood
        if (this._windFilter) {
            const windQ = {
                dreamlike: 0.5, mysterious: 0.8, calm: 0.6,
                energetic: 1.2, intense: 1.5,
            };
            this._windFilter.Q.value = windQ[this.planetMood] || 0.8;
        }

        if (this._windLFO) {
            const gustSpeed = {
                dreamlike: 0.08, mysterious: 0.12, calm: 0.15,
                energetic: 0.25, intense: 0.35,
            };
            this._windLFO.frequency.value = gustSpeed[this.planetMood] || 0.15;
        }

        // Rebuild chord progression for new planet
        this._buildChordProgression();
    }

    // ============================================================
    // UTILITY
    // ============================================================

    _createNoiseBuffer(duration) {
        const ctx = this.ctx;
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    dispose() {
        this._stopEngine();
        try { if (this._windSource) this._windSource.stop(); } catch(e) {}
        try { if (this._windLFO) this._windLFO.stop(); } catch(e) {}
        try { if (this._planetHum) this._planetHum.stop(); } catch(e) {}
        try { if (this._termOsc) this._termOsc.stop(); } catch(e) {}
        try { if (this._termOsc2) this._termOsc2.stop(); } catch(e) {}
        try { if (this._termNoise) this._termNoise.stop(); } catch(e) {}
        for (const pad of (this._musicPads || [])) {
            try { pad.osc.stop(); } catch(e) {}
            try { pad.osc2.stop(); } catch(e) {}
            try { pad.lfo.stop(); } catch(e) {}
        }
        if (this.ctx && this.ctx.state !== 'closed') {
            this.ctx.close();
        }
        this.initialized = false;
    }
}
