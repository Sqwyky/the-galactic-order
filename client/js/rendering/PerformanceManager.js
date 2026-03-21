/**
 * THE GALACTIC ORDER - Performance Manager
 *
 * Adaptive quality system that keeps the game running smooth
 * on everything from gaming PCs to Chromebooks.
 *
 * Monitors FPS and automatically adjusts rendering quality across
 * the full pipeline:
 * - Post-processing passes (GTAO, bloom, film grain, TAA, SSR, SSGI,
 *   motion blur, DOF, contact shadows, atmosphere, volumetric clouds,
 *   lens flare, lens dirt, FXAA)
 * - Dynamic resolution scaling (50-100% based on tier)
 * - Terrain material features (cloud shadows, water caustics)
 * - Particle counts (atmospheric, mining, weather)
 * - Vegetation density (grass, flora)
 * - Draw distance (terrain chunk radius)
 *
 * All pass communication uses public APIs (setQuality, setWeatherParams,
 * etc.) — never reaches into _material.uniforms directly.
 *
 * Can be manually overridden via window._debug.perf.setQuality('LOW')
 *
 * Integration:
 *   const perf = new PerformanceManager(renderer);
 *   // After composer is built — single unified call:
 *   perf.registerPasses({ composer, ssaoPass, bloomPass, ... });
 *   // In game loop:
 *   perf.update(dt);
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
        shadowsEnabled:       true,
        shadowMapSize:        2048,
        postProcessing: {
            ssao:       true,
            bloom:      true,
            filmGrain:  true,
            colorGrade: true,
        },
        bloomStrengthMultiplier: 1.0,
        gtaoSamples:             16,
        gtaoRadius:              0.5,
        filmGrainIntensity:      0.025,
        saturationBoost:         1.3,
        // 8 new rendering features
        motionBlur:              true,
        motionBlurSamples:       16,
        motionBlurScale:         1.0,
        dof:                     true,
        dofSamples:              32,
        dofMaxBlur:              10.0,
        contactShadows:          true,
        contactShadowSteps:      16,
        contactShadowStrength:   0.4,
        cloudShadows:            true,
        waterCaustics:           true,
        ssgi:                    true,
        ssgiRays:                8,
        ssgiSteps:               16,
        ssgiIntensity:           0.5,
        // Visual quality features
        resolutionScale:         1.0,
        lensFlare:               true,
        lensDirt:                true,
        fxaa:                    false,  // TAA handles AA on ULTRA
    },

    // ---- HIGH: slight GTAO reduction, fewer particles ----
    [QUALITY_TIERS.HIGH]: {
        particleMultiplier:   0.75,
        drawDistance:          5,
        floraMultiplier:      0.85,
        grassEnabled:         true,
        miningParticleCount:  30,
        shadowsEnabled:       true,
        shadowMapSize:        1024,
        postProcessing: {
            ssao:       true,
            bloom:      true,
            filmGrain:  true,
            colorGrade: true,
        },
        bloomStrengthMultiplier: 1.0,
        gtaoSamples:             8,
        gtaoRadius:              0.4,
        filmGrainIntensity:      0.025,
        saturationBoost:         1.3,
        // 8 new rendering features
        motionBlur:              true,
        motionBlurSamples:       8,
        motionBlurScale:         0.8,
        dof:                     true,
        dofSamples:              16,
        dofMaxBlur:              8.0,
        contactShadows:          true,
        contactShadowSteps:      8,
        contactShadowStrength:   0.35,
        cloudShadows:            true,
        waterCaustics:           true,
        ssgi:                    true,
        ssgiRays:                4,
        ssgiSteps:               8,
        ssgiIntensity:           0.4,
        // Visual quality features
        resolutionScale:         1.0,
        lensFlare:               true,
        lensDirt:                true,
        fxaa:                    false,  // TAA handles AA on HIGH
    },

    // ---- MEDIUM: no GTAO, bloom + grain preserved, halved particles ----
    [QUALITY_TIERS.MEDIUM]: {
        particleMultiplier:   0.5,
        drawDistance:          4,
        floraMultiplier:      0.6,
        grassEnabled:         true,
        miningParticleCount:  25,
        shadowsEnabled:       true,   // CSM provides 2-cascade shadows at this tier
        shadowMapSize:        512,
        postProcessing: {
            ssao:       false,
            bloom:      true,       // Keep bloom — the painted sci-fi look
            filmGrain:  true,       // Keep grain — cheap, adds texture
            colorGrade: true,
        },
        bloomStrengthMultiplier: 0.7,
        gtaoSamples:             4,
        gtaoRadius:              0.3,
        filmGrainIntensity:      0.02,
        saturationBoost:         1.35,  // Slightly higher to compensate for no GTAO depth
        // 8 new rendering features
        motionBlur:              true,
        motionBlurSamples:       4,
        motionBlurScale:         0.5,
        dof:                     false,
        dofSamples:              16,
        dofMaxBlur:              8.0,
        contactShadows:          false,
        contactShadowSteps:      8,
        contactShadowStrength:   0.35,
        cloudShadows:            true,
        waterCaustics:           true,
        ssgi:                    false,
        ssgiRays:                4,
        ssgiSteps:               8,
        ssgiIntensity:           0.4,
        // Visual quality features
        resolutionScale:         0.85,
        lensFlare:               false,
        lensDirt:                true,
        fxaa:                    false,  // TAA still active on MEDIUM
    },

    // ---- LOW: no SSAO, reduced bloom + grain, sparse grass ----
    [QUALITY_TIERS.LOW]: {
        particleMultiplier:   0.35,
        drawDistance:          3,
        floraMultiplier:      0.4,
        grassEnabled:         true,    // Keep grass (sparse), preserves ground look
        grassMultiplier:      0.3,     // Very sparse grass
        miningParticleCount:  15,
        shadowsEnabled:       false,
        shadowMapSize:        512,
        postProcessing: {
            ssao:       false,
            bloom:      true,       // Keep bloom — even subtle bloom prevents flat look
            filmGrain:  true,       // Keep grain — nearly free on GPU
            colorGrade: true,
        },
        bloomStrengthMultiplier: 0.5,
        gtaoSamples:             4,
        gtaoRadius:              0.3,
        filmGrainIntensity:      0.015,
        saturationBoost:         1.4,   // Higher saturation compensates for fewer visual layers
        // 8 new rendering features — all disabled on LOW
        motionBlur:              false,
        motionBlurSamples:       4,
        motionBlurScale:         0.5,
        dof:                     false,
        dofSamples:              16,
        dofMaxBlur:              8.0,
        contactShadows:          false,
        contactShadowSteps:      8,
        contactShadowStrength:   0.35,
        cloudShadows:            false,
        waterCaustics:           false,
        ssgi:                    false,
        ssgiRays:                4,
        ssgiSteps:               8,
        ssgiIntensity:           0.4,
        // Visual quality features
        resolutionScale:         0.7,
        lensFlare:               false,
        lensDirt:                false,
        fxaa:                    true,   // FXAA replaces TAA on LOW
    },

    // ---- POTATO: everything stays ON but at minimum — looks good, runs fast ----
    [QUALITY_TIERS.POTATO]: {
        particleMultiplier:   0.25,
        drawDistance:          2,
        floraMultiplier:      0.25,
        grassEnabled:         false,   // Only grass is disabled on true potato
        miningParticleCount:  10,
        shadowsEnabled:       false,
        shadowMapSize:        512,
        postProcessing: {
            ssao:       false,
            bloom:      true,       // Bloom stays — threshold raised so only bright things glow
            filmGrain:  true,       // Grain stays — it's a single texture sample, nearly free
            colorGrade: true,       // Color grade stays — always
        },
        bloomStrengthMultiplier: 0.35,
        gtaoSamples:             4,
        gtaoRadius:              0.3,
        filmGrainIntensity:      0.012, // Subtle but present
        saturationBoost:         1.45,  // Extra pop to compensate for less geometry detail
        // 8 new rendering features — all disabled on POTATO
        motionBlur:              false,
        motionBlurSamples:       4,
        motionBlurScale:         0.5,
        dof:                     false,
        dofSamples:              16,
        dofMaxBlur:              8.0,
        contactShadows:          false,
        contactShadowSteps:      8,
        contactShadowStrength:   0.35,
        cloudShadows:            false,
        waterCaustics:           false,
        ssgi:                    false,
        ssgiRays:                4,
        ssgiSteps:               8,
        ssgiIntensity:           0.4,
        // Visual quality features
        resolutionScale:         0.5,
        lensFlare:               false,
        lensDirt:                false,
        fxaa:                    true,   // FXAA replaces TAA on POTATO
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

        // ---- New rendering systems (2026 pipeline) ----
        this._taaPass        = null;   // Temporal anti-aliasing
        this._ssrPass        = null;   // Screen-space reflections
        this._autoExposure   = null;   // Eye adaptation
        this._volumetricClouds = null; // 3D volumetric clouds
        this._atmospherePass = null;   // Ray-marched atmosphere

        // ---- 8 new rendering features ----
        this._motionBlurPass     = null;
        this._dofPass            = null;
        this._contactShadowPass  = null;
        this._ssgiPass           = null;
        this._weatherSystem      = null;
        this._triplanarMaterial  = null;

        // ---- Visual quality features ----
        this._lensFlarePass      = null;
        this._lensDirtPass       = null;
        this._fxaaPass           = null;
        this._resolutionScaler   = null;

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
     * Register all rendering passes for quality management.
     * Call once after the full composer pipeline is built.
     *
     * @param {Object} passes - All pass references (any may be omitted)
     * @param {EffectComposer} [passes.composer]
     * @param {GTAOPass}       [passes.ssaoPass]
     * @param {UnrealBloomPass} [passes.bloomPass]
     * @param {ShaderPass}     [passes.filmGrainPass]
     * @param {ShaderPass}     [passes.colorGradePass]
     * @param {TAAPass}        [passes.taaPass]
     * @param {SSRPass}        [passes.ssrPass]
     * @param {AutoExposurePass} [passes.autoExposure]
     * @param {VolumetricCloudPass} [passes.volumetricClouds]
     * @param {RayMarchedAtmospherePass} [passes.atmospherePass]
     * @param {SkyDome}        [passes.skyDome]
     * @param {CSMManager}     [passes.csmManager]
     * @param {MotionBlurPass} [passes.motionBlurPass]
     * @param {DOFPass}        [passes.dofPass]
     * @param {ContactShadowPass} [passes.contactShadowPass]
     * @param {SSGIPass}       [passes.ssgiPass]
     * @param {WeatherSystem}  [passes.weatherSystem]
     * @param {THREE.ShaderMaterial} [passes.triplanarMaterial]
     */
    registerPasses(passes = {}) {
        // Core composer passes
        if (passes.composer !== undefined) this._composer = passes.composer;
        if (passes.ssaoPass !== undefined) this._ssaoPass = passes.ssaoPass;
        if (passes.bloomPass !== undefined) this._bloomPass = passes.bloomPass;
        if (passes.filmGrainPass !== undefined) this._filmGrainPass = passes.filmGrainPass;
        if (passes.colorGradePass !== undefined) this._colorGradePass = passes.colorGradePass;

        // 2026 pipeline passes
        if (passes.taaPass !== undefined) this._taaPass = passes.taaPass;
        if (passes.ssrPass !== undefined) this._ssrPass = passes.ssrPass;
        if (passes.autoExposure !== undefined) this._autoExposure = passes.autoExposure;
        if (passes.volumetricClouds !== undefined) this._volumetricClouds = passes.volumetricClouds;
        if (passes.atmospherePass !== undefined) this._atmospherePass = passes.atmospherePass;
        if (passes.skyDome !== undefined) this._skyDome = passes.skyDome;
        if (passes.csmManager !== undefined) this._csmManager = passes.csmManager;

        // 8 new rendering features
        if (passes.motionBlurPass !== undefined) this._motionBlurPass = passes.motionBlurPass;
        if (passes.dofPass !== undefined) this._dofPass = passes.dofPass;
        if (passes.contactShadowPass !== undefined) this._contactShadowPass = passes.contactShadowPass;
        if (passes.ssgiPass !== undefined) this._ssgiPass = passes.ssgiPass;
        if (passes.weatherSystem !== undefined) this._weatherSystem = passes.weatherSystem;
        if (passes.triplanarMaterial !== undefined) this._triplanarMaterial = passes.triplanarMaterial;

        // Visual quality features
        if (passes.lensFlarePass !== undefined) this._lensFlarePass = passes.lensFlarePass;
        if (passes.lensDirtPass !== undefined) this._lensDirtPass = passes.lensDirtPass;
        if (passes.fxaaPass !== undefined) this._fxaaPass = passes.fxaaPass;
        if (passes.resolutionScaler !== undefined) this._resolutionScaler = passes.resolutionScaler;

        this._syncPasses();
    }

    /**
     * @deprecated Use registerPasses() instead. Kept for backward compatibility.
     */
    applyToComposer(composer, ssaoPass, bloomPass, filmGrainPass, colorGradePass) {
        this.registerPasses({ composer, ssaoPass, bloomPass, filmGrainPass, colorGradePass });
    }

    /**
     * @deprecated Use registerPasses() instead. Kept for backward compatibility.
     */
    applyToNewPasses(passes = {}) {
        this.registerPasses(passes);
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
        const cfg = TIER_SETTINGS[this.currentTier];

        // Shadows — toggle on renderer based on tier
        if (this.renderer) {
            this.renderer.shadowMap.enabled = cfg.shadowsEnabled;
        }

        if (this._ssaoPass) {
            this._ssaoPass.enabled = pp.ssao;
            if (pp.ssao && typeof this._ssaoPass.updateGtaoMaterial === 'function') {
                this._ssaoPass.updateGtaoMaterial({
                    radius: cfg.gtaoRadius,
                    samples: cfg.gtaoSamples,
                });
            }
        }

        if (this._bloomPass) {
            this._bloomPass.enabled  = pp.bloom;
            this._bloomPass.strength = this.settings.bloomStrength;
        }

        if (this._filmGrainPass) {
            this._filmGrainPass.enabled = pp.filmGrain;
            if (this._filmGrainPass.uniforms && this._filmGrainPass.uniforms.uIntensity) {
                this._filmGrainPass.uniforms.uIntensity.value = this.settings.filmGrainIntensity;
            }
        }

        if (this._colorGradePass) {
            this._colorGradePass.enabled = pp.colorGrade;
            if (this._colorGradePass.uniforms && this._colorGradePass.uniforms.uSaturation) {
                this._colorGradePass.uniforms.uSaturation.value = this.settings.saturationBoost;
            }
        }

        // ---- New 2026 pipeline passes ----
        const tierName = TIER_NAMES[this.currentTier];

        if (this._taaPass) {
            // TAA: enabled on ULTRA/HIGH/MEDIUM, disabled on LOW/POTATO (FXAA replaces it)
            if (this.currentTier >= QUALITY_TIERS.LOW) {
                this._taaPass.enabled = false;
            } else {
                this._taaPass.enabled = true;
                this._taaPass.setQuality(tierName.toLowerCase());
            }
        }

        if (this._ssrPass) {
            // SSR: enabled on ULTRA/HIGH, disabled on MEDIUM and below
            if (this.currentTier <= QUALITY_TIERS.HIGH) {
                this._ssrPass.enabled = true;
                this._ssrPass.setQuality(tierName.toLowerCase());
            } else {
                this._ssrPass.enabled = false;
            }
        }

        if (this._autoExposure) {
            // Auto-exposure: enabled on ULTRA/HIGH/MEDIUM/LOW, disabled on POTATO
            this._autoExposure.enabled = this.currentTier <= QUALITY_TIERS.LOW;
            this._autoExposure.adaptationSpeed = this.currentTier <= QUALITY_TIERS.HIGH ? 2.0 : 3.0;
        }

        if (this._volumetricClouds) {
            // Volumetric clouds: enabled on ULTRA/HIGH/MEDIUM, disabled on LOW/POTATO
            const volCloudsOn = this.currentTier <= QUALITY_TIERS.MEDIUM;
            this._volumetricClouds.enabled = volCloudsOn;

            // Toggle SkyDome 2D clouds inversely — avoid double cloud rendering
            if (this._skyDome) {
                this._skyDome.setCloudsEnabled(!volCloudsOn);
            }
        }

        if (this._atmospherePass) {
            // Ray-marched atmosphere: disabled on POTATO to meet ≤2 pass budget
            if (this.currentTier >= QUALITY_TIERS.POTATO) {
                this._atmospherePass.enabled = false;
            } else if (this.currentTier <= QUALITY_TIERS.HIGH) {
                this._atmospherePass.enabled = true;
                this._atmospherePass.setQuality('high');
            } else if (this.currentTier === QUALITY_TIERS.MEDIUM) {
                this._atmospherePass.enabled = true;
                this._atmospherePass.setQuality('medium');
            } else {
                this._atmospherePass.enabled = true;
                this._atmospherePass.setQuality('low');
            }
        }

        // ---- Cascade Shadow Maps ----
        if (this._csmManager) {
            // ULTRA/HIGH: 3 cascades, MEDIUM: 2 cascades, LOW/POTATO: disabled
            this._csmManager.setQuality(tierName);
        }

        // ---- 8 New Rendering Features (via public APIs) ----

        // Motion Blur — uses setQuality() which handles enabled + uniforms
        if (this._motionBlurPass) {
            this._motionBlurPass.setQuality(tierName.toLowerCase());
        }

        // Depth of Field — uses setQuality() which handles enabled + uniforms
        if (this._dofPass) {
            this._dofPass.setQuality(tierName.toLowerCase());
        }

        // Contact Shadows — uses setQuality() which handles enabled + uniforms
        if (this._contactShadowPass) {
            this._contactShadowPass.setQuality(tierName.toLowerCase());
        }

        // Cloud Shadows & Water Caustics (triplanar material public API)
        if (this._triplanarMaterial && this._triplanarMaterial.setWeatherParams) {
            this._triplanarMaterial.setWeatherParams({
                cloudShadows: cfg.cloudShadows,
                caustics: cfg.waterCaustics,
            });
        }

        // SSGI — uses setQuality() which handles enabled + uniforms
        if (this._ssgiPass) {
            this._ssgiPass.setQuality(tierName.toLowerCase());
        }

        // Crepuscular rays cloud occlusion (atmosphere public API)
        if (this._atmospherePass && this._atmospherePass.setCloudOcclusion) {
            this._atmospherePass.setCloudOcclusion(this.currentTier <= QUALITY_TIERS.HIGH);
        }

        // Weather system particle multiplier
        if (this._weatherSystem) {
            this._weatherSystem.setParticleMultiplier(cfg.particleMultiplier);
        }

        // ---- Visual Quality Features ----

        // Dynamic resolution scaling
        if (this._resolutionScaler) {
            this._resolutionScaler.setScale(cfg.resolutionScale);
        }

        // Lens flare
        if (this._lensFlarePass) {
            this._lensFlarePass.setQuality(tierName.toLowerCase());
        }

        // Lens dirt
        if (this._lensDirtPass) {
            this._lensDirtPass.setQuality(tierName.toLowerCase());
        }

        // FXAA fallback (enabled when TAA is off)
        if (this._fxaaPass) {
            this._fxaaPass.enabled = cfg.fxaa;
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
