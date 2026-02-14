/**
 * THE GALACTIC ORDER — Development Server
 *
 * Simple static file server for the client/ directory.
 * Serves on http://localhost:3000
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CLIENT_DIR = join(__dirname, '..', 'client');
const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.mjs':  'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
    '.glb':  'model/gltf-binary',
    '.gltf': 'model/gltf+json',
};

const server = createServer(async (req, res) => {
    try {
        let urlPath = req.url.split('?')[0];
        if (urlPath === '/') urlPath = '/index.html';

        const filePath = join(CLIENT_DIR, urlPath);

        // Security: prevent directory traversal
        if (!filePath.startsWith(CLIENT_DIR)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        const data = await readFile(filePath);
        const ext = extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.writeHead(404);
            res.end('Not found');
        } else {
            console.error(err);
            res.writeHead(500);
            res.end('Internal server error');
        }
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 The Galactic Order server running at http://localhost:${PORT}`);
    console.log(`   Landing page: http://localhost:${PORT}/landing.html`);
});
