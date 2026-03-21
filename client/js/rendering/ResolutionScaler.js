/**
 * THE GALACTIC ORDER - Dynamic Resolution Scaler
 *
 * Manages render resolution independently from display resolution.
 * Weak devices render at 50-75% resolution (massive perf win),
 * while high-end devices can supersample at 125-150%.
 *
 * Works by adjusting renderer.setSize() with updateStyle=false,
 * keeping the canvas CSS size at full display resolution while
 * rendering internally at a scaled resolution.
 *
 * Integration:
 *   const scaler = new ResolutionScaler(renderer, canvas);
 *   // PerformanceManager calls:
 *   scaler.setScale(0.75); // 75% resolution
 *   // On window resize:
 *   scaler.resize(window.innerWidth, window.innerHeight);
 */

// ============================================================
// PER-TIER RECOMMENDED SCALES
// ============================================================

export const RESOLUTION_SCALES = {
    ULTRA:  1.0,
    HIGH:   1.0,
    MEDIUM: 0.85,
    LOW:    0.7,
    POTATO: 0.5,
};

// ============================================================
// RESOLUTION SCALER
// ============================================================

export class ResolutionScaler {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {HTMLCanvasElement} canvas
     */
    constructor(renderer, canvas) {
        this._renderer = renderer;
        this._canvas = canvas;

        /** Full display dimensions (CSS pixels × devicePixelRatio) */
        this._displayWidth = canvas.clientWidth || window.innerWidth;
        this._displayHeight = canvas.clientHeight || window.innerHeight;

        /** Base device pixel ratio captured at construction */
        this._basePixelRatio = window.devicePixelRatio || 1;

        /** Resolution multiplier: 0.5 = half, 1.0 = native, 1.5 = supersample */
        this._scale = 1.0;

        // Apply initial state
        this._apply();
    }

    // --------------------------------------------------------
    // Public API
    // --------------------------------------------------------

    /**
     * Set the resolution scale factor.
     *
     * @param {number} factor - Multiplier for render resolution.
     *   0.5 = half resolution (massive perf win on weak GPUs)
     *   1.0 = native resolution
     *   1.5 = supersample (sharper, costs ~2× fill rate)
     */
    setScale(factor) {
        this._scale = Math.max(0.25, Math.min(2.0, factor));
        this._apply();
    }

    /**
     * Called on window resize. Updates the display dimensions
     * and re-applies the current scale.
     *
     * @param {number} width  - New display width (CSS pixels)
     * @param {number} height - New display height (CSS pixels)
     */
    resize(width, height) {
        this._displayWidth = width;
        this._displayHeight = height;
        this._apply();
    }

    /**
     * Returns the current scaled render resolution.
     *
     * @returns {{ width: number, height: number }}
     */
    getScaledSize() {
        const w = Math.max(1, Math.round(this._displayWidth * this._scale));
        const h = Math.max(1, Math.round(this._displayHeight * this._scale));
        return { width: w, height: h };
    }

    /**
     * Returns the effective pixel ratio after scaling.
     * Native pixel ratio × scale factor.
     *
     * @returns {number}
     */
    getRenderPixelRatio() {
        return this._basePixelRatio * this._scale;
    }

    /** Current scale factor (read-only). */
    get scale() {
        return this._scale;
    }

    // --------------------------------------------------------
    // Internal
    // --------------------------------------------------------

    /**
     * Apply the current scale to the renderer.
     *
     * - renderer.setPixelRatio() controls how many physical pixels
     *   map to one CSS pixel. By scaling it we shrink or grow the
     *   internal render resolution.
     * - renderer.setSize(w, h, false) resizes the drawing buffer
     *   WITHOUT touching the canvas CSS dimensions, so the canvas
     *   still fills the screen at display resolution.
     */
    _apply() {
        const scaledPixelRatio = this.getRenderPixelRatio();
        this._renderer.setPixelRatio(scaledPixelRatio);

        // setSize with updateStyle=false: changes the drawing buffer
        // size but leaves the CSS width/height untouched.
        this._renderer.setSize(
            this._displayWidth,
            this._displayHeight,
            false  // don't update CSS style
        );
    }
}
