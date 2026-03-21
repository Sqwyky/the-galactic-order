/**
 * THE GALACTIC ORDER — Client API Helper
 *
 * Handles all communication with the backend:
 *   - Authentication (register, login, guest)
 *   - Save/load game state
 *   - Universe discoveries
 *   - WebSocket connection for multiplayer
 *
 * Usage:
 *   import { api } from './core/API.js';
 *
 *   // Login or play as guest
 *   await api.loginAsGuest();
 *   await api.login('username', 'password');
 *
 *   // Save/load
 *   await api.save(0, gameState);
 *   const state = await api.load(0);
 *
 *   // Multiplayer
 *   api.connectMultiplayer();
 *   api.joinLocation(30, 42);
 *   api.sendUpdate({ position, rotation, phase });
 */

import { eventBus } from './EventBus.js';

const API_BASE = '/api';

class API {
    constructor() {
        this._token = localStorage.getItem('tgo_token');
        this._player = JSON.parse(localStorage.getItem('tgo_player') || 'null');
        this._socket = null;
        this._listeners = new Map();
    }

    // --- Auth ---

    get isLoggedIn() {
        return !!this._token;
    }

    get player() {
        return this._player;
    }

    async register(username, password, email, displayName) {
        const res = await this._post('/auth/register', { username, password, email, displayName });
        this._setAuth(res);
        return res;
    }

    async login(username, password) {
        const res = await this._post('/auth/login', { username, password });
        this._setAuth(res);
        return res;
    }

    async loginAsGuest() {
        const res = await this._post('/auth/guest');
        this._setAuth(res);
        return res;
    }

    logout() {
        this._token = null;
        this._player = null;
        localStorage.removeItem('tgo_token');
        localStorage.removeItem('tgo_player');
        if (this._socket) {
            this._socket.disconnect();
            this._socket = null;
        }
    }

    async getMe() {
        return this._get('/auth/me');
    }

    // --- Save / Load ---

    async save(slot, state) {
        return this._post('/player/save', { slot, ...state });
    }

    async load(slot = 0) {
        return this._get(`/player/load/${slot}`);
    }

    async listSaves() {
        return this._get('/player/saves');
    }

    // --- Universe / Discoveries ---

    async discover({ type, universeSeed, systemRule, planetSeed, name, data }) {
        return this._post('/universe/discover', { type, universeSeed, systemRule, planetSeed, name, data });
    }

    async getSystemDiscoveries(systemRule, universeSeed = '42') {
        return this._get(`/universe/system/${systemRule}?seed=${universeSeed}`);
    }

    async getMyDiscoveries(limit = 20) {
        return this._get(`/universe/my-discoveries?limit=${limit}`);
    }

    // --- Server Status ---

    async getStatus() {
        return this._get('/status');
    }

    // --- Multiplayer (Socket.io) ---

    async connectMultiplayer() {
        if (this._socket) return this._socket;
        if (!this._token) throw new Error('Must be logged in to connect multiplayer');

        // Dynamically import socket.io client
        let ioFn;
        if (typeof io !== 'undefined') {
            ioFn = io;
        } else {
            try {
                const mod = await import('https://cdn.jsdelivr.net/npm/socket.io-client@4/+esm');
                ioFn = mod.io;
            } catch (e) {
                console.warn('[TGO] Socket.io client not available:', e.message);
                return null;
            }
        }

        this._socket = ioFn({
            auth: { token: this._token },
            transports: ['websocket', 'polling'],
        });

        this._socket.on('connect', () => {
            console.log('[TGO] Multiplayer connected');
            this._emit('multiplayer:connected');
            eventBus.emit('multiplayer:connected', {});
        });

        this._socket.on('disconnect', (reason) => {
            console.log('[TGO] Multiplayer disconnected:', reason);
            this._emit('multiplayer:disconnected', { reason });
            eventBus.emit('multiplayer:disconnected', { reason });
        });

        this._socket.on('connect_error', (err) => {
            console.warn('[TGO] Multiplayer connection error:', err.message);
        });

        // Forward server events to local listeners
        const serverEvents = ['player:joined', 'player:left', 'player:state', 'location:players', 'chat:message'];
        for (const event of serverEvents) {
            this._socket.on(event, (data) => this._emit(event, data));
        }

        return this._socket;
    }

    joinLocation(systemRule, planetSeed) {
        this._socket?.emit('join:location', { systemRule, planetSeed });
    }

    sendUpdate(state) {
        this._socket?.volatile.emit('player:update', state);
    }

    sendChat(text) {
        this._socket?.emit('chat:message', { text });
    }

    // --- Event Listeners (for multiplayer events) ---

    on(event, callback) {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event).push(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        const list = this._listeners.get(event);
        if (list) {
            const idx = list.indexOf(callback);
            if (idx !== -1) list.splice(idx, 1);
        }
    }

    // --- Internal ---

    _emit(event, data) {
        const list = this._listeners.get(event);
        if (list) list.forEach(cb => cb(data));
    }

    _setAuth({ token, player }) {
        this._token = token;
        this._player = player;
        localStorage.setItem('tgo_token', token);
        localStorage.setItem('tgo_player', JSON.stringify(player));
    }

    async _get(path) {
        const res = await fetch(`${API_BASE}${path}`, {
            headers: this._headers(),
        });
        if (!res.ok) throw await this._error(res);
        return res.json();
    }

    async _post(path, body) {
        const res = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this._headers() },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw await this._error(res);
        return res.json();
    }

    _headers() {
        const h = {};
        if (this._token) h['Authorization'] = `Bearer ${this._token}`;
        return h;
    }

    async _error(res) {
        try {
            const data = await res.json();
            return new Error(data.error || `HTTP ${res.status}`);
        } catch {
            return new Error(`HTTP ${res.status}`);
        }
    }
}

// Singleton
export const api = new API();
