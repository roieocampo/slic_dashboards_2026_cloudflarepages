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

    // Keep the exact uploaded source identity. An HTML file input hides its
    // real Windows path, so the local agent must verify SHA-256 before binding.
    const refs = body.source_refs && typeof body.source_refs === 'object' ? body.source_refs : {};
    const previousRows = await sbRequest(context.env, 'GET',
      'slic_sync_settings?id=eq.1&select=enabled,auto_resume_on_bind&limit=1');
    const previous = (previousRows && previousRows[0]) || {};
    const patch = {
      enabled: false,
      auto_resume_on_bind: !!previous.enabled || !!previous.auto_resume_on_bind,
      updated_at: new Date().toISOString(),
    };
    for (const sh of sheets) {
      const key=String(sh.sheet_key||'').toUpperCase();
      if (!['LTX','ETS'].includes(key))continue;
      const file=refs[key]||{};
      const name=String(file.name||'').split(/[\\/]/).pop().slice(0,255);
      const sha=String(file.sha256||'').toLowerCase();
      if (!name || !/^[a-f0-9]{64}$/.test(sha))continue;
      const prefix=key.toLowerCase();
      patch[prefix+'_expected_name']=name;
      patch[prefix+'_expected_sha256']=sha;
      patch[prefix+'_source_status']='pending';
      patch[prefix+'_source_message']='Local agent verification pending for '+name;
    }
    await sbRequest(context.env,'PATCH','slic_sync_settings?id=eq.1',patch,'return=minimal');
    return json({ ok: true, counts, sync_id: syncId, auto_sync_paused: true, source_binding_pending: true });
  } catch (err) {
    return json({ ok: false, error: err.message || String(err) }, 500);
  }
}
