import { json, requireSession, isAdmin, uniqueHeaders, buildRowsFromClient, sbUpsert, ROWS_TABLE } from '../../_utils.js';

export async function onRequestPost(context) {
  try {
    const { session, error } = await requireSession(context.request, context.env);
    if (error) return error;
    if (!isAdmin(session)) return json({ ok: false, error: 'Admin Access required.' }, 403);
    const body = await context.request.json();
    const sheetKey = String(body.sheet_key || '').toUpperCase();
    if (!['LTX', 'ETS'].includes(sheetKey)) return json({ ok: false, error: 'Invalid sheet key.' }, 400);
    const syncId = String(body.sync_id || '');
    if (!syncId) return json({ ok: false, error: 'Missing sync_id.' }, 400);
    const headers = uniqueHeaders((body.headers || []).slice(0, 10), 10);
    const rows = await buildRowsFromClient(sheetKey, syncId, String(body.sheet_name || ''), headers, body.rows || []);
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      await sbUpsert(context.env, ROWS_TABLE, rows.slice(i, i + chunkSize), 'sheet_key,source_row');
    }
    return json({ ok: true, count: rows.length });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
