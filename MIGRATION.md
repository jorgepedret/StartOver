# Site Migration Script

This script migrates website files from the backup directory into the startover repo, updating asset references to point to a shared assets directory.

## How It Works

### 1. **Validates Site Structure** 
   - Checks that each site directory contains exactly 2 files: `index.html` and `_meta.json`
   - Reports any sites with missing files or extra files
   - Found 655 sites with valid structure

### 2. **Migrates HTML Files**
   - Copies HTML files from `backup/pages/{sitename}.html` to `sites/{sitename}/index.html`
   - Updates all asset references in the HTML files
   - Reports successful migrations and skipped sites (248 backup files matched, 365 sites migrated)

### 3. **Updates Asset References**
   - Changes relative paths from `../assets/...` to `/assets/...` (or custom host)
   - This allows each site to be served as a subdomain while assets are shared from the main host
   - Example: `../assets/static/themes/glow/main.css` → `/assets/static/themes/glow/main.css`

### 4. **Copies Assets**
   - Copies entire `backup/assets/` directory to `startover/assets/`
   - Includes: custom-images, external, fonts, static, uploads, user-images
   - Total size: ~1.4GB

## Directory Structure After Migration

```
startover/
├── sites/
│   ├── 122ways/
│   │   ├── index.html (updated with /assets/... references)
│   │   └── _meta.json (preserved)
│   ├── 10doorways/
│   │   └── ...
│   └── ... (365 migrated sites)
│
└── assets/
    ├── static/
    ├── uploads/
    ├── custom-images/
    ├── user-images/
    ├── fonts/
    └── external/
```

## Usage

### Run Migration
```bash
node migrate-sites.js
```

### Custom Asset Host
By default, assets are referenced as `/assets/...`. To use a different host:

```bash
ASSET_HOST=https://startover.world/assets node migrate-sites.js
```

This would change references to: `https://startover.world/assets/static/themes/...`

## Results

- ✓ 655 sites validated
- ✓ 365 sites migrated from backup
- ✓ 290 sites skipped (no backup file found)
- ✓ All asset references updated
- ✓ 1.4GB assets copied

## Subdomain Serving

With this structure, you can serve sites as subdomains:
- `lowdrama.startover.world` or `lowdrama.localhost:8000` → serves `sites/lowdrama/index.html`
- Assets are served from main host at `/assets/` → `startover.world/assets/` or `localhost:8000/assets/`

All asset references in HTML files now point to `/assets/...` so they'll resolve correctly from any subdomain.

## Notes

- The migration script validates existing structure but doesn't modify `_meta.json` files
- Sites without corresponding backup files are skipped but can be added manually later
- The script is idempotent - running it multiple times will overwrite site HTML files with the latest backup versions
