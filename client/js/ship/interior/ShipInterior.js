/**
 * THE GALACTIC ORDER — Ship Interior Generator
 *
 * Generates walkable interior geometry for ships with hasWalkableInterior.
 * Players physically walk between stations and press E to assume roles.
 *
 * Interior layout per ship class:
 *   - Bridge room with station consoles
 *   - Corridors connecting bridge to engineering
 *   - Engineering section (rear)
 *   - Emissive strip lighting and holographic displays
 *
 * Interior is added to the ship group so it moves with the ship.
 * Collision uses simple AABB checks against room bounds.
 */

import * as THREE from 'three';

// ============================================================
// INTERIOR MATERIALS
// ============================================================

function createInteriorMaterials() {
    const floor = new THREE.MeshStandardMaterial({
        color: 0x1a1d22,
        metalness: 0.5,
        roughness: 0.8,
    });

    const wall = new THREE.MeshStandardMaterial({
        color: 0x252830,
        metalness: 0.3,
        roughness: 0.7,
    });

    const ceiling = new THREE.MeshStandardMaterial({
        color: 0x1e2126,
        metalness: 0.4,
        roughness: 0.6,
    });

    const console_ = new THREE.MeshStandardMaterial({
        color: 0x0a0d12,
        metalness: 0.7,
        roughness: 0.3,
    });

    const screen = new THREE.MeshBasicMaterial({
        color: 0x003322,
        transparent: true,
        opacity: 0.8,
    });

    const lightStrip = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0x334455,
        emissiveIntensity: 0.8,
    });

    const accentLight = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0x00ff88,
        emissiveIntensity: 0.5,
    });

    return { floor, wall, ceiling, console: console_, screen, lightStrip, accentLight };
}

// ============================================================
// SHIP INTERIOR
// ============================================================

export class ShipInterior {
    /**
     * @param {THREE.Group} shipGroup - Ship hull group to attach interior to
     * @param {Object} classData - Ship class from registry
     * @param {Object[]} stationPositions - From builder
     */
    constructor(shipGroup, classData, stationPositions) {
        this.shipGroup = shipGroup;
        this.classData = classData;
        this.stationPositions = stationPositions;

        this.interiorGroup = new THREE.Group();
        this.interiorGroup.name = 'interior';
        this.materials = createInteriorMaterials();

        // Room definitions for collision
        this.rooms = [];

        // Station interaction volumes
        this.stationVolumes = [];

        this._generate();
        this.shipGroup.add(this.interiorGroup);
    }

    _generate() {
        const scale = this._getInteriorScale();

        // Bridge room
        this._buildRoom({
            name: 'bridge',
            x: 0, y: 0, z: scale.bridgeZ,
            width: scale.bridgeW, height: scale.roomH, depth: scale.bridgeD,
        });

        // Corridor connecting bridge to engineering
        if (scale.corridorLen > 0) {
            this._buildCorridor({
                x: 0, y: 0, z: scale.bridgeZ - scale.bridgeD / 2 - scale.corridorLen / 2,
                width: scale.corridorW, height: scale.roomH, depth: scale.corridorLen,
            });
        }

        // Engineering room
        this._buildRoom({
            name: 'engineering',
            x: 0, y: 0, z: scale.engineeringZ,
            width: scale.engW, height: scale.roomH, depth: scale.engD,
        });

        // Station consoles
        for (const sp of this.stationPositions) {
            this._buildStationConsole(sp);
        }
    }

    _getInteriorScale() {
        const cls = this.classData.class;

        // Scale interior based on ship class
        switch (cls) {
            case 'hauler':
                return {
                    bridgeZ: 1.5, bridgeW: 2.0, bridgeD: 2.0,
                    corridorLen: 1.5, corridorW: 1.0,
                    engineeringZ: -1.5, engW: 2.0, engD: 2.0,
                    roomH: 2.0,
                };
            case 'corvette':
                return {
                    bridgeZ: 2.0, bridgeW: 2.5, bridgeD: 3.0,
                    corridorLen: 2.0, corridorW: 1.2,
                    engineeringZ: -3.0, engW: 2.5, engD: 2.5,
                    roomH: 2.2,
                };
            case 'frigate':
                return {
                    bridgeZ: 3.0, bridgeW: 3.5, bridgeD: 4.0,
                    corridorLen: 3.0, corridorW: 1.5,
                    engineeringZ: -4.0, engW: 3.0, engD: 3.0,
                    roomH: 2.5,
                };
            case 'capital':
                return {
                    bridgeZ: 4.0, bridgeW: 4.5, bridgeD: 5.0,
                    corridorLen: 4.0, corridorW: 2.0,
                    engineeringZ: -5.5, engW: 4.0, engD: 4.0,
                    roomH: 3.0,
                };
            default:
                return {
                    bridgeZ: 1.0, bridgeW: 1.5, bridgeD: 1.5,
                    corridorLen: 0, corridorW: 0.8,
                    engineeringZ: -0.5, engW: 1.5, engD: 1.5,
                    roomH: 1.8,
                };
        }
    }

    _buildRoom(cfg) {
        const M = this.materials;
        const hw = cfg.width / 2;
        const hh = cfg.height / 2;
        const hd = cfg.depth / 2;

        // Floor
        const floorGeo = new THREE.BoxGeometry(cfg.width, 0.05, cfg.depth);
        const floor = new THREE.Mesh(floorGeo, M.floor);
        floor.position.set(cfg.x, cfg.y - hh, cfg.z);
        this.interiorGroup.add(floor);

        // Ceiling
        const ceilGeo = new THREE.BoxGeometry(cfg.width, 0.05, cfg.depth);
        const ceil = new THREE.Mesh(ceilGeo, M.ceiling);
        ceil.position.set(cfg.x, cfg.y + hh, cfg.z);
        this.interiorGroup.add(ceil);

        // Walls (left, right, front, back)
        const wallThickness = 0.05;

        // Left wall
        const lwGeo = new THREE.BoxGeometry(wallThickness, cfg.height, cfg.depth);
        const lw = new THREE.Mesh(lwGeo, M.wall);
        lw.position.set(cfg.x - hw, cfg.y, cfg.z);
        this.interiorGroup.add(lw);

        // Right wall
        const rw = new THREE.Mesh(lwGeo, M.wall);
        rw.position.set(cfg.x + hw, cfg.y, cfg.z);
        this.interiorGroup.add(rw);

        // Back wall
        const bwGeo = new THREE.BoxGeometry(cfg.width, cfg.height, wallThickness);
        const bw = new THREE.Mesh(bwGeo, M.wall);
        bw.position.set(cfg.x, cfg.y, cfg.z - hd);
        this.interiorGroup.add(bw);

        // Front wall (with door opening for bridge)
        if (cfg.name !== 'bridge') {
            const fw = new THREE.Mesh(bwGeo, M.wall);
            fw.position.set(cfg.x, cfg.y, cfg.z + hd);
            this.interiorGroup.add(fw);
        }

        // Ceiling light strips
        const stripGeo = new THREE.BoxGeometry(cfg.width * 0.6, 0.03, 0.08);
        for (let i = 0; i < 3; i++) {
            const strip = new THREE.Mesh(stripGeo, M.lightStrip);
            strip.position.set(cfg.x, cfg.y + hh - 0.05, cfg.z - hd + hd * 0.5 + i * (cfg.depth * 0.3));
            this.interiorGroup.add(strip);
        }

        // Floor accent lines
        const lineGeo = new THREE.BoxGeometry(cfg.width * 0.8, 0.01, 0.04);
        const line = new THREE.Mesh(lineGeo, M.accentLight);
        line.position.set(cfg.x, cfg.y - hh + 0.03, cfg.z);
        this.interiorGroup.add(line);

        // Register room bounds for collision
        this.rooms.push({
            name: cfg.name,
            minX: cfg.x - hw + wallThickness,
            maxX: cfg.x + hw - wallThickness,
            minY: cfg.y - hh,
            maxY: cfg.y + hh,
            minZ: cfg.z - hd + wallThickness,
            maxZ: cfg.z + hd - wallThickness,
        });
    }

    _buildCorridor(cfg) {
        const M = this.materials;
        const hw = cfg.width / 2;
        const hh = cfg.height / 2;
        const hd = cfg.depth / 2;

        // Floor
        const floorGeo = new THREE.BoxGeometry(cfg.width, 0.05, cfg.depth);
        const floor = new THREE.Mesh(floorGeo, M.floor);
        floor.position.set(cfg.x, cfg.y - hh, cfg.z);
        this.interiorGroup.add(floor);

        // Ceiling
        const ceilGeo = new THREE.BoxGeometry(cfg.width, 0.05, cfg.depth);
        const ceil = new THREE.Mesh(ceilGeo, M.ceiling);
        ceil.position.set(cfg.x, cfg.y + hh, cfg.z);
        this.interiorGroup.add(ceil);

        // Side walls
        const swGeo = new THREE.BoxGeometry(0.05, cfg.height, cfg.depth);
        for (const sign of [-1, 1]) {
            const sw = new THREE.Mesh(swGeo, M.wall);
            sw.position.set(cfg.x + sign * hw, cfg.y, cfg.z);
            this.interiorGroup.add(sw);
        }

        // Corridor light strips
        const stripGeo = new THREE.BoxGeometry(0.04, 0.03, cfg.depth * 0.8);
        for (const sign of [-1, 1]) {
            const strip = new THREE.Mesh(stripGeo, M.lightStrip);
            strip.position.set(cfg.x + sign * (hw - 0.1), cfg.y + hh - 0.05, cfg.z);
            this.interiorGroup.add(strip);
        }

        // Register corridor bounds
        this.rooms.push({
            name: 'corridor',
            minX: cfg.x - hw + 0.05,
            maxX: cfg.x + hw - 0.05,
            minY: cfg.y - hh,
            maxY: cfg.y + hh,
            minZ: cfg.z - hd,
            maxZ: cfg.z + hd,
        });
    }

    _buildStationConsole(stationPos) {
        const M = this.materials;

        // Console desk
        const deskGeo = new THREE.BoxGeometry(0.8, 0.6, 0.3);
        const desk = new THREE.Mesh(deskGeo, M.console);
        desk.position.set(stationPos.x, stationPos.y - 0.2, stationPos.z + 0.5);
        this.interiorGroup.add(desk);

        // Screen (angled)
        const screenGeo = new THREE.BoxGeometry(0.6, 0.4, 0.02);
        const screen = new THREE.Mesh(screenGeo, M.screen);
        screen.position.set(stationPos.x, stationPos.y + 0.2, stationPos.z + 0.6);
        screen.rotation.x = -0.3; // Tilt back slightly
        this.interiorGroup.add(screen);

        // Chair
        const seatGeo = new THREE.BoxGeometry(0.4, 0.05, 0.4);
        const seat = new THREE.Mesh(seatGeo, M.console);
        seat.position.set(stationPos.x, stationPos.y - 0.5, stationPos.z);
        this.interiorGroup.add(seat);

        const backGeo = new THREE.BoxGeometry(0.4, 0.5, 0.05);
        const back = new THREE.Mesh(backGeo, M.console);
        back.position.set(stationPos.x, stationPos.y - 0.25, stationPos.z - 0.2);
        this.interiorGroup.add(back);

        // Station indicator light
        const indicatorGeo = new THREE.SphereGeometry(0.03, 4, 4);
        const indicatorMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
        const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
        indicator.position.set(stationPos.x, stationPos.y + 0.45, stationPos.z + 0.58);
        this.interiorGroup.add(indicator);

        // Register interaction volume
        this.stationVolumes.push({
            role: stationPos.role,
            center: { x: stationPos.x, y: stationPos.y, z: stationPos.z },
            radius: 1.5,
        });
    }

    /**
     * Check if a position is inside any room (for collision).
     * @param {{x: number, y: number, z: number}} pos
     * @returns {boolean}
     */
    isInsideInterior(pos) {
        for (const room of this.rooms) {
            if (pos.x >= room.minX && pos.x <= room.maxX &&
                pos.z >= room.minZ && pos.z <= room.maxZ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Constrain a position to stay within interior bounds.
     * @param {{x: number, y: number, z: number}} pos
     * @returns {{x: number, y: number, z: number}}
     */
    constrainPosition(pos) {
        // Find which room the player is nearest to
        let bestRoom = null;
        let bestDist = Infinity;

        for (const room of this.rooms) {
            const cx = (room.minX + room.maxX) / 2;
            const cz = (room.minZ + room.maxZ) / 2;
            const dx = pos.x - cx;
            const dz = pos.z - cz;
            const dist = dx * dx + dz * dz;
            if (dist < bestDist) {
                bestDist = dist;
                bestRoom = room;
            }
        }

        if (!bestRoom) return pos;

        return {
            x: Math.max(bestRoom.minX, Math.min(bestRoom.maxX, pos.x)),
            y: pos.y,
            z: Math.max(bestRoom.minZ, Math.min(bestRoom.maxZ, pos.z)),
        };
    }

    /**
     * Get the floor Y position (constant for ship interiors).
     * @returns {number}
     */
    getFloorY() {
        if (this.rooms.length > 0) return this.rooms[0].minY;
        return 0;
    }

    /** Dispose all interior resources. */
    dispose() {
        this.interiorGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        this.shipGroup.remove(this.interiorGroup);
    }
}
