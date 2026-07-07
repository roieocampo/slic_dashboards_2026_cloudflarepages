# SLIC DashBoards Cloudflare v11 - Filter Popup + Local Agent Progress Fix

This package keeps the Cloudflare Pages layout matched to the last Vercel v11 version.

## Fixes
- Column filter popup now opens directly below the clicked header filter button.
- Popup closes safely when the table scrolls or the window resizes.
- Local PC auto sync agent now scans Excel rows faster using `iter_rows`.
- Local agent now prints row-scan progress so it does not look frozen while reading large Excel sheets.
- Local agent now stops after too many consecutive blank rows even if the sheet has a very large formatted range.

## Deploy to Cloudflare Pages
Replace/upload all files from this zip to your Cloudflare GitHub repo, then redeploy Cloudflare Pages.

Build settings remain:
- Framework preset: None
- Build command: blank
- Build output directory: public
- Root directory: /

## Local Auto Sync
Also replace your local `local_sync_agent.py` with the included updated file.

Run example:
```bat
set SUPABASE_URL=https://your-project.supabase.co
set SUPABASE_SERVICE_KEY=your-service-role-key
set SLIC_SSL_VERIFY=false
python local_sync_agent.py
```
