import { json, requireSession, fetchLastSync } from '../_utils.js';

export async function onRequestGet(context) {
  try {
    const { error } = await requireSession(context.request, context.env);
    if (error) return error;
    const lastSync = await fetchLastSync(context.env);
    return json({ ok: true, last_sync: lastSync || {} });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
