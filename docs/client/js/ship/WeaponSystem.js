/**
 * THE GALACTIC ORDER - Ship Weapon System
 *
 * Two weapon modes:
 *   LASER  — instant raycast, beam visual, fast cooldown
 *   ROCKET — projectile with travel time, explosion on impact
 *
 * Controls:
 *   Left Click — Fire current weapon
 *   G          — Toggle weapon type
 */

import * as THREE from 'three';

// ============================================================
// CONFIGURATION
// ============================================================

const WEAPON_CONFIG = {
    laser: {
        cooldown: 0.15,         // seconds between shots
        range: 500,             // meters
        beamDuration: 0.2,      // how long beam visual stays
        beamColor: 0x00ffcc,    // Teal laser
        beamWidth: 0.05,
        damage: 10,
    },
    rocket: {
        cooldown: 0.8,
        speed: 80,              // m/s
        lifetime: 5.0,          // seconds before despawn
        explosionRadius: 8,
        explosionDuration: 0.4,
        rocketColor: 0xff6633,
        trailColor: 0xff9900,
        damage: 50,
        maxActive: 10,
    },
};

// ============================================================
// WEAPON SYSTEM
// ============================================================

export class WeaponSystem {
    /**
     * @param {THREE.Scene} scene
     * @param {import('./ShipModel.js').ShipModel} shipModel
     */
    constructor(scene, shipModel) {
        this.scene = scene;
        this.ship = shipModel;
        this.config = WEAPON_CONFIG;

        // State
        this.currentWeapon = 'laser'; // 'laser' or 'rocket'
        this.cooldownTimer = 0;
        this.isFiring = false;

        // Laser beams (pool)
        this.laserBeams = [];
        this._laserGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 4);
        this._laserGeo.rotateX(Math.PI / 2);
        this._laserMat = new THREE.MeshBasicMaterial({
            color: this.config.laser.beamColor,
            transparent: true,
            opacity: 0.9,
        });

        // Rockets (pool)
        this.rockets = [];
        this._rocketGeo = new THREE.ConeGeometry(0.15, 0.6, 6);
        this._rocketGeo.rotateX(Math.PI / 2);
        this._rocketMat = new THREE.MeshBasicMaterial({
            color: this.config.rocket.rocketColor,
        });

        // Explosion particles
        this.explosions = [];

        // Muzzle flash light
        this.muzzleLight = new THREE.PointLight(0x00ffcc, 0, 10);
        this.ship.group.add(this.muzzleLight);
        this.muzzleLight.position.set(0, 0, 3); // Ship nose

        // Fire origin (in ship local space, at the nose)
        this.fireOrigin = new THREE.Vector3(0, 0, 3.0);

        // Raycaster for laser hits
        this._raycaster = new THREE.Raycaster();

        // Mouse state
        this._mouseDown = false;
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
    }

    // ============================================================
    // ENABLE / DISABLE
    // ============================================================

    enable() {
        document.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mouseup', this._onMouseUp);
        document.addEventListener('keydown', this._onKeyDown);
    }

    disable() {
        document.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('mouseup', this._onMouseUp);
        document.removeEventListener('keydown', this._onKeyDown);
        this._mouseDown = false;
    }

    // ============================================================
    // INPUT
    // ============================================================

    _onMouseDown(e) {
        if (e.button === 0) { // Left click only
            this._mouseDown = true;
        }
    }

    _onMouseUp(e) {
        if (e.button === 0) {
            this._mouseDown = false;
        }
    }

    _onKeyDown(e) {
        if (e.code === 'KeyG') {
            this.toggleWeapon();
        }
    }

    toggleWeapon() {
        this.currentWeapon = this.currentWeapon === 'laser' ? 'rocket' : 'laser';
        // Update muzzle light color
        this.muzzleLight.color.setHex(
            this.currentWeapon === 'laser' ? 0x00ffcc : 0xff6633
        );
    }

    // ============================================================
    // UPDATE
    // ============================================================

    update(dt) {
        // Cooldown
        if (this.cooldownTimer > 0) {
            this.cooldownTimer -= dt;
        }

        // Fire if mouse held and cooldown ready
        if (this._mouseDown && this.cooldownTimer <= 0) {
            this._fire();
        }

        // Update active beams
        this._updateBeams(dt);

        // Update active rockets
        this._updateRockets(dt);

        // Update explosions
        this._updateExplosions(dt);

        // Decay muzzle flash
        if (this.muzzleLight.intensity > 0) {
            this.muzzleLight.intensity *= Math.max(0, 1 - 15 * dt);
            if (this.muzzleLight.intensity < 0.01) this.muzzleLight.intensity = 0;
        }
    }

    // ============================================================
    // FIRE
    // ============================================================

    _fire() {
        if (this.currentWeapon === 'laser') {
            this._fireLaser();
        } else {
            this._fireRocket();
        }

        this.cooldownTimer = this.config[this.currentWeapon].cooldown;

        // Muzzle flash
        this.muzzleLight.intensity = 3;
    }

    _fireLaser() {
        // Get world-space fire origin and direction
        const origin = this.fireOrigin.clone();
        this.ship.group.localToWorld(origin);

        const direction = new THREE.Vector3(0, 0, 1);
        direction.applyQuaternion(this.ship.group.quaternion);

        // Create beam visual
        const cfg = this.config.laser;
        const beamLength = cfg.range;
        const beam = new THREE.Mesh(this._laserGeo.clone(), this._laserMat.clone());
        beam.scale.set(1, 1, beamLength);
        beam.position.copy(origin);
        beam.position.addScaledVector(direction, beamLength / 2);
        beam.quaternion.copy(this.ship.group.quaternion);

        this.scene.add(beam);
        this.laserBeams.push({
            mesh: beam,
            lifetime: cfg.beamDuration,
        });
    }

    _fireRocket() {
        const cfg = this.config.rocket;

        // Enforce max active
        if (this.rockets.length >= cfg.maxActive) return;

        // Get world-space fire origin and direction
        const origin = this.fireOrigin.clone();
        this.ship.group.localToWorld(origin);

        const direction = new THREE.Vector3(0, 0, 1);
        direction.applyQuaternion(this.ship.group.quaternion);

        // Create rocket mesh
        const rocket = new THREE.Mesh(this._rocketGeo, this._rocketMat);
        rocket.position.copy(origin);
        rocket.quaternion.copy(this.ship.group.quaternion);

        // Trail (simple line)
        const trailGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -2),
        ]);
        const trailMat = new THREE.LineBasicMaterial({
            color: cfg.trailColor,
            transparent: true,
            opacity: 0.6,
        });
        const trail = new THREE.Line(trailGeo, trailMat);
        rocket.add(trail);

        // Rocket glow
        const glowLight = new THREE.PointLight(cfg.rocketColor, 2, 15);
        rocket.add(glowLight);

        this.scene.add(rocket);
        this.rockets.push({
            mesh: rocket,
            velocity: direction.multiplyScalar(cfg.speed),
            lifetime: cfg.lifetime,
            light: glowLight,
        });
    }

    // ============================================================
    // UPDATE PROJECTILES
    // ============================================================

    _updateBeams(dt) {
        for (let i = this.laserBeams.length - 1; i >= 0; i--) {
            const beam = this.laserBeams[i];
            beam.lifetime -= dt;

            // Fade out
            beam.mesh.material.opacity = Math.max(0, beam.lifetime / this.config.laser.beamDuration);

            if (beam.lifetime <= 0) {
                this.scene.remove(beam.mesh);
                beam.mesh.geometry.dispose();
                beam.mesh.material.dispose();
                this.laserBeams.splice(i, 1);
            }
        }
    }

    _updateRockets(dt) {
        for (let i = this.rockets.length - 1; i >= 0; i--) {
            const r = this.rockets[i];
            r.lifetime -= dt;

            // Move
            r.mesh.position.addScaledVector(r.velocity, dt);

            // Check ground hit
            const groundH = this._getGroundHeight(r.mesh.position.x, r.mesh.position.z);
            if (groundH !== null && r.mesh.position.y <= groundH + 0.5) {
                // Explode!
                this._createExplosion(r.mesh.position);
                this._removeRocket(i);
                continue;
            }

            // Timeout
            if (r.lifetime <= 0) {
                this._removeRocket(i);
            }
        }
    }

    _removeRocket(index) {
        const r = this.rockets[index];
        this.scene.remove(r.mesh);
        // Dispose trail inside rocket
        r.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        this.rockets.splice(index, 1);
    }

    _createExplosion(position) {
        // Simple particle burst: expanding sphere of points
        const count = 30;
        const positions = new Float32Array(count * 3);
        const velocities = [];

        for (let i = 0; i < count; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y;
            positions[i * 3 + 2] = position.z;

            // Random direction
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const speed = 5 + Math.random() * 15;
            velocities.push(new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.cos(phi) * speed * 0.5 + 5,
                Math.sin(phi) * Math.sin(theta) * speed,
            ));
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.PointsMaterial({
            color: 0xff6633,
            size: 0.8,
            transparent: true,
            opacity: 1,
        });

        const points = new THREE.Points(geo, mat);
        this.scene.add(points);

        // Explosion light
        const light = new THREE.PointLight(0xff6633, 5, 20);
        light.position.copy(position);
        this.scene.add(light);

        this.explosions.push({
            points,
            geo,
            mat,
            light,
            velocities,
            lifetime: this.config.rocket.explosionDuration,
            maxLifetime: this.config.rocket.explosionDuration,
        });
    }

    _updateExplosions(dt) {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const exp = this.explosions[i];
            exp.lifetime -= dt;

            const t = 1 - exp.lifetime / exp.maxLifetime;
            exp.mat.opacity = 1 - t;
            exp.mat.size = 0.8 + t * 2;
            exp.light.intensity = 5 * (1 - t);

            // Move particles
            const posArr = exp.geo.getAttribute('position').array;
            for (let j = 0; j < exp.velocities.length; j++) {
                posArr[j * 3] += exp.velocities[j].x * dt;
                posArr[j * 3 + 1] += exp.velocities[j].y * dt;
                posArr[j * 3 + 2] += exp.velocities[j].z * dt;
                // Gravity on particles
                exp.velocities[j].y -= 15 * dt;
            }
            exp.geo.getAttribute('position').needsUpdate = true;

            if (exp.lifetime <= 0) {
                this.scene.remove(exp.points);
                this.scene.remove(exp.light);
                exp.geo.dispose();
                exp.mat.dispose();
                this.explosions.splice(i, 1);
            }
        }
    }

    // Hacky but works — store getHeightAt reference
    setGetHeightAt(fn) {
        this._getGroundHeight = fn;
    }

    _getGroundHeight(x, z) {
        return this._getGroundHeight ? this._getGroundHeight(x, z) : null;
    }

    // ============================================================
    // CLEANUP
    // ============================================================

    dispose() {
        this.disable();

        for (const beam of this.laserBeams) {
            this.scene.remove(beam.mesh);
            beam.mesh.geometry.dispose();
            beam.mesh.material.dispose();
        }

        for (const r of this.rockets) {
            this.scene.remove(r.mesh);
        }

        for (const exp of this.explosions) {
            this.scene.remove(exp.points);
            this.scene.remove(exp.light);
            exp.geo.dispose();
            exp.mat.dispose();
        }

        this._laserGeo.dispose();
        this._laserMat.dispose();
    }

    /**
     * Get weapon info for HUD.
     */
    getHUDInfo() {
        const cfg = this.config[this.currentWeapon];
        return {
            weapon: this.currentWeapon.toUpperCase(),
            cooldownPct: Math.max(0, this.cooldownTimer / cfg.cooldown),
            isReady: this.cooldownTimer <= 0,
            activeRockets: this.rockets.length,
        };
    }
}
