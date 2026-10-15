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
    const exportMode = body.export_mode === 'copy' ? 'copy' : 'overwrite';

    // Schedule-only PATCH. Do NOT include ltx_path, ets_path or export_directory.
    // Those three local Windows paths are owned by local_sync_agent.py --configure.
    // PATCHing only these fields guarantees a web save can never restore an old
    // hard-coded path or overwrite the source selected on the PC.
    const payload = {
      enabled: !!body.enabled,
      schedule_type: body.schedule_type === 'interval' ? 'interval' : 'daily',
      daily_time: String(body.daily_time || '00:00').slice(0, 5),
      interval_minutes: Math.max(1, Math.min(10080, parseInt(body.interval_minutes || 60, 10))),
      export_enabled: !!body.export_enabled,
      export_schedule_type: body.export_schedule_type === 'interval' ? 'interval' : 'daily',
      export_daily_time: String(body.export_daily_time || '00:00').slice(0, 5),
      export_interval_minutes: Math.max(1, Math.min(10080, parseInt(body.export_interval_minutes || 1440, 10))),
      export_mode: exportMode,
      updated_at: new Date().toISOString(),
    };

    await sbRequest(context.env, 'PATCH', 'slic_sync_settings?id=eq.1', payload, 'return=minimal');
    return json({ ok: true, settings: await fetchSettings(context.env) });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
