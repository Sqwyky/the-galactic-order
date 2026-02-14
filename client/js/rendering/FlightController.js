/**
 * THE GALACTIC ORDER - Flight Controller
 *
 * NMS-style flight camera that handles:
 * 1. SYSTEM VIEW — orbiting the star, clicking planets
 * 2. FLIGHT MODE — smooth interpolation toward a target planet
 * 3. ORBIT MODE — orbiting around a planet after arrival
 *
 * The flight uses a smooth exponential ease that accelerates,
 * then decelerates — feels like a spaceship with momentum.
 *
 * Works alongside Three.js OrbitControls (enables/disables as needed).
 */

import * as THREE from 'three';

// ============================================================
// FLIGHT STATES
// ============================================================

export const FLIGHT_STATE = {
    IDLE: 'idle',           // System view, free orbit around star
    FLYING: 'flying',       // In transit to a planet
    ARRIVING: 'arriving',   // Decelerating near planet
    ORBITING: 'orbiting',   // Circling the target planet
    LEAVING: 'leaving',     // Pulling back from planet to system view
};

// ============================================================
// FLIGHT CONTROLLER
// ============================================================

export class FlightController {
    /**
     * @param {THREE.Camera} camera
     * @param {Object} orbitControls - Three.js OrbitControls instance
     */
    constructor(camera, orbitControls) {
        this.camera = camera;
        this.controls = orbitControls;
        this.state = FLIGHT_STATE.IDLE;

        // Flight parameters
        this.startPosition = new THREE.Vector3();
        this.targetPosition = new THREE.Vector3();
        this.startLookAt = new THREE.Vector3();
        this.targetLookAt = new THREE.Vector3();

        this.flightProgress = 0;
        this.flightDuration = 3.0; // seconds
        this.flightSpeed = 1.0;

        // Current camera target (what we're looking at)
        this.lookAtTarget = new THREE.Vector3(0, 0, 0);

        // Orbit parameters (when orbiting a planet)
        this.orbitTarget = null;      // The ghost planet we're orbiting
        this.orbitRadius = 3;
        this.orbitAngle = 0;
        this.orbitSpeed = 0.3;
        this.orbitHeight = 0.5;

        // Callback
        this.onArrival = null;
        this.onLeaveComplete = null;

        // HUD info
        this.speed = 0;
        this.distanceToTarget = 0;

        // Warp visual effect params
        this.warpIntensity = 0;
    }

    /**
     * Initiate flight to a planet.
     *
     * @param {Object} ghostPlanet - Ghost planet descriptor
     * @param {THREE.Vector3} planetWorldPos - Planet's current world position
     * @param {Function} [onArrival] - Called when flight completes
     */
    flyTo(ghostPlanet, planetWorldPos, onArrival = null) {
        this.state = FLIGHT_STATE.FLYING;
        this.orbitTarget = ghostPlanet;
        this.onArrival = onArrival;

        // Save starting position
        this.startPosition.copy(this.camera.position);
        this.startLookAt.copy(this.lookAtTarget);

        // Calculate orbit position around the target planet
        const orbitDist = (ghostPlanet.size || 1) * 3.5;
        this.orbitRadius = orbitDist;

        // Arrive at an angle that shows the sunlit side
        const arrivalDir = new THREE.Vector3(1, 0.3, 0.5).normalize();
        this.targetPosition.copy(planetWorldPos).add(
            arrivalDir.multiplyScalar(orbitDist)
        );
        this.targetLookAt.copy(planetWorldPos);

        // Calculate flight duration based on distance
        const distance = this.startPosition.distanceTo(this.targetPosition);
        this.flightDuration = Math.max(2.0, Math.min(5.0, distance * 0.15));

        this.flightProgress = 0;

        // Disable orbit controls during flight
        if (this.controls) {
            this.controls.enabled = false;
        }
    }

    /**
     * Return to system view (pull back from planet).
     *
     * @param {THREE.Vector3} systemCenter - Center of the star system
     * @param {number} systemViewDist - How far to pull back
     * @param {Function} [onComplete] - Called when transition completes
     */
    returnToSystem(systemCenter, systemViewDist = 35, onComplete = null) {
        this.state = FLIGHT_STATE.LEAVING;
        this.onLeaveComplete = onComplete;

        this.startPosition.copy(this.camera.position);
        this.startLookAt.copy(this.lookAtTarget);

        // Pull back to a nice system overview angle
        this.targetPosition.set(
            systemCenter.x + systemViewDist * 0.5,
            systemCenter.y + systemViewDist * 0.7,
            systemCenter.z + systemViewDist * 0.5
        );
        this.targetLookAt.copy(systemCenter);

        this.flightDuration = 2.5;
        this.flightProgress = 0;

        if (this.controls) {
            this.controls.enabled = false;
        }
    }

    /**
     * Update every frame.
     * @param {number} deltaTime - Seconds since last frame
     */
    update(deltaTime) {
        switch (this.state) {
            case FLIGHT_STATE.FLYING:
            case FLIGHT_STATE.LEAVING:
                this._updateFlight(deltaTime);
                break;
            case FLIGHT_STATE.ORBITING:
                this._updateOrbit(deltaTime);
                break;
            case FLIGHT_STATE.IDLE:
            default:
                break;
        }
    }

    /**
     * Smooth flight interpolation.
     */
    _updateFlight(deltaTime) {
        this.flightProgress += deltaTime / this.flightDuration;

        if (this.flightProgress >= 1.0) {
            this.flightProgress = 1.0;

            // Arrived!
            this.camera.position.copy(this.targetPosition);
            this.lookAtTarget.copy(this.targetLookAt);
            this.camera.lookAt(this.lookAtTarget);

            this.warpIntensity = 0;
            this.speed = 0;

            if (this.state === FLIGHT_STATE.FLYING) {
                this.state = FLIGHT_STATE.ORBITING;
                this.orbitAngle = Math.atan2(
                    this.camera.position.x - this.targetLookAt.x,
                    this.camera.position.z - this.targetLookAt.z
                );

                // Re-enable orbit controls centered on planet
                if (this.controls) {
                    this.controls.target.copy(this.targetLookAt);
                    this.controls.enabled = true;
                    this.controls.update();
                }

                if (this.onArrival) this.onArrival(this.orbitTarget);
            } else if (this.state === FLIGHT_STATE.LEAVING) {
                this.state = FLIGHT_STATE.IDLE;
                this.orbitTarget = null;

                if (this.controls) {
                    this.controls.target.copy(this.targetLookAt);
                    this.controls.enabled = true;
                    this.controls.update();
                }

                if (this.onLeaveComplete) this.onLeaveComplete();
            }

            return;
        }

        // Smooth ease-in-out (cubic)
        const t = this._smoothstep(this.flightProgress);

        // Warp intensity peaks at middle of flight
        this.warpIntensity = Math.sin(this.flightProgress * Math.PI) * 0.8;

        // Speed display (arbitrary units, peaks mid-flight)
        this.speed = Math.sin(this.flightProgress * Math.PI) * 100;

        // Interpolate position
        this.camera.position.lerpVectors(this.startPosition, this.targetPosition, t);

        // Interpolate look-at
        this.lookAtTarget.lerpVectors(this.startLookAt, this.targetLookAt, t);
        this.camera.lookAt(this.lookAtTarget);

        // Distance to target for HUD
        this.distanceToTarget = this.camera.position.distanceTo(this.targetPosition);
    }

    /**
     * Orbit around the current planet.
     */
    _updateOrbit(deltaTime) {
        // Let OrbitControls handle this — we just track the state
        // Auto-rotation gives the NMS feel
        if (this.controls && this.controls.autoRotate) {
            this.controls.update();
        }
    }

    /**
     * Get current flight info for HUD display.
     */
    getHUDInfo() {
        return {
            state: this.state,
            speed: Math.round(this.speed),
            distance: this.distanceToTarget.toFixed(1),
            warpIntensity: this.warpIntensity,
            targetName: this.orbitTarget ? this.orbitTarget.name : null,
        };
    }

    /**
     * Is the controller currently animating?
     */
    isAnimating() {
        return this.state === FLIGHT_STATE.FLYING || this.state === FLIGHT_STATE.LEAVING;
    }

    /**
     * Smooth hermite interpolation.
     */
    _smoothstep(t) {
        // Quintic smoothstep for extra-smooth acceleration/deceleration
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
}
