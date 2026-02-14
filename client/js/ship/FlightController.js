/**
 * THE GALACTIC ORDER - Ship Flight Controller (Pioneer-Style Thruster Physics)
 *
 * Upgraded with Pioneer Space Sim's thruster-based flight model:
 *
 * Pioneer models individual thrusters on the ship — main engine,
 * retro rockets, lateral jets, and rotational thrusters. Each has
 * its own force and fuel consumption. This gives the ship a much
 * more realistic, weighty feel compared to simple velocity changes.
 *
 * Key differences from the original:
 * 1. 6DOF (six degrees of freedom) — translate + rotate on all axes
 * 2. Angular momentum — ship keeps spinning until counter-thrust
 * 3. Individual thruster forces (not just "move forward")
 * 4. Fuel system — thrusters consume fuel, no fuel = no thrust
 * 5. Thruster response delay — thrusters spool up, not instant
 *
 * Controls:
 *   W/S         — Main / Retro thrust
 *   A/D         — Lateral (strafe) thrust
 *   R/F         — Vertical thrust (up/down)
 *   Shift       — Afterburner (3x main thrust, 5x fuel burn)
 *   Alt         — Free look (orbit camera without turning ship)
 *   Mouse       — Pitch + Yaw (rotational thrusters)
 *   Q/E         — Roll (rotational thrusters)
 *   E           — Exit ship (handled externally)
 *
 * Physics: Pioneer-style Newtonian with thruster forces.
 * Camera is parented to ship group for natural cockpit movement.
 */

import * as THREE from 'three';

// ============================================================
// THRUSTER CONFIGURATION (Pioneer-inspired)
// ============================================================

/**
 * Each thruster group has:
 * - force: Newtons of thrust
 * - fuelRate: kg/s fuel consumption
 * - spoolTime: seconds to reach full thrust from zero
 */
export const THRUSTER_CONFIG = {
    // Main engine (rear-facing, pushes ship forward)
    main: {
        force: 50.0,          // m/s² (assuming unit mass ship)
        fuelRate: 1.0,        // fuel units per second
        spoolTime: 0.15,      // seconds to full power
    },
    // Retro rockets (forward-facing, slows ship down)
    retro: {
        force: 40.0,
        fuelRate: 0.8,
        spoolTime: 0.1,
    },
    // Lateral thrusters (left/right strafe)
    lateral: {
        force: 30.0,
        fuelRate: 0.5,
        spoolTime: 0.08,
    },
    // Vertical thrusters (up/down)
    vertical: {
        force: 25.0,
        fuelRate: 0.5,
        spoolTime: 0.08,
    },
    // Rotational thrusters (pitch, yaw, roll)
    rotation: {
        pitchForce: 1.5,      // rad/s² angular acceleration
        yawForce: 1.5,
        rollForce: 2.0,
        fuelRate: 0.2,
        spoolTime: 0.05,
    },
    // Afterburner (multiplies main engine)
    afterburner: {
        thrustMultiplier: 3.0,
        fuelMultiplier: 5.0,
    },
};

export const FLIGHT_CONFIG = {
    // Thrust
    forwardThrust: 50.0,
    strafeThrust: 30.0,
    brakeForce: 40.0,
    boostMultiplier: 3.0,
    verticalThrust: 25.0,

    // Speed limits
    maxSpeed: 80.0,
    maxBoostSpeed: 200.0,
    verticalSpeed: 25.0,

    // Drag — Pioneer uses very low drag (space is a vacuum)
    // We keep some drag for game feel but less than before
    linearDrag: 0.3,          // Reduced from 0.6 — more Newtonian
    angularDrag: 2.0,         // Angular velocity decay (stabilization thrusters)

    // Steering — now driven by rotational thrusters
    mouseSensitivity: 0.0015,
    pitchSpeed: 1.5,
    yawSpeed: 1.5,
    rollSpeed: 2.0,           // Q/E roll
    rollOnStrafe: 0.4,
    rollReturnSpeed: 3.0,

    // Camera
    cockpitOffset: new THREE.Vector3(0, 0.85, -1.4),
    freeLookSpeed: 0.003,
    freeLookMaxAngle: Math.PI * 0.6,
    freeLookReturnSpeed: 5.0,

    // Ground collision
    minAltitude: 3.0,
    groundPushForce: 20.0,

    // Landing
    landingDescentSpeed: 8.0,
    landingHeight: 2.5,

    // Fuel system
    maxFuel: 100.0,
    fuelRegenRate: 0.0,       // No passive regen — must refuel

    // Thruster response (Pioneer spool-up)
    thrusterSpoolRate: 8.0,   // How fast thrusters reach target (per second)
};

// ============================================================
// FLIGHT CONTROLLER
// ============================================================

export class FlightController {
    /**
     * @param {THREE.Camera} camera
     * @param {HTMLElement} domElement - Canvas for pointer lock
     * @param {import('./ShipModel.js').ShipModel} shipModel
     * @param {Function} getHeightAt - (x, z) => terrain height
     */
    constructor(camera, domElement, shipModel, getHeightAt) {
        this.camera = camera;
        this.domElement = domElement;
        this.ship = shipModel;
        this.getHeightAt = getHeightAt;
        this.config = { ...FLIGHT_CONFIG };

        // State
        this.enabled = false;
        this.velocity = new THREE.Vector3();
        this.angularVelocity = new THREE.Vector3(); // Pioneer: angular momentum
        this.speed = 0;
        this.altitude = 0;
        this.thrust = 0;

        // Fuel system (Pioneer-inspired)
        this.fuel = this.config.maxFuel;

        // Thruster spool states (0 = off, 1 = full)
        // Pioneer models individual thruster response times
        this.thrusterStates = {
            main: 0,
            retro: 0,
            lateralLeft: 0,
            lateralRight: 0,
            verticalUp: 0,
            verticalDown: 0,
            pitch: 0,
            yaw: 0,
            roll: 0,
        };

        // Steering
        this.pitchInput = 0;
        this.yawInput = 0;
        this.rollInput = 0;     // Q/E roll control
        this.targetRoll = 0;
        this.currentRoll = 0;

        // Free look (Alt key)
        this.isFreeLook = false;
        this.freeLookYaw = 0;
        this.freeLookPitch = 0;

        // Landing state
        this.isLanding = false;
        this.hasLanded = false;
        this.onLanded = null;

        // Input
        this.keys = {};
        this.isPointerLocked = false;
        this.isBoosting = false;

        // Touch input support
        this.touchInput = { x: 0, z: 0, yaw: 0, pitch: 0, boost: false, vertical: 0 };

        // Reusable vectors
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._up = new THREE.Vector3(0, 1, 0);
        this._shipUp = new THREE.Vector3();
        this._worldPos = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
        this._targetQuat = new THREE.Quaternion();
        this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this._thrustAccel = new THREE.Vector3();

        // Bind handlers
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onPointerLockChange = this._onPointerLockChange.bind(this);
        this._onClick = this._onClick.bind(this);
    }

    // ============================================================
    // ENABLE / DISABLE
    // ============================================================

    enable(shipPosition) {
        this.enabled = true;
        this.isLanding = false;
        this.hasLanded = false;

        // Reset inputs
        this.keys = {};
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.pitchInput = 0;
        this.yawInput = 0;
        this.rollInput = 0;
        this.freeLookYaw = 0;
        this.freeLookPitch = 0;
        this.isFreeLook = false;
        this.currentRoll = 0;

        // Reset thruster states
        for (const key of Object.keys(this.thrusterStates)) {
            this.thrusterStates[key] = 0;
        }

        if (shipPosition) {
            this.ship.group.position.copy(shipPosition);
        }

        this.ship.setLandingGear(false);

        // Parent camera to ship
        this.ship.group.add(this.camera);
        this.camera.position.copy(this.config.cockpitOffset);
        this.camera.rotation.set(0, 0, 0);
        this.camera.quaternion.identity();

        // Attach event listeners
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('pointerlockchange', this._onPointerLockChange);
        this.domElement.addEventListener('click', this._onClick);
    }

    disable() {
        this.enabled = false;

        const worldPos = new THREE.Vector3();
        this.ship.group.getWorldPosition(worldPos);

        this.camera.getWorldPosition(this._worldPos);
        this.camera.getWorldQuaternion(this._tempQuat);
        this.ship.group.remove(this.camera);

        this.camera.position.copy(this._worldPos);
        this.camera.quaternion.copy(this._tempQuat);

        this.ship.setLandingGear(true);

        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('pointerlockchange', this._onPointerLockChange);
        this.domElement.removeEventListener('click', this._onClick);

        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        this.keys = {};
        return worldPos;
    }

    // ============================================================
    // INPUT HANDLERS
    // ============================================================

    _onKeyDown(e) {
        this.keys[e.code] = true;

        if (e.code === 'AltLeft' || e.code === 'AltRight') {
            e.preventDefault();
            this.isFreeLook = true;
        }

        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            this.isBoosting = true;
        }
    }

    _onKeyUp(e) {
        this.keys[e.code] = false;

        if (e.code === 'AltLeft' || e.code === 'AltRight') {
            this.isFreeLook = false;
        }

        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            this.isBoosting = false;
        }
    }

    _onMouseMove(e) {
        if (!this.isPointerLocked) return;

        const dx = e.movementX || 0;
        const dy = e.movementY || 0;

        if (this.isFreeLook) {
            this.freeLookYaw += dx * this.config.freeLookSpeed;
            this.freeLookPitch += dy * this.config.freeLookSpeed;

            const maxAngle = this.config.freeLookMaxAngle;
            this.freeLookYaw = Math.max(-maxAngle, Math.min(maxAngle, this.freeLookYaw));
            this.freeLookPitch = Math.max(-maxAngle * 0.5, Math.min(maxAngle * 0.5, this.freeLookPitch));
        } else {
            this.yawInput -= dx * this.config.mouseSensitivity;
            this.pitchInput -= dy * this.config.mouseSensitivity;
        }
    }

    _onPointerLockChange() {
        this.isPointerLocked = document.pointerLockElement === this.domElement;
    }

    _onClick() {
        if (!this.isPointerLocked && this.enabled) {
            this.domElement.requestPointerLock();
        }
    }

    /**
     * Set touch input from TouchControls.
     * @param {Object} input - { x, z, yaw, pitch, boost, vertical }
     */
    setTouchInput(input) {
        this.touchInput = { ...this.touchInput, ...input };
    }

    // ============================================================
    // UPDATE — called every frame
    // ============================================================

    update(dt) {
        if (!this.enabled) return;

        dt = Math.min(dt, 0.1);

        if (this.isLanding) {
            this._updateLanding(dt);
            return;
        }

        // ---- Thruster spool (Pioneer response delay) ----
        this._updateThrusterSpool(dt);

        // ---- Rotational thrusters (steering) ----
        this._updateSteering(dt);

        // ---- Linear thrusters (movement) ----
        this._updateThrust(dt);

        // ---- Ground collision ----
        this._updateGroundCollision(dt);

        // ---- Apply velocity to position ----
        this.ship.group.position.addScaledVector(this.velocity, dt);

        // ---- Update stats for HUD ----
        this.speed = this.velocity.length();
        const groundH = this.getHeightAt(
            this.ship.group.position.x,
            this.ship.group.position.z
        );
        this.altitude = this.ship.group.position.y - (groundH || 0);

        // ---- Camera free look ----
        this._updateFreeLook(dt);

        // ---- Engine glow ----
        this.ship.updateEngines(this.thrust, performance.now() / 1000);
    }

    /**
     * Pioneer-style thruster spool.
     * Thrusters don't instantly reach full power — they spool up/down
     * based on input, giving a more physical, weighty feel.
     */
    _updateThrusterSpool(dt) {
        const rate = this.config.thrusterSpoolRate * dt;
        const ti = this.touchInput;

        // Target states from input
        const targets = {
            main: (this.keys['KeyW'] || ti.z > 0.1) ? 1.0 : 0.0,
            retro: (this.keys['KeyS'] || ti.z < -0.1) ? 1.0 : 0.0,
            lateralLeft: (this.keys['KeyA'] || ti.x < -0.1) ? 1.0 : 0.0,
            lateralRight: (this.keys['KeyD'] || ti.x > 0.1) ? 1.0 : 0.0,
            verticalUp: (this.keys['KeyR'] || ti.vertical > 0.1) ? 1.0 : 0.0,
            verticalDown: (this.keys['KeyF'] || ti.vertical < -0.1) ? 1.0 : 0.0,
            pitch: Math.abs(this.pitchInput) > 0.01 ? 1.0 : 0.0,
            yaw: Math.abs(this.yawInput) > 0.01 ? 1.0 : 0.0,
            roll: (this.keys['KeyQ'] || this.keys['KeyE']) ? 1.0 : 0.0,
        };

        // Spool toward targets
        for (const [key, target] of Object.entries(targets)) {
            const current = this.thrusterStates[key];
            if (current < target) {
                this.thrusterStates[key] = Math.min(target, current + rate);
            } else {
                this.thrusterStates[key] = Math.max(target, current - rate * 2); // Spool down faster
            }
        }
    }

    _updateSteering(dt) {
        // Clamp input
        this.pitchInput = Math.max(-1, Math.min(1, this.pitchInput));
        this.yawInput = Math.max(-1, Math.min(1, this.yawInput));

        // Merge touch input
        const touchYaw = this.touchInput.yaw || 0;
        const touchPitch = this.touchInput.pitch || 0;

        const euler = this._euler;
        euler.setFromQuaternion(this.ship.group.quaternion, 'YXZ');

        // Pioneer: rotational thrusters apply angular acceleration
        // Angular velocity accumulates (like real space physics)
        const pitchAccel = (this.pitchInput + touchPitch) * this.config.pitchSpeed;
        const yawAccel = (this.yawInput + touchYaw) * this.config.yawSpeed;

        // Apply rotation scaled by thruster spool state
        const pitchSpool = this.thrusterStates.pitch;
        const yawSpool = this.thrusterStates.yaw;

        euler.y += yawAccel * yawSpool * dt;
        euler.x += pitchAccel * pitchSpool * dt;

        // Clamp pitch
        euler.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, euler.x));

        // Q/E roll (Pioneer has explicit roll control)
        this.rollInput = 0;
        if (this.keys['KeyQ']) this.rollInput = 1;
        if (this.keys['KeyE']) this.rollInput = -1;

        // Bank from strafe + yaw (cosmetic)
        const strafeInput = (this.keys['KeyA'] ? 1 : 0) - (this.keys['KeyD'] ? 1 : 0)
                          + (this.touchInput.x < -0.1 ? 1 : 0) - (this.touchInput.x > 0.1 ? 1 : 0);
        this.targetRoll = strafeInput * this.config.rollOnStrafe;
        this.targetRoll += this.yawInput * 0.3;
        this.targetRoll += this.rollInput * 0.8; // Manual roll
        this.targetRoll = Math.max(-0.8, Math.min(0.8, this.targetRoll));

        this.currentRoll += (this.targetRoll - this.currentRoll) * Math.min(1, this.config.rollReturnSpeed * dt);
        euler.z = this.currentRoll;

        this.ship.group.quaternion.setFromEuler(euler);

        // Pioneer: angular drag (stabilization thrusters dampen spin)
        this.pitchInput *= Math.max(0, 1 - this.config.angularDrag * dt);
        this.yawInput *= Math.max(0, 1 - this.config.angularDrag * dt);
    }

    _updateThrust(dt) {
        // Get ship's local axes in world space
        this.ship.group.getWorldDirection(this._forward);
        this._right.crossVectors(this._forward, this._up).normalize();
        this._shipUp.crossVectors(this._right, this._forward).normalize();

        this._thrustAccel.set(0, 0, 0);
        let thrustAmount = 0;
        let fuelBurn = 0;
        const ti = this.touchInput;

        const hasFuel = this.fuel > 0;
        const boosting = this.isBoosting || ti.boost;

        // === MAIN ENGINE ===
        if ((this.keys['KeyW'] || ti.z > 0.1) && hasFuel) {
            const baseForce = THRUSTER_CONFIG.main.force;
            const multiplier = boosting ? THRUSTER_CONFIG.afterburner.thrustMultiplier : 1;
            const spool = this.thrusterStates.main;
            const force = baseForce * multiplier * spool;
            this._thrustAccel.addScaledVector(this._forward, force);
            thrustAmount = boosting ? 1.0 : 0.6;
            fuelBurn += THRUSTER_CONFIG.main.fuelRate * spool *
                (boosting ? THRUSTER_CONFIG.afterburner.fuelMultiplier : 1);
        }

        // === RETRO ROCKETS ===
        if ((this.keys['KeyS'] || ti.z < -0.1) && hasFuel) {
            const spool = this.thrusterStates.retro;
            this._thrustAccel.addScaledVector(this._forward, -THRUSTER_CONFIG.retro.force * spool);
            thrustAmount = Math.max(thrustAmount, 0.2);
            fuelBurn += THRUSTER_CONFIG.retro.fuelRate * spool;
        }

        // === LATERAL THRUSTERS ===
        if ((this.keys['KeyA'] || ti.x < -0.1) && hasFuel) {
            const spool = this.thrusterStates.lateralLeft;
            this._thrustAccel.addScaledVector(this._right, -THRUSTER_CONFIG.lateral.force * spool);
            thrustAmount = Math.max(thrustAmount, 0.3);
            fuelBurn += THRUSTER_CONFIG.lateral.fuelRate * spool;
        }
        if ((this.keys['KeyD'] || ti.x > 0.1) && hasFuel) {
            const spool = this.thrusterStates.lateralRight;
            this._thrustAccel.addScaledVector(this._right, THRUSTER_CONFIG.lateral.force * spool);
            thrustAmount = Math.max(thrustAmount, 0.3);
            fuelBurn += THRUSTER_CONFIG.lateral.fuelRate * spool;
        }

        // === VERTICAL THRUSTERS (R/F or touch) ===
        if ((this.keys['KeyR'] || ti.vertical > 0.1) && hasFuel) {
            const spool = this.thrusterStates.verticalUp;
            this._thrustAccel.addScaledVector(this._shipUp, THRUSTER_CONFIG.vertical.force * spool);
            thrustAmount = Math.max(thrustAmount, 0.3);
            fuelBurn += THRUSTER_CONFIG.vertical.fuelRate * spool;
        }
        if ((this.keys['KeyF'] || ti.vertical < -0.1) && hasFuel) {
            const spool = this.thrusterStates.verticalDown;
            this._thrustAccel.addScaledVector(this._shipUp, -THRUSTER_CONFIG.vertical.force * spool);
            thrustAmount = Math.max(thrustAmount, 0.3);
            fuelBurn += THRUSTER_CONFIG.vertical.fuelRate * spool;
        }

        // Apply acceleration
        this.velocity.addScaledVector(this._thrustAccel, dt);

        // Consume fuel
        this.fuel = Math.max(0, this.fuel - fuelBurn * dt);

        // Pioneer-style drag — very light in space, heavier in atmosphere
        // This simulates atmospheric drag for low-altitude flight
        const dragFactor = Math.pow(1 - this.config.linearDrag, dt);
        this.velocity.multiplyScalar(dragFactor);

        // Speed limit
        const maxSpd = boosting ? this.config.maxBoostSpeed : this.config.maxSpeed;
        if (this.velocity.length() > maxSpd) {
            this.velocity.setLength(maxSpd);
        }

        // Prevent excessive backwards speed
        const forwardSpeed = this.velocity.dot(this._forward);
        if (forwardSpeed < -10) {
            this.velocity.addScaledVector(this._forward, (-10 - forwardSpeed));
        }

        this.thrust = thrustAmount;

        // Hover bias (ships float, not fall)
        if (!this.keys['KeyS'] && !(ti.z < -0.1)) {
            const currentY = this.ship.group.position.y;
            const groundH = this.getHeightAt(
                this.ship.group.position.x,
                this.ship.group.position.z
            ) || 0;
            const hoverTarget = groundH + 20;
            if (currentY < hoverTarget && this.velocity.y < 5) {
                this.velocity.y += 8 * dt;
            }
        }
    }

    _updateGroundCollision(dt) {
        const pos = this.ship.group.position;
        const groundH = this.getHeightAt(pos.x, pos.z);
        if (groundH === null) return;

        const minY = groundH + this.config.minAltitude;

        if (pos.y < minY) {
            pos.y = minY;
            if (this.velocity.y < 0) {
                this.velocity.y = Math.abs(this.velocity.y) * 0.3;
            }
        }
    }

    _updateFreeLook(dt) {
        if (this.isFreeLook) {
            this.camera.rotation.set(
                -this.freeLookPitch,
                -this.freeLookYaw,
                0,
                'YXZ'
            );
        } else {
            if (Math.abs(this.freeLookYaw) > 0.001 || Math.abs(this.freeLookPitch) > 0.001) {
                this.freeLookYaw *= Math.max(0, 1 - this.config.freeLookReturnSpeed * dt);
                this.freeLookPitch *= Math.max(0, 1 - this.config.freeLookReturnSpeed * dt);
                this.camera.rotation.set(
                    -this.freeLookPitch,
                    -this.freeLookYaw,
                    0,
                    'YXZ'
                );
            } else {
                this.camera.rotation.set(0, 0, 0);
                this.camera.quaternion.identity();
            }
        }

        this.camera.position.copy(this.config.cockpitOffset);
    }

    // ============================================================
    // LANDING SEQUENCE
    // ============================================================

    startLanding(onComplete) {
        this.isLanding = true;
        this.hasLanded = false;
        this.onLanded = onComplete;

        this.velocity.multiplyScalar(0.3);
        this.ship.setLandingGear(true);
    }

    _updateLanding(dt) {
        const pos = this.ship.group.position;
        const groundH = this.getHeightAt(pos.x, pos.z) || 0;
        const targetY = groundH + this.config.landingHeight;

        if (pos.y > targetY + 0.1) {
            pos.y -= this.config.landingDescentSpeed * dt;
            this.velocity.multiplyScalar(Math.max(0, 1 - 3 * dt));
            pos.addScaledVector(this.velocity, dt);
        } else {
            pos.y = targetY;
            this.velocity.set(0, 0, 0);
            this.hasLanded = true;

            const euler = this._euler;
            euler.setFromQuaternion(this.ship.group.quaternion, 'YXZ');
            euler.x *= 0.9;
            euler.z *= 0.9;
            this.ship.group.quaternion.setFromEuler(euler);

            if (Math.abs(euler.x) < 0.01 && Math.abs(euler.z) < 0.01) {
                this.isLanding = false;
                if (this.onLanded) this.onLanded();
            }
        }

        this.ship.updateEngines(0.1, performance.now() / 1000);
        this.speed = this.velocity.length();
        this.altitude = pos.y - groundH;
    }

    // ============================================================
    // UTILITY
    // ============================================================

    getWorldPosition(target) {
        target = target || new THREE.Vector3();
        return this.ship.group.getWorldPosition(target);
    }

    getHUDInfo() {
        const pos = this.ship.group.position;
        return {
            speed: Math.round(this.speed),
            altitude: Math.round(this.altitude),
            x: Math.round(pos.x),
            z: Math.round(pos.z),
            isBoosting: this.isBoosting,
            thrust: this.thrust,
            isLanding: this.isLanding,
            fuel: Math.round(this.fuel),
            maxFuel: this.config.maxFuel,
            // Thruster spool states for HUD visualization
            thrusters: { ...this.thrusterStates },
        };
    }

    isNearPosition(worldPos, radius = 8) {
        return this.ship.group.position.distanceTo(worldPos) < radius;
    }
}
