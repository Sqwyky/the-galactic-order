/**
 * THE GALACTIC ORDER - Performance Manager
 *
 * Adaptive quality system that keeps the game running smooth
 * on everything from gaming PCs to Chromebooks.
 *
 * Monitors FPS and automatically adjusts rendering quality:
 * - Post-processing passes (SSAO, bloom, film grain)
 * - Particle counts (atmospheric, mining, deconstruction)
 * - Vegetation density (grass, flora)
 * - Draw distance (terrain chunk radius)
 *
 * Can be manually overridden via window._debug.perf.setQuality('LOW')
 *
 * Integration:
 *   const perf = new PerformanceManager(renderer);
 *   // In game loop:
 *   perf.update(dt);
 *   // After composer is built:
 *   perf.applyToComposer(composer, ssaoPass, bloomPass, filmGrainPass);
 *   // Other systems read perf.settings each frame.
 */

// ============================================================
// QUALITY TIERS
// ============================================================

export const QUALITY_TIERS = {
    ULTRA:  0,
    HIGH:   1,
    MEDIUM: 2,
    LOW:    3,
    POTATO: 4,
};

/** Reverse lookup: tier index → name string */
const TIER_NAMES = ['ULTRA', 'HIGH', 'MEDIUM', 'LOW', 'POTATO'];

// ============================================================
// PER-TIER SETTINGS
// Each tier defines the full settings snapshot that gets applied
// when the tier is activated.
// ============================================================

const TIER_SETTINGS = {
    // ---- ULTRA: everything maxed, for beefy GPUs ----
    [QUALITY_TIERS.ULTRA]: {
        particleMultiplier:   1.0,
        drawDistance:          6,     // matches TERRAIN_CONFIG.viewRadius default
        floraMultiplier:      1.0,
        grassEnabled:         true,
        miningParticleCount:  40,
        postProcessing: {
            ssao:       true,
            bloom:      true,
            filmGrain:  true,
            colorGrade: true,
        },
        bloomStrengthMultiplier: 1.0,
        ssaoKernelRadius:        12,
        filmGrainIntensity:      0.025,
        saturationBoost:         1.3,
    },

    // ---- HIGH: slight SSAO reduction, fewer particles ----
    [QUALITY_TIERS.HIGH]: {
        particleMultiplier:   0.75,
        drawDistance:          5,
        floraMultiplier:      0.85,
        grassEnabled:         true,
        miningParticleCount:  30,
        postProcessing: {
            ssao:       true,
            bloom:      true,
            filmGrain:  true,
            colorGrade: true,
        },
        bloomStrengthMultiplier: 1.0,
        ssaoKernelRadius:        8,
        filmGrainIntensity:      0.025,
        saturationBoost:         1.3,
    },

    // ---- MEDIUM: no SSAO, bloom + grain preserved, halved particles ----
    [QUALITY_TIERS.MEDIUM]: {
        particleMultiplier:   0.5,
        drawDistance:          4,
        floraMultiplier:      0.6,
        grassEnabled:         true,
        miningParticleCount:  25,
        postProcessing: {
            ssao:       false,
            bloom:      true,       // Keep bloom — the painted sci-fi look
            filmGrain:  true,       // Keep grain — cheap, adds texture
            colorGrade: true,
        },
        bloomStrengthMultiplier: 0.7,
        ssaoKernelRadius:        8,
        filmGrainIntensity:      0.02,
        saturationBoost:         1.35,  // Slightly higher to compensate for no SSAO depth
    },

    // ---- LOW: no SSAO, reduced bloom + grain, sparse grass ----
    [QUALITY_TIERS.LOW]: {
        particleMultiplier:   0.35,
        drawDistance:          3,
        floraMultiplier:      0.4,
        grassEnabled:         true,    // Keep grass (sparse), preserves ground look
        grassMultiplier:      0.3,     // Very sparse grass
        miningParticleCount:  15,
        postProcessing: {
            ssao:       false,
            bloom:      true,       // Keep bloom — even subtle bloom prevents flat look
            filmGrain:  true,       // Keep grain — nearly free on GPU
            colorGrade: true,
        },
        bloomStrengthMultiplier: 0.5,
        ssaoKernelRadius:        4,
        filmGrainIntensity:      0.015,
        saturationBoost:         1.4,   // Higher saturation compensates for fewer visual layers
    },

    // ---- POTATO: everything stays ON but at minimum — looks good, runs fast ----
    [QUALITY_TIERS.POTATO]: {
        particleMultiplier:   0.25,
        drawDistance:          2,
        floraMultiplier:      0.25,
        grassEnabled:         false,   // Only grass is disabled on true potato
        miningParticleCount:  10,
        postProcessing: {
            ssao:       false,
            bloom:      true,       // Bloom stays — threshold raised so only bright things glow
            filmGrain:  true,       // Grain stays — it's a single texture sample, nearly free
            colorGrade: true,       // Color grade stays — always
        },
        bloomStrengthMultiplier: 0.35,
        ssaoKernelRadius:        4,
        filmGrainIntensity:      0.012, // Subtle but present
        saturationBoost:         1.45,  // Extra pop to compensate for less geometry detail
    },
};

// ============================================================
// ADAPTIVE THRESHOLDS
// ============================================================

/** FPS below this for LOW_FPS_DURATION seconds triggers a tier downgrade */
const LOW_FPS_THRESHOLD  = 25;

/** FPS above this for HIGH_FPS_DURATION seconds triggers a tier upgrade */
const HIGH_FPS_THRESHOLD = 50;

/** Sustained low FPS duration (seconds) before downgrading */
const LOW_FPS_DURATION   = 3.0;

/** Sustained high FPS duration (seconds) before upgrading */
const HIGH_FPS_DURATION  = 8.0;

/** How many seconds of FPS history to keep for the rolling average */
const FPS_HISTORY_WINDOW = 1.0;

/** Minimum seconds between automatic tier changes (prevents thrashing) */
const TIER_CHANGE_COOLDOWN = 5.0;

// ============================================================
// PERFORMANCE MANAGER
// ============================================================

export class PerformanceManager {
    /**
     * @param {THREE.WebGLRenderer} renderer - The Three.js WebGL renderer
     */
    constructor(renderer) {
        this.renderer = renderer;

        /** Current quality tier index (0 = ULTRA .. 4 = POTATO) */
        this.currentTier = QUALITY_TIERS.ULTRA;

        /** If true, automatic tier adjustment is disabled (manual override) */
        this.manualOverride = false;

        // ---- FPS tracking (lightweight — just frame counting) ----
        this._frames       = 0;
        this._lastTime     = performance.now();
        this._fps          = 60;       // current rolling average
        this._fpsHistory   = [];       // [{time, fps}] samples within the window

        // ---- Adaptive timers ----
        this._lowFpsTimer       = 0;   // seconds spent below LOW_FPS_THRESHOLD
        this._highFpsTimer      = 0;   // seconds spent above HIGH_FPS_THRESHOLD
        this._tierChangeCooldown = 0;  // seconds remaining before next auto-change

        // ---- Bloom base strength (set externally from planet mood) ----
        this._bloomBaseStrength = 1.0;

        // ---- Quality change callbacks ----
        this._onQualityChanged = [];

        // ---- Composer references (set via applyToComposer) ----
        this._composer       = null;
        this._ssaoPass       = null;
        this._bloomPass      = null;
        this._filmGrainPass  = null;
        this._colorGradePass = null;

        // ---- Device capabilities (populated by _detectHardware) ----
        this.deviceInfo = {
            maxTextureSize:     0,
            cpuCores:           0,
            gpuTier:            'unknown',  // 'high', 'mid', 'low'
            isMobile:           false,
        };

        // ---- Public settings — read by other systems each frame ----
        this.settings = {
            particleMultiplier:   1.0,
            drawDistance:          6,
            floraMultiplier:      1.0,
            grassEnabled:         true,
            grassMultiplier:      1.0,
            miningParticleCount:  40,
            postProcessing: {
                ssao:       true,
                bloom:      true,
                filmGrain:  true,
                colorGrade: true,
            },
            bloomStrength:        1.0,  // final bloom strength (base * multiplier)
            filmGrainIntensity:   0.025,
            saturationBoost:      1.3,
        };

        // Detect hardware and set the initial tier
        this._detectHardware();
    }

    // ================================================================
    // HARDWARE DETECTION — runs once at init
    // ================================================================

    /**
     * Probe WebGL capabilities, CPU cores, and device type to pick a
     * sensible starting tier so we don't blast a Chromebook with SSAO
     * on the very first frame.
     */
    _detectHardware() {
        const caps = this.renderer.capabilities;
        const gl   = this.renderer.getContext();

        // ---- GPU info ----
        this.deviceInfo.maxTextureSize = caps.maxTextureSize || 4096;

        // Try to read the unmasked renderer string (gives us the actual GPU name)
        let gpuName = '';
        const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugExt) {
            gpuName = gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) || '';
        }

        // ---- CPU info ----
        this.deviceInfo.cpuCores = navigator.hardwareConcurrency || 2;

        // ---- Mobile detection ----
        this.deviceInfo.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        // ---- Heuristic GPU tier classification ----
        const gpuLower = gpuName.toLowerCase();
        const isIntegrated = /intel|mesa|llvmpipe|swiftshader|apple gpu/i.test(gpuLower);
        const isHighEnd    = /rtx|rx\s*[67]\d{3}|radeon\s*pro|nvidia.*[4-9]0[678]0/i.test(gpuLower);

        if (isHighEnd && this.deviceInfo.maxTextureSize >= 16384) {
            this.deviceInfo.gpuTier = 'high';
        } else if (isIntegrated || this.deviceInfo.maxTextureSize <= 4096) {
            this.deviceInfo.gpuTier = 'low';
        } else {
            this.deviceInfo.gpuTier = 'mid';
        }

        // ---- Pick initial tier ----
        let startTier;

        if (this.deviceInfo.isMobile) {
            // Mobile: start at LOW, never higher than MEDIUM
            startTier = QUALITY_TIERS.LOW;
        } else if (this.deviceInfo.gpuTier === 'low' || this.deviceInfo.cpuCores <= 2) {
            // Weak desktop / Chromebook
            startTier = QUALITY_TIERS.MEDIUM;
        } else if (this.deviceInfo.gpuTier === 'mid') {
            startTier = QUALITY_TIERS.HIGH;
        } else {
            startTier = QUALITY_TIERS.ULTRA;
        }

        console.log(
            `[TGO PerfManager] GPU: "${gpuName || 'unknown'}" ` +
            `| maxTex: ${this.deviceInfo.maxTextureSize} ` +
            `| cores: ${this.deviceInfo.cpuCores} ` +
            `| tier: ${this.deviceInfo.gpuTier} ` +
            `| mobile: ${this.deviceInfo.isMobile} ` +
            `| starting quality: ${TIER_NAMES[startTier]}`
        );

        this._applyTier(startTier);
    }

    // ================================================================
    // UPDATE — call once per frame, MUST be cheap
    // ================================================================

    /**
     * Lightweight per-frame update. Counts frames and checks whether
     * the quality tier needs to change. All the heavy lifting (enabling/
     * disabling passes) only happens on tier transitions.
     *
     * @param {number} dt - Delta time in seconds from clock.getDelta()
     */
    update(dt) {
        // Clamp absurd dt spikes (tab-away, etc.)
        if (dt > 0.5) dt = 0.5;

        // ---- Count frames for rolling FPS ----
        this._frames++;
        const now = performance.now();
        const elapsed = (now - this._lastTime) / 1000; // seconds

        if (elapsed >= FPS_HISTORY_WINDOW) {
            this._fps = this._frames / elapsed;
            this._frames = 0;
            this._lastTime = now;

            // Push a sample and prune old ones
            this._fpsHistory.push({ time: now, fps: this._fps });
            const cutoff = now - FPS_HISTORY_WINDOW * 1000;
            while (this._fpsHistory.length > 0 && this._fpsHistory[0].time < cutoff) {
                this._fpsHistory.shift();
            }
        }

        // Skip adaptive logic if manually overridden
        if (this.manualOverride) return;

        // ---- Tier change cooldown ----
        if (this._tierChangeCooldown > 0) {
            this._tierChangeCooldown -= dt;
            // Reset adaptive timers while on cooldown to avoid instant re-trigger
            this._lowFpsTimer  = 0;
            this._highFpsTimer = 0;
            return;
        }

        // ---- Check for sustained low FPS → downgrade ----
        if (this._fps < LOW_FPS_THRESHOLD) {
            this._lowFpsTimer  += dt;
            this._highFpsTimer  = 0;

            if (this._lowFpsTimer >= LOW_FPS_DURATION) {
                this._lowFpsTimer = 0;
                this._stepDown();
            }
        }
        // ---- Check for sustained high FPS → upgrade ----
        else if (this._fps > HIGH_FPS_THRESHOLD) {
            this._highFpsTimer += dt;
            this._lowFpsTimer   = 0;

            if (this._highFpsTimer >= HIGH_FPS_DURATION) {
                this._highFpsTimer = 0;
                this._stepUp();
            }
        }
        // ---- FPS is in the acceptable band — reset timers ----
        else {
            this._lowFpsTimer  = 0;
            this._highFpsTimer = 0;
        }
    }

    // ================================================================
    // TIER TRANSITIONS
    // ================================================================

    /** Drop one quality tier (if not already at POTATO). */
    _stepDown() {
        if (this.currentTier >= QUALITY_TIERS.POTATO) return;
        const newTier = this.currentTier + 1;
        console.log(
            `[TGO PerfManager] FPS ${this._fps.toFixed(1)} too low — ` +
            `downgrading ${TIER_NAMES[this.currentTier]} → ${TIER_NAMES[newTier]}`
        );
        this._applyTier(newTier);
    }

    /** Raise one quality tier (if not already at ULTRA). */
    _stepUp() {
        if (this.currentTier <= QUALITY_TIERS.ULTRA) return;
        const newTier = this.currentTier - 1;
        console.log(
            `[TGO PerfManager] FPS ${this._fps.toFixed(1)} headroom — ` +
            `upgrading ${TIER_NAMES[this.currentTier]} → ${TIER_NAMES[newTier]}`
        );
        this._applyTier(newTier);
    }

    /**
     * Apply a quality tier. Updates this.settings and (if composer refs
     * exist) directly toggles post-processing passes.
     *
     * @param {number} tier - One of QUALITY_TIERS values
     */
    _applyTier(tier) {
        this.currentTier = tier;
        this._tierChangeCooldown = TIER_CHANGE_COOLDOWN;

        const cfg = TIER_SETTINGS[tier];
        if (!cfg) return;

        // ---- Copy settings snapshot ----
        this.settings.particleMultiplier  = cfg.particleMultiplier;
        this.settings.drawDistance        = cfg.drawDistance;
        this.settings.floraMultiplier     = cfg.floraMultiplier;
        this.settings.grassEnabled        = cfg.grassEnabled;
        this.settings.grassMultiplier     = cfg.grassMultiplier || 1.0;
        this.settings.miningParticleCount = cfg.miningParticleCount;

        this.settings.postProcessing.ssao       = cfg.postProcessing.ssao;
        this.settings.postProcessing.bloom      = cfg.postProcessing.bloom;
        this.settings.postProcessing.filmGrain  = cfg.postProcessing.filmGrain;
        this.settings.postProcessing.colorGrade = cfg.postProcessing.colorGrade;

        // Bloom strength = mood-driven base * tier multiplier
        this.settings.bloomStrength = this._bloomBaseStrength * cfg.bloomStrengthMultiplier;

        // Film grain & saturation (preserved across all tiers for visual parity)
        this.settings.filmGrainIntensity = cfg.filmGrainIntensity;
        this.settings.saturationBoost    = cfg.saturationBoost;

        // ---- Apply to composer passes if they've been registered ----
        this._syncPasses();

        // ---- Notify listeners (MiningSystem, etc.) ----
        const tierName = TIER_NAMES[tier];
        for (const cb of this._onQualityChanged) {
            cb(tierName, this.settings);
        }
    }

    // ================================================================
    // COMPOSER INTEGRATION
    // ================================================================

    /**
     * Register the EffectComposer and its individual passes so the
     * PerformanceManager can directly enable/disable them on tier changes.
     *
     * Call this once, after the composer pipeline is built.
     *
     * @param {EffectComposer} composer
     * @param {SSAOPass}       ssaoPass
     * @param {UnrealBloomPass} bloomPass
     * @param {ShaderPass}     filmGrainPass
     * @param {ShaderPass}     [colorGradePass] - optional; if omitted, color grade stays always-on
     */
    applyToComposer(composer, ssaoPass, bloomPass, filmGrainPass, colorGradePass) {
        this._composer       = composer;
        this._ssaoPass       = ssaoPass;
        this._bloomPass      = bloomPass;
        this._filmGrainPass  = filmGrainPass;
        this._colorGradePass = colorGradePass || null;

        // Apply current tier to the passes right away
        this._syncPasses();
    }

    /**
     * Set the mood-driven bloom base strength. Called once when the planet
     * mood is computed (e.g. planetMood.atmosphere.bloomStrength).
     *
     * The final bloom strength shown in-game is: base * tier multiplier.
     *
     * @param {number} strength - e.g. 0.8 for calm worlds, 1.5 for dreamy Delta worlds
     */
    setBloomBaseStrength(strength) {
        this._bloomBaseStrength = strength;
        const cfg = TIER_SETTINGS[this.currentTier];
        if (cfg) {
            this.settings.bloomStrength = this._bloomBaseStrength * cfg.bloomStrengthMultiplier;
        }
        // Re-apply to bloom pass if it exists
        if (this._bloomPass) {
            this._bloomPass.strength = this.settings.bloomStrength;
        }
    }

    /**
     * Push the current settings to the actual Three.js pass objects.
     * Only does work if passes have been registered via applyToComposer().
     */
    _syncPasses() {
        const pp = this.settings.postProcessing;

        if (this._ssaoPass) {
            this._ssaoPass.enabled = pp.ssao;
            if (pp.ssao) {
                const cfg = TIER_SETTINGS[this.currentTier];
                this._ssaoPass.kernelRadius = cfg.ssaoKernelRadius;
            }
        }

        if (this._bloomPass) {
            this._bloomPass.enabled  = pp.bloom;
            this._bloomPass.strength = this.settings.bloomStrength;
        }

        if (this._filmGrainPass) {
            this._filmGrainPass.enabled = pp.filmGrain;
            // Adjust grain intensity per tier (subtle on low-end, full on high-end)
            if (this._filmGrainPass.uniforms && this._filmGrainPass.uniforms.uIntensity) {
                this._filmGrainPass.uniforms.uIntensity.value = this.settings.filmGrainIntensity;
            }
        }

        if (this._colorGradePass) {
            this._colorGradePass.enabled = pp.colorGrade;
            // Adjust saturation per tier (higher on low-end to compensate for fewer layers)
            if (this._colorGradePass.uniforms && this._colorGradePass.uniforms.uSaturation) {
                this._colorGradePass.uniforms.uSaturation.value = this.settings.saturationBoost;
            }
        }
    }

    // ================================================================
    // PUBLIC API — for manual control & debug
    // ================================================================

    /**
     * Manually set a quality tier by name or index. Disables automatic
     * adaptation until resetAuto() is called.
     *
     * @param {string|number} tier - 'ULTRA' | 'HIGH' | 'MEDIUM' | 'LOW' | 'POTATO' | 0..4
     */
    setQuality(tier) {
        let tierIndex;

        if (typeof tier === 'string') {
            const upper = tier.toUpperCase();
            tierIndex = QUALITY_TIERS[upper];
            if (tierIndex === undefined) {
                console.warn(`[TGO PerfManager] Unknown tier "${tier}". Valid: ${TIER_NAMES.join(', ')}`);
                return;
            }
        } else {
            tierIndex = Math.max(0, Math.min(4, Math.floor(tier)));
        }

        this.manualOverride = true;
        console.log(
            `[TGO PerfManager] Manual override → ${TIER_NAMES[tierIndex]} ` +
            `(auto-adjust disabled)`
        );
        this._applyTier(tierIndex);
    }

    /**
     * Re-enable automatic quality adjustment after a manual override.
     */
    resetAuto() {
        this.manualOverride = false;
        this._lowFpsTimer       = 0;
        this._highFpsTimer      = 0;
        this._tierChangeCooldown = TIER_CHANGE_COOLDOWN;
        console.log('[TGO PerfManager] Auto-adjust re-enabled');
    }

    /**
     * Register a callback for quality tier changes.
     * Called with (tierName: string, settings: Object) whenever the tier changes.
     * Use this to propagate quality settings to other systems (MiningSystem, etc.).
     *
     * @param {Function} callback - (tierName, settings) => void
     */
    onQualityChanged(callback) {
        this._onQualityChanged.push(callback);
    }

    /**
     * Get a snapshot of the current performance state for HUD display.
     *
     * @returns {{ fps: number, tier: string, tierIndex: number, manualOverride: boolean, deviceInfo: Object }}
     */
    getStats() {
        return {
            fps:            Math.round(this._fps),
            tier:           TIER_NAMES[this.currentTier],
            tierIndex:      this.currentTier,
            manualOverride: this.manualOverride,
            deviceInfo:     this.deviceInfo,
        };
    }

    /**
     * Get the current FPS (rolling average over the last ~1 second).
     * @returns {number}
     */
    get fps() {
        return this._fps;
    }

    /**
     * Get the current tier name as a string.
     * @returns {string}
     */
    get tierName() {
        return TIER_NAMES[this.currentTier];
    }
}
