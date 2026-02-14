/**
 * THE GALACTIC ORDER - Ship Flight Controller
 *
 * Handles all ship flight physics and input. Mirrors WalkingController's
 * enable()/disable()/update(dt) pattern for clean phase switching.
 *
 * Controls:
 *   WASD      — Forward / Strafe Left / Brake / Strafe Right
 *   Shift     — Boosters (3x thrust)
 *   Alt       — Free look (orbit camera without turning ship)
 *   Mouse     — Steer ship (pitch + yaw)
 *   E         — Exit ship (handled externally in landing.html)
 *
 * Physics: acceleration-based with drag for smooth, NMS-style flight feel.
 * Camera is parented to ship group for natural cockpit movement.
 */

import * as THREE from 'three';

// ============================================================
// CONFIGURATION
// ============================================================

export const FLIGHT_CONFIG = {
    // Thrust
    forwardThrust: 50.0,      // m/s² acceleration
    strafeThrust: 30.0,       // m/s² strafe acceleration
    brakeForce: 40.0,         // m/s² deceleration
    boostMultiplier: 3.0,     // Shift multiplier

    // Speed limits
    maxSpeed: 80.0,           // m/s normal
    maxBoostSpeed: 200.0,     // m/s with boost
    verticalSpeed: 25.0,      // m/s up/down (R/F keys or auto-altitude)

    // Drag (0 = no drag, 1 = instant stop)
    linearDrag: 0.6,          // Velocity decay per second (smooth deceleration)

    // Steering
    mouseSensitivity: 0.0015,
    pitchSpeed: 1.5,          // rad/s max pitch rate
    yawSpeed: 1.5,            // rad/s max yaw rate
    rollOnStrafe: 0.4,        // radians bank angle when strafing
    rollReturnSpeed: 3.0,     // How fast roll returns to 0

    // Camera
    cockpitOffset: new THREE.Vector3(0, 0.6, 1.8), // Local offset from ship center
    freeLookSpeed: 0.003,
    freeLookMaxAngle: Math.PI * 0.6,  // Max free-look angle
    freeLookReturnSpeed: 5.0,         // Slerp speed back to forward

    // Ground collision
    minAltitude: 3.0,         // Minimum height above terrain
    groundPushForce: 20.0,    // How fast it pushes up when too low

    // Landing
    landingDescentSpeed: 8.0, // m/s during auto-land
    landingHeight: 2.5,       // Height above ground when landed
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
        this.speed = 0; // scalar speed for HUD
        this.altitude = 0;
        this.thrust = 0; // 0-1 for engine glow

        // Steering
        this.pitchInput = 0;
        this.yawInput = 0;
        this.targetRoll = 0;
        this.currentRoll = 0;

        // Free look (Alt key)
        this.isFreeLook = false;
        this.freeLookYaw = 0;
        this.freeLookPitch = 0;

        // Landing state
        this.isLanding = false;
        this.hasLanded = false;
        this.onLanded = null; // Callback when landing complete

        // Input
        this.keys = {};
        this.isPointerLocked = false;
        this.isBoosting = false;

        // Reusable vectors
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._up = new THREE.Vector3(0, 1, 0);
        this._worldPos = new THREE.Vector3();
        this._tempQuat = new THREE.Quaternion();
        this._targetQuat = new THREE.Quaternion();
        this._euler = new THREE.Euler(0, 0, 0, 'YXZ');

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

    /**
     * Enable flight mode. Camera becomes child of ship.
     * @param {THREE.Vector3} [shipPosition] - Where the ship is
     */
    enable(shipPosition) {
        this.enabled = true;
        this.isLanding = false;
        this.hasLanded = false;

        // Reset inputs
        this.keys = {};
        this.velocity.set(0, 0, 0);
        this.pitchInput = 0;
        this.yawInput = 0;
        this.freeLookYaw = 0;
        this.freeLookPitch = 0;
        this.isFreeLook = false;
        this.currentRoll = 0;

        if (shipPosition) {
            this.ship.group.position.copy(shipPosition);
        }

        // Retract landing gear
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

    /**
     * Disable flight mode. Camera un-parented from ship.
     * Returns the ship's world position for walking controller handoff.
     * @returns {THREE.Vector3} Ship world position
     */
    disable() {
        this.enabled = false;

        // Get ship world position before un-parenting
        const worldPos = new THREE.Vector3();
        this.ship.group.getWorldPosition(worldPos);

        // Un-parent camera
        this.camera.getWorldPosition(this._worldPos);
        this.camera.getWorldQuaternion(this._tempQuat);
        this.ship.group.remove(this.camera);

        // Restore camera to scene-level
        this.camera.position.copy(this._worldPos);
        this.camera.quaternion.copy(this._tempQuat);

        // Deploy landing gear
        this.ship.setLandingGear(true);

        // Remove listeners
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('pointerlockchange', this._onPointerLockChange);
        this.domElement.removeEventListener('click', this._onClick);

        // Exit pointer lock
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

        // Prevent Alt from opening browser menu
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
            // Free look — orbit camera without turning ship
            this.freeLookYaw += dx * this.config.freeLookSpeed;
            this.freeLookPitch += dy * this.config.freeLookSpeed;

            const maxAngle = this.config.freeLookMaxAngle;
            this.freeLookYaw = Math.max(-maxAngle, Math.min(maxAngle, this.freeLookYaw));
            this.freeLookPitch = Math.max(-maxAngle * 0.5, Math.min(maxAngle * 0.5, this.freeLookPitch));
        } else {
            // Normal steering
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

    // ============================================================
    // UPDATE — called every frame
    // ============================================================

    update(dt) {
        if (!this.enabled) return;

        // Clamp dt to prevent physics explosion
        dt = Math.min(dt, 0.1);

        if (this.isLanding) {
            this._updateLanding(dt);
            return;
        }

        // ---- Steering (apply mouse input to ship rotation) ----
        this._updateSteering(dt);

        // ---- Thrust (WASD → acceleration) ----
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

    _updateSteering(dt) {
        // Clamp input
        this.pitchInput = Math.max(-1, Math.min(1, this.pitchInput));
        this.yawInput = Math.max(-1, Math.min(1, this.yawInput));

        // Apply pitch and yaw to ship's Euler rotation
        const euler = this._euler;
        euler.setFromQuaternion(this.ship.group.quaternion, 'YXZ');

        euler.y += this.yawInput * this.config.yawSpeed * dt;
        euler.x += this.pitchInput * this.config.pitchSpeed * dt;

        // Clamp pitch to prevent flipping
        euler.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, euler.x));

        // Roll from strafe input (bank into turns)
        const strafeInput = (this.keys['KeyA'] ? 1 : 0) - (this.keys['KeyD'] ? 1 : 0);
        this.targetRoll = strafeInput * this.config.rollOnStrafe;
        // Also add yaw-based roll for natural banking
        this.targetRoll += this.yawInput * 0.3;
        this.targetRoll = Math.max(-0.6, Math.min(0.6, this.targetRoll));

        // Smooth roll
        this.currentRoll += (this.targetRoll - this.currentRoll) * Math.min(1, this.config.rollReturnSpeed * dt);
        euler.z = this.currentRoll;

        this.ship.group.quaternion.setFromEuler(euler);

        // Decay input (smooth return to center)
        this.pitchInput *= Math.max(0, 1 - 5 * dt);
        this.yawInput *= Math.max(0, 1 - 5 * dt);
    }

    _updateThrust(dt) {
        // Get ship's local axes in world space
        this.ship.group.getWorldDirection(this._forward);
        this._right.crossVectors(this._forward, this._up).normalize();

        const accel = new THREE.Vector3();
        let thrustAmount = 0;

        // Forward / Brake
        if (this.keys['KeyW']) {
            const thrustForce = this.config.forwardThrust * (this.isBoosting ? this.config.boostMultiplier : 1);
            accel.addScaledVector(this._forward, thrustForce);
            thrustAmount = this.isBoosting ? 1.0 : 0.6;
        }
        if (this.keys['KeyS']) {
            accel.addScaledVector(this._forward, -this.config.brakeForce);
            thrustAmount = Math.max(thrustAmount, 0.2);
        }

        // Strafe
        if (this.keys['KeyA']) {
            accel.addScaledVector(this._right, -this.config.strafeThrust);
            thrustAmount = Math.max(thrustAmount, 0.3);
        }
        if (this.keys['KeyD']) {
            accel.addScaledVector(this._right, this.config.strafeThrust);
            thrustAmount = Math.max(thrustAmount, 0.3);
        }

        // Apply acceleration
        this.velocity.addScaledVector(accel, dt);

        // Drag (exponential decay)
        const dragFactor = Math.pow(1 - this.config.linearDrag, dt);
        this.velocity.multiplyScalar(dragFactor);

        // Speed limit
        const maxSpd = this.isBoosting ? this.config.maxBoostSpeed : this.config.maxSpeed;
        if (this.velocity.length() > maxSpd) {
            this.velocity.setLength(maxSpd);
        }

        // Prevent going backwards (negative speed)
        const forwardSpeed = this.velocity.dot(this._forward);
        if (forwardSpeed < -10) {
            // Clamp reverse speed
            this.velocity.addScaledVector(this._forward, (-10 - forwardSpeed));
        }

        this.thrust = thrustAmount;

        // Small upward bias to counteract gravity feel (hover)
        // Ships should float, not fall
        if (!this.keys['KeyS']) {
            const currentY = this.ship.group.position.y;
            const groundH = this.getHeightAt(
                this.ship.group.position.x,
                this.ship.group.position.z
            ) || 0;
            const hoverTarget = groundH + 20; // Default hover altitude
            if (currentY < hoverTarget && this.velocity.y < 5) {
                this.velocity.y += 8 * dt; // Gentle upward push
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
            // Bounce velocity upward
            if (this.velocity.y < 0) {
                this.velocity.y = Math.abs(this.velocity.y) * 0.3; // Soft bounce
            }
        }
    }

    _updateFreeLook(dt) {
        if (this.isFreeLook) {
            // Apply free look rotation to camera (local to ship)
            this.camera.rotation.set(
                -this.freeLookPitch,
                -this.freeLookYaw,
                0,
                'YXZ'
            );
        } else {
            // Slerp camera back to forward
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

        // Ensure cockpit position
        this.camera.position.copy(this.config.cockpitOffset);
    }

    // ============================================================
    // LANDING SEQUENCE
    // ============================================================

    /**
     * Start auto-landing. Ship descends to ground.
     * @param {Function} onComplete - Called when landed
     */
    startLanding(onComplete) {
        this.isLanding = true;
        this.hasLanded = false;
        this.onLanded = onComplete;

        // Kill horizontal velocity gradually
        this.velocity.multiplyScalar(0.3);

        // Deploy landing gear
        this.ship.setLandingGear(true);
    }

    _updateLanding(dt) {
        const pos = this.ship.group.position;
        const groundH = this.getHeightAt(pos.x, pos.z) || 0;
        const targetY = groundH + this.config.landingHeight;

        // Descend
        if (pos.y > targetY + 0.1) {
            pos.y -= this.config.landingDescentSpeed * dt;
            // Slow horizontal movement
            this.velocity.multiplyScalar(Math.max(0, 1 - 3 * dt));
            pos.addScaledVector(this.velocity, dt);
        } else {
            pos.y = targetY;
            this.velocity.set(0, 0, 0);
            this.hasLanded = true;

            // Level out the ship
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

        // Update engine glow (idle)
        this.ship.updateEngines(0.1, performance.now() / 1000);
        this.speed = this.velocity.length();
        this.altitude = pos.y - groundH;
    }

    // ============================================================
    // UTILITY
    // ============================================================

    /**
     * Get the ship's world position (for terrain/sky updates).
     */
    getWorldPosition(target) {
        target = target || new THREE.Vector3();
        return this.ship.group.getWorldPosition(target);
    }

    /**
     * Get HUD info.
     */
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
        };
    }

    /**
     * Check if the ship is near a position (for E-key enter check).
     */
    isNearPosition(worldPos, radius = 8) {
        return this.ship.group.position.distanceTo(worldPos) < radius;
    }
}
