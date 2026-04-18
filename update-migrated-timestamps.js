#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SITES_DIR = path.join(__dirname, 'sites');
const BACKUP_PAGES_DIR = '/Users/office/Downloads/backup/pages';
const NEW_TIMESTAMP = '20260221153838'; // YYYYMMDDHHmmss format

console.log('📝 Updating timestamps for migrated sites only...\n');

let updated = 0;
let skipped = 0;
let errors = 0;

fs.readdirSync(SITES_DIR).forEach((siteName) => {
  const metaPath = path.join(SITES_DIR, siteName, '_meta.json');
  const backupPath = path.join(BACKUP_PAGES_DIR, `${siteName}.html`);

  // Only update if backup exists (i.e., site was migrated)
  if (!fs.existsSync(backupPath)) {
    skipped++;
    return;
  }

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const oldTimestamp = meta.timestamp;
    meta.timestamp = NEW_TIMESTAMP;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
    console.log(`✓ ${siteName}: ${oldTimestamp} → ${NEW_TIMESTAMP}`);
    updated++;
  } catch (err) {
    console.log(`✗ ${siteName}: ${err.message}`);
    errors++;
  }
});

console.log(`\n📊 Results:`);
console.log(`   Updated: ${updated}`);
console.log(`   Skipped (no backup): ${skipped}`);
if (errors > 0) console.log(`   Errors: ${errors}`);
console.log(`\n✨ Done! Updated ${updated} migrated sites to timestamp: ${NEW_TIMESTAMP}`);
