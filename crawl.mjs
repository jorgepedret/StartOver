#!/usr/bin/env node
/**
 * Wayback Machine Bulk Crawler
 * Usage: node crawl.mjs domains.txt
 *
 * domains.txt: one domain per line, e.g.:
 *   lowdrama.mystrikingly.com
 *   archetypalanger.mystrikingly.com
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────────────────────────
const OUTPUT_DIR   = path.join(__dirname, 'sites');
const PROGRESS_FILE = path.join(__dirname, 'crawl-progress.json');
const LOG_FILE     = path.join(__dirname, 'crawl.log');
const DELAY_MS     = 2000;   // ms between requests (be nice to archive.org)
const RETRY_LIMIT  = 3;
const RETRY_DELAY  = 5000;   // ms before retry

// ── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

let logStream;
async function log(msg, level = 'INFO') {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
  console.log(line);
  await fs.appendFile(LOG_FILE, line + '\n');
}

/**
 * Get the most recent archived snapshot timestamp for a URL via CDX API.
 * Returns { timestamp, original } or null.
 */
async function getLatestSnapshot(domain) {
  // Query a specific URL variant (http or https)
  async function queryCDX(url) {
    const cdxUrl =
      `http://web.archive.org/cdx/search/cdx` +
      `?url=${encodeURIComponent(url)}` +
      `&output=json` +
      `&limit=-1` +
      `&fl=timestamp,original,statuscode` +
      `&filter=statuscode:200`;
    const res = await fetch(cdxUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length < 2) return null;
    return { timestamp: rows[rows.length - 1][0], original: rows[rows.length - 1][1] };
  }

  // Try both http and https, return whichever has the newer snapshot
  const [http, https] = await Promise.all([
    queryCDX(`http://${domain}/`).catch(() => null),
    queryCDX(`https://${domain}/`).catch(() => null),
  ]);

  const candidates = [http, https].filter(Boolean);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
}

/**
 * Fetch raw HTML from Wayback Machine.
 * The `id_` modifier strips the Wayback toolbar/JS injections.
 */
async function fetchArchivedHtml(timestamp, original) {
  const url = `https://web.archive.org/web/${timestamp}id_/${original}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(60000),
    headers: {
      'User-Agent': 'WaybackRecovery/1.0 (archival recovery project)',
    },
  });
  if (!res.ok) throw new Error(`Fetch HTTP ${res.status} for ${url}`);
  return await res.text();
}

/**
 * Rewrite archived asset URLs in HTML so relative paths work locally.
 * Removes leftover Wayback Machine URL prefixes from src/href attributes.
 */
function rewriteHtml(html, originalDomain, timestamp) {
  // Strip Wayback prefix from absolute URLs pointing back to archive.org
  // e.g. https://web.archive.org/web/20240101000000id_/https://example.com/foo.css
  // → https://example.com/foo.css  (or could be made relative)
  const pattern = /https?:\/\/web\.archive\.org\/web\/\d{14}(?:id_|[a-z_]*)\//gi;
  return html.replace(pattern, '');
}

async function fetchWithRetry(domain) {
  for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const snapshot = await getLatestSnapshot(domain);
      if (!snapshot) return { status: 'no_snapshot' };

      const html = await fetchArchivedHtml(snapshot.timestamp, snapshot.original);
      const cleaned = rewriteHtml(html, domain, snapshot.timestamp);
      return { status: 'ok', html: cleaned, snapshot };
    } catch (err) {
      if (attempt < RETRY_LIMIT) {
        await log(`  Retry ${attempt}/${RETRY_LIMIT} for ${domain}: ${err.message}`, 'WARN');
        await sleep(RETRY_DELAY * attempt);
      } else {
        return { status: 'error', error: err.message };
      }
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const domainsFile = process.argv[2];
  const refreshMode = process.argv.includes('--refresh');

  if (!domainsFile) {
    console.error('Usage: node crawl.mjs domains.txt [--refresh]');
    process.exit(1);
  }

  // Load domain list
  // Handles multiple formats:
  //   lowdrama.mystrikingly.com
  //   https://lowdrama.mystrikingly.com — Some Title
  //   https://lowdrama.mystrikingly.com
  const raw = await fs.readFile(domainsFile, 'utf-8');
  const entries = raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const parts = l.split(/\s[—|]\s|\t/);
      const urlPart = parts[0].trim();
      const title = parts[1]?.trim() || '';
      let domain;
      try { domain = new URL(urlPart).hostname; } catch { domain = urlPart; }
      return { domain, title };
    })
    .filter(e => e.domain);

  const domains = entries.map(e => e.domain);
  const titleMap = Object.fromEntries(entries.map(e => [e.domain, e.title]));

  await log(`Loaded ${domains.length} domains${refreshMode ? ' [REFRESH MODE — checking for newer snapshots]' : ''}`);

  // Load or init progress
  let progress = {};
  try {
    progress = JSON.parse(await fs.readFile(PROGRESS_FILE, 'utf-8'));
    await log(`Resuming — ${Object.keys(progress).length} already processed`);
  } catch {
    // Fresh start
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let success = 0, skipped = 0, updated = 0, errors = 0, noSnapshot = 0;

  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];
    const slug = domain.split('.')[0];
    const existing = progress[domain];

    // Normal mode: skip already done
    if (!refreshMode && existing?.status === 'ok') {
      skipped++;
      continue;
    }

    // Refresh mode: check CDX for newer timestamp before fetching
    if (refreshMode && existing?.status === 'ok') {
      try {
        const snapshot = await getLatestSnapshot(domain);
        if (!snapshot || snapshot.timestamp === existing.timestamp) {
          skipped++;
          await sleep(300); // small delay even on skips
          continue;
        }
        await log(`[${i + 1}/${domains.length}] ${domain} — newer snapshot found (${existing.timestamp} → ${snapshot.timestamp})`);
      } catch {
        skipped++;
        continue;
      }
    } else {
      await log(`[${i + 1}/${domains.length}] ${domain} → sites/${slug}/`);
    }

    const result = await fetchWithRetry(domain);

    if (result.status === 'ok') {
      const siteDir = path.join(OUTPUT_DIR, slug);
      await fs.mkdir(siteDir, { recursive: true });
      await fs.writeFile(path.join(siteDir, 'index.html'), result.html, 'utf-8');

      // Save metadata alongside the HTML
      await fs.writeFile(
        path.join(siteDir, '_meta.json'),
        JSON.stringify({ domain, slug, title: titleMap[domain] || '', ...result.snapshot, crawledAt: new Date().toISOString() }, null, 2)
      );

      progress[domain] = { status: 'ok', slug, timestamp: result.snapshot.timestamp };
      if (refreshMode) updated++; else success++;
    } else if (result.status === 'no_snapshot') {
      await log(`  No snapshot found for ${domain}`, 'WARN');
      progress[domain] = { status: 'no_snapshot' };
      noSnapshot++;
    } else {
      await log(`  Error for ${domain}: ${result.error}`, 'ERROR');
      progress[domain] = { status: 'error', error: result.error };
      errors++;
    }

    // Save progress after every domain
    await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));

    await sleep(DELAY_MS);
  }

  await log('─────────────────────────────────────────');
  await log(`Done! ✓ New: ${success}  ↑ Updated: ${updated}  ⏭ Skipped: ${skipped}  ✗ Errors: ${errors}  ∅ No snapshot: ${noSnapshot}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
