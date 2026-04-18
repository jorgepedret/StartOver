#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SITES_DIR = path.join(__dirname, 'sites');
const BACKUP_PAGES_DIR = '/Users/office/Downloads/backup/pages';
const NEW_TIMESTAMP = '20260221153838'; // YYYYMMDDHHmmss format

const progressPath = 'crawl-progress.json';
const progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));

console.log('📝 Updating crawl-progress.json timestamps for migrated sites...\n');

let updated = 0;
let skipped = 0;

Object.keys(progress).forEach((domain) => {
  const slug = progress[domain].slug;
  const backupPath = path.join(BACKUP_PAGES_DIR, `${slug}.html`);

  // Only update if backup exists (i.e., site was migrated)
  if (!fs.existsSync(backupPath)) {
    skipped++;
    return;
  }

  const oldTimestamp = progress[domain].timestamp;
  progress[domain].timestamp = NEW_TIMESTAMP;
  console.log(`✓ ${slug}: ${oldTimestamp} → ${NEW_TIMESTAMP}`);
  updated++;
});

fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2) + '\n', 'utf-8');

console.log(`\n📊 Results:`);
console.log(`   Updated: ${updated}`);
console.log(`   Skipped: ${skipped}`);
console.log(`\n✨ Done! Updated crawl-progress.json for ${updated} migrated sites`);
