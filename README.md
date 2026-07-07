# SLIC DashBoards - Cloudflare Pages v11 Match

This is the Cloudflare Pages version styled and arranged to match the last Vercel version:

`SLIC_DashBoards_v11_week_filter_agent_fix.zip`

Attendance project is not included and is not touched.

## Deploy on Cloudflare Pages

1. Create or open your Cloudflare GitHub repo.
2. Replace the repo contents with this package.
3. Cloudflare Pages build settings:
   - Framework preset: None
   - Build command: leave blank
   - Build output directory: public
   - Root directory: /
4. Add Environment Variables in Cloudflare Pages:
   - SUPABASE_URL
   - SUPABASE_SERVICE_KEY
   - APP_SECRET_KEY
5. Redeploy.

## Access

- User Access: `user` / `user`
- CIP level Access: `cip` / `jjgcip`
- Admin Access: `admin` / `roieocamposlic`

You can override those using Cloudflare Environment Variables:

- LEVEL1_USERNAME / LEVEL1_PASSWORD
- LEVEL2_USERNAME / LEVEL2_PASSWORD
- LEVEL3_USERNAME / LEVEL3_PASSWORD

## Local auto sync

Use the included `local_sync_agent.py` on the PC that can access the Excel files.

Example CMD:

```bat
set SUPABASE_URL=https://your-project.supabase.co
set SUPABASE_SERVICE_KEY=your-service-role-key
set SLIC_SSL_VERIFY=false
python local_sync_agent.py
```

## Files included

- `public/index.html` - Cloudflare frontend matching Vercel v11 look/flow
- `functions/` - Cloudflare Pages Functions API
- `local_sync_agent.py` - local PC sync worker from v11
- `supabase_schema.sql`
- `supabase_auto_sync_settings.sql`
