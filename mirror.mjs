#!/usr/bin/env node
/**
 * Phase 2: Deep asset mirror using wget
 * This fetches CSS, images, JS — not just HTML.
 * Requires: wget installed (brew install wget / apt install wget)
 *
 * Usage: node mirror.mjs domains.txt
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUTPUT_DIR = path.join(__dirname, 'sites');
const MIRROR_LOG = path.join(__dirname, 'mirror-progress.json');
const DELAY_BETWEEN_SITES = 3000; // ms — longer for full mirrors

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getLatestTimestamp(domain) {
  const res = await fetch(
    `http://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&limit=1&fl=timestamp&filter=statuscode:200&fastLatest=true`,
    { signal: AbortSignal.timeout(15000) }
  );
  const rows = await res.json();
  if (!rows || rows.length < 2) return null;
  return rows[1][0]; // timestamp string
}

async function mirrorSite(domain, slug, timestamp) {
  const waybackBase = `https://web.archive.org/web/${timestamp}/`;
  const targetUrl = `${waybackBase}https://${domain}/`;
  const outDir = path.join(OUTPUT_DIR, slug);
  await fs.mkdir(outDir, { recursive: true });

  return new Promise((resolve, reject) => {
    const args = [
      '--mirror',
      '--convert-links',         // rewrite links to work locally
      '--adjust-extension',      // save .html files with .html extension
      '--page-requisites',       // get all assets (CSS, JS, images)
      '--no-parent',
      '--wait=1',                // 1 second between requests
      '--random-wait',
      '--no-host-directories',
      '--cut-dirs=3',            // trim /web/TIMESTAMP/ from paths
      `-P`, outDir,              // output directory
      '--user-agent=WaybackRecovery/1.0',
      '--timeout=30',
      '--tries=3',
      targetUrl,
    ];

    console.log(`  wget ${args.slice(-1)[0]}`);
    const proc = spawn('wget', args, { stdio: 'inherit' });

    proc.on('close', code => {
      if (code === 0 || code === 8) {
        // code 8 = server error on some URLs — often still mostly successful
        resolve();
      } else {
        reject(new Error(`wget exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const domainsFile = process.argv[2];
  if (!domainsFile) {
    console.error('Usage: node mirror.mjs domains.txt');
    process.exit(1);
  }

  const raw = await fs.readFile(domainsFile, 'utf-8');
  const domains = raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const stripped = l.split(/\s[—|]\s|\t/)[0].trim();
      try { return new URL(stripped).hostname; } catch { return stripped; }
    })
    .filter(Boolean);

  let progress = {};
  try { progress = JSON.parse(await fs.readFile(MIRROR_LOG, 'utf-8')); } catch {}

  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i];
    const slug = domain.split('.')[0];

    if (progress[domain]?.done) {
      console.log(`[${i+1}/${domains.length}] SKIP ${domain}`);
      continue;
    }

    console.log(`[${i+1}/${domains.length}] Mirroring ${domain} → sites/${slug}/`);

    try {
      const timestamp = await getLatestTimestamp(domain);
      if (!timestamp) {
        console.log(`  No snapshot found`);
        progress[domain] = { done: false, error: 'no_snapshot' };
      } else {
        await mirrorSite(domain, slug, timestamp);
        progress[domain] = { done: true, timestamp };
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      progress[domain] = { done: false, error: err.message };
    }

    await fs.writeFile(MIRROR_LOG, JSON.stringify(progress, null, 2));
    await sleep(DELAY_BETWEEN_SITES);
  }

  const done = Object.values(progress).filter(v => v.done).length;
  console.log(`\nMirror complete: ${done}/${domains.length} sites mirrored`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
