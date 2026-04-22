#!/usr/bin/env node
/**
 * build-index.mjs
 * Generates /var/www/startover/index.html from crawl-progress.json + domains file
 *
 * Usage: node build-index.mjs all_links.md
 * Output: index.html  (copy this to /var/www/startover/index.html on the server)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const domainsFile = process.argv[2] || 'all_links.md';

  // Format "20250908094125" → "September 8th, 2025"
  function formatTimestamp(ts) {
    if (!ts) return null;
    const y = parseInt(ts.slice(0, 4));
    const m = parseInt(ts.slice(4, 6)) - 1; // 0-indexed
    const d = parseInt(ts.slice(6, 8));
    const date = new Date(y, m, d);
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const v = d % 100;
    const suffix = (v >= 11 && v <= 13) ? 'th'
      : ['th','st','nd','rd'][d % 10] || 'th';
    return `${month} ${d}${suffix}, ${y}`;
  }

  // Load titles from domains file
  const raw = await fs.readFile(domainsFile, 'utf-8');
  const titleMap = {};
  raw.split('\n').forEach(l => {
    const parts = l.trim().split(/\s[—|]\s|\t/);
    if (parts.length < 2) return;
    const urlPart = parts[0].trim();
    const title = parts[1]?.trim() || '';
    let domain;
    try { domain = new URL(urlPart).hostname; } catch { domain = urlPart; }
    if (domain) titleMap[domain] = title;
  });

  // Load crawl progress
  let progress = {};
  try {
    progress = JSON.parse(await fs.readFile('crawl-progress.json', 'utf-8'));
  } catch {
    console.error('crawl-progress.json not found — run crawl.mjs first');
    process.exit(1);
  }

  // Build site list — recovered
  const sites = Object.entries(progress)
    .filter(([, v]) => v.status === 'ok')
    .map(([domain, v]) => ({
      slug: v.slug,
      domain,
      title: titleMap[domain] || v.slug,
      url: `https://${v.slug}.startover.world`,
      timestamp: v.timestamp,
      captured: formatTimestamp(v.timestamp),
      status: 'ok',
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  // Build uncaptured list — all domains not in progress OR with error/no_snapshot
  const allDomains = Object.keys(titleMap);
  const uncaptured = allDomains
    .filter(domain => !progress[domain] || progress[domain].status !== 'ok')
    .map(domain => {
      const slug = domain.split('.')[0];
      return {
        slug,
        domain,
        title: titleMap[domain] || slug,
        status: progress[domain]?.status || 'pending',
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  const total = Object.keys(titleMap).length;
  const ok = sites.length;
  const errors = Object.values(progress).filter(v => v.status === 'error').length;
  const noSnap = Object.values(progress).filter(v => v.status === 'no_snapshot').length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StartOver.world — Spaceport</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Barlow+Condensed:wght@400;600;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #f5f4f0;
      --surface: #eeede8;
      --border: #dddbd3;
      --accent: #e79d2e;
      --accent2: #c0392b;
      --text: #1a1a1a;
      --muted: #888880;
      --card-hover: #eceae3;
    }

    html { scroll-behavior: smooth; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Space Mono', monospace;
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Grid background */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
      z-index: 0;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
      position: relative;
      z-index: 1;
    }

    /* Header */
    header {
      padding: 80px 0 48px;
      border-bottom: 1px solid var(--border);
    }

    .eyebrow {
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 16px;
    }

    h1 {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: clamp(72px, 12vw, 140px);
      font-weight: 800;
      line-height: 0.9;
      letter-spacing: 0;
      text-transform: uppercase;
      margin-bottom: 24px;
    }

    h1 .dim { color: var(--muted); }
    h1 .bright { color: var(--accent); }

    .subtitle {
      font-size: 14px;
      color: var(--muted);
      line-height: 1.7;
      max-width: 520px;
    }

    /* Stats bar */
    .stats {
      display: flex;
      gap: 32px;
      padding: 24px 0;
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stat-number {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 28px;
      font-weight: 800;
      color: var(--accent);
    }

    .stat-label {
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--muted);
    }

    /* Search */
    .search-wrap {
      padding: 32px 0 24px;
      position: sticky;
      top: 0;
      background: var(--bg);
      z-index: 10;
      border-bottom: 1px solid var(--border);
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    }

    .search-inner {
      position: relative;
    }

    .search-icon {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      font-size: 14px;
      pointer-events: none;
    }

    #search {
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 14px 16px 14px 44px;
      color: var(--text);
      font-family: 'Space Mono', monospace;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    #search:focus {
      border-color: var(--accent);
    }

    #search::placeholder { color: var(--muted); }

    .results-count {
      font-size: 11px;
      color: var(--muted);
      margin-top: 10px;
      letter-spacing: 0.1em;
    }

    /* Grid */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1px;
      background: var(--border);
      margin-top: 0;
    }

    .card {
      background: var(--bg);
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: background 0.15s;
      text-decoration: none;
      color: inherit;
      position: relative;
      overflow: hidden;
    }

    .card::after {
      content: '→';
      position: absolute;
      right: 20px;
      top: 50%;
      transform: translateY(-50%) translateX(8px);
      color: var(--accent);
      font-size: 18px;
      opacity: 0;
      transition: opacity 0.15s, transform 0.15s;
    }

    .card:hover {
      background: var(--card-hover);
    }

    .card:hover::after {
      opacity: 1;
      transform: translateY(-50%) translateX(0);
    }

    .card-title {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      line-height: 1.3;
      padding-right: 24px;
    }

    .card-slug {
      font-size: 11px;
      color: var(--muted);
      letter-spacing: 0.05em;
    }

    .card-slug span {
      color: var(--accent);
      opacity: 0.7;
    }

    .card-date {
      font-size: 10px;
      color: var(--muted);
      letter-spacing: 0.05em;
      opacity: 0.7;
    }

    /* Uncaptured cards */
    .card.uncaptured {
      opacity: 0.45;
      cursor: default;
      pointer-events: none;
    }

    .card.uncaptured .card-slug span {
      color: var(--muted);
    }

    .card.uncaptured .card-date {
      color: var(--accent2);
      opacity: 0.6;
    }

    .section-label {
      grid-column: 1 / -1;
      padding: 24px 24px 8px;
      font-size: 10px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: var(--muted);
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      border-top: 1px solid var(--border);
    }

    /* Hidden card */
    .card.hidden { display: none; }

    /* Footer */
    footer {
      padding: 48px 0;
      border-top: 1px solid var(--border);
      margin-top: 0;
      font-size: 11px;
      color: var(--muted);
      letter-spacing: 0.1em;
    }

    .no-results {
      padding: 80px 24px;
      text-align: center;
      color: var(--muted);
      font-size: 14px;
      display: none;
    }

    @media (max-width: 600px) {
      header { padding: 48px 0 32px; }
      .stats { gap: 20px; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="eyebrow">StartOver.xyz — Spaceport</div>
      <h1>
        <span class="dim">Start</span><span class="bright">Over</span><br>
        <span class="dim">.world</span>
      </h1>
      <p class="subtitle">
        A cloud of ${ok} recovered websites from the Possibility Management &amp;
        StartOver.xyz gameworld — archived and restored.
      </p>
    </header>

    <div class="stats">
      <div class="stat">
        <div class="stat-number">${ok}</div>
        <div class="stat-label">Sites Restored</div>
      </div>
      <div class="stat">
        <div class="stat-number">${total}</div>
        <div class="stat-label">Total Domains</div>
      </div>
      <div class="stat">
        <div class="stat-number">${errors + noSnap}</div>
        <div class="stat-label">Missing</div>
      </div>
    </div>

    <div class="search-wrap">
      <div class="container" style="padding:0">
        <div class="search-inner">
          <span class="search-icon">⌕</span>
          <input
            type="search"
            id="search"
            placeholder="Search sites..."
            autocomplete="off"
            autofocus
          >
        </div>
        <div class="results-count" id="count">${ok} recovered · ${uncaptured.length} missing</div>
      </div>
    </div>

    <div class="grid" id="grid">
      ${sites.map(s => `
      <a class="card" href="${s.url}" target="_blank"
         data-title="${s.title.toLowerCase()}"
         data-slug="${s.slug.toLowerCase()}">
        <div class="card-title">${s.title}</div>
        <div class="card-slug"><span>${s.slug}</span>.startover.world</div>
        <div class="card-date">Last captured ${s.captured}</div>
      </a>`).join('')}
      ${uncaptured.length > 0 ? `
      <div class="section-label">Not yet recovered — ${uncaptured.length} sites</div>
      ${uncaptured.map(s => `
      <div class="card uncaptured"
         data-title="${s.title.toLowerCase()}"
         data-slug="${s.slug.toLowerCase()}">
        <div class="card-title">${s.title}</div>
        <div class="card-slug"><span style="color:var(--muted)">${s.slug}</span>.startover.world</div>
        <div class="card-date">No capture recorded</div>
      </div>`).join('')}` : ''}
    </div>

    <div class="no-results" id="no-results">No sites match your search.</div>

    <footer>
      <div class="container" style="padding:0">
        STARTOVER.WORLD — Recovered from archive.org —
        ${new Date().getFullYear()}
      </div>
    </footer>
  </div>

  <script>
    const search = document.getElementById('search');
    const cards = document.querySelectorAll('.card');
    const count = document.getElementById('count');
    const noResults = document.getElementById('no-results');
    const recoveredTotal = ${ok};
    const missingTotal = ${uncaptured.length};

    search.addEventListener('input', () => {
      const q = search.value.toLowerCase().trim();
      let visibleRecovered = 0;
      let visibleMissing = 0;

      cards.forEach(card => {
        const match = !q ||
          card.dataset.title.includes(q) ||
          card.dataset.slug.includes(q);
        card.classList.toggle('hidden', !match);
        if (match) {
          if (card.classList.contains('uncaptured')) visibleMissing++;
          else visibleRecovered++;
        }
      });

      if (q) {
        count.textContent = \`\${visibleRecovered} recovered · \${visibleMissing} missing\`;
      } else {
        count.textContent = \`\${recoveredTotal} recovered · \${missingTotal} missing\`;
      }

      noResults.style.display = (visibleRecovered + visibleMissing) === 0 ? 'block' : 'none';
    });
  </script>
</body>
</html>`;

  const outPath = path.join(__dirname, 'index.html');
  await fs.writeFile(outPath, html, 'utf-8');
  console.log(`✓ Generated index.html with ${ok} sites`);
  console.log(`  Copy to server: scp index.html hostinger:/var/www/startover/index.html`);
}

main().catch(err => { console.error(err); process.exit(1); });
