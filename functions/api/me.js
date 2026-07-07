import { json, getSession, roleLabel } from '../_utils.js';
export async function onRequestGet(context) {
  const session = await getSession(context.request, context.env);
  if (!session) return json({ ok: true, logged_in: false });
  return json({ ok: true, logged_in: true, user: session.user, role: session.role, label: roleLabel(session.role) });
}
