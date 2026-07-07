import { json, requireSession, isAdmin, uniqueHeaders, sbUpsert, sbRequest, q, META_TABLE, ROWS_TABLE, LOG_TABLE } from '../../_utils.js';

export async function onRequestPost(context) {
  try {
    const { session, error } = await requireSession(context.request, context.env);
    if (error) return error;
    if (!isAdmin(session)) return json({ ok: false, error: 'Admin Access required.' }, 403);
    const body = await context.request.json();
    const syncId = String(body.sync_id || '');
    if (!syncId) return json({ ok: false, error: 'Missing sync_id.' }, 400);
    const sheets = Array.isArray(body.sheets) ? body.sheets : [];
    const startedAt = body.started_at || new Date().toISOString();
    const counts = { LTX: 0, ETS: 0 };
    for (const sheet of sheets) {
      const sheetKey = String(sheet.sheet_key || '').toUpperCase();
      if (!['LTX', 'ETS'].includes(sheetKey)) continue;
      const rowCount = Number(sheet.row_count || 0);
      counts[sheetKey] = rowCount;
      await sbRequest(context.env, 'DELETE', `${ROWS_TABLE}?sheet_key=eq.${q(sheetKey)}&sync_id=neq.${q(syncId)}`, undefined, 'return=minimal');
      await sbUpsert(context.env, META_TABLE, [{
        sheet_key: sheetKey,
        sheet_name: String(sheet.sheet_name || ''),
        headers: uniqueHeaders((sheet.headers || []).slice(0, 10), 10),
        last_sync_id: syncId,
        row_count: rowCount,
        updated_at: new Date().toISOString(),
      }], 'sheet_key');
    }
    await sbRequest(context.env, 'POST', LOG_TABLE, [{
      sync_id: syncId,
      status: 'success',
      message: 'Sync completed from Cloudflare browser upload',
      ltx_count: counts.LTX || 0,
      ets_count: counts.ETS || 0,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    }], 'return=minimal');
    return json({ ok: true, counts, sync_id: syncId });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
