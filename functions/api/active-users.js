import { json, requireSession, isAdmin, sbRequest, q } from '../_utils.js';

const ACTIVE_TABLE = 'slic_active_users';
const ACTIVE_WINDOW_SECONDS = 90;
const CLEANUP_WINDOW_MINUTES = 30;

export async function onRequestGet(context) {
  try {
    const { session, error } = await requireSession(context.request, context.env);
    if (error) return error;
    if (!isAdmin(session)) return json({ ok: false, error: 'Admin access required.' }, 403);

    const activeCutoff = new Date(Date.now() - ACTIVE_WINDOW_SECONDS * 1000).toISOString();
    const cleanupCutoff = new Date(Date.now() - CLEANUP_WINDOW_MINUTES * 60 * 1000).toISOString();

    // Best effort cleanup only. If cleanup fails, monitoring should still work.
    try {
      await sbRequest(context.env, 'DELETE', `${ACTIVE_TABLE}?last_seen_at=lt.${q(cleanupCutoff)}`, undefined, 'return=minimal');
    } catch {}

    const users = await sbRequest(
      context.env,
      'GET',
      `${ACTIVE_TABLE}?select=${q('client_id,user_name,role,label,sheet,path,last_seen_at')}&last_seen_at=gte.${q(activeCutoff)}&order=last_seen_at.desc&limit=200`
    ) || [];

    const counts = { level1: 0, level2: 0, level3: 0 };
    for (const u of users) {
      if (u.role === 'level3') counts.level3 += 1;
      else if (u.role === 'level2') counts.level2 += 1;
      else counts.level1 += 1;
    }

    return json({ ok: true, total: users.length, counts, users, active_window_seconds: ACTIVE_WINDOW_SECONDS });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
