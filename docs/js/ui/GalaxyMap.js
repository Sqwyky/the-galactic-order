/**
 * THE GALACTIC ORDER - Galaxy Map
 *
 * A 2D/canvas-based star map overlay that appears when the player
 * initiates a hyperspace jump. Shows nearby star systems as points
 * of light, with names, types, and distances.
 *
 * Flow:
 *   [Player charges hyperspace] → Galaxy Map opens
 *   [Player clicks a star]      → System View opens (3D orbiting planets)
 *   [Player clicks a planet]    → Warp to that planet (DESCENT phase)
 *
 * The map is generated from UniverseManager.getNearbySystems(),
 * which deterministically places stars based on the Genesis Seed.
 * Every fork sees the same galaxy. Every player visits the same stars.
 *
 * Visual style: Dark space, glowing star dots, connecting lines for
 * nearby systems, NMS-style hover cards with system info.
 */

import { UniverseManager, STAR_TYPES } from '../universe/UniverseManager.js';
import { hashFloat } from '../generation/hashSeed.js';

// ============================================================
// GALAXY MAP
// ============================================================

export class GalaxyMap {
    /**
     * @param {Object} options
     * @param {Function} options.onSystemSelected - Called when player picks a system
     * @param {number} [options.viewRadius=8] - How many grid cells to show
     */
    constructor(options = {}) {
        this.onSystemSelected = options.onSystemSelected || null;
        this.onCancel = options.onCancel || null;
        this.viewRadius = options.viewRadius || 8;

        // Universe manager (shared seed = shared galaxy)
        this.universe = new UniverseManager(42);

        // Player's current galactic coordinates
        this.playerX = 0;
        this.playerY = 0;

        // Map state
        this.isOpen = false;
        this.systems = [];
        this.hoveredSystem = null;
        this.selectedSystem = null;

        // Camera/view transform
        this.viewCenterX = 0;
        this.viewCenterY = 0;
        this.zoom = 1.0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Animation
        this._animTime = 0;
        this._animFrame = null;
        this._fadeIn = 0;

        // DOM elements
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.infoPanel = null;

        // Bind event handlers
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onClick = this._onClick.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._animate = this._animate.bind(this);

        this._build();
    }

    // ============================================================
    // DOM CONSTRUCTION
    // ============================================================

    _build() {
        // Container overlay
        this.container = document.createElement('div');
        this.container.id = 'galaxy-map';
        this.container.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            z-index: 50; display: none;
            background: rgba(0, 0, 0, 0.95);
            transition: opacity 0.5s;
            opacity: 0;
            cursor: crosshair;
        `;

        // Canvas for star rendering
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = 'width: 100%; height: 100%;';
        this.container.appendChild(this.canvas);

        // Title
        const title = document.createElement('div');
        title.style.cssText = `
            position: absolute; top: 24px; left: 50%; transform: translateX(-50%);
            color: #88ccff; font-family: 'Courier New', monospace;
            font-size: 14px; letter-spacing: 6px;
            text-shadow: 0 0 20px rgba(100,180,255,0.3);
            pointer-events: none;
        `;
        title.textContent = 'GALACTIC NAVIGATION';
        this.container.appendChild(title);

        // Controls hint
        const hint = document.createElement('div');
        hint.style.cssText = `
            position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
            color: #445; font-family: 'Courier New', monospace;
            font-size: 10px; letter-spacing: 2px; text-align: center;
            pointer-events: none;
        `;
        hint.innerHTML = 'CLICK STAR TO SELECT · SCROLL TO ZOOM · DRAG TO PAN · ESC TO CANCEL';
        this.container.appendChild(hint);

        // Info panel (shows on hover)
        this.infoPanel = document.createElement('div');
        this.infoPanel.style.cssText = `
            position: absolute; display: none;
            background: rgba(10, 15, 30, 0.9);
            border: 1px solid rgba(100, 180, 255, 0.2);
            padding: 12px 16px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            color: #aabbcc;
            pointer-events: none;
            min-width: 180px;
        `;
        this.container.appendChild(this.infoPanel);

        // Current system indicator
        this.currentLabel = document.createElement('div');
        this.currentLabel.style.cssText = `
            position: absolute; top: 60px; left: 24px;
            color: #00ff88; font-family: 'Courier New', monospace;
            font-size: 11px; letter-spacing: 1px;
            pointer-events: none;
        `;
        this.container.appendChild(this.currentLabel);

        document.body.appendChild(this.container);
    }

    // ============================================================
    // OPEN / CLOSE
    // ============================================================

    /**
     * Open the galaxy map.
     * @param {number} currentX - Player's current galactic X
     * @param {number} currentY - Player's current galactic Y
     */
    open(currentX, currentY) {
        this.playerX = currentX;
        this.playerY = currentY;
        this.viewCenterX = currentX;
        this.viewCenterY = currentY;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.hoveredSystem = null;
        this.selectedSystem = null;
        this._fadeIn = 0;

        // Resize canvas
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ctx = this.canvas.getContext('2d');

        // Load nearby systems
        this.systems = this.universe.getNearbySystems(currentX, currentY, this.viewRadius);

        // Update current system label
        const currentSystem = this.universe.getSystem(currentX, currentY);
        this.currentLabel.innerHTML =
            `CURRENT: <span style="color:#88ccff">${currentSystem.star.name}</span> ` +
            `<span style="color:#446">[${currentX}, ${currentY}]</span>`;

        // Show
        this.isOpen = true;
        this.container.style.display = 'block';
        requestAnimationFrame(() => {
            this.container.style.opacity = '1';
        });

        // Attach events
        this.canvas.addEventListener('mousemove', this._onMouseMove);
        this.canvas.addEventListener('click', this._onClick);
        this.canvas.addEventListener('mousedown', this._onMouseDown);
        this.canvas.addEventListener('mouseup', this._onMouseUp);
        this.canvas.addEventListener('wheel', this._onWheel);
        document.addEventListener('keydown', this._onKeyDown);

        // Exit pointer lock if active
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        // Start animation loop
        this._animate();
    }

    close() {
        this.isOpen = false;
        this.container.style.opacity = '0';
        setTimeout(() => {
            this.container.style.display = 'none';
        }, 500);

        // Remove events
        this.canvas.removeEventListener('mousemove', this._onMouseMove);
        this.canvas.removeEventListener('click', this._onClick);
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
        this.canvas.removeEventListener('mouseup', this._onMouseUp);
        this.canvas.removeEventListener('wheel', this._onWheel);
        document.removeEventListener('keydown', this._onKeyDown);

        if (this._animFrame) {
            cancelAnimationFrame(this._animFrame);
            this._animFrame = null;
        }
    }

    // ============================================================
    // COORDINATE TRANSFORMS
    // ============================================================

    /**
     * Convert galactic coordinates to screen coordinates.
     */
    galaxyToScreen(gx, gy) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const scale = 60 * this.zoom;

        const dx = (gx - this.viewCenterX) - this.dragOffsetX;
        const dy = (gy - this.viewCenterY) - this.dragOffsetY;

        return {
            x: cx + dx * scale,
            y: cy + dy * scale,
        };
    }

    /**
     * Convert screen coordinates to galactic coordinates.
     */
    screenToGalaxy(sx, sy) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        const scale = 60 * this.zoom;

        return {
            x: (sx - cx) / scale + this.viewCenterX + this.dragOffsetX,
            y: (sy - cy) / scale + this.viewCenterY + this.dragOffsetY,
        };
    }

    // ============================================================
    // RENDERING
    // ============================================================

    _animate() {
        if (!this.isOpen) return;

        this._animTime += 0.016;
        this._fadeIn = Math.min(1, this._fadeIn + 0.03);

        this._draw();

        this._animFrame = requestAnimationFrame(this._animate);
    }

    _draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Clear
        ctx.fillStyle = 'rgba(2, 3, 8, 1)';
        ctx.fillRect(0, 0, w, h);

        // Background stars (static distant stars)
        this._drawBackgroundStars(ctx, w, h);

        // Grid lines (subtle)
        this._drawGrid(ctx, w, h);

        // Connection lines between nearby systems
        this._drawConnections(ctx);

        // Stars
        for (const s of this.systems) {
            this._drawStar(ctx, s);
        }

        // Player position marker
        this._drawPlayerMarker(ctx);

        // Selection ring
        if (this.selectedSystem) {
            const pos = this.galaxyToScreen(this.selectedSystem.x, this.selectedSystem.y);
            const pulse = Math.sin(this._animTime * 4) * 0.3 + 0.7;
            ctx.strokeStyle = `rgba(0, 255, 136, ${pulse * this._fadeIn})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    _drawBackgroundStars(ctx, w, h) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        // Deterministic background stars
        for (let i = 0; i < 200; i++) {
            const x = (hashFloat('bg_star', i, 'x') * w);
            const y = (hashFloat('bg_star', i, 'y') * h);
            const size = hashFloat('bg_star', i, 'size') < 0.9 ? 0.5 : 1;
            ctx.fillRect(x, y, size, size);
        }
    }

    _drawGrid(ctx, w, h) {
        const scale = 60 * this.zoom;
        ctx.strokeStyle = 'rgba(40, 60, 100, 0.08)';
        ctx.lineWidth = 0.5;

        // Vertical lines
        const startGX = Math.floor(this.viewCenterX + this.dragOffsetX - w / (2 * scale)) - 1;
        const endGX = Math.ceil(this.viewCenterX + this.dragOffsetX + w / (2 * scale)) + 1;
        for (let gx = startGX; gx <= endGX; gx++) {
            const sx = this.galaxyToScreen(gx, 0).x;
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, h);
            ctx.stroke();
        }

        // Horizontal lines
        const startGY = Math.floor(this.viewCenterY + this.dragOffsetY - h / (2 * scale)) - 1;
        const endGY = Math.ceil(this.viewCenterY + this.dragOffsetY + h / (2 * scale)) + 1;
        for (let gy = startGY; gy <= endGY; gy++) {
            const sy = this.galaxyToScreen(0, gy).y;
            ctx.beginPath();
            ctx.moveTo(0, sy);
            ctx.lineTo(w, sy);
            ctx.stroke();
        }
    }

    _drawConnections(ctx) {
        ctx.strokeStyle = 'rgba(60, 100, 180, 0.06)';
        ctx.lineWidth = 0.5;

        for (let i = 0; i < this.systems.length; i++) {
            const a = this.systems[i];
            const posA = this.galaxyToScreen(a.x, a.y);

            for (let j = i + 1; j < this.systems.length; j++) {
                const b = this.systems[j];
                const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

                if (dist < 3) {
                    const posB = this.galaxyToScreen(b.x, b.y);
                    ctx.beginPath();
                    ctx.moveTo(posA.x, posA.y);
                    ctx.lineTo(posB.x, posB.y);
                    ctx.stroke();
                }
            }
        }
    }

    _drawStar(ctx, systemData) {
        const { x, y, system } = systemData;
        const pos = this.galaxyToScreen(x, y);
        const starType = system.star.type;
        const isHovered = this.hoveredSystem === systemData;
        const isCurrent = (x === this.playerX && y === this.playerY);
        const pulse = Math.sin(this._animTime * 2 + x * 3 + y * 7) * 0.2 + 0.8;

        // Star color from type
        const [r, g, b] = starType.color;
        const alpha = this._fadeIn * pulse;

        // Glow
        const glowSize = (starType.size * 8 + (isHovered ? 8 : 0)) * this.zoom;
        const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glowSize);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.8})`);
        gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        const coreSize = Math.max(2, starType.size * 2.5 * this.zoom);
        ctx.fillStyle = `rgba(${Math.min(255, r + 80)}, ${Math.min(255, g + 80)}, ${Math.min(255, b + 80)}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, coreSize, 0, Math.PI * 2);
        ctx.fill();

        // Current system marker
        if (isCurrent) {
            ctx.strokeStyle = `rgba(0, 255, 136, ${0.5 + Math.sin(this._animTime * 3) * 0.3})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
            ctx.stroke();

            // "YOU ARE HERE" label
            ctx.fillStyle = `rgba(0, 255, 136, ${alpha * 0.6})`;
            ctx.font = '8px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText('YOU ARE HERE', pos.x, pos.y + 22);
        }

        // Star name (show if zoomed in enough or hovered)
        if (this.zoom > 0.6 || isHovered) {
            ctx.fillStyle = isHovered
                ? `rgba(200, 220, 255, ${alpha})`
                : `rgba(120, 140, 170, ${alpha * 0.6})`;
            ctx.font = isHovered ? '11px Courier New' : '9px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(system.star.name, pos.x, pos.y - 12);

            // Planet count
            if (isHovered || this.zoom > 1.2) {
                ctx.fillStyle = `rgba(80, 100, 130, ${alpha * 0.5})`;
                ctx.font = '8px Courier New';
                ctx.fillText(`${system.planetCount} planets · ${starType.name}`, pos.x, pos.y + (isCurrent ? 32 : 18));
            }
        }
    }

    _drawPlayerMarker(ctx) {
        const pos = this.galaxyToScreen(this.playerX, this.playerY);
        const t = this._animTime;

        // Crosshair
        const size = 20;
        ctx.strokeStyle = `rgba(0, 255, 136, ${0.3 + Math.sin(t * 2) * 0.1})`;
        ctx.lineWidth = 1;

        // Top
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - size);
        ctx.lineTo(pos.x, pos.y - size * 0.6);
        ctx.stroke();
        // Bottom
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y + size);
        ctx.lineTo(pos.x, pos.y + size * 0.6);
        ctx.stroke();
        // Left
        ctx.beginPath();
        ctx.moveTo(pos.x - size, pos.y);
        ctx.lineTo(pos.x - size * 0.6, pos.y);
        ctx.stroke();
        // Right
        ctx.beginPath();
        ctx.moveTo(pos.x + size, pos.y);
        ctx.lineTo(pos.x + size * 0.6, pos.y);
        ctx.stroke();
    }

    // ============================================================
    // EVENT HANDLERS
    // ============================================================

    _onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Dragging (pan)
        if (this.isDragging) {
            const scale = 60 * this.zoom;
            this.dragOffsetX -= (mx - this.dragStartX) / scale;
            this.dragOffsetY -= (my - this.dragStartY) / scale;
            this.dragStartX = mx;
            this.dragStartY = my;
            return;
        }

        // Hit test stars
        this.hoveredSystem = null;
        for (const s of this.systems) {
            const pos = this.galaxyToScreen(s.x, s.y);
            const dist = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
            if (dist < 15) {
                this.hoveredSystem = s;
                break;
            }
        }

        // Update info panel
        if (this.hoveredSystem) {
            const sys = this.hoveredSystem.system;
            const starType = sys.star.type;
            const dist = this.hoveredSystem.distance.toFixed(1);
            const isCurrent = (this.hoveredSystem.x === this.playerX && this.hoveredSystem.y === this.playerY);

            this.infoPanel.style.display = 'block';
            this.infoPanel.style.left = (e.clientX + 20) + 'px';
            this.infoPanel.style.top = (e.clientY - 10) + 'px';
            this.infoPanel.innerHTML = `
                <div style="color: rgb(${starType.color.join(',')}); font-size: 13px; margin-bottom: 6px;">
                    ${sys.star.name}
                </div>
                <div style="color: #556; font-size: 9px; margin-bottom: 8px; letter-spacing: 1px;">
                    ${starType.name} · ${starType.temperature}K
                </div>
                <div>Planets: <span style="color: #88ccff">${sys.planetCount}</span></div>
                <div>Distance: <span style="color: #88ccff">${dist} ly</span></div>
                <div>Coords: <span style="color: #556">[${this.hoveredSystem.x}, ${this.hoveredSystem.y}]</span></div>
                ${isCurrent ? '<div style="color: #00ff88; margin-top: 6px;">CURRENT SYSTEM</div>' : ''}
                ${!isCurrent ? '<div style="color: #446; margin-top: 8px; font-size: 9px;">CLICK TO SELECT</div>' : ''}
            `;
            this.canvas.style.cursor = 'pointer';
        } else {
            this.infoPanel.style.display = 'none';
            this.canvas.style.cursor = 'crosshair';
        }
    }

    _onClick(e) {
        if (this.isDragging) return;

        if (this.hoveredSystem) {
            this.selectedSystem = this.hoveredSystem;

            // Notify the game
            if (this.onSystemSelected) {
                this.onSystemSelected(this.hoveredSystem);
            }
        }
    }

    _onMouseDown(e) {
        if (!this.hoveredSystem) {
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.canvas.style.cursor = 'grabbing';
        }
    }

    _onMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = this.hoveredSystem ? 'pointer' : 'crosshair';
    }

    _onWheel(e) {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom = Math.max(0.3, Math.min(3.0, this.zoom * zoomDelta));

        // Reload systems if we zoom out enough to see more
        const neededRadius = Math.ceil(this.viewRadius / this.zoom) + 2;
        if (neededRadius > this.viewRadius) {
            this.viewRadius = neededRadius;
            this.systems = this.universe.getNearbySystems(
                this.playerX, this.playerY, this.viewRadius
            );
        }
    }

    _onKeyDown(e) {
        if (e.code === 'Escape') {
            this.close();
            if (this.onCancel) this.onCancel();
        }
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    /**
     * Set the player's current galactic position.
     */
    setPlayerPosition(x, y) {
        this.playerX = x;
        this.playerY = y;
    }

    /**
     * Get the UniverseManager (shared instance).
     */
    getUniverse() {
        return this.universe;
    }

    dispose() {
        if (this.container?.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
