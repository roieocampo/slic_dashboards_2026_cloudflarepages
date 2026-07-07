import { json, requireSession, isAdmin, fetchSettings, saveSettings } from '../_utils.js';

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
    const payload = {
      enabled: !!body.enabled,
      schedule_type: body.schedule_type === 'interval' ? 'interval' : 'daily',
      daily_time: String(body.daily_time || '00:00').slice(0, 5),
      interval_minutes: Math.max(1, Math.min(10080, parseInt(body.interval_minutes || 60, 10))),
      ltx_path: String(body.ltx_path || ''),
      ets_path: String(body.ets_path || ''),
    };
    await saveSettings(context.env, payload);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
