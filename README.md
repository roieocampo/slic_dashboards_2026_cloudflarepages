# SLIC DashBoards - Cloudflare Pages Version

This is a separate Cloudflare Pages + Functions version of the SLIC DashBoards app.
It does not modify the existing Vercel project.

## What stays the same

- Same Supabase project/tables
- Same LTX / ETS dashboard data
- Same local_sync_agent.py for local PC auto sync
- Same logins by default:
  - user / user
  - cip / jjgcip
  - admin / roieocamposlic

## Cloudflare project setup

1. Create a new GitHub repo, for example:

```text
slic-dashboards-cloudflare
```

2. Upload all files/folders from this package into the repo root:

```text
public/
functions/
package.json
README.md
local_sync_agent.py
run_local_sync_agent_company_ssl_example.bat
supabase_schema.sql
supabase_auto_sync_settings.sql
```

3. In Cloudflare:

```text
Cloudflare Dashboard
→ Workers & Pages
→ Create application
→ Pages
→ Connect to Git
→ Select the slic-dashboards-cloudflare repo
```

4. Build settings:

```text
Framework preset: None
Build command: leave blank
Build output directory: public
Root directory: /
```

5. Add Environment Variables in Cloudflare Pages:

```text
SUPABASE_URL
SUPABASE_SERVICE_KEY
APP_SECRET_KEY
```

Optional login override variables:

```text
LEVEL1_USERNAME
LEVEL1_PASSWORD
LEVEL2_USERNAME
LEVEL2_PASSWORD
LEVEL3_USERNAME
LEVEL3_PASSWORD
```

6. Deploy.

## Supabase

If your existing SLIC Supabase tables already exist, no need to rerun SQL.
If this is a fresh Supabase project, run:

```text
supabase_schema.sql
supabase_auto_sync_settings.sql
```

## Local auto sync

The local PC auto sync agent still works the same. Run it on the PC that can access the Excel files.

For company SSL/proxy networks:

```bat
set SUPABASE_URL=https://your-project.supabase.co
set SUPABASE_SERVICE_KEY=your-service-role-key
set SLIC_SSL_VERIFY=false
python local_sync_agent.py
```

## Notes

- Do not expose SUPABASE_SERVICE_KEY in the frontend.
- This package keeps the key inside Cloudflare Functions only.
- Manual Admin upload works through browser chunk upload to avoid large payload errors.
- Browser Excel parsing uses the SheetJS CDN. If your network blocks the CDN, use the local_sync_agent.py instead.
  
