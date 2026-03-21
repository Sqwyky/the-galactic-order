/**
 * THE GALACTIC ORDER — Ship PBR Material System
 *
 * Centralized factory replacing all MeshLambertMaterial usage with
 * physically-based MeshStandardMaterial / MeshPhysicalMaterial.
 *
 * Procedural panel-line normal maps are generated via Canvas2D at
 * construction time — zero external textures, matching the game's
 * "everything from math" philosophy.
 *
 * Material palette per ship:
 *   hull        — metallic plating with panel-line normal map
 *   hullDark    — darker panel separation plates
 *   accent      — saturated color trim
 *   trim        — dark structural members
 *   chrome      — mirror-like metal trim
 *   glass       — physical glass (transmission + refraction)
 *   glassDark   — tinted interior glass
 *   engine      — emissive engine glow
 *   engineInner — bright white engine core
 *   lightRed    — port running light
 *   lightGreen  — starboard running light
 *   lightWhite  — tail / nose running light
 *   emissiveLine— subtle tech glow for panel seam accents
 */

import * as THREE from 'three';

// ============================================================
// PROCEDURAL NORMAL MAP GENERATOR
// ============================================================

/**
 * Generate a panel-line normal map on a Canvas2D.
 * Draws grid lines, rivet dots, and edge bevels, then converts
 * to a normal map via a simple Sobel-like filter.
 *
 * @param {number} size   Texture resolution (default 256)
 * @param {number} seed   Variation seed for slight randomness
 * @returns {THREE.CanvasTexture}
 */
export function generatePanelNormalMap(size = 256, seed = 42) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Start with flat normal (128, 128, 255)
    ctx.fillStyle = '#8080ff';
    ctx.fillRect(0, 0, size, size);

    // Seeded pseudo-random
    let s = seed;
    const rand = () => { s = (s * 16807 + 11) % 2147483647; return (s & 0x7fffffff) / 0x7fffffff; };

    // --- Panel grid lines ---
    ctx.strokeStyle = '#7070e0';
    ctx.lineWidth = 2;

    // Horizontal panel lines
    const hCount = 4 + Math.floor(rand() * 4);
    for (let i = 1; i < hCount; i++) {
        const y = Math.floor((i / hCount) * size) + Math.floor(rand() * 8 - 4);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
    }

    // Vertical panel lines
    const vCount = 4 + Math.floor(rand() * 4);
    for (let i = 1; i < vCount; i++) {
        const x = Math.floor((i / vCount) * size) + Math.floor(rand() * 8 - 4);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
        ctx.stroke();
    }

    // --- Rivet dots ---
    ctx.fillStyle = '#7575e8';
    const rivetCount = 12 + Math.floor(rand() * 16);
    for (let i = 0; i < rivetCount; i++) {
        const rx = Math.floor(rand() * size);
        const ry = Math.floor(rand() * size);
        ctx.beginPath();
        ctx.arc(rx, ry, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // --- Diagonal accent lines (subtle) ---
    ctx.strokeStyle = '#7878ea';
    ctx.lineWidth = 1;
    const diagCount = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < diagCount; i++) {
        const x1 = Math.floor(rand() * size);
        const y1 = Math.floor(rand() * size);
        const len = 20 + Math.floor(rand() * 40);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + len, y1 + len * 0.3);
        ctx.stroke();
    }

    // --- Convert height perturbations to normal map via Sobel ---
    const imageData = ctx.getImageData(0, 0, size, size);
    const pixels = imageData.data;

    // Read blue channel as height (higher blue = higher surface)
    const height = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) {
        height[i] = pixels[i * 4 + 2] / 255.0;
    }

    // Sobel filter → normal
    const outData = ctx.createImageData(size, size);
    const out = outData.data;
    const strength = 2.0;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = y * size + x;
            const xp = x < size - 1 ? idx + 1 : idx;
            const xn = x > 0 ? idx - 1 : idx;
            const yp = y < size - 1 ? idx + size : idx;
            const yn = y > 0 ? idx - size : idx;

            const dx = (height[xp] - height[xn]) * strength;
            const dy = (height[yp] - height[yn]) * strength;

            // Normal = normalize(-dx, -dy, 1)
            const len = Math.sqrt(dx * dx + dy * dy + 1);
            const nx = (-dx / len) * 0.5 + 0.5;
            const ny = (-dy / len) * 0.5 + 0.5;
            const nz = (1.0 / len) * 0.5 + 0.5;

            const oi = (y * size + x) * 4;
            out[oi]     = Math.floor(nx * 255);
            out[oi + 1] = Math.floor(ny * 255);
            out[oi + 2] = Math.floor(nz * 255);
            out[oi + 3] = 255;
        }
    }
    ctx.putImageData(outData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return texture;
}

// ============================================================
// SHIP MATERIALS FACTORY
// ============================================================

/**
 * Create a full PBR material palette for a ship.
 *
 * @param {Object} opts
 * @param {THREE.Color|number} opts.hullColor    Main hull plating color
 * @param {THREE.Color|number} opts.accentColor  Wing / trim accent color
 * @param {THREE.Color|number} opts.engineColor  Engine glow tint
 * @param {boolean} [opts.usePanelNormals=true]  Enable panel-line normal maps
 * @param {number}  [opts.seed=42]               Variation seed for normals
 * @returns {Object} Material palette
 */
export function createShipMaterials(opts = {}) {
    const hullColor   = new THREE.Color(opts.hullColor   ?? 0x5a6577);
    const accentColor = new THREE.Color(opts.accentColor ?? 0xb83232);
    const engineColor = new THREE.Color(opts.engineColor ?? 0x33ddff);
    const usePanelNormals = opts.usePanelNormals !== false;
    const seed = opts.seed ?? 42;

    // Generate normal map (reusable for all hull materials on this ship)
    const normalMap = usePanelNormals ? generatePanelNormalMap(256, seed) : null;

    // --- Hull: main metallic plating ---
    const hull = new THREE.MeshStandardMaterial({
        color: hullColor,
        metalness: 0.7,
        roughness: 0.4,
        flatShading: true,
        normalMap: normalMap,
        normalScale: new THREE.Vector2(0.4, 0.4),
    });

    // --- Hull Dark: panel separation plates ---
    const hullDarkColor = new THREE.Color(hullColor).multiplyScalar(0.6);
    const hullDark = new THREE.MeshStandardMaterial({
        color: hullDarkColor,
        metalness: 0.5,
        roughness: 0.6,
        flatShading: true,
        normalMap: normalMap,
        normalScale: new THREE.Vector2(0.3, 0.3),
    });

    // --- Accent: saturated color trim ---
    const accent = new THREE.MeshStandardMaterial({
        color: accentColor,
        metalness: 0.3,
        roughness: 0.5,
        flatShading: true,
    });

    // --- Trim: dark structural members ---
    const trim = new THREE.MeshStandardMaterial({
        color: 0x2a2f38,
        metalness: 0.4,
        roughness: 0.7,
        flatShading: true,
    });

    // --- Chrome: mirror-like metal ---
    const chrome = new THREE.MeshStandardMaterial({
        color: 0x8899aa,
        metalness: 0.95,
        roughness: 0.1,
        flatShading: true,
    });

    // --- Glass: physical refraction ---
    // Use MeshPhysicalMaterial for transmission if available, fallback
    const glass = new THREE.MeshPhysicalMaterial({
        color: 0x88ccff,
        metalness: 0.0,
        roughness: 0.1,
        transmission: 0.9,
        thickness: 0.5,
        ior: 1.5,
        transparent: true,
        opacity: 0.35,
    });

    // --- Glass Dark: tinted interior ---
    const glassDark = new THREE.MeshStandardMaterial({
        color: 0x223344,
        metalness: 0.1,
        roughness: 0.3,
        transparent: true,
        opacity: 0.6,
    });

    // --- Engine glow: emissive colored ---
    const engine = new THREE.MeshBasicMaterial({
        color: engineColor,
        transparent: true,
        opacity: 0.85,
    });

    // --- Engine inner: bright white core ---
    const engineInner = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
    });

    // --- Running lights ---
    const lightRed   = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const lightGreen = new THREE.MeshBasicMaterial({ color: 0x22ff44 });
    const lightWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // --- Emissive panel line accent ---
    const emissiveLine = new THREE.MeshStandardMaterial({
        color: 0x000000,
        metalness: 0.0,
        roughness: 0.5,
        emissive: engineColor,
        emissiveIntensity: 0.4,
    });

    // --- Landing gear materials (PBR) ---
    const strut = new THREE.MeshStandardMaterial({
        color: 0x3a3a3a,
        metalness: 0.6,
        roughness: 0.5,
    });
    const pad = new THREE.MeshStandardMaterial({
        color: 0x555555,
        metalness: 0.4,
        roughness: 0.7,
    });
    const piston = new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.8,
        roughness: 0.2,
    });

    return {
        hull, hullDark, accent, trim, chrome,
        glass, glassDark,
        engine, engineInner,
        lightRed, lightGreen, lightWhite,
        emissiveLine,
        strut, pad, piston,
        // Expose for disposal
        _normalMap: normalMap,
    };
}

/**
 * Dispose all materials and textures in a palette.
 * @param {Object} mats - Material palette from createShipMaterials
 */
export function disposeShipMaterials(mats) {
    if (mats._normalMap) mats._normalMap.dispose();
    for (const key of Object.keys(mats)) {
        if (key.startsWith('_')) continue;
        if (mats[key] && mats[key].dispose) mats[key].dispose();
    }
}
