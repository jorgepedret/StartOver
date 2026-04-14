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
const PORT = 3000;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || '';
  const slug = host.split('.')[0]; // "lowdrama" from "lowdrama.localhost:3000"

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
    // Fallback: list available sites
    if (slug === 'localhost' || slug === '127') {
      const sites = await fs.readdir(SITES_DIR).catch(() => []);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <h1>Recovered Sites (${sites.length})</h1>
        <ul>${sites.filter(s => !s.startsWith('_')).map(s =>
          `<li><a href="http://${s}.localhost:${PORT}">${s}</a></li>`
        ).join('')}</ul>
      `);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(`<h2>404 — "${slug}" not found in sites/</h2>`);
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n🌐 Dev server running`);
  console.log(`   Index: http://localhost:${PORT}`);
  console.log(`   Sites: http://[slug].localhost:${PORT}`);
  console.log(`\n   e.g.  http://lowdrama.localhost:${PORT}`);
});
