import { json, requireSession, roleLabel, sbRequest, q } from '../_utils.js';

const ACTIVE_TABLE = 'slic_active_users';

function safeClientId(value) {
  return String(value || '').trim().slice(0, 160) || `client-${Date.now()}`;
}

export async function onRequestPost(context) {
  try {
    const { session, error } = await requireSession(context.request, context.env);
    if (error) return error;

    let payload = {};
    try { payload = await context.request.json(); } catch {}

    const now = new Date().toISOString();
    const row = {
      client_id: safeClientId(payload.client_id),
      user_name: session.user || '',
      role: session.role || '',
      label: roleLabel(session.role),
      sheet: String(payload.sheet || '').slice(0, 16),
      path: String(payload.path || '').slice(0, 180),
      user_agent: String(context.request.headers.get('user-agent') || '').slice(0, 300),
      last_seen_at: now,
      updated_at: now,
    };

    await sbRequest(
      context.env,
      'POST',
      `${ACTIVE_TABLE}?on_conflict=${q('client_id')}`,
      [row],
      'resolution=merge-duplicates,return=minimal'
    );
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
