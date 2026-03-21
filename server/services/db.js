/**
 * THE GALACTIC ORDER — Database Service
 *
 * SQLite wrapper for development. Swap this single file
 * for Oracle Autonomous DB in production.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

/**
 * Initialize database connection and run schema.
 * @returns {Database} The database instance
 */
export function initDB() {
    db = new Database(config.db.path);

    // Performance pragmas for SQLite
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Run schema
    const schema = readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf-8');
    db.exec(schema);

    console.log('  Database initialized');
    return db;
}

/**
 * Get the database instance.
 * @returns {Database}
 */
export function getDB() {
    if (!db) throw new Error('Database not initialized. Call initDB() first.');
    return db;
}

/**
 * Close the database connection gracefully.
 */
export function closeDB() {
    if (db) {
        db.close();
        db = null;
    }
}
