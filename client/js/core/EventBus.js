/**
 * THE GALACTIC ORDER - Event Bus
 *
 * Simple publish/subscribe system that decouples game systems.
 * Instead of systems calling each other directly, they emit events
 * that any subscriber can react to.
 *
 * Usage:
 *   import { eventBus } from './core/EventBus.js';
 *
 *   // Subscribe
 *   eventBus.on('phase:change', (data) => { ... });
 *
 *   // Publish
 *   eventBus.emit('phase:change', { from: 'SURFACE', to: 'FLIGHT' });
 *
 *   // Unsubscribe
 *   eventBus.off('phase:change', handler);
 *
 * Standard events:
 *   phase:change       { from, to }
 *   planet:transition   { rule, seed, name }
 *   planet:ready        { rule, seed }
 *   quality:change      { tier, tierName }
 *   system:dispose      { name }
 */

class EventBus {
    constructor() {
        this._listeners = new Map();
        this._onceListeners = new Map();
    }

    /**
     * Subscribe to an event.
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(callback);

        // Return unsubscribe function for convenience
        return () => this.off(event, callback);
    }

    /**
     * Subscribe to an event once (auto-unsubscribes after first call).
     * @param {string} event
     * @param {Function} callback
     */
    once(event, callback) {
        if (!this._onceListeners.has(event)) {
            this._onceListeners.set(event, []);
        }
        this._onceListeners.get(event).push(callback);
    }

    /**
     * Unsubscribe from an event.
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            const idx = listeners.indexOf(callback);
            if (idx !== -1) listeners.splice(idx, 1);
        }
    }

    /**
     * Emit an event to all subscribers.
     * @param {string} event
     * @param {*} data - Event payload
     */
    emit(event, data) {
        // Regular listeners
        const listeners = this._listeners.get(event);
        if (listeners) {
            for (let i = 0; i < listeners.length; i++) {
                listeners[i](data);
            }
        }

        // Once listeners (fire and remove)
        const onceListeners = this._onceListeners.get(event);
        if (onceListeners && onceListeners.length > 0) {
            const batch = onceListeners.splice(0);
            for (let i = 0; i < batch.length; i++) {
                batch[i](data);
            }
        }
    }

    /**
     * Remove all listeners (for cleanup/testing).
     */
    clear() {
        this._listeners.clear();
        this._onceListeners.clear();
    }
}

// Singleton instance — import this everywhere
export const eventBus = new EventBus();
