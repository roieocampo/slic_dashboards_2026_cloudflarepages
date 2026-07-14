-- SLIC DashBoards Active Website Users
-- Run once in Supabase SQL Editor.

create table if not exists public.slic_active_users (
  client_id text primary key,
  user_name text,
  role text,
  label text,
  sheet text,
  path text,
  user_agent text,
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_slic_active_users_last_seen
on public.slic_active_users(last_seen_at desc);

create index if not exists idx_slic_active_users_role
on public.slic_active_users(role);
