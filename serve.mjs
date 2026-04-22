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
  '.yml':  'text/yaml',
  '.yaml': 'text/yaml',
  '.md':   'text/markdown',
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
  // Enable CORS for API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Strip query string from URL
  const pathname = req.url.split('?')[0];

  // Handle /api/pages/* - API endpoints for editor
  if (pathname.startsWith('/api/pages/')) {
    const slug = pathname.slice(11); // Remove '/api/pages/' prefix

    if (req.method === 'GET') {
      // Read page data
      try {
        const htmlPath = path.join(SITES_DIR, slug || 'example-site', 'index.html');
        if (!htmlPath.startsWith(SITES_DIR)) {
          res.writeHead(403); res.end('Forbidden'); return;
        }
        const content = await fs.readFile(htmlPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ html: content, slug: slug || 'example-site' }));
      } catch (e) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Page not found' }));
      }
      return;
    } else if (req.method === 'POST' || req.method === 'PUT') {
      // Write page data
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const siteSlug = slug || data.slug || 'example-site';
          const siteDir = path.join(SITES_DIR, siteSlug);

          if (!siteDir.startsWith(SITES_DIR)) {
            res.writeHead(403); res.end('Forbidden'); return;
          }

          await fs.mkdir(siteDir, { recursive: true });
          await fs.writeFile(path.join(siteDir, 'index.html'), data.html);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, slug: siteSlug }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  // Handle /admin/* at root level
  if (pathname.startsWith('/admin')) {
    let filePath = pathname === '/admin' || pathname === '/admin/'
      ? path.join(ADMIN_DIR, 'index.html')
      : path.join(ADMIN_DIR, pathname.slice(7)); // Remove '/admin/' prefix

    // Prevent path traversal
    if (!filePath.startsWith(ADMIN_DIR)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    try {
      let stat;
      try {
        stat = await fs.stat(filePath);
      } catch {
        // Try adding .html extension if file not found and no extension
        if (!path.extname(filePath)) {
          filePath += '.html';
          stat = await fs.stat(filePath);
        } else {
          throw new Error('Not found');
        }
      }

      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');

      const content = await fs.readFile(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Admin file not found');
    }
    return;
  }

  // Handle /assets/ at root level
  if (pathname.startsWith('/assets/')) {
    let filePath = path.join(ASSETS_DIR, pathname.slice(8)); // Remove '/assets/' prefix

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

  let filePath = path.join(SITES_DIR, slug, pathname === '/' ? 'index.html' : pathname);

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
