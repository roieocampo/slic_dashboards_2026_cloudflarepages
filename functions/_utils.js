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
    // Exact source paths are intentionally NOT hard-coded. They are selected
    // on the source PC with local_sync_agent.py --configure.
    ltx_path: '',
    ets_path: '',
    export_enabled: false,
    export_schedule_type: 'daily',
    export_daily_time: '00:00',
    export_interval_minutes: 1440,
    export_directory: "L:\\ENGINEER\\LOcampo\\SLIC_DailyUpdates_Monitoring",
    export_mode: 'overwrite',
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
  const current = await fetchSettings(env);
  return sbUpsert(env, SETTINGS_TABLE, [{ ...defaultSettings(), ...current, ...payload, id: 1, updated_at: new Date().toISOString() }], 'id');
}

export async function fetchRows(env, sheetKey, maxRows = EXPORT_MAX_ROWS) {
  const rows = [];
  let offset = 0;
  while (rows.length < maxRows) {
    const limit = Math.min(PAGE_SIZE, maxRows - rows.length);
    const endpoint = `${ROWS_TABLE}?select=${q('source_row,row_values')}&sheet_key=eq.${q(sheetKey)}&order=source_row.asc&limit=${limit}&offset=${offset}`;
    const batch = await sbRequest(env, 'GET', endpoint);
    if (!batch || !batch.length) break;
    rows.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return rows;
}

export function normText(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  const v = searchNorm(value);
  if (!keyword) return true;
  return searchVariants(keyword).some((k) => v.includes(k));
}

export function uniqueHeaders(headers, maxCols = 10) {
  const out = [];
  const seen = {};
  for (let i = 0; i < maxCols; i++) {
    let base = normText(headers && headers[i]) || `Column ${String.fromCharCode(65 + i)}`;
    if (seen[base]) {
      seen[base] += 1;
      base = `${base} (${seen[base]})`;
    } else {
      seen[base] = 1;
    }
    out.push(base);
  }
  return out;
}

function compactStatus(value) {
  return normText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function partKeyFromValue(value, row) {
  const p = searchNorm(normText(value));
  if (p) return p;
  return `__row_${row?.source_row ?? ''}`;
}

function rowCountKey(row) {
  return `__source_row_${row?.source_row ?? ''}`;
}

function addDynamicOtherByPart(dynamicOthers, rawValue, pk) {
  const display = normText(rawValue);
  if (!display) return;
  let entry = dynamicOthers.get(compactStatus(display));
  if (!entry) {
    entry = { label: display, parts: new Set() };
    dynamicOthers.set(compactStatus(display), entry);
  }
  entry.parts.add(pk);
}

function fastCategoryMatchCompact(v, category) {
  if (!v) return false;
  const c = compactStatus(category);
  if (v === c) return true;

  if (c === 'completed') {
    return v === 'complete' || v === 'completed' || v === 'done' || v === 'closed' || v === 'finished' ||
      v.includes('complete') || v.includes('slicconverted') || v.includes('suvconverted') ||
      v.includes('suvhwchecker') || v.includes('rbtosuvconverted') ||
      v.includes('alreadysuvenrolled') || v.includes('alreadysuvhwchecker');
  }
  if (c === 'failed') return v === 'failed' || v === 'fail' || v.includes('failed') || v.includes('failure');
  if (c === 'ongoing') return v === 'ongoing' || v === 'inprogress' || v.includes('ongoing') || v.includes('inprogress');
  if (c === 'insufficientdata') return v.includes('insufficientdata') || v === 'insufficient';
  if (c === 'pending') return v.includes('pending');
  if (c === 'slicconverted') return v.includes('slicconverted');
  if (c === 'suvconverted') return v.includes('suvconverted') && !v.includes('rbtosuvconverted');
  if (c === 'suvhwchecker') return v.includes('suvhwchecker');
  if (c === 'rbtosuvconverted') return v.includes('rbtosuvconverted');
  if (c === 'alreadyapprovedinlocal') return v.includes('alreadyapprovedinlocal');
  if (c === 'forapprovalinlocal') return v.includes('forapprovalinlocal');
  if (c === 'done') return v === 'done' || v === 'completed' || v === 'complete';
  if (c === 'fortrs') return v.includes('fortrs');
  if (c === 'nosuvyet') return v.includes('nosuvyet');
  if (c === 'forapproval') return v.includes('forapproval');
  if (c === 'nosuv') return v === 'nosuv' || v.includes('nosuv');
  if (c === 'onqueue') return v === 'onqueue' || v.includes('onqueue');
  return v === c;
}

function matchedCategory(compactValue, categories) {
  for (const cat of categories) {
    if (fastCategoryMatchCompact(compactValue, cat)) return cat;
  }
  return null;
}

function addSingleCategory(countSets, dynamicOthers, rawValue, categories, pk, options = {}) {
  const raw = normText(rawValue);
  const compact = compactStatus(raw);
  const cat = compact ? matchedCategory(compact, categories) : null;
  if (cat) {
    countSets[cat].add(pk);
    return cat;
  }
  if (raw) {
    addDynamicOtherByPart(dynamicOthers, raw, pk);
    return raw;
  }
  if (options.countBlank) {
    const blankLabel = options.blankLabel || 'Blank / No Status';
    addDynamicOtherByPart(dynamicOthers, blankLabel, pk);
    return blankLabel;
  }
  return null;
}

function valueCounts(rows, idx, partIdx = null) {
  const map = new Map();
  for (const row of rows) {
    const v = rowCell(row, idx);
    if (!v) continue;
    const pk = partIdx == null ? String(row.source_row ?? '') : partKeyFromValue(rowCell(row, partIdx), row);
    const key = compactStatus(v);
    let e = map.get(key);
    if (!e) { e = { label: normText(v), parts: new Set() }; map.set(key, e); }
    e.parts.add(pk);
  }
  return Object.fromEntries([...map.values()].map((e) => [e.label, e.parts.size]));
}

function setsToCounts(sets, dynamicOthers) {
  const out = {};
  for (const [k, v] of Object.entries(sets)) out[k] = v.size;
  for (const e of dynamicOthers.values()) out[e.label] = e.parts.size;
  return out;
}

export function buildSummary(rows, headers) {
  const partIdx = headerIndex(headers, ['Partname', 'Part Name', 'Part Names', 'Device', 'Device Name']);
  const enrollIdx = headerIndex(headers, ['Enrollment Status', 'Enrolled in Cloud']);
  const remarksIdx = headerIndex(headers, ['Cloud Enrollment Remarks', 'Remarks']);
  const trsIdx = headerIndex(headers, ['TRS Updates', 'TRS Update']);
  const peIdx = headerIndex(headers, ['PE Updates', 'Status']);
  const finalIdx = headerIndex(headers, ['Final Remarks / Status', 'Final Remarks', 'Final Status']);
  const weekIdx = headerIndex(headers, ['Week Completion', 'TRS Completion week', 'Completion Week']);

  const peCats = ['Completed', 'Failed', 'Ongoing', 'Insufficient Data', 'Pending'];
  const enrollCats = ['Done', 'Ongoing', 'Failed', 'RB to SUV converted', 'SUV+HW checker'];
  const remarksCats = ['Already approved in Local', 'For approval in Local', 'RB to SUV converted'];
  const trsCats = ['Done', 'For TRS', 'No SUV yet', 'For Approval'];
  const finalCats = ['SLIC Converted', 'SUV Converted', 'SUV+HW Checker', 'Ongoing', 'For Approval', 'No SUV', 'Insufficient Data', 'FAILED', 'Onqueue'];

  const makeSets = (cats) => Object.fromEntries(cats.map((c) => [c, new Set()]));
  const validRowSet = new Set();
  const uniquePartSet = new Set();
  const peSets = makeSets(peCats), enrollSets = makeSets(enrollCats), remarksSets = makeSets(remarksCats), trsSets = makeSets(trsCats), finalSets = makeSets(finalCats);
  const peOthers = new Map(), enrollOthers = new Map(), remarksOthers = new Map(), trsOthers = new Map(), finalOthers = new Map(), weekMap = new Map();

  for (const row of rows) {
    const partValue = rowCell(row, partIdx);
    if (!partValue) continue;

    const rk = rowCountKey(row);
    validRowSet.add(rk);
    uniquePartSet.add(searchNorm(partValue));

    const pe = rowCell(row, peIdx);
    const fin = rowCell(row, finalIdx);
    const enroll = rowCell(row, enrollIdx);
    const rem = rowCell(row, remarksIdx);
    const trs = rowCell(row, trsIdx);
    const week = rowCell(row, weekIdx);

    addSingleCategory(peSets, peOthers, pe, peCats, rk, { countBlank: true, blankLabel: 'Blank PE Updates' });
    addSingleCategory(enrollSets, enrollOthers, enroll, enrollCats, rk, { countBlank: true, blankLabel: 'Blank Enrollment Status' });
    addSingleCategory(remarksSets, remarksOthers, rem, remarksCats, rk, { countBlank: true, blankLabel: 'Blank Cloud Enrollment Remarks' });
    addSingleCategory(trsSets, trsOthers, trs, trsCats, rk, { countBlank: true, blankLabel: 'Blank TRS Updates' });
    addSingleCategory(finalSets, finalOthers, fin, finalCats, rk, { countBlank: true, blankLabel: 'Blank Final Remarks / Status' });

    if (week) {
      const w = normText(week);
      if (!weekMap.has(w)) weekMap.set(w, new Set());
      weekMap.get(w).add(rk);
    }
  }

  const peCounts = setsToCounts(peSets, peOthers);
  const enrollmentCounts = setsToCounts(enrollSets, enrollOthers);
  const remarksCounts = setsToCounts(remarksSets, remarksOthers);
  const trsCounts = setsToCounts(trsSets, trsOthers);
  const finalCounts = setsToCounts(finalSets, finalOthers);

  return {
    indexes: { partIdx, enrollIdx, remarksIdx, trsIdx, peIdx, finalIdx, weekIdx },
    partnames_count: validRowSet.size,
    unique_partnames_count: uniquePartSet.size,
    pe_counts: peCounts,
    enrollment_counts: enrollmentCounts,
    remarks_counts: remarksCounts,
    trs_counts: trsCounts,
    final_counts: finalCounts,
    week_counts: Object.fromEntries([...weekMap.entries()].map(([k, v]) => [k, v.size])),
    reconciliation: {
      valid_rows: validRowSet.size,
      unique_partnames: uniquePartSet.size,
      pe_total: Object.values(peCounts).reduce((a, b) => a + Number(b || 0), 0),
      enrollment_total: Object.values(enrollmentCounts).reduce((a, b) => a + Number(b || 0), 0),
      remarks_total: Object.values(remarksCounts).reduce((a, b) => a + Number(b || 0), 0),
      trs_total: Object.values(trsCounts).reduce((a, b) => a + Number(b || 0), 0),
      final_total: Object.values(finalCounts).reduce((a, b) => a + Number(b || 0), 0),
    },
  };
}

export { ROWS_TABLE, META_TABLE, LOG_TABLE, SETTINGS_TABLE, PAGE_SIZE, EXPORT_MAX_ROWS };