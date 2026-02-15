/**
 * THE GALACTIC ORDER - System View
 *
 * A 3D canvas overlay that shows a star system's planets orbiting
 * their star. The player selects a planet to warp to.
 *
 * Flow:
 *   [Galaxy Map] → player clicks star → System View opens
 *   [System View] → player clicks planet → warp initiated
 *
 * Renders using a dedicated Three.js scene overlaid on the game.
 * Shows: central star (glowing sphere), orbiting ghost planets
 * (colored by archetype), orbit paths, planet info on hover.
 *
 * Uses the ghost planet data from UniverseManager — deterministic,
 * so every player sees the same system layout.
 */

import * as THREE from 'three';

// ============================================================
// SYSTEM VIEW
// ============================================================

export class SystemView {
    /**
     * @param {Object} options
     * @param {Function} options.onPlanetSelected - Called when player picks a planet
     * @param {Function} options.onBack - Called when player goes back to galaxy map
     */
    constructor(options = {}) {
        this.onPlanetSelected = options.onPlanetSelected || null;
        this.onBack = options.onBack || null;
        this.onCancel = options.onCancel || null;

        // State
        this.isOpen = false;
        this.systemData = null;
        this.hoveredPlanet = null;
        this.selectedPlanet = null;

        // Three.js scene (separate from the game scene)
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();

        // 3D objects
        this.starMesh = null;
        this.planetMeshes = []; // { mesh, ghost, orbitLine }
        this.starLight = null;

        // Camera orbit
        this.cameraAngle = 0;
        this.cameraDistance = 40;
        this.cameraHeight = 20;
        this.cameraTargetDistance = 40;

        // DOM
        this.container = null;
        this.infoPanel = null;
        this.systemLabel = null;
        this._animFrame = null;

        // Event handlers
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onClick = this._onClick.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._animate = this._animate.bind(this);

        this._build();
    }

    _build() {
        // Container
        this.container = document.createElement('div');
        this.container.id = 'system-view';
        this.container.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            z-index: 50; display: none;
            background: #000;
            transition: opacity 0.5s;
            opacity: 0;
            cursor: crosshair;
        `;

        // System label
        this.systemLabel = document.createElement('div');
        this.systemLabel.style.cssText = `
            position: absolute; top: 24px; left: 50%; transform: translateX(-50%);
            color: #88ccff; font-family: 'Courier New', monospace;
            font-size: 14px; letter-spacing: 6px;
            text-shadow: 0 0 20px rgba(100,180,255,0.3);
            pointer-events: none; text-align: center;
        `;
        this.container.appendChild(this.systemLabel);

        // Info panel
        this.infoPanel = document.createElement('div');
        this.infoPanel.style.cssText = `
            position: absolute; display: none;
            background: rgba(10, 15, 30, 0.9);
            border: 1px solid rgba(100, 180, 255, 0.2);
            padding: 12px 16px;
            font-family: 'Courier New', monospace;
            font-size: 11px; color: #aabbcc;
            pointer-events: none; min-width: 200px;
        `;
        this.container.appendChild(this.infoPanel);

        // Controls hint
        const hint = document.createElement('div');
        hint.style.cssText = `
            position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
            color: #445; font-family: 'Courier New', monospace;
            font-size: 10px; letter-spacing: 2px; text-align: center;
            pointer-events: none;
        `;
        hint.innerHTML = 'CLICK PLANET TO WARP · SCROLL TO ZOOM · BACKSPACE TO RETURN · ESC TO CANCEL';
        this.container.appendChild(hint);

        // Back button
        const backBtn = document.createElement('div');
        backBtn.style.cssText = `
            position: absolute; top: 24px; left: 24px;
            color: #556; font-family: 'Courier New', monospace;
            font-size: 11px; letter-spacing: 2px; cursor: pointer;
            padding: 4px 8px; border: 1px solid rgba(80,100,130,0.3);
            transition: color 0.2s, border-color 0.2s;
        `;
        backBtn.textContent = '< GALAXY MAP';
        backBtn.addEventListener('mouseenter', () => {
            backBtn.style.color = '#88ccff';
            backBtn.style.borderColor = 'rgba(100,180,255,0.5)';
        });
        backBtn.addEventListener('mouseleave', () => {
            backBtn.style.color = '#556';
            backBtn.style.borderColor = 'rgba(80,100,130,0.3)';
        });
        backBtn.addEventListener('click', () => {
            this.close();
            if (this.onBack) this.onBack();
        });
        this.container.appendChild(backBtn);

        document.body.appendChild(this.container);
    }

    // ============================================================
    // OPEN / CLOSE
    // ============================================================

    /**
     * Open the system view for a given star system.
     * @param {Object} systemData - From UniverseManager.generateStarSystem()
     */
    open(systemData) {
        this.systemData = systemData;
        this.hoveredPlanet = null;
        this.selectedPlanet = null;
        this.cameraAngle = 0;
        this.cameraTargetDistance = 40;
        this.cameraDistance = 40;

        // Update label
        this.systemLabel.innerHTML =
            `${systemData.star.name.toUpperCase()}` +
            `<div style="font-size: 9px; color: #556; margin-top: 4px; letter-spacing: 2px;">` +
            `${systemData.star.type.name} · ${systemData.planetCount} PLANETS · ` +
            `[${systemData.coordinates.x}, ${systemData.coordinates.y}]</div>`;

        // Create 3D scene
        this._createScene(systemData);

        // Show
        this.isOpen = true;
        this.container.style.display = 'block';
        requestAnimationFrame(() => {
            this.container.style.opacity = '1';
        });

        // Events
        this.container.addEventListener('mousemove', this._onMouseMove);
        this.container.addEventListener('click', this._onClick);
        this.container.addEventListener('wheel', this._onWheel);
        document.addEventListener('keydown', this._onKeyDown);

        // Start render loop
        this.clock.start();
        this._animate();
    }

    close() {
        this.isOpen = false;
        this.container.style.opacity = '0';

        setTimeout(() => {
            this.container.style.display = 'none';
            this._disposeScene();
        }, 500);

        this.container.removeEventListener('mousemove', this._onMouseMove);
        this.container.removeEventListener('click', this._onClick);
        this.container.removeEventListener('wheel', this._onWheel);
        document.removeEventListener('keydown', this._onKeyDown);

        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
    }

    // ============================================================
    // 3D SCENE
    // ============================================================

    _createScene(systemData) {
        // Dispose existing
        this._disposeScene();

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60, window.innerWidth / window.innerHeight, 0.1, 500
        );

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

        // Insert canvas into container (before info panel)
        this.container.insertBefore(this.renderer.domElement, this.container.firstChild);
        this.renderer.domElement.style.cssText = 'position: absolute; top: 0; left: 0;';

        // Lighting
        const ambient = new THREE.AmbientLight(0x111122, 0.5);
        this.scene.add(ambient);

        // Star
        const starType = systemData.star.type;
        const starColor = new THREE.Color(
            starType.color[0] / 255,
            starType.color[1] / 255,
            starType.color[2] / 255
        );

        // Star mesh (glowing sphere)
        const starGeo = new THREE.SphereGeometry(starType.size * 1.5, 32, 32);
        const starMat = new THREE.MeshBasicMaterial({
            color: starColor,
            transparent: true,
            opacity: 0.95,
        });
        this.starMesh = new THREE.Mesh(starGeo, starMat);
        this.scene.add(this.starMesh);

        // Star glow (sprite)
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 128;
        glowCanvas.height = 128;
        const glowCtx = glowCanvas.getContext('2d');
        const gradient = glowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, `rgba(${starType.color.join(',')}, 0.8)`);
        gradient.addColorStop(0.3, `rgba(${starType.color.join(',')}, 0.3)`);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        glowCtx.fillStyle = gradient;
        glowCtx.fillRect(0, 0, 128, 128);

        const glowTexture = new THREE.CanvasTexture(glowCanvas);
        const glowMat = new THREE.SpriteMaterial({
            map: glowTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const glowSprite = new THREE.Sprite(glowMat);
        glowSprite.scale.set(starType.size * 8, starType.size * 8, 1);
        this.scene.add(glowSprite);

        // Star light
        this.starLight = new THREE.PointLight(starColor, 2, 100);
        this.scene.add(this.starLight);

        // Planets
        this.planetMeshes = [];

        const ARCHETYPE_COLORS = {
            Barren:    0x8a7d6b,
            Desert:    0xc4a24e,
            Oceanic:   0x2266aa,
            Temperate: 0x4a8c3f,
            Frozen:    0x99bbdd,
            Volcanic:  0xaa3322,
            Exotic:    0x8844aa,
            Lush:      0x33aa55,
        };

        for (const ghost of systemData.planets) {
            const color = ARCHETYPE_COLORS[ghost.archetype?.name] || 0x888888;
            const planetSize = Math.max(0.3, ghost.size * 0.5);

            // Planet sphere
            const geo = new THREE.SphereGeometry(planetSize, 16, 16);
            const mat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.7,
                metalness: 0.1,
                emissive: new THREE.Color(color).multiplyScalar(0.1),
            });
            const mesh = new THREE.Mesh(geo, mat);
            this.scene.add(mesh);

            // Orbit ring
            const orbitGeo = new THREE.RingGeometry(
                ghost.orbitRadius - 0.02,
                ghost.orbitRadius + 0.02,
                128
            );
            const orbitMat = new THREE.MeshBasicMaterial({
                color: 0x334466,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.15,
            });
            const orbitLine = new THREE.Mesh(orbitGeo, orbitMat);
            orbitLine.rotation.x = -Math.PI / 2;
            this.scene.add(orbitLine);

            // Rings (if the planet has them)
            let ringMesh = null;
            if (ghost.hasRings) {
                const ringGeo = new THREE.RingGeometry(
                    planetSize * 1.4, planetSize * 2.2, 64
                );
                const ringMat = new THREE.MeshBasicMaterial({
                    color,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.3,
                });
                ringMesh = new THREE.Mesh(ringGeo, ringMat);
                ringMesh.rotation.x = Math.PI / 2 + ghost.axialTilt;
                mesh.add(ringMesh);
            }

            this.planetMeshes.push({
                mesh,
                ghost,
                orbitLine,
                ringMesh,
            });
        }

        // Background stars
        const bgStarGeo = new THREE.BufferGeometry();
        const bgStarPositions = new Float32Array(500 * 3);
        for (let i = 0; i < 500; i++) {
            bgStarPositions[i * 3] = (Math.random() - 0.5) * 400;
            bgStarPositions[i * 3 + 1] = (Math.random() - 0.5) * 400;
            bgStarPositions[i * 3 + 2] = (Math.random() - 0.5) * 400;
        }
        bgStarGeo.setAttribute('position', new THREE.BufferAttribute(bgStarPositions, 3));
        const bgStarMat = new THREE.PointsMaterial({
            color: 0xffffff, size: 0.3, transparent: true, opacity: 0.4,
        });
        this.scene.add(new THREE.Points(bgStarGeo, bgStarMat));
    }

    _disposeScene() {
        if (this.renderer) {
            this.renderer.domElement.remove();
            this.renderer.dispose();
            this.renderer = null;
        }
        if (this.scene) {
            this.scene.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    child.material.dispose();
                }
            });
            this.scene = null;
        }
        this.planetMeshes = [];
        this.starMesh = null;
    }

    // ============================================================
    // ANIMATION
    // ============================================================

    _animate() {
        if (!this.isOpen || !this.renderer) return;

        const dt = this.clock.getDelta();
        const t = this.clock.getElapsedTime();

        // Orbit camera around the system
        this.cameraAngle += dt * 0.1;
        this.cameraDistance += (this.cameraTargetDistance - this.cameraDistance) * dt * 3;

        this.camera.position.set(
            Math.cos(this.cameraAngle) * this.cameraDistance,
            this.cameraHeight,
            Math.sin(this.cameraAngle) * this.cameraDistance
        );
        this.camera.lookAt(0, 0, 0);

        // Animate planets orbiting
        for (const { mesh, ghost } of this.planetMeshes) {
            const angle = ghost.currentAngle + t * ghost.orbitSpeed;
            mesh.position.set(
                Math.cos(angle) * ghost.orbitRadius,
                Math.sin(ghost.orbitTilt * 5) * 0.5,
                Math.sin(angle) * ghost.orbitRadius
            );
            mesh.rotation.y += dt * 0.5;
        }

        // Animate star pulsing
        if (this.starMesh) {
            const pulse = 1.0 + Math.sin(t * 2) * 0.05;
            this.starMesh.scale.setScalar(pulse);
        }

        // Render
        this.renderer.render(this.scene, this.camera);

        this._animFrame = requestAnimationFrame(this._animate);
    }

    // ============================================================
    // INTERACTION
    // ============================================================

    _onMouseMove(e) {
        if (!this.renderer || !this.camera) return;

        const rect = this.container.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );

        // Raycast against planets
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        this.hoveredPlanet = null;

        for (const { mesh, ghost } of this.planetMeshes) {
            // Use a slightly larger bounding sphere for easier selection
            const planetPos = mesh.position.clone();
            const dist = raycaster.ray.distanceToPoint(planetPos);

            if (dist < ghost.size * 0.8 + 0.5) {
                this.hoveredPlanet = { mesh, ghost };
                break;
            }
        }

        // Update cursor and info panel
        if (this.hoveredPlanet) {
            this.container.style.cursor = 'pointer';
            const ghost = this.hoveredPlanet.ghost;

            // Highlight the planet
            this.hoveredPlanet.mesh.material.emissiveIntensity = 0.5;

            this.infoPanel.style.display = 'block';
            this.infoPanel.style.left = (e.clientX + 20) + 'px';
            this.infoPanel.style.top = (e.clientY - 10) + 'px';
            this.infoPanel.innerHTML = `
                <div style="color: #88ccff; font-size: 13px; margin-bottom: 6px;">
                    ${ghost.name}
                </div>
                <div style="color: #556; font-size: 9px; margin-bottom: 8px; letter-spacing: 1px;">
                    ${ghost.archetype?.name || 'Unknown'} · ${ghost.ruleLabel}
                </div>
                <div>Rule: <span style="color: #88ccff">${ghost.rule}</span> (Class ${ghost.ruleClass})</div>
                <div>Size: <span style="color: #88ccff">${ghost.size.toFixed(1)}</span></div>
                <div>Orbit: <span style="color: #88ccff">${ghost.orbitRadius.toFixed(1)} AU</span></div>
                ${ghost.hasRings ? '<div style="color: #aa88cc;">Has ring system</div>' : ''}
                ${ghost.moonCount > 0 ? `<div>Moons: <span style="color: #88ccff">${ghost.moonCount}</span></div>` : ''}
                ${ghost.isGasGiant ? '<div style="color: #ffaa44;">Gas giant (no landing)</div>' : ''}
                ${!ghost.isGasGiant ? '<div style="color: #00ff88; margin-top: 8px; font-size: 9px;">CLICK TO WARP</div>' : ''}
            `;
        } else {
            this.container.style.cursor = 'crosshair';
            this.infoPanel.style.display = 'none';

            // Reset all planet emissives
            for (const { mesh } of this.planetMeshes) {
                mesh.material.emissiveIntensity = 0.1;
            }
        }
    }

    _onClick() {
        if (this.hoveredPlanet && !this.hoveredPlanet.ghost.isGasGiant) {
            this.selectedPlanet = this.hoveredPlanet.ghost;

            // Notify game
            if (this.onPlanetSelected) {
                this.onPlanetSelected(this.selectedPlanet, this.systemData);
            }
        }
    }

    _onWheel(e) {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? 1.1 : 0.9;
        this.cameraTargetDistance = Math.max(10, Math.min(100, this.cameraTargetDistance * zoomDelta));
        this.cameraHeight = this.cameraTargetDistance * 0.5;
    }

    _onKeyDown(e) {
        if (e.code === 'Escape') {
            this.close();
            if (this.onCancel) this.onCancel();
        } else if (e.code === 'Backspace') {
            this.close();
            if (this.onBack) this.onBack();
        }
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    dispose() {
        this._disposeScene();
        if (this.container?.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
