/**
 * THE GALACTIC ORDER - Walking Controller
 *
 * First-person camera controller for walking on planet surfaces.
 * Handles:
 * - WASD / Arrow key movement
 * - Mouse look (pointer lock)
 * - Gravity + terrain following (player sticks to ground)
 * - Sprint (Shift key)
 * - Jump (Space)
 * - Head bob for immersion
 *
 * Works with TerrainManager.getHeightAt() to keep the player
 * on the ground regardless of terrain shape.
 */

import * as THREE from 'three';

// ============================================================
// CONFIGURATION
// ============================================================

export const WALK_CONFIG = {
    // Movement
    walkSpeed: 6.0,         // meters per second (NMS-style comfortable pace)
    sprintSpeed: 12.0,      // meters per second
    jumpForce: 6.0,         // initial upward velocity (gentle NMS jump)
    gravity: -12.0,         // m/s^2 (lighter than Earth — alien planet feel)

    // Camera
    eyeHeight: 1.7,         // meters above ground
    mouseSensitivity: 0.002,
    maxPitch: Math.PI / 2 - 0.05, // ~85 degrees up/down

    // Head bob
    headBobEnabled: true,
    headBobFrequency: 7.0,    // cycles per second while walking
    headBobAmplitude: 0.06,   // meters (noticeable NMS-style bob)

    // Physics
    groundSnapDistance: 3.5,   // how far below to check for ground
    slopeSmoothing: 0.12,     // smoother camera on terrain slopes (higher = smoother)
};

// ============================================================
// WALKING CONTROLLER
// ============================================================

export class WalkingController {
    /**
     * @param {THREE.Camera} camera
     * @param {HTMLElement} domElement - The canvas element for pointer lock
     * @param {Function} getHeightAt - Function(x, z) => height at that position
     */
    constructor(camera, domElement, getHeightAt) {
        this.camera = camera;
        this.domElement = domElement;
        this.getHeightAt = getHeightAt;
        this.config = { ...WALK_CONFIG };

        // State
        this.enabled = false;
        this.position = new THREE.Vector3(0, 10, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.rotation = { yaw: 0, pitch: 0 }; // Euler angles

        // Input
        this.keys = {};
        this.isPointerLocked = false;
        this.isGrounded = false;
        this.isSprinting = false;

        // Touch input (injected by TouchControls)
        this._touchInput = null; // { moveX, moveZ, lookYaw, lookPitch, sprint, jump }

        // Head bob
        this.headBobPhase = 0;
        this.headBobOffset = 0;

        // Smoothing
        this.groundHeight = 0;
        this.smoothGroundHeight = 0;

        // Direction vectors (reused for performance)
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._moveDir = new THREE.Vector3();

        // Bind event handlers
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onPointerLockChange = this._onPointerLockChange.bind(this);
        this._onClick = this._onClick.bind(this);
    }

    /**
     * Set touch input from TouchControls (called each frame on mobile).
     * @param {Object|null} input - { moveX, moveZ, lookYaw, lookPitch, sprint, jump }
     */
    setTouchInput(input) {
        this._touchInput = input;
    }

    /**
     * Enable the walking controller.
     * Attaches event listeners and activates pointer lock on click.
     */
    enable(startPosition = null) {
        if (startPosition) {
            this.position.copy(startPosition);
        }

        // Get initial ground height
        this.groundHeight = this.getHeightAt(this.position.x, this.position.z) || 0;
        this.smoothGroundHeight = this.groundHeight;
        this.position.y = this.groundHeight + this.config.eyeHeight;

        // Reset camera roll to prevent upside-down view from descent lookAt()
        this.camera.rotation.z = 0;

        // Reset rotation on first enable (coming from descent) if yaw is unset
        if (this.rotation.yaw === 0 && this.rotation.pitch === 0) {
            // Start looking roughly forward (along +Z)
            this.rotation.yaw = 0;
            this.rotation.pitch = 0;
        }

        // Reset velocity
        this.velocity.set(0, 0, 0);
        this.isGrounded = true;

        this.enabled = true;

        // Event listeners
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('pointerlockchange', this._onPointerLockChange);
        this.domElement.addEventListener('click', this._onClick);
    }

    /**
     * Disable the walking controller.
     */
    disable() {
        this.enabled = false;
        this.keys = {};

        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('pointerlockchange', this._onPointerLockChange);
        this.domElement.removeEventListener('click', this._onClick);

        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
    }

    /**
     * Update every frame.
     * @param {number} dt - Delta time in seconds
     */
    update(dt) {
        if (!this.enabled) return;

        // Clamp dt to prevent huge jumps
        dt = Math.min(dt, 0.1);

        // ---- MOVEMENT ----
        this._updateMovement(dt);

        // ---- GRAVITY + GROUND ----
        this._updatePhysics(dt);

        // ---- HEAD BOB ----
        this._updateHeadBob(dt);

        // ---- APPLY TO CAMERA ----
        this._applyToCamera();
    }

    /**
     * Calculate horizontal movement from keyboard input.
     */
    _updateMovement(dt) {
        // Forward direction (yaw only, no pitch — we walk horizontally)
        this._forward.set(
            -Math.sin(this.rotation.yaw),
            0,
            -Math.cos(this.rotation.yaw)
        ).normalize();

        // Right direction
        this._right.set(
            Math.cos(this.rotation.yaw),
            0,
            -Math.sin(this.rotation.yaw)
        ).normalize();

        // Input direction
        this._moveDir.set(0, 0, 0);

        // Touch input (analog joystick) takes priority if active
        const ti = this._touchInput;
        if (ti && (ti.moveX !== 0 || ti.moveZ !== 0)) {
            // Analog stick: moveZ = forward/back, moveX = strafe
            this._moveDir.addScaledVector(this._forward, ti.moveZ);
            this._moveDir.addScaledVector(this._right, ti.moveX);
            // Apply touch look
            this.rotation.yaw -= ti.lookYaw * 0.02;
            this.rotation.pitch -= ti.lookPitch * 0.02;
            this.rotation.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.rotation.pitch));
        } else {
            if (this.keys['KeyW'] || this.keys['ArrowUp'])    this._moveDir.add(this._forward);
            if (this.keys['KeyS'] || this.keys['ArrowDown'])   this._moveDir.sub(this._forward);
            if (this.keys['KeyA'] || this.keys['ArrowLeft'])   this._moveDir.sub(this._right);
            if (this.keys['KeyD'] || this.keys['ArrowRight'])  this._moveDir.add(this._right);
        }

        // Touch look (even without movement)
        if (ti && (ti.lookYaw !== 0 || ti.lookPitch !== 0) && ti.moveX === 0 && ti.moveZ === 0) {
            this.rotation.yaw -= ti.lookYaw * 0.02;
            this.rotation.pitch -= ti.lookPitch * 0.02;
            this.rotation.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.rotation.pitch));
        }

        // Normalize diagonal movement
        if (this._moveDir.lengthSq() > 0) {
            this._moveDir.normalize();
        }

        // Speed (touch boost or keyboard sprint)
        this.isSprinting = (ti && ti.sprint) || this.keys['ShiftLeft'] || this.keys['ShiftRight'];
        const speed = this.isSprinting ? this.config.sprintSpeed : this.config.walkSpeed;

        // Apply movement
        this.velocity.x = this._moveDir.x * speed;
        this.velocity.z = this._moveDir.z * speed;

        this.position.x += this.velocity.x * dt;
        this.position.z += this.velocity.z * dt;
    }

    /**
     * Gravity and ground collision.
     * NMS-style: smooth terrain following, gentle landings, no jitter.
     */
    _updatePhysics(dt) {
        // Get ground height at current position
        const newGroundHeight = this.getHeightAt(this.position.x, this.position.z);
        if (newGroundHeight !== null && newGroundHeight !== undefined) {
            this.groundHeight = newGroundHeight;
        }

        // Smooth ground height with gentle slope interpolation
        // This prevents jarring camera jumps on uneven terrain
        const slopeRate = this.config.slopeSmoothing || 0.12;
        const smoothSpeed = 1.0 - Math.pow(slopeRate, dt * 60);
        this.smoothGroundHeight += (this.groundHeight - this.smoothGroundHeight) * smoothSpeed;

        const targetY = this.smoothGroundHeight + this.config.eyeHeight;

        // Apply gravity
        this.velocity.y += this.config.gravity * dt;
        this.position.y += this.velocity.y * dt;

        // Ground collision — soft landing
        if (this.position.y <= targetY) {
            this.position.y = targetY;
            // Dampen landing instead of hard stop (NMS feel)
            if (this.velocity.y < -2) {
                this.velocity.y *= -0.1; // Tiny bounce
            } else {
                this.velocity.y = 0;
            }
            this.isGrounded = true;
        } else {
            // Check if we're very close to ground (standing on slope going down)
            const gap = this.position.y - targetY;
            if (gap < 0.3 && this.velocity.y <= 0) {
                // Snap to ground gently — walking downhill
                this.position.y = targetY;
                this.velocity.y = 0;
                this.isGrounded = true;
            } else {
                this.isGrounded = false;
            }
        }

        // Jump (keyboard or touch)
        if (this.isGrounded && (this.keys['Space'] || (this._touchInput && this._touchInput.jump))) {
            this.velocity.y = this.config.jumpForce;
            this.isGrounded = false;
        }
    }

    /**
     * Head bob while moving.
     */
    _updateHeadBob(dt) {
        if (!this.config.headBobEnabled) {
            this.headBobOffset = 0;
            return;
        }

        const isMoving = this._moveDir.lengthSq() > 0.01 && this.isGrounded;
        if (isMoving) {
            const freq = this.isSprinting
                ? this.config.headBobFrequency * 1.3
                : this.config.headBobFrequency;
            this.headBobPhase += dt * freq;
            this.headBobOffset = Math.sin(this.headBobPhase * Math.PI * 2) * this.config.headBobAmplitude;
        } else {
            // Smoothly return to zero
            this.headBobOffset *= 0.9;
            this.headBobPhase = 0;
        }
    }

    /**
     * Apply position + rotation to camera.
     */
    _applyToCamera() {
        this.camera.position.set(
            this.position.x,
            this.position.y + this.headBobOffset,
            this.position.z
        );

        // Euler rotation: yaw around Y, pitch around X
        // IMPORTANT: Always reset Z to 0 — the descent camera.lookAt() can leave
        // a z-roll (e.g., -π = upside down) that persists if not cleared.
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.rotation.yaw;
        this.camera.rotation.x = this.rotation.pitch;
        this.camera.rotation.z = 0;
    }

    // ============================================================
    // EVENT HANDLERS
    // ============================================================

    _onKeyDown(e) {
        this.keys[e.code] = true;
    }

    _onKeyUp(e) {
        this.keys[e.code] = false;
    }

    _onMouseMove(e) {
        if (!this.isPointerLocked) return;

        this.rotation.yaw -= e.movementX * this.config.mouseSensitivity;
        this.rotation.pitch -= e.movementY * this.config.mouseSensitivity;

        // Clamp pitch
        this.rotation.pitch = Math.max(
            -this.config.maxPitch,
            Math.min(this.config.maxPitch, this.rotation.pitch)
        );
    }

    _onClick() {
        if (!this.isPointerLocked && this.enabled) {
            this.domElement.requestPointerLock();
        }
    }

    _onPointerLockChange() {
        this.isPointerLocked = document.pointerLockElement === this.domElement;
    }

    // ============================================================
    // PUBLIC HELPERS
    // ============================================================

    /**
     * Get position info for HUD.
     */
    getHUDInfo() {
        return {
            x: this.position.x.toFixed(1),
            y: this.position.y.toFixed(1),
            z: this.position.z.toFixed(1),
            groundHeight: this.groundHeight.toFixed(1),
            speed: Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2).toFixed(1),
            isGrounded: this.isGrounded,
            isSprinting: this.isSprinting,
        };
    }

    /**
     * Get the forward look direction.
     */
    getLookDirection() {
        const dir = new THREE.Vector3(0, 0, -1);
        dir.applyQuaternion(this.camera.quaternion);
        return dir;
    }
}
