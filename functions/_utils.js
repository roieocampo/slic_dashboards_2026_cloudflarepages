const ROWS_TABLE = 'slic_dashboard_rows';
const META_TABLE = 'slic_sheet_meta';
const LOG_TABLE = 'slic_sync_log';
const SETTINGS_TABLE = 'slic_sync_settings';
const PAGE_SIZE = 1000;
const EXPORT_MAX_ROWS = 200000;

export function q(value) {
  return encodeURIComponent(String(value ?? ''));
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function redirect(location) {
  return new Response(null, { status: 302, headers: { location } });
}

export function getEnv(env, key, fallback = '') {
  return env[key] || fallback;
}

export function userConfig(env) {
  return {
    level1User: getEnv(env, 'LEVEL1_USERNAME', 'user'),
    level1Pass: getEnv(env, 'LEVEL1_PASSWORD', 'user'),
    level2User: getEnv(env, 'LEVEL2_USERNAME', 'cip'),
    level2Pass: getEnv(env, 'LEVEL2_PASSWORD', 'jjgcip'),
    level3User: getEnv(env, 'LEVEL3_USERNAME', 'admin'),
    level3Pass: getEnv(env, 'LEVEL3_PASSWORD', 'roieocamposlic'),
  };
}

export function roleLabel(role) {
  if (role === 'level3') return 'Admin Access';
  if (role === 'level2') return 'CIP level Access';
  return 'User Access';
}

function bytesToBase64Url(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  value = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (value.length % 4) value += '=';
  const bin = atob(value);
  return new Uint8Array([...bin].map((ch) => ch.charCodeAt(0)));
}

async function hmacSign(secret, payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(sig));
}

export async function makeSessionCookie(env, session) {
  const secret = getEnv(env, 'APP_SECRET_KEY', 'change-this-slic-dashboard-secret');
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    ...session,
    iat: Date.now(),
  })));
  const sig = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

export function parseCookies(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const out = {};
  cookieHeader.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

export async function getSession(request, env) {
  const raw = parseCookies(request).slic_cf_session;
  if (!raw || !raw.includes('.')) return null;
  const [payload, sig] = raw.split('.', 2);
  const secret = getEnv(env, 'APP_SECRET_KEY', 'change-this-slic-dashboard-secret');
  const expected = await hmacSign(secret, payload);
  if (expected !== sig) return null;
  try {
    const text = new TextDecoder().decode(base64UrlToBytes(payload));
    const data = JSON.parse(text);
    if (!data || !data.user || !data.role) return null;
    return data;
  } catch {
    return null;
  }
}

export async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session) return { error: json({ ok: false, error: 'Not logged in.' }, 401), session: null };
  return { session };
}

export function isCip(session) {
  return session && (session.role === 'level2' || session.role === 'level3');
}

export function isAdmin(session) {
  return session && session.role === 'level3';
}

export function ensureConfig(env) {
  const missing = [];
  if (!env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!env.SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY');
  if (!env.APP_SECRET_KEY) missing.push('APP_SECRET_KEY');
  if (missing.length) throw new Error('Missing Cloudflare Environment Variable(s): ' + missing.join(', '));
}

export async function sbRequest(env, method, endpoint, body = undefined, prefer = undefined) {
  ensureConfig(env);
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${String(endpoint).replace(/^\//, '')}`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'content-type': 'application/json',
  };
  if (prefer) headers.prefer = prefer;
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} failed ${res.status}: ${text.slice(0, 500)}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export async function sbUpsert(env, table, rows, conflictCols) {
  if (!rows || !rows.length) return null;
  return sbRequest(env, 'POST', `${table}?on_conflict=${q(conflictCols)}`, rows, 'resolution=merge-duplicates,return=minimal');
}

export async function fetchMeta(env, sheetKey) {
  const rows = await sbRequest(env, 'GET', `${META_TABLE}?sheet_key=eq.${q(sheetKey)}&select=*&limit=1`);
  return rows && rows[0] ? rows[0] : {};
}

export async function fetchLastSync(env) {
  const rows = await sbRequest(env, 'GET', `${LOG_TABLE}?select=*&order=id.desc&limit=1`);
  return rows && rows[0] ? rows[0] : {};
}

export function defaultSettings() {
  return {
    id: 1,
    enabled: false,
    schedule_type: 'daily',
    daily_time: '00:00',
    interval_minutes: 60,
    ltx_path: "C:\\Users\\locampo3\\OneDrive - Analog Devices, Inc\\Ramilo, Kim Jonas's files - SLIC_Sharepoint\\LTX Sample weekly.xlsx",
    ets_path: "C:\\Users\\locampo3\\OneDrive - Analog Devices, Inc\\Ramilo, Kim Jonas's files - SLIC_Sharepoint\\SLIC_Activity_Monitoring.xlsm",
  };
}

export async function fetchSettings(env) {
  try {
    const rows = await sbRequest(env, 'GET', `${SETTINGS_TABLE}?id=eq.1&select=*&limit=1`);
    return { ...defaultSettings(), ...((rows && rows[0]) || {}) };
  } catch {
    return defaultSettings();
  }
}

export async function saveSettings(env, payload) {
  return sbUpsert(env, SETTINGS_TABLE, [{ ...defaultSettings(), ...payload, id: 1, updated_at: new Date().toISOString() }], 'id');
}

export async function fetchRows(env, sheetKey, maxRows = EXPORT_MAX_ROWS) {
  const rows = [];
  let offset = 0;
  while (rows.length < maxRows) {
    const limit = Math.min(PAGE_SIZE, maxRows - rows.length);
    const endpoint = `${ROWS_TABLE}?select=${q('source_row,row_values,data,status_value,completed_flag,synced_at')}&sheet_key=eq.${q(sheetKey)}&order=source_row.asc&limit=${limit}&offset=${offset}`;
    const batch = await sbRequest(env, 'GET', endpoint);
    if (!batch || !batch.length) break;
    rows.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return rows;
}

export function normText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function headerIndex(headers, names) {
  const targets = names.map(normKey);
  const hs = (headers || []).map(normKey);
  for (const target of targets) {
    const idx = hs.findIndex((h) => h === target);
    if (idx >= 0) return idx;
  }
  for (const target of targets) {
    const idx = hs.findIndex((h) => target && (h.includes(target) || target.includes(h)));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function rowCell(row, idx) {
  const vals = row && row.row_values ? row.row_values : [];
  if (idx === undefined || idx === null || idx < 0 || idx >= vals.length) return '';
  return normText(vals[idx]);
}

export function searchNorm(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function searchVariants(value) {
  const base = searchNorm(value);
  const set = new Set(base ? [base] : []);
  if (base.startsWith('ltc')) set.add('lt' + base.slice(3));
  else if (base.startsWith('lt')) set.add('ltc' + base.slice(2));
  return [...set].filter(Boolean);
}

export function smartMatch(value, keyword) {
  keyword = normText(keyword);
  if (!keyword) return true;
  const text = String(value ?? '');
  if (text.toLowerCase().includes(keyword.toLowerCase())) return true;
  const hay = searchNorm(text);
  return searchVariants(keyword).some((v) => v && hay.includes(v));
}

const COMPLETED_FINAL_ALIASES = ['SUV+HW Checker', 'RB to SUV converted', 'Already SUV Enrolled', 'Already SUV+HW Checker', 'SLIC Converted', 'SUV Converted'];
function categoryMatch(value, category) {
  const v = normText(value).toLowerCase();
  const c = normText(category).toLowerCase();
  if (!v || !c) return false;
  if (v === c) return true;
  if (['done', 'failed', 'completed', 'ongoing', 'pending'].includes(c)) return v.startsWith(c);
  return v.includes(c);
}
function isCompletedFinalStatus(value) {
  return COMPLETED_FINAL_ALIASES.some((alias) => categoryMatch(value, alias));
}
function partKey(row, idx) {
  const v = rowCell(row, idx);
  return v ? v.toLowerCase() : `__row_${row.source_row || ''}`;
}
function countPartsByCategory(rows, partIdx, colIdx, categories, includeOthers = true) {
  const counts = {};
  for (const cat of categories) counts[cat] = new Set();
  const others = new Set();
  if (colIdx < 0) return Object.fromEntries(Object.keys(counts).map((k) => [k, 0]));
  for (const row of rows) {
    const value = rowCell(row, colIdx);
    if (!value) continue;
    let matched = false;
    for (const cat of categories) {
      if (categoryMatch(value, cat)) { counts[cat].add(partKey(row, partIdx)); matched = true; }
    }
    if (includeOthers && !matched) others.add(partKey(row, partIdx));
  }
  if (includeOthers && others.size) counts.Others = others;
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.size]));
}
function countPeUpdates(rows, partIdx, peIdx, finalIdx) {
  const cats = ['Completed', 'Failed', 'Ongoing', 'Insufficient Data', 'Pending'];
  const counts = Object.fromEntries(cats.map((c) => [c, new Set()]));
  const others = new Set();
  for (const row of rows) {
    const pk = partKey(row, partIdx);
    const pe = rowCell(row, peIdx);
    const fin = rowCell(row, finalIdx);
    let matched = false;
    if (isCompletedFinalStatus(fin) || categoryMatch(pe, 'Completed')) { counts.Completed.add(pk); matched = true; }
    for (const cat of ['Failed', 'Ongoing', 'Insufficient Data', 'Pending']) {
      if (categoryMatch(pe, cat)) { counts[cat].add(pk); matched = true; }
    }
    if (!matched && pe) others.add(pk);
  }
  if (others.size) counts.Others = others;
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.size]));
}
function valueCounts(rows, idx, partIdx = null) {
  const map = new Map();
  for (const row of rows) {
    const v = rowCell(row, idx);
    if (!v) continue;
    if (partIdx === null || partIdx === undefined || partIdx < 0) map.set(v, (map.get(v) || 0) + 1);
    else {
      if (!map.has(v)) map.set(v, new Set());
      map.get(v).add(partKey(row, partIdx));
    }
  }
  return Object.fromEntries([...map.entries()].map(([k, v]) => [k, v instanceof Set ? v.size : v]));
}

export function buildSummary(headers, rows) {
  const partIdx = headerIndex(headers, ['Partname', 'Partnames', 'Part Name', 'Device', 'Part Number']);
  const enrollIdx = headerIndex(headers, ['Enrollment Status', 'Enrolled in Cloud']);
  const remarksIdx = headerIndex(headers, ['Cloud Enrollment Remarks', 'Remarks']);
  const trsIdx = headerIndex(headers, ['TRS Updates', 'TRS Update']);
  const peIdx = headerIndex(headers, ['PE Updates', 'Status']);
  const finalIdx = headerIndex(headers, ['Final Remarks / Status', 'Final Status']);
  const weekIdx = headerIndex(headers, ['Week Completion', 'TRS Completion week', 'Completion week']);
  const partSet = new Set();
  for (const row of rows) {
    const v = rowCell(row, partIdx);
    if (v) partSet.add(v.toLowerCase());
  }
  return {
    indexes: { partIdx, enrollIdx, remarksIdx, trsIdx, peIdx, finalIdx, weekIdx },
    partnames_count: partSet.size,
    pe_counts: countPeUpdates(rows, partIdx, peIdx, finalIdx),
    enrollment_counts: countPartsByCategory(rows, partIdx, enrollIdx, ['Done', 'Ongoing', 'Failed', 'RB to SUV converted', 'SUV+HW checker'], true),
    remarks_counts: countPartsByCategory(rows, partIdx, remarksIdx, ['Already approved in Local', 'For approval in Local', 'RB to SUV converted'], true),
    trs_counts: countPartsByCategory(rows, partIdx, trsIdx, ['Done', 'For TRS', 'No SUV yet', 'For Approval'], true),
    final_counts: countPartsByCategory(rows, partIdx, finalIdx, ['SLIC Converted', 'SUV Converted', 'SUV+HW Checker', 'Ongoing', 'For Approval', 'No SUV', 'Insufficient Data', 'FAILED', 'Onqueue'], true),
    week_counts: valueCounts(rows, weekIdx, partIdx),
  };
}

export function displayHeader(sourceCol, rawHeader) {
  const forced = {
    1: 'Partname',
    13: 'Enrollment Status',
    14: 'Cloud Enrollment Remarks',
    15: 'TRS Updates',
    16: 'PE Updates',
    18: 'Final Remarks / Status',
    19: 'Week Completion',
  };
  return forced[sourceCol] || normText(rawHeader) || `Column ${String.fromCharCode(64 + sourceCol)}`;
}

export function uniqueHeaders(rawHeaders, maxCols = 10) {
  const headers = [];
  const seen = {};
  for (let i = 0; i < Math.min(rawHeaders.length, maxCols); i++) {
    let base = normText(rawHeaders[i]) || `Column ${String.fromCharCode(65 + i)}`;
    if (seen[base]) { seen[base] += 1; base = `${base} (${seen[base]})`; }
    else seen[base] = 1;
    headers.push(base);
  }
  while (headers.length < maxCols) headers.push(`Column ${String.fromCharCode(65 + headers.length)}`);
  return headers;
}

export async function sha256Hex(value) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildRowsFromClient(sheetKey, syncId, sheetName, headers, clientRows) {
  const peIdx = headerIndex(headers, ['PE Updates', 'Status']);
  const finalIdx = headerIndex(headers, ['Final Remarks / Status', 'Final Status']);
  const stamp = new Date().toISOString();
  const out = [];
  for (const item of clientRows || []) {
    const sourceRow = Number(item.source_row || 0);
    if (!sourceRow) continue;
    const values = (item.row_values || []).slice(0, 10);
    while (values.length < 10) values.push('');
    if (values.every((v) => !normText(v))) continue;
    const data = {};
    for (let i = 0; i < 10; i++) data[headers[i] || `Column ${String.fromCharCode(65 + i)}`] = values[i] ?? '';
    const pe = values[peIdx] || '';
    const fin = values[finalIdx] || '';
    out.push({
      sheet_key: sheetKey,
      sheet_name: sheetName,
      source_row: sourceRow,
      row_values: values,
      data,
      row_hash: await sha256Hex(JSON.stringify(values)),
      status_value: String(pe || '').trim(),
      completed_flag: categoryMatch(pe, 'Completed') || isCompletedFinalStatus(fin),
      sync_id: syncId,
      synced_at: stamp,
    });
  }
  return out;
}

export { ROWS_TABLE, META_TABLE, LOG_TABLE, SETTINGS_TABLE };
