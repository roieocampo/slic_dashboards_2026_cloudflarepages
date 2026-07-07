import { json, requireSession, isCip, fetchMeta, fetchLastSync, fetchRows, buildSummary, roleLabel } from '../_utils.js';

export async function onRequestGet(context) {
  try {
    const { session, error } = await requireSession(context.request, context.env);
    if (error) return error;
    const url = new URL(context.request.url);
    const sheet = (url.searchParams.get('sheet') || 'LTX').toUpperCase() === 'ETS' ? 'ETS' : 'LTX';
    const meta = await fetchMeta(context.env, sheet);
    const lastSync = await fetchLastSync(context.env);
    const headers = Array.isArray(meta.headers) ? meta.headers : [];
    const rowCount = Number(meta.row_count || 0);
    const rows = rowCount ? await fetchRows(context.env, sheet, Math.max(rowCount, 1)) : [];
    const summary = buildSummary(headers, rows);
    return json({
      ok: true,
      sheet,
      user: { name: session.user, role: session.role, label: roleLabel(session.role) },
      meta,
      last_sync: lastSync,
      summary,
      rows: isCip(session) ? rows : [],
      can_view_rows: isCip(session),
      can_admin: session.role === 'level3',
    });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
