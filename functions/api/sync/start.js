import { json, requireSession, isAdmin } from '../../_utils.js';
export async function onRequestPost(context) {
  const { session, error } = await requireSession(context.request, context.env);
  if (error) return error;
  if (!isAdmin(session)) return json({ ok: false, error: 'Admin Access required.' }, 403);
  return json({ ok: true, sync_id: crypto.randomUUID(), started_at: new Date().toISOString() });
}
