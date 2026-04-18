#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SITES_DIR = path.join(__dirname, 'sites');
const BACKUP_DIR = '/Users/office/Downloads/backup';
const BACKUP_PAGES_DIR = path.join(BACKUP_DIR, 'pages');
const BACKUP_ASSETS_DIR = path.join(BACKUP_DIR, 'assets');
const ASSETS_DIR = path.join(__dirname, 'assets');

const ASSET_HOST = process.env.ASSET_HOST || '/assets';

console.log('🚀 Starting site migration...\n');

// 1. Validate sites directory structure
console.log('📋 Validating sites directory structure...');
const siteIssues = [];
const siteNames = new Set();

fs.readdirSync(SITES_DIR).forEach((name) => {
  const sitePath = path.join(SITES_DIR, name);
  const stat = fs.statSync(sitePath);

  if (!stat.isDirectory()) {
    siteIssues.push(`${name} is not a directory`);
    return;
  }

  const files = fs.readdirSync(sitePath);
  const hasIndexHtml = files.includes('index.html');
  const hasMetaJson = files.includes('_meta.json');

  if (!hasIndexHtml) {
    siteIssues.push(`${name}: missing index.html`);
  }
  if (!hasMetaJson) {
    siteIssues.push(`${name}: missing _meta.json`);
  }
  if (files.length > 2) {
    siteIssues.push(`${name}: extra files found: ${files.filter(f => f !== 'index.html' && f !== '_meta.json').join(', ')}`);
  }

  siteNames.add(name);
});

if (siteIssues.length > 0) {
  console.log('⚠️  Found issues in sites directory:');
  siteIssues.forEach(issue => console.log(`   - ${issue}`));
  console.log();
} else {
  console.log(`✓ All ${siteNames.size} sites have valid structure\n`);
}

// 2. Check for missing backup files
console.log('🔍 Checking backup files...');
const backupPages = fs.readdirSync(BACKUP_PAGES_DIR).filter(f => f.endsWith('.html'));
const missingSites = [];

siteNames.forEach(siteName => {
  const backupFile = `${siteName}.html`;
  if (!backupPages.includes(backupFile)) {
    missingSites.push(siteName);
  }
});

if (missingSites.length > 0) {
  console.log(`⚠️  No backup found for these sites: ${missingSites.join(', ')}\n`);
}

console.log(`✓ Found ${backupPages.length} pages in backup\n`);

// 3. Update asset references in HTML
function updateAssetReferences(html) {
  // Match ../assets/... patterns and replace with /assets/...
  return html.replace(/\.\.\/assets\//g, `${ASSET_HOST}/`);
}

// 4. Migrate sites
console.log('📦 Migrating sites...');
let migratedCount = 0;
let skippedCount = 0;

siteNames.forEach(siteName => {
  const backupFile = path.join(BACKUP_PAGES_DIR, `${siteName}.html`);
  const targetFile = path.join(SITES_DIR, siteName, 'index.html');

  if (!fs.existsSync(backupFile)) {
    console.log(`⊘ ${siteName}: no backup file`);
    skippedCount++;
    return;
  }

  try {
    let html = fs.readFileSync(backupFile, 'utf-8');
    html = updateAssetReferences(html);
    fs.writeFileSync(targetFile, html, 'utf-8');
    console.log(`✓ ${siteName}`);
    migratedCount++;
  } catch (err) {
    console.log(`✗ ${siteName}: ${err.message}`);
    skippedCount++;
  }
});

console.log(`\nMigrated ${migratedCount} sites, skipped ${skippedCount}\n`);

// 5. Copy assets
console.log('📁 Copying assets...');
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

try {
  // Use cp -r to copy recursively
  execSync(`cp -r ${BACKUP_ASSETS_DIR}/* ${ASSETS_DIR}/`, { stdio: 'pipe' });
  console.log(`✓ Assets copied to ${ASSETS_DIR}\n`);
} catch (err) {
  console.log(`✗ Failed to copy assets: ${err.message}\n`);
  process.exit(1);
}

// 6. Summary
console.log('📊 Migration Summary:');
console.log(`   - Sites validated: ${siteNames.size}`);
console.log(`   - Sites migrated: ${migratedCount}`);
console.log(`   - Asset references updated: ${migratedCount}`);
console.log(`   - Assets copied: ✓`);
console.log(`   - Asset URL prefix: ${ASSET_HOST}`);
console.log('\n✨ Migration complete!');

if (migratedCount < siteNames.size) {
  process.exit(1);
}
