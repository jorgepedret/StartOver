#!/usr/bin/env node
/**
 * Local server to preview recovered sites
 * Routes by subdomain: lowdrama.localhost:3000 → sites/lowdrama/index.html
 *
 * Usage: node serve.mjs
 * Then visit: http://lowdrama.localhost:3000
 */

import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITES_DIR = path.join(__dirname, 'sites');
const ASSETS_DIR = path.join(__dirname, 'assets');
const ADMIN_DIR = path.join(__dirname, 'admin');
const PORT = 3000;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
};

const server = http.createServer(async (req, res) => {
  // Handle /admin at root level
  if (req.url === '/admin' || req.url === '/admin/') {
    try {
      const content = await fs.readFile(path.join(ADMIN_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Admin not found');
    }
    return;
  }

  // Handle /assets/ at root level
  if (req.url.startsWith('/assets/')) {
    let filePath = path.join(ASSETS_DIR, req.url.slice(8)); // Remove '/assets/' prefix

    // Prevent path traversal
    if (!filePath.startsWith(ASSETS_DIR)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');

      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Asset not found');
    }
    return;
  }

  const host = req.headers.host || '';
  const slug = host.split('.')[0].split(':')[0]; // "lowdrama" from "lowdrama.localhost:3000"

  let filePath = path.join(SITES_DIR, slug, req.url === '/' ? 'index.html' : req.url);

  // Prevent path traversal
  if (!filePath.startsWith(SITES_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');

    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(content);
  } catch {
    if (slug === 'localhost' || slug === '127') {
      // Root — serve generated index.html
      try {
        const index = await fs.readFile(path.join(__dirname, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(index);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('index.html not found — run: node build-index.mjs all_links.md');
      }
    } else {
      // Missing subdomain — serve notfound.html
      try {
        const notfound = await fs.readFile(path.join(__dirname, 'notfound.html'));
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(notfound);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Site "${slug}" not found`);
      }
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n🌐 Dev server running`);
  console.log(`   Index: http://localhost:${PORT}`);
  console.log(`   Sites: http://[slug].localhost:${PORT}`);
  console.log(`\n   e.g.  http://lowdrama.localhost:${PORT}`);
});
