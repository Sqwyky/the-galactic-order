/**
 * THE GALACTIC ORDER - Game Manager
 *
 * Owns the game loop, phase transitions, and system orchestration.
 * Uses GameEngine for phase-based system registration.
 *
 * Extracted from landing.html to make the game loop testable
 * and keep the HTML file focused on DOM/boot only.
 *
 * Usage:
 *   const gm = new GameManager(systems);
 *   gm.start();
 */

import * as THREE from 'three';
import { GameEngine, PHASE } from './GameEngine.js';
import { eventBus } from './EventBus.js';
import { TERRAIN_CONFIG } from '../terrain/TerrainChunk.js';

export class GameManager {
    /**
     * @param {Object} systems - All game system instances
     */
    constructor(systems) {
        this.s = systems; // Short alias for all systems
        this.engine = new GameEngine();
        this.clock = new THREE.Clock();
        this._frameCount = 0;
        this._lastFpsTime = 0;
        this._shipWorldPos = new THREE.Vector3();
        this._running = false;

        // Descent state
        this.descentProgress = 0;
        this.descentLanded = false;
        this.descentStartHeight = 200;
        this.descentEndHeight = 10;
        this.descentDuration = 8;

        // Phase management (uses GameEngine internally)
        this.currentPhase = 'DESCENT';

        this._registerSystems();
        this._bindPhaseTransitions();
    }

    _registerSystems() {
        const s = this.s;
        const engine = this.engine;

        // Register systems with phases they operate in
        engine.register('terrain', s.terrainManager, {
            phases: ['DESCENT', 'SURFACE', 'FLIGHT'],
            priority: 10,
            update: (dt, t) => {
                const pos = this.currentPhase === 'FLIGHT'
                    ? this._shipWorldPos : s.camera.position;
                s.terrainManager.update(pos, s.camera, dt);
                s.terrainManager.updateWater(t, pos);
            },
        });

        engine.register('skyDome', s.skyDome, {
            phases: ['DESCENT', 'SURFACE', 'FLIGHT'],
            priority: 15,
            update: (dt, t) => {
                const pos = this.currentPhase === 'FLIGHT'
                    ? this._shipWorldPos : s.camera.position;
                s.skyDome.update(pos, t);
            },
        });

        engine.register('vegetation', null, {
            phases: ['SURFACE', 'FLIGHT'],
            priority: 20,
            update: (dt, t) => {
                const pos = this.currentPhase === 'FLIGHT'
                    ? this._shipWorldPos : s.camera.position;
                s.grassSystem.update(s.terrainManager.chunks, pos, t);
                s.rockScatter.update(s.terrainManager.chunks, pos);
                s.alienFlora.update(s.terrainManager.chunks, pos, t);
            },
        });

        engine.register('particles', s.atmosphericParticles, {
            phases: ['DESCENT', 'SURFACE', 'FLIGHT'],
            priority: 25,
            update: (dt, t) => {
                const pos = this.currentPhase === 'FLIGHT'
                    ? this._shipWorldPos : s.camera.position;
                s.atmosphericParticles.update(pos, t);
            },
        });

        engine.register('walker', s.walker, {
            phases: ['SURFACE'],
            priority: 30,
            update: (dt) => {
                if (!s.dialogue.isDialogueActive() && !s.tablet.isOpen) {
                    s.walker.update(dt);
                }
            },
        });

        engine.register('mining', s.miningSystem, {
            phases: ['SURFACE'],
            priority: 35,
            update: (dt) => {
                s.miningSystem.setMineableMeshes(
                    Array.from(s.rockScatter.rockChunks.values()),
                    Array.from(s.alienFlora.chunkMeshes.values()).flat()
                );
                s.miningSystem.update(dt);
                s.miningHUD.update(dt);
                const info = s.miningSystem.getHUDInfo();
                s.miningHUD.updateHeat(info.heatPct, info.isOverheated);
            },
        });

        engine.register('inventory', s.inventory, {
            phases: ['SURFACE'],
            priority: 36,
            update: (dt) => {
                if (s.tablet.isOpen) {
                    s.tablet.updateInventory();
                    s.tablet.updateRefinery();
                }
                s.inventory.updateRefinery(dt);
            },
        });

        engine.register('npc', s.npcManager, {
            phases: ['SURFACE'],
            priority: 40,
            update: (dt) => {
                s.npcManager.update(dt, s.camera.position);
            },
        });

        engine.register('creatures', s.creatureSystem, {
            phases: ['SURFACE'],
            priority: 45,
            update: (dt) => {
                if (s.creatureSystem) s.creatureSystem.update(dt, s.camera.position);
            },
        });

        engine.register('flight', s.flightController, {
            phases: ['FLIGHT'],
            priority: 30,
            update: (dt) => {
                s.flightController.update(dt);
                s.flightController.getWorldPosition(this._shipWorldPos);
            },
        });

        engine.register('weapons', s.weaponSystem, {
            phases: ['FLIGHT'],
            priority: 35,
            update: (dt) => s.weaponSystem.update(dt),
        });

        engine.register('scanner', s.scannerSystem, {
            phases: ['FLIGHT'],
            priority: 36,
            update: (dt) => {
                const wasScanning = s.scannerSystem.isScanning;
                s.scannerSystem.update(dt, this._shipWorldPos);
                if (!wasScanning && s.scannerSystem.isScanning) {
                    s.audioSystem.scannerPulse();
                }
            },
        });

        engine.register('hyperspace', s.hyperspaceSystem, {
            phases: ['FLIGHT'],
            priority: 37,
            update: (dt) => {
                const flightInfo = s.flightController.getHUDInfo();
                s.hyperspaceSystem.update(dt, flightInfo.altitude);
                if (s.hyperspaceSystem.isCharging) {
                    s.audioSystem.hyperspaceCharge(s.hyperspaceSystem.chargeProgress);
                }
            },
        });

        // ---- NEW SYSTEMS: PowerSystem & DamageSystem ----

        if (s.powerSystem) {
            engine.register('power', s.powerSystem, {
                phases: ['FLIGHT'],
                priority: 29, // Before flight controller so multipliers are ready
                update: () => {
                    // Power system is event-driven, no per-frame update needed
                    // But we read multipliers each frame for other systems
                },
            });
        }

        if (s.damageSystem) {
            engine.register('damage', s.damageSystem, {
                phases: ['FLIGHT'],
                priority: 38,
                update: (dt, t) => {
                    const powerMult = s.powerSystem
                        ? s.powerSystem.getMultiplier('shields') : 1.0;
                    s.damageSystem.update(dt, t, powerMult);
                },
            });
        }

        // ---- Multiplayer sync ----

        if (s.shipSyncManager) {
            engine.register('multiplayer', s.shipSyncManager, {
                phases: ['FLIGHT'],
                priority: 90, // After all other systems
                update: (dt) => {
                    const localState = s.flightController
                        ? { position: this._shipWorldPos.toArray(), rotation: [0, 0, 0, 1] }
                        : null;
                    const localSystems = (s.powerSystem && s.damageSystem)
                        ? { power: s.powerSystem.getState(), damage: s.damageSystem.getState() }
                        : null;
                    s.shipSyncManager.update(dt, localState, localSystems);
                },
            });
        }
    }

    _bindPhaseTransitions() {
        // E key — enter/exit ship
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyE' && this.currentPhase !== 'DESCENT') {
                // Don't toggle during dialogue or tablet
                const s = this.s;
                if (s.dialogue && s.dialogue.isDialogueActive()) return;
                if (s.tablet && s.tablet.isOpen) return;
                this.handleShipToggle();
            }
        });
    }

    // ============================================================
    // PHASE TRANSITIONS
    // ============================================================

    handleShipToggle() {
        const s = this.s;
        if (this.currentPhase === 'SURFACE') {
            const dist = s.camera.position.distanceTo(s.shipModel.group.position);
            if (dist < 8) this.enterShip();
        } else if (this.currentPhase === 'FLIGHT') {
            this.exitShip();
        }
    }

    enterShip() {
        const s = this.s;
        this.currentPhase = 'FLIGHT';
        this.engine.setPhase('FLIGHT');

        s.walker.disable();
        s.miningSystem.disable();

        document.getElementById('crosshair').classList.remove('visible');
        document.getElementById('controls-hint').classList.remove('visible');
        s.shipHUD.hideEnterPrompt();

        const shipPos = s.shipModel.group.position.clone();
        shipPos.y += 5;
        s.flightController.enable(shipPos);
        s.weaponSystem.enable();
        s.scannerSystem.enable();
        s.hyperspaceSystem.enable();
        s.shipHUD.show();

        document.getElementById('phaseName').textContent = 'FLIGHT MODE';
        document.getElementById('phaseInfo').textContent = `${s.planetName} · Ship Active`;
        console.log('[TGO] Entered ship — flight mode active');
    }

    exitShip() {
        const s = this.s;
        s.flightController.startLanding(() => {
            this.currentPhase = 'SURFACE';
            this.engine.setPhase('SURFACE');

            const landPos = s.flightController.disable();
            s.weaponSystem.disable();
            s.scannerSystem.disable();
            s.hyperspaceSystem.disable();
            s.shipHUD.hide();

            const groundH = s.terrainManager.getHeightAt(landPos.x, landPos.z) || 0;
            const walkStart = new THREE.Vector3(landPos.x + 3, groundH + 1.7, landPos.z + 3);
            s.walker.enable(walkStart);
            s.miningSystem.enable();

            document.getElementById('crosshair').classList.add('visible');
            document.getElementById('phaseName').textContent = 'SURFACE EXPLORATION';
            document.getElementById('phaseInfo').textContent = `${s.planetName} · Rule ${s.planetRule}`;
            console.log('[TGO] Exited ship — surface exploration');
        });
    }

    // ============================================================
    // DESCENT
    // ============================================================

    updateDescent(dt) {
        const s = this.s;
        this.descentProgress += dt / this.descentDuration;

        if (this.descentProgress >= 1.0) {
            this.descentProgress = 1.0;
            if (!this.descentLanded) {
                this.descentLanded = true;
                this.onLanded();
            }
            return;
        }

        const t = 1.0 - Math.pow(1.0 - this.descentProgress, 3);
        const height = this.descentStartHeight * (1 - t) + this.descentEndHeight * t;
        const forwardDrift = t * 20;

        let shakeX = 0, shakeY = 0;
        if (this.descentProgress < 0.6) {
            const shakeIntensity = (1.0 - this.descentProgress / 0.6) * 1.5;
            const shakeFreq = 15 + this.descentProgress * 20;
            shakeX = Math.sin(this.descentProgress * shakeFreq * 6.28) * shakeIntensity *
                     (0.5 + Math.sin(this.descentProgress * 47) * 0.5);
            shakeY = Math.cos(this.descentProgress * shakeFreq * 5.13) * shakeIntensity * 0.6;
        }

        s.camera.position.set(
            Math.sin(this.descentProgress * 0.5) * 5 + shakeX,
            height + shakeY,
            forwardDrift
        );

        const lookY = height * 0.3;
        s.camera.lookAt(0, lookY, forwardDrift + 20);

        // Atmosphere overlay
        const atmosOverlay = document.getElementById('atmos-overlay');
        if (this.descentProgress < 0.3) {
            const baseIntensity = Math.sin(this.descentProgress / 0.3 * Math.PI) * 0.4;
            const flicker = 0.05 * Math.sin(this.descentProgress * 80) + 0.03 * Math.sin(this.descentProgress * 130);
            const intensity = baseIntensity + flicker;
            atmosOverlay.style.background =
                `radial-gradient(ellipse at center, ` +
                `rgba(255,180,80,${intensity * 0.3}), ` +
                `rgba(255,120,30,${intensity * 0.7}), ` +
                `rgba(200,50,10,${intensity * 0.4}) 70%, ` +
                `transparent)`;
            atmosOverlay.style.opacity = 1;
        } else if (this.descentProgress < 0.7) {
            const hazeIntensity = (this.descentProgress - 0.3) / 0.4 * 0.15;
            atmosOverlay.style.background = s.atmosTint + hazeIntensity + ')';
            atmosOverlay.style.opacity = 1;
        } else {
            atmosOverlay.style.opacity = 0;
        }

        document.getElementById('altitudeValue').textContent = `${Math.round(height)}m`;
    }

    onLanded() {
        const s = this.s;
        this.currentPhase = 'SURFACE';
        this.engine.setPhase('SURFACE');

        // Planet name banner
        const banner = document.getElementById('planet-banner');
        document.getElementById('bannerName').textContent = s.planetName.toUpperCase();
        document.getElementById('bannerSubtitle').textContent =
            `Rule ${s.planetRule} · ${s.planetMood.bandLabel} ${s.planetMood.moodName} · ${s.planetFreq.frequency.toFixed(1)}Hz (${s.planetNote.display})` +
            (s.planetMood.isSchumannResonant ? ' · ★ RESONANT' : '');
        banner.classList.add('visible');
        setTimeout(() => banner.classList.remove('visible'), 4000);
        setTimeout(() => {
            document.getElementById('controls-hint').classList.add('visible');
            document.getElementById('crosshair').classList.add('visible');
        }, 1500);
        setTimeout(() => {
            document.getElementById('controls-hint').classList.remove('visible');
        }, 9000);

        const groundH = s.terrainManager.getHeightAt(s.camera.position.x, s.camera.position.z) || 5;
        s.walker.enable(new THREE.Vector3(s.camera.position.x, groundH + 1.7, s.camera.position.z));
        s.miningSystem.enable();

        // Place ship near landing spot
        if (s.shipModel && s.shipGroundCallback) {
            s.shipGroundCallback();
        }

        // Spawn NPC
        if (s.npcManager) {
            setTimeout(() => {
                s.npcManager.spawnMysteriousBeing();
                if (s.tablet) {
                    s.tablet.addDiscovery(`Landed on ${s.planetName}. Surface exploration initiated.`);
                    s.tablet.addDiscovery(`Anomalous energy signature detected nearby...`);
                    s.tablet.addDiscovery(`Your ship is parked nearby. Press E to board.`);
                }
            }, 2000);
        }
    }

    /**
     * Reset descent state for a new planet (called during planet transition).
     */
    resetDescent() {
        this.descentProgress = 0;
        this.descentLanded = false;
        this.currentPhase = 'DESCENT';
    }

    // ============================================================
    // GAME LOOP
    // ============================================================

    start() {
        this._running = true;
        this.engine.setPhase('DESCENT');
        this._animate();
    }

    _animate() {
        if (!this._running) return;
        requestAnimationFrame(() => this._animate());

        const dt = this.clock.getDelta();
        const t = this.clock.getElapsedTime();
        const s = this.s;

        // Phase-specific logic
        if (this.currentPhase === 'DESCENT') {
            this.updateDescent(dt);
            // Descent also updates terrain/sky/particles via engine
            this.engine.tick(dt, t);
        } else {
            // GameEngine handles all phase-specific system updates
            this.engine.tick(dt, t);

            if (this.currentPhase === 'SURFACE') {
                this._updateSurfaceHUD(dt, t);
            } else if (this.currentPhase === 'FLIGHT') {
                this._updateFlightHUD(dt, t);
            }
        }

        // ---- Always-on updates (all phases) ----

        // Ground fill follows camera/ship
        const pos = this.currentPhase === 'FLIGHT'
            ? this._shipWorldPos : s.camera.position;
        if (s.groundFill) {
            s.groundFill.position.x = pos.x;
            s.groundFill.position.z = pos.z;
        }

        // Sun tracking
        s.sunLight.position.set(pos.x + 100, 80, pos.z + 60);
        s.sunLight.target.position.set(pos.x, 0, pos.z);
        s.sunLight.target.updateMatrixWorld();

        // Cascade shadows
        s.csmManager.update(s.camera);

        // Pipeline updates
        if (s.combinedGradePass) s.combinedGradePass.uniforms.uTime.value = t;
        if (s.volumetricClouds) s.volumetricClouds.updateWind(dt);
        if (s.windField) s.windField.update(dt, s.camera.position);
        if (s.triplanarMaterial && s.triplanarMaterial.uniforms) {
            s.triplanarMaterial.uniforms.uTime.value = t;
            if (s.volumetricClouds) {
                s.triplanarMaterial.uniforms.uCloudWindOffset.value.copy(s.volumetricClouds.windOffset);
            }
        }
        if (s.atmospherePass && s.volumetricClouds) {
            s.atmospherePass.setCloudWindOffset(s.volumetricClouds.windOffset);
        }
        if (s.weatherSystem) s.weatherSystem.update(dt, s.camera.position);

        // Lens flare sun tracking
        if (s.lensFlarePass && s.lensFlarePass.enabled) {
            const sunDir = new THREE.Vector3(0.5, 0.3, 0.4).normalize();
            const sunWorldPos = s.camera.position.clone().add(sunDir.multiplyScalar(1000));
            const sunNDC = sunWorldPos.project(s.camera);
            s.lensFlarePass.setSunScreenPosition(sunNDC.x * 0.5 + 0.5, sunNDC.y * 0.5 + 0.5);
        }

        // Render
        if (s.taaPass) s.taaPass.applyJitter();
        s.composer.render();
        if (s.taaPass) s.taaPass.restoreJitter();

        // Performance
        s.perfManager.update(dt);

        // FPS counter
        this._frameCount++;
        if (t - this._lastFpsTime > 1) {
            const fps = Math.round(this._frameCount / (t - this._lastFpsTime));
            const stats = s.terrainManager.getStats();
            document.getElementById('perf').textContent =
                `${fps} FPS · ${s.perfManager.tierName} · ${stats.activeChunks} chunks (${stats.culledChunks || 0} culled) · LOD ${stats.lodBias?.toFixed(1) || '1.0'} · ${s.renderer.info.render.triangles} tris`;
            this._frameCount = 0;
            this._lastFpsTime = t;
        }
    }

    _updateSurfaceHUD(dt, t) {
        const s = this.s;

        // NPC proximity
        if (s.npcManager && s.npcManager.mysteriousBeing && s.encounterState !== 'talking') {
            const proximity = s.npcManager.checkMysteriousBeingProximity(s.camera.position);
            if (proximity.inRange && s.encounterState !== 'complete') {
                s.dialogue.hideProximityHint();
                if (s.encounterState !== 'talking' && s.triggerBeingDialogue) {
                    s.triggerBeingDialogue();
                }
            } else if (proximity.inGlowRange && s.encounterState === 'waiting') {
                s.dialogue.showProximityHint();
            } else {
                s.dialogue.hideProximityHint();
            }
        }

        // Tablet coordinates
        if (s.tablet.isOpen) {
            s.tablet.setCoordinates(s.camera.position.x, s.camera.position.y, s.camera.position.z);
        }

        // Audio
        const miningInfo = s.miningSystem.getHUDInfo();
        s.audioSystem.update(dt, {
            playerPos: s.camera.position,
            isGrounded: s.walker.isGrounded,
            isMoving: s.walker.velocity.x !== 0 || s.walker.velocity.z !== 0,
            isSprinting: s.walker.isSprinting,
            isMining: miningInfo.isFiring,
            miningHeat: miningInfo.heatPct,
            weatherState: s.weatherSystem ? s.weatherSystem.weather : 'clear',
            windStrength: s.windField ? s.windField.baseStrength : 0.1,
            altitude: s.camera.position.y,
            oceanLevel: TERRAIN_CONFIG.waterLevel || 0,
            biome: s.terrainManager.getBiomeAt ? s.terrainManager.getBiomeAt(s.camera.position.x, s.camera.position.z) : 'grassland',
        });

        // Ship proximity prompt
        if (s.shipGrounded) {
            const distToShip = s.camera.position.distanceTo(s.shipModel.group.position);
            if (distToShip < 8) {
                s.shipHUD.showEnterPrompt();
            } else {
                s.shipHUD.hideEnterPrompt();
            }
        }

        // Walking HUD
        const info = s.walker.getHUDInfo();
        document.getElementById('altitudeValue').textContent = `${info.y}m`;
        document.getElementById('phaseInfo').textContent =
            `X:${info.x} Z:${info.z} · ${info.speed}m/s${info.isSprinting ? ' · SPRINT' : ''}`;
    }

    _updateFlightHUD(dt, t) {
        const s = this.s;
        const flightInfo = s.flightController.getHUDInfo();

        // Audio
        s.audioSystem.update(dt, {
            playerPos: this._shipWorldPos,
            isGrounded: false, isMoving: false, isSprinting: false,
            isMining: false, miningHeat: 0,
            weatherState: s.weatherSystem ? s.weatherSystem.weather : 'clear',
            windStrength: s.windField ? s.windField.baseStrength : 0.1,
            altitude: flightInfo.altitude,
            oceanLevel: TERRAIN_CONFIG.waterLevel || 0,
            shipThrottle: flightInfo.thrust || 0,
            afterburner: flightInfo.isBoosting,
            shipSpeed: flightInfo.speed,
        });

        // Ship HUD — include power/damage info if available
        const weaponInfo = s.weaponSystem.getHUDInfo();
        if (s.powerSystem) {
            weaponInfo.powerState = s.powerSystem.getState();
        }
        if (s.damageSystem) {
            weaponInfo.damageState = s.damageSystem.getState();
        }
        s.shipHUD.update(flightInfo, weaponInfo);

        document.getElementById('altitudeValue').textContent = `${flightInfo.altitude}m`;
        document.getElementById('phaseInfo').textContent =
            `${flightInfo.speed}m/s · ${flightInfo.isBoosting ? 'BOOST' : 'CRUISE'}`;
    }

    dispose() {
        this._running = false;
        this.engine.dispose();
    }
}
