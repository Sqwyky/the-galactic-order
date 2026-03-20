/**
 * THE GALACTIC ORDER - Mining System Configuration
 *
 * Shared constants and defaults for all mining sub-modules.
 */

export const MINING_CONFIG = {
    range: 12,                // meters — mining reach
    beamColor: 0x00ffcc,      // Teal beam (matches ship laser aesthetic)
    beamWidth: 0.02,
    damagePerSecond: 35,      // Base integrity drain per second
    heatPerSecond: 15,        // Base heat generation per second
    maxHeat: 100,
    heatCoolRate: 25,         // Heat decay per second when not firing
    overheatCooldown: 2.0,    // Seconds locked out after overheat

    // Deconstruction particle effect
    particleCount: 40,
    particleDuration: 1.5,    // seconds
    particleSpeed: 3,
    particleSize: 0.15,

    // Rock/flora integrity
    rockIntegrity: 100,
    floraIntegrity: 60,

    // Performance limits
    maxParticleSystems: 3,    // Max concurrent deconstruction effects
    maxCrystals: 8,           // Max concurrent resource crystals

    // Beam energy particles traveling along beam
    beamParticleCount: 3,     // Bright dots traveling along beam

    // Crystal trail
    crystalTrailEnabled: true,
    crystalTrailCount: 6,     // Tiny particles trailing behind crystal
};
