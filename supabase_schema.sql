-- SLIC DashBoards Supabase schema
-- Run this in Supabase SQL Editor for the NEW SLIC_DashBoards project.

create table if not exists public.slic_dashboard_rows (
  id bigserial primary key,
  sheet_key text not null check (sheet_key in ('ETS', 'LTX')),
  sheet_name text not null,
  source_row integer not null,
  row_values jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  row_hash text,
  status_value text,
  completed_flag boolean not null default false,
  sync_id text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(sheet_key, source_row)
);

create index if not exists idx_slic_dashboard_rows_sheet_row
on public.slic_dashboard_rows(sheet_key, source_row);

create index if not exists idx_slic_dashboard_rows_status
on public.slic_dashboard_rows(sheet_key, status_value);

create index if not exists idx_slic_dashboard_rows_sync
on public.slic_dashboard_rows(sheet_key, sync_id);

create table if not exists public.slic_sheet_meta (
  sheet_key text primary key check (sheet_key in ('ETS', 'LTX')),
  sheet_name text not null,
  headers jsonb not null default '[]'::jsonb,
  last_sync_id text,
  row_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.slic_sync_log (
  id bigserial primary key,
  sync_id text,
  status text not null,
  message text,
  ets_count integer not null default 0,
  ltx_count integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Lock tables from public/anon access.
-- The Vercel backend uses SUPABASE_SERVICE_KEY, so it can still read/write.
alter table public.slic_dashboard_rows enable row level security;
alter table public.slic_sheet_meta enable row level security;
alter table public.slic_sync_log enable row level security;
-- Optional SQL upgrade for Admin Auto Sync Settings.
-- Run this once if you want to use the Local PC Auto Sync Agent settings page.

create table if not exists public.slic_sync_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default false,
  schedule_type text not null default 'daily' check (schedule_type in ('daily', 'interval')),
  daily_time text not null default '00:00',
  interval_minutes integer not null default 60,
  ltx_path text,
  ets_path text,
  updated_at timestamptz not null default now()
);

insert into public.slic_sync_settings (id, enabled, schedule_type, daily_time, interval_minutes, ltx_path, ets_path)
values (
  1,
  false,
  'daily',
  '00:00',
  60,
  'C:\Users\locampo3\OneDrive - Analog Devices, Inc\Ramilo, Kim Jonas''s files - SLIC_Sharepoint\LTX Sample weekly.xlsx',
  'C:\Users\locampo3\OneDrive - Analog Devices, Inc\Ramilo, Kim Jonas''s files - SLIC_Sharepoint\SLIC_Activity_Monitoring.xlsm'
)
on conflict (id) do nothing;

alter table public.slic_sync_settings enable row level security;
