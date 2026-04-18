#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SITES_DIR = path.join(__dirname, 'sites');
const NEW_TIMESTAMP = '2026-02-21T15:38:38.758335+00:00';

console.log('📝 Updating metadata timestamps...\n');

let updated = 0;
let errors = 0;

fs.readdirSync(SITES_DIR).forEach((siteName) => {
  const metaPath = path.join(SITES_DIR, siteName, '_meta.json');

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    meta.crawledAt = NEW_TIMESTAMP;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
    updated++;
  } catch (err) {
    console.log(`✗ ${siteName}: ${err.message}`);
    errors++;
  }
});

console.log(`✓ Updated: ${updated}`);
if (errors > 0) console.log(`✗ Errors: ${errors}`);
console.log(`\n✨ Done! Timestamp: ${NEW_TIMESTAMP}`);
