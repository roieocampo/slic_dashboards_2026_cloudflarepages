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
