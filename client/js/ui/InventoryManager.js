/**
 * THE GALACTIC ORDER - Inventory Manager
 *
 * The player's "High-Tech Backpack" — tracks collected elements,
 * manages stack limits, and provides the data layer for the
 * Tablet UI inventory display and Refinery system.
 *
 * In-game fiction: The backpack uses molecular reconstitution
 * to store raw elemental data as compressed information patterns.
 * It can hold finite stacks of each element type.
 */

import { ELEMENTS, REFINERY_RECIPES, calculateRefineEfficiency } from '../generation/HarmonicElements.js';

// ============================================================
// INVENTORY MANAGER
// ============================================================

export class InventoryManager {
    constructor() {
        // Element quantities — start empty
        this.items = {};
        for (const id of Object.keys(ELEMENTS)) {
            this.items[id] = 0;
        }

        // Active refinery process
        this.refining = null; // { recipe, chosenRule, startTime, duration, efficiency }

        // Event callbacks
        this._onChanged = [];
        this._onRefineComplete = [];
    }

    // ============================================================
    // ELEMENT MANAGEMENT
    // ============================================================

    /**
     * Add an element to the inventory.
     * @param {string} elementId
     * @param {number} quantity
     * @returns {number} Quantity actually added (may be less if at max stack)
     */
    add(elementId, quantity) {
        const element = ELEMENTS[elementId];
        if (!element) return 0;

        const current = this.items[elementId] || 0;
        const maxStack = element.maxStack;
        const canAdd = Math.min(quantity, maxStack - current);

        if (canAdd <= 0) return 0;

        this.items[elementId] = current + canAdd;
        this._notifyChanged(elementId, canAdd, 'add');
        return canAdd;
    }

    /**
     * Remove an element from the inventory.
     * @param {string} elementId
     * @param {number} quantity
     * @returns {boolean} True if successfully removed
     */
    remove(elementId, quantity) {
        const current = this.items[elementId] || 0;
        if (current < quantity) return false;

        this.items[elementId] = current - quantity;
        this._notifyChanged(elementId, quantity, 'remove');
        return true;
    }

    /**
     * Check if the player has enough of an element.
     */
    has(elementId, quantity = 1) {
        return (this.items[elementId] || 0) >= quantity;
    }

    /**
     * Get the quantity of an element.
     */
    get(elementId) {
        return this.items[elementId] || 0;
    }

    /**
     * Get all non-zero inventory entries.
     * @returns {Array<{ element: Object, quantity: number }>}
     */
    getAll() {
        const result = [];
        for (const [id, qty] of Object.entries(this.items)) {
            if (qty > 0) {
                result.push({
                    element: ELEMENTS[id],
                    quantity: qty,
                });
            }
        }
        return result;
    }

    /**
     * Check if the inventory is full for a given element.
     */
    isFull(elementId) {
        const element = ELEMENTS[elementId];
        if (!element) return true;
        return (this.items[elementId] || 0) >= element.maxStack;
    }

    // ============================================================
    // REFINERY SYSTEM (CA Annealing)
    // ============================================================

    /**
     * Get available refinery recipes the player can start.
     * @returns {Array<{ recipe: Object, canStart: boolean, reason: string }>}
     */
    getAvailableRecipes() {
        return REFINERY_RECIPES.map(recipe => {
            const hasInput = this.has(recipe.input.element, recipe.input.quantity);
            const hasSecond = !recipe.secondInput ||
                this.has(recipe.secondInput.element, recipe.secondInput.quantity);
            const outputFull = this.isFull(recipe.output.element);
            const alreadyRefining = this.refining !== null;

            let canStart = true;
            let reason = '';

            if (alreadyRefining) {
                canStart = false;
                reason = 'Refinery in use';
            } else if (!hasInput) {
                canStart = false;
                reason = `Need ${recipe.input.quantity} ${ELEMENTS[recipe.input.element].symbol}`;
            } else if (!hasSecond) {
                canStart = false;
                reason = `Need ${recipe.secondInput.quantity} ${ELEMENTS[recipe.secondInput.element].symbol}`;
            } else if (outputFull) {
                canStart = false;
                reason = `${ELEMENTS[recipe.output.element].symbol} storage full`;
            }

            return { recipe, canStart, reason };
        });
    }

    /**
     * Start a refinery process.
     * @param {string} recipeId - Which recipe to use
     * @param {number} chosenRule - The CA rule number to use as catalyst
     * @returns {{ success: boolean, message: string }}
     */
    startRefining(recipeId, chosenRule) {
        if (this.refining) {
            return { success: false, message: 'Refinery already active.' };
        }

        const recipe = REFINERY_RECIPES.find(r => r.id === recipeId);
        if (!recipe) return { success: false, message: 'Unknown recipe.' };

        // Check inputs
        if (!this.has(recipe.input.element, recipe.input.quantity)) {
            return { success: false, message: `Insufficient ${ELEMENTS[recipe.input.element].name}.` };
        }
        if (recipe.secondInput && !this.has(recipe.secondInput.element, recipe.secondInput.quantity)) {
            return { success: false, message: `Insufficient ${ELEMENTS[recipe.secondInput.element].name}.` };
        }

        // Consume inputs
        this.remove(recipe.input.element, recipe.input.quantity);
        if (recipe.secondInput) {
            this.remove(recipe.secondInput.element, recipe.secondInput.quantity);
        }

        // Calculate efficiency based on chosen rule
        const eff = calculateRefineEfficiency(chosenRule, recipe);

        this.refining = {
            recipe,
            chosenRule,
            startTime: Date.now(),
            duration: recipe.time * 1000, // ms
            efficiency: eff,
            progress: 0,
        };

        return {
            success: true,
            message: `Annealing with Rule ${chosenRule}... (${eff.label}, ${Math.round(eff.efficiency * 100)}% yield)`,
        };
    }

    /**
     * Update the refinery process. Call every frame.
     * @param {number} dt - Delta time in seconds
     * @returns {{ active: boolean, progress: number, complete: boolean }|null}
     */
    updateRefinery(dt) {
        if (!this.refining) return null;

        const elapsed = Date.now() - this.refining.startTime;
        this.refining.progress = Math.min(1.0, elapsed / this.refining.duration);

        if (this.refining.progress >= 1.0) {
            // Complete! Calculate output
            const recipe = this.refining.recipe;
            const eff = this.refining.efficiency;
            const outputQty = Math.max(1, Math.floor(recipe.output.quantity * eff.efficiency));

            const added = this.add(recipe.output.element, outputQty);

            const result = {
                active: false,
                progress: 1.0,
                complete: true,
                output: {
                    element: ELEMENTS[recipe.output.element],
                    quantity: added,
                    efficiency: eff,
                },
            };

            this._notifyRefineComplete(result.output);
            this.refining = null;
            return result;
        }

        return {
            active: true,
            progress: this.refining.progress,
            complete: false,
            recipe: this.refining.recipe,
            efficiency: this.refining.efficiency,
            chosenRule: this.refining.chosenRule,
        };
    }

    // ============================================================
    // EVENTS
    // ============================================================

    onChanged(callback) {
        this._onChanged.push(callback);
    }

    onRefineComplete(callback) {
        this._onRefineComplete.push(callback);
    }

    _notifyChanged(elementId, quantity, action) {
        for (const cb of this._onChanged) {
            cb(elementId, quantity, action);
        }
    }

    _notifyRefineComplete(output) {
        for (const cb of this._onRefineComplete) {
            cb(output);
        }
    }

    // ============================================================
    // SERIALIZATION (for save/load later)
    // ============================================================

    toJSON() {
        return { items: { ...this.items } };
    }

    fromJSON(data) {
        if (data && data.items) {
            for (const [id, qty] of Object.entries(data.items)) {
                if (ELEMENTS[id]) {
                    this.items[id] = qty;
                }
            }
        }
    }
}
