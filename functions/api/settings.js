import { json, requireSession, isAdmin, fetchSettings, sbRequest } from '../_utils.js';

export async function onRequestGet(context) {
  const { session, error } = await requireSession(context.request, context.env);
  if (error) return error;
  if (!isAdmin(session)) return json({ ok: false, error: 'Admin Access required.' }, 403);
  return json({ ok: true, settings: await fetchSettings(context.env) });
}

export async function onRequestPost(context) {
  try {
    const { session, error } = await requireSession(context.request, context.env);
    if (error) return error;
    if (!isAdmin(session)) return json({ ok: false, error: 'Admin Access required.' }, 403);
    const body = await context.request.json();
    const scope = body.scope === 'export' ? 'export' : 'auto';
    const payload = { updated_at: new Date().toISOString() };
    const boundedMinutes = (value, fallback) => {
      const n = Number.parseInt(value, 10);
      return Number.isFinite(n) ? Math.max(1, Math.min(10080, n)) : fallback;
    };
    if (scope === 'auto') {
      if (body.enabled) {
        const current = await fetchSettings(context.env);
        for (const key of ['ltx','ets']) {
          if (current[key+'_expected_name'] && current[key+'_source_status'] !== 'verified') {
            return json({ok:false,error:key.toUpperCase()+' uploaded workbook is not yet verified by the local agent. Do not enable Auto Sync with an old file.'},409);
          }
        }
      }
      payload.enabled = !!body.enabled;
      payload.schedule_type = body.schedule_type === 'interval' ? 'interval' : 'daily';
      payload.daily_time = String(body.daily_time || '00:00').slice(0, 5);
      payload.interval_minutes = boundedMinutes(body.interval_minutes, 60);
      // Source workbook paths are never altered by a website schedule save.
    } else {
      const directory = String(body.export_directory || '').trim();
      // The Windows agent validates the actual existence/accessibility of this path.
      if (!directory || directory.length > 1024 || /[\r\n\0]/.test(directory) ||
          !/^(?:[A-Za-z]:[\\/]|\\\\|\/\/)/.test(directory)) {
        return json({ ok: false, error: 'Enter a full Windows drive or network folder path, e.g. L:\\Exports.' }, 400);
      }
      payload.export_enabled = !!body.export_enabled;
      payload.export_schedule_type = body.export_schedule_type === 'interval' ? 'interval' : 'daily';
      payload.export_daily_time = String(body.export_daily_time || '00:00').slice(0, 5);
      payload.export_interval_minutes = boundedMinutes(body.export_interval_minutes, 1440);
      payload.export_mode = body.export_mode === 'copy' ? 'copy' : 'overwrite';
      payload.export_directory = directory;
    }
    await sbRequest(context.env, 'PATCH', 'slic_sync_settings?id=eq.1', payload, 'return=minimal');
    return json({ ok: true, settings: await fetchSettings(context.env) });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
