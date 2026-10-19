-- Run once in Supabase SQL Editor. Does not change dashboard data or summary formulas.
ALTER TABLE public.slic_sync_settings
  ADD COLUMN IF NOT EXISTS picker_request_id text,
  ADD COLUMN IF NOT EXISTS picker_kind text,
  ADD COLUMN IF NOT EXISTS picker_status text DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS picker_message text,
  ADD COLUMN IF NOT EXISTS picker_updated_at timestamptz;

UPDATE public.slic_sync_settings
SET picker_status = COALESCE(picker_status, 'idle')
WHERE id = 1;