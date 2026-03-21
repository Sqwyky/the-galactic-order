/**
 * THE GALACTIC ORDER — Server Configuration
 *
 * Loads from .env in development, environment variables in production.
 * All config flows through this single file.
 */

import { config as loadEnv } from 'dotenv';
import { randomBytes } from 'crypto';

loadEnv();

const env = process.env.NODE_ENV || 'development';

export default {
    env,
    port: parseInt(process.env.PORT, 10) || 3000,

    // JWT auth
    jwt: {
        secret: process.env.JWT_SECRET || randomBytes(32).toString('hex'),
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },

    // Database
    db: {
        // SQLite for dev, Oracle connection string for prod
        path: process.env.DB_PATH || './server/db/galactic-order.sqlite',
    },

    // CORS
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
    },

    // Rate limiting
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: env === 'development' ? 1000 : 100,
    },
};
