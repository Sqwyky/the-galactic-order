/**
 * THE GALACTIC ORDER - Day/Night Cycle
 *
 * Dynamic time-of-day system that rotates the sun, transitions
 * sky colors from day → dusk → night → dawn, and adjusts all
 * lighting + atmosphere accordingly.
 *
 * Time mapping (0 to 1):
 *   0.00 = Midnight    (sun below horizon, stars visible)
 *   0.25 = Dawn        (warm orange/pink horizon, sun rising)
 *   0.50 = Noon        (full daylight, planet mood colors)
 *   0.75 = Dusk        (red/orange sunset, fading light)
 *
 * Integration:
 *   - Rotates sky dome sun direction + colors
 *   - Adjusts directional, ambient, hemisphere, fill, rim lights
 *   - Updates fog color + density
 *   - Feeds ray-marched atmosphere pass
 *   - Stars in SkyDome shader auto-appear when sky is dark
 *
 * Planet mood colors are treated as the "noon" palette.
 * Night palette is a universal deep-blue/purple darkness.
 *
 * One full cycle = 480 seconds (8 minutes) by default.
 */

import * as THREE from 'three';

// ============================================================
// UTILITY
// ============================================================

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function lerpColor(target, a, b, t) {
    target.r = a.r + (b.r - a.r) * t;
    target.g = a.g + (b.g - a.g) * t;
    target.b = a.b + (b.b - a.b) * t;
}

// ============================================================
// DAY/NIGHT CYCLE
// ============================================================

export class DayNightCycle {
    /**
     * @param {Object} [options]
     * @param {number} [options.startTime=0.35] - Initial time (0-1), 0.35 = morning
     * @param {number} [options.cycleDuration=480] - Seconds per full day
     */
    constructor(options = {}) {
        // Time: 0 = midnight, 0.5 = noon
        this.timeOfDay = options.startTime !== undefined ? options.startTime : 0.35;
        this.cycleDuration = options.cycleDuration || 480; // 8 minutes
        this.speed = 1.0;
        this.paused = false;

        // Planet "noon" colors (set by mood system)
        this.dayColors = {
            topColor: new THREE.Color(0x0a1a4a),
            midColor: new THREE.Color(0x3366aa),
            bottomColor: new THREE.Color(0x88aacc),
            fogColor: new THREE.Color(0x88aacc),
            sunColor: new THREE.Color(0xffeedd),
        };
        this.dayAmbientIntensity = 0.5;
        this.daySunIntensity = 2.8;
        this.dayHemiIntensity = 0.8;
        this.dayFogDensity = 0.003;

        // Night palette (universal dark sky)
        this._nightColors = {
            topColor: new THREE.Color(0x010108),
            midColor: new THREE.Color(0x020210),
            bottomColor: new THREE.Color(0x050518),
            fogColor: new THREE.Color(0x030310),
            sunColor: new THREE.Color(0x6677aa), // Moonlight
        };

        // Sunset/sunrise accent colors
        this._sunsetColor = new THREE.Color(1.0, 0.35, 0.12);
        this._dawnColor = new THREE.Color(1.0, 0.5, 0.2);

        // Current computed output values
        this.sunDirection = new THREE.Vector3(0.5, 0.3, 0.4).normalize();
        this.currentColors = {
            topColor: new THREE.Color(),
            midColor: new THREE.Color(),
            bottomColor: new THREE.Color(),
            fogColor: new THREE.Color(),
            sunColor: new THREE.Color(),
        };
        this.currentSunIntensity = 2.8;
        this.currentAmbientIntensity = 0.5;
        this.currentHemiIntensity = 0.8;
        this.currentFogDensity = 0.003;
        this._dayFactor = 1.0;
    }

    /**
     * Set the planet's "noon" palette from mood data.
     * Call on initial load and planet transitions.
     */
    setPlanetMood(planetMood) {
        this.dayColors.topColor.set(...planetMood.sky.topColor);
        this.dayColors.midColor.set(...planetMood.sky.bottomColor);
        this.dayColors.bottomColor.set(...planetMood.sky.fogColor);
        this.dayColors.fogColor.set(...planetMood.sky.fogColor);
        this.dayColors.sunColor.set(...planetMood.sky.sunColor);
        this.dayAmbientIntensity = planetMood.atmosphere.ambientLight;
        this.dayFogDensity = planetMood.atmosphere.fogDensity;
    }

    /**
     * Advance time and compute all current values.
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        if (this.paused) return;

        // Advance time
        this.timeOfDay += (dt / this.cycleDuration) * this.speed;
        if (this.timeOfDay >= 1.0) this.timeOfDay -= 1.0;
        if (this.timeOfDay < 0) this.timeOfDay += 1.0;

        const t = this.timeOfDay;

        // ---- SUN ORBIT ----
        // Full circular orbit: elevation = sin(angle), azimuth = cos(angle)
        const sunAngle = t * Math.PI * 2;
        const elevation = Math.sin(sunAngle - Math.PI * 0.5);
        const horizontal = Math.cos(sunAngle - Math.PI * 0.5);

        this.sunDirection.set(
            horizontal,
            elevation,
            0.35 // Slight Z offset for interesting shadow angles
        ).normalize();

        // ---- PHASE FACTORS ----
        const sunAlt = elevation; // -1 (midnight) to +1 (noon)

        // dayFactor: 0 = full night, 1 = full day
        this._dayFactor = smoothstep(-0.1, 0.3, sunAlt);

        // sunsetFactor: peaks when sun is near the horizon
        const sunsetActive = smoothstep(-0.15, 0.0, sunAlt) *
                             (1.0 - smoothstep(0.15, 0.35, sunAlt));

        // ---- SKY COLOR INTERPOLATION ----
        const df = this._dayFactor;

        lerpColor(this.currentColors.topColor, this._nightColors.topColor, this.dayColors.topColor, df);
        lerpColor(this.currentColors.midColor, this._nightColors.midColor, this.dayColors.midColor, df);
        lerpColor(this.currentColors.bottomColor, this._nightColors.bottomColor, this.dayColors.bottomColor, df);
        lerpColor(this.currentColors.fogColor, this._nightColors.fogColor, this.dayColors.fogColor, df);
        lerpColor(this.currentColors.sunColor, this._nightColors.sunColor, this.dayColors.sunColor, df);

        // ---- SUNSET/SUNRISE TINT ----
        if (sunsetActive > 0.01) {
            const warmColor = t < 0.5 ? this._dawnColor : this._sunsetColor;
            const blend = sunsetActive;
            this.currentColors.bottomColor.lerp(warmColor, blend * 0.5);
            this.currentColors.fogColor.lerp(warmColor, blend * 0.3);
            this.currentColors.sunColor.lerp(warmColor, blend * 0.4);
            this.currentColors.midColor.lerp(warmColor, blend * 0.15);
        }

        // ---- LIGHTING INTENSITIES ----
        this.currentSunIntensity = this.daySunIntensity * df;
        this.currentAmbientIntensity = this.dayAmbientIntensity * (0.12 + 0.88 * df);
        this.currentHemiIntensity = this.dayHemiIntensity * (0.1 + 0.9 * df);
        this.currentFogDensity = this.dayFogDensity * (1.0 + (1.0 - df) * 0.5);
    }

    /**
     * Apply computed values to all scene objects.
     * Call once per frame after update().
     */
    applyToScene(refs) {
        const {
            skyDome, sunLight, ambientLight, hemiLight,
            fillLight, rimLight, fog, atmospherePass,
            groundFillMat, waterSunDir,
        } = refs;

        const sd = this.sunDirection;
        const cc = this.currentColors;

        // Sky dome uniforms
        if (skyDome) {
            const u = skyDome.material.uniforms;
            u.uTopColor.value.copy(cc.topColor);
            u.uMidColor.value.copy(cc.midColor);
            u.uBottomColor.value.copy(cc.bottomColor);
            u.uFogColor.value.copy(cc.fogColor);
            u.uSunColor.value.copy(cc.sunColor);
            u.uSunDirection.value.copy(sd);
        }

        // Directional sun light
        if (sunLight) {
            sunLight.color.copy(cc.sunColor);
            sunLight.intensity = this.currentSunIntensity;
        }

        // Ambient light
        if (ambientLight) {
            ambientLight.color.copy(cc.bottomColor);
            ambientLight.intensity = this.currentAmbientIntensity;
        }

        // Hemisphere light
        if (hemiLight) {
            hemiLight.color.copy(cc.topColor);
            hemiLight.intensity = this.currentHemiIntensity;
        }

        // Fill + rim lights (fade at night)
        if (fillLight) fillLight.intensity = 0.35 * this._dayFactor;
        if (rimLight) rimLight.intensity = 0.25 * this._dayFactor;

        // Scene fog
        if (fog) {
            fog.color.copy(cc.fogColor);
            fog.density = this.currentFogDensity;
        }

        // Ground fill plane color
        if (groundFillMat) {
            groundFillMat.color.copy(cc.fogColor);
        }

        // Ray-marched atmosphere post-processing
        if (atmospherePass) {
            atmospherePass.setAtmosphere({
                skyColor: cc.topColor,
                fogColor: cc.fogColor,
                sunColor: cc.sunColor,
                sunDirection: sd,
                fogDensity: this.currentFogDensity,
            });
        }
    }

    /**
     * Update the sun light position relative to a world position.
     * Call each frame for shadow map coverage.
     * @param {THREE.DirectionalLight} sunLight
     * @param {THREE.Vector3} playerPos - Player/camera world position
     */
    updateSunPosition(sunLight, playerPos) {
        if (!sunLight) return;

        const sd = this.sunDirection;
        // Position the light source along the sun direction, far from player
        sunLight.position.set(
            playerPos.x + sd.x * 120,
            Math.max(sd.y * 100, 5), // Keep minimum height for shadow quality
            playerPos.z + sd.z * 120
        );
        sunLight.target.position.set(playerPos.x, 0, playerPos.z);
        sunLight.target.updateMatrixWorld();
    }

    // ============================================================
    // PUBLIC GETTERS
    // ============================================================

    /** 0 = full night, 1 = full day */
    getDayFactor() {
        return this._dayFactor;
    }

    /** Current phase string for HUD */
    getPhaseString() {
        const t = this.timeOfDay;
        if (t < 0.15 || t >= 0.85) return 'NIGHT';
        if (t < 0.30) return 'DAWN';
        if (t < 0.70) return 'DAY';
        return 'DUSK';
    }

    /** 24-hour clock string (e.g., "14:30") */
    getTimeString() {
        const hours = Math.floor(this.timeOfDay * 24);
        const minutes = Math.floor((this.timeOfDay * 24 - hours) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /** HUD info object */
    getHUDInfo() {
        return {
            timeOfDay: this.timeOfDay,
            phase: this.getPhaseString(),
            clock: this.getTimeString(),
            dayFactor: this._dayFactor,
            sunAltitude: this.sunDirection.y,
        };
    }
}
