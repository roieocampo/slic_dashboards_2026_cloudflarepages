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
    // Dashboard/export only needs source_row and row_values. Keeping the payload small
    // prevents Cloudflare Pages Functions from hitting ExceededCpu on large sheets.
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

const CANONICAL_ALIASES = {
  'Completed': [
    'Completed', 'Complete', 'Done', 'Pass', 'Passed',
    'RB to SUV converted', 'RB to SUV convert', 'RB SUV converted', 'RB-SUV converted',
    'SUV+HW Checker', 'SUV HW Checker', 'SUV and HW Checker', 'SUV & HW Checker',
    'Already SUV Enrolled', 'Already SUV+HW Checker', 'Already SUV HW Checker',
    'SLIC Converted', 'SUV Converted'
  ],
  'Failed': ['Failed', 'Fail', 'FAILED'],
  'Ongoing': ['Ongoing', 'On going', 'On-going', 'In Progress', 'In-progress'],
  'Insufficient Data': ['Insufficient Data', 'Insufficient', 'Not enough data'],
  'Pending': ['Pending', 'Pend'],
  'Done': ['Done', 'Completed', 'Complete'],
  'RB to SUV converted': ['RB to SUV converted', 'RB to SUV convert', 'RB SUV converted', 'RB-SUV converted', 'RB to SUV Conversion'],
  'SUV+HW checker': ['SUV+HW checker', 'SUV+HW Checker', 'SUV HW Checker', 'SUV and HW Checker', 'SUV & HW Checker'],
  'Already approved in Local': ['Already approved in Local', 'Already approve in Local', 'Approved in Local', 'Already Local Approved'],
  'For approval in Local': ['For approval in Local', 'For approve in Local', 'For Local Approval', 'Local for Approval'],
  'For TRS': ['For TRS', 'For TRS Update', 'Need TRS', 'TRS Needed'],
  'No SUV yet': ['No SUV yet', 'No SUV', 'No SUV available'],
  'For Approval': ['For Approval', 'For approval', 'Pending Approval'],
  'SLIC Converted': ['SLIC Converted', 'SLIC convert', 'SLIC conversion'],
  'SUV Converted': ['SUV Converted', 'SUV convert', 'SUV conversion'],
  'SUV+HW Checker': ['SUV+HW Checker', 'SUV HW Checker', 'SUV and HW Checker', 'SUV & HW Checker'],
  'No SUV': ['No SUV', 'No SUV yet', 'No SUV available'],
  'Onqueue': ['Onqueue', 'On queue', 'On-queue', 'On Queue']
};

function compactStatus(value) {
  return searchNorm(value);
}

function statusLooksLike(value, alias) {
  const v = compactStatus(value);
  const a = compactStatus(alias);
  if (!v || !a) return false;
  if (v === a) return true;
  if (v.includes(a) || a.includes(v)) return true;

  // Pattern-based correction for common punctuation/spacing/wording differences.
  if (a.includes('rbtosuv') && v.includes('rb') && v.includes('suv') && (v.includes('convert') || v.includes('conversion'))) return true;
  if (a.includes('suvhwchecker') && v.includes('suv') && v.includes('hw') && v.includes('checker')) return true;
  if (a.includes('slicconverted') && v.includes('slic') && (v.includes('convert') || v.includes('conversion'))) return true;
  if (a.includes('suvconverted') && !v.includes('rbtosuv') && v.includes('suv') && (v.includes('convert') || v.includes('conversion'))) return true;
  if (a.includes('alreadyapprovedinlocal') && v.includes('already') && v.includes('approved') && v.includes('local')) return true;
  if (a.includes('forapprovalinlocal') && v.includes('approval') && v.includes('local') && (v.includes('for') || v.includes('pending'))) return true;
  if (a.includes('insufficientdata') && v.includes('insufficient') && v.includes('data')) return true;
  if (a.includes('nosuvyet') && v.includes('no') && v.includes('suv')) return true;
  if (a.includes('fortrs') && v.includes('trs') && (v.includes('for') || v.includes('need'))) return true;
  if (a === 'ongoing' && (v.includes('ongoing') || v.includes('ongoing') || v.includes('inprogress'))) return true;
  if (a === 'pending' && v.includes('pending')) return true;
  if (a === 'failed' && v.includes('fail')) return true;
  if (a === 'completed' && (v.includes('completed') || v.includes('complete') || v.includes('done') || v.includes('passed'))) return true;
  return false;
}

function aliasesForCategory(category) {
  const aliases = new Set([category]);
  const list = CANONICAL_ALIASES[category] || [];
  for (const a of list) aliases.add(a);
  return [...aliases];
}

function categoryMatch(value, category) {
  value = normText(value);
  category = normText(category);
  if (!value || !category) return false;
  return aliasesForCategory(category).some((alias) => statusLooksLike(value, alias));
}

function canonicalKnownLabel(value, categories = []) {
  const ordered = [...categories, 'Completed', 'Failed', 'Ongoing', 'Insufficient Data', 'Pending', 'Done', 'RB to SUV converted', 'SUV+HW checker', 'Already approved in Local', 'For approval in Local', 'For TRS', 'No SUV yet', 'For Approval', 'SLIC Converted', 'SUV Converted', 'SUV+HW Checker', 'No SUV', 'Onqueue'];
  const seen = new Set();
  for (const cat of ordered) {
    if (!cat || seen.has(cat)) continue;
    seen.add(cat);
    if (categoryMatch(value, cat)) return cat;
  }
  return normText(value);
}

function isCompletedFinalStatus(value) {
  return categoryMatch(value, 'Completed');
}

function partKeyFromValue(partValue, row) {
  const v = normText(partValue);
  return v ? searchNorm(v) : `__row_${row.source_row || ''}`;
}

function partKey(row, idx) {
  return partKeyFromValue(rowCell(row, idx), row);
}

function addDynamicOtherByPart(dynamicOthers, rawValue, pk) {
  const display = normText(rawValue);
  if (!display) return;
  const key = compactStatus(display) || display.toLowerCase();
  if (!dynamicOthers.has(key)) dynamicOthers.set(key, { label: display, parts: new Set() });
  dynamicOthers.get(key).parts.add(pk);
}

function setsToCounts(countSets, dynamicOthers = null) {
  const out = {};
  for (const [label, set] of Object.entries(countSets)) out[label] = set.size;
  if (dynamicOthers) {
    for (const { label, parts } of [...dynamicOthers.values()].sort((a, b) => a.label.localeCompare(b.label))) {
      if (!out[label]) out[label] = parts.size;
      else out[label] += parts.size;
    }
  }
  return out;
}

const CATEGORY_ALIAS_COMPACTS = (() => {
  const out = {};
  const labels = new Set(Object.keys(CANONICAL_ALIASES));
  for (const [cat, aliases] of Object.entries(CANONICAL_ALIASES)) {
    labels.add(cat);
    for (const a of aliases || []) labels.add(a);
  }
  for (const label of labels) {
    const aliases = new Set([compactStatus(label)]);
    for (const a of CANONICAL_ALIASES[label] || []) aliases.add(compactStatus(a));
    out[label] = [...aliases].filter(Boolean);
  }
  return out;
})();

function statusLooksLikeCompact(v, aliasCompact) {
  const a = aliasCompact;
  if (!v || !a) return false;
  if (v === a) return true;
  if (v.includes(a) || a.includes(v)) return true;

  // Fast pattern-based correction for common punctuation/spacing/wording differences.
  if (a.includes('rbtosuv') && v.includes('rb') && v.includes('suv') && (v.includes('convert') || v.includes('conversion'))) return true;
  if (a.includes('suvhwchecker') && v.includes('suv') && v.includes('hw') && v.includes('checker')) return true;
  if (a.includes('slicconverted') && v.includes('slic') && (v.includes('convert') || v.includes('conversion'))) return true;
  if (a.includes('suvconverted') && !v.includes('rbtosuv') && v.includes('suv') && (v.includes('convert') || v.includes('conversion'))) return true;
  if (a.includes('alreadysuvenrolled') && v.includes('already') && v.includes('suv') && v.includes('enroll')) return true;
  if (a.includes('alreadysuvhwchecker') && v.includes('already') && v.includes('suv') && v.includes('hw') && v.includes('checker')) return true;
  if (a.includes('alreadyapprovedinlocal') && v.includes('already') && v.includes('approved') && v.includes('local')) return true;
  if (a.includes('forapprovalinlocal') && v.includes('approval') && v.includes('local') && (v.includes('for') || v.includes('pending'))) return true;
  if (a.includes('insufficientdata') && v.includes('insufficient') && v.includes('data')) return true;
  if ((a.includes('nosuvyet') || a === 'nosuv') && v.includes('no') && v.includes('suv')) return true;
  if (a.includes('fortrs') && v.includes('trs') && (v.includes('for') || v.includes('need'))) return true;
  if (a === 'ongoing' && (v.includes('ongoing') || v.includes('inprogress'))) return true;
  if (a === 'pending' && v.includes('pending')) return true;
  if (a === 'failed' && v.includes('fail')) return true;
  if (a === 'completed' && (v.includes('completed') || v.includes('complete') || v.includes('done') || v.includes('passed'))) return true;
  if (a === 'done' && (v.includes('done') || v.includes('complete'))) return true;
  if (a === 'forapproval' && v.includes('approval') && (v.includes('for') || v.includes('pending'))) return true;
  if (a === 'onqueue' && (v.includes('onqueue') || (v.includes('on') && v.includes('queue')))) return true;
  return false;
}

function fastCategoryMatchCompact(compactValue, category) {
  const aliases = CATEGORY_ALIAS_COMPACTS[category] || [compactStatus(category)];
  for (const a of aliases) if (statusLooksLikeCompact(compactValue, a)) return true;
  return false;
}

function addMatchedCategory(countSets, compactValue, categories, pk) {
  let matched = false;
  for (const cat of categories) {
    if (fastCategoryMatchCompact(compactValue, cat)) {
      countSets[cat].add(pk);
      matched = true;
    }
  }
  return matched;
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

  const peCats = ['Completed', 'Failed', 'Ongoing', 'Insufficient Data', 'Pending'];
  const enrollCats = ['Done', 'Ongoing', 'Failed', 'RB to SUV converted', 'SUV+HW checker'];
  const remarksCats = ['Already approved in Local', 'For approval in Local', 'RB to SUV converted'];
  const trsCats = ['Done', 'For TRS', 'No SUV yet', 'For Approval'];
  const finalCats = ['SLIC Converted', 'SUV Converted', 'SUV+HW Checker', 'Ongoing', 'For Approval', 'No SUV', 'Insufficient Data', 'FAILED', 'Onqueue'];

  const makeSets = (cats) => Object.fromEntries(cats.map((c) => [c, new Set()]));
  const partSet = new Set();
  const peSets = makeSets(peCats), enrollSets = makeSets(enrollCats), remarksSets = makeSets(remarksCats), trsSets = makeSets(trsCats), finalSets = makeSets(finalCats);
  const peOthers = new Map(), enrollOthers = new Map(), remarksOthers = new Map(), trsOthers = new Map(), finalOthers = new Map(), weekMap = new Map();

  for (const row of rows) {
    const partValue = rowCell(row, partIdx);
    const pk = partKeyFromValue(partValue, row);
    if (partValue) partSet.add(searchNorm(partValue));

    const pe = rowCell(row, peIdx);
    const fin = rowCell(row, finalIdx);
    const enroll = rowCell(row, enrollIdx);
    const rem = rowCell(row, remarksIdx);
    const trs = rowCell(row, trsIdx);
    const week = rowCell(row, weekIdx);
    const peC = compactStatus(pe), finC = compactStatus(fin), enrollC = compactStatus(enroll), remC = compactStatus(rem), trsC = compactStatus(trs);

    // PE Updates: Completed can come from PE Updates or Final Remarks / Status.
    let peMatched = false;
    if (fastCategoryMatchCompact(peC, 'Completed') || fastCategoryMatchCompact(finC, 'Completed')) { peSets.Completed.add(pk); peMatched = true; }
    for (const cat of ['Failed', 'Ongoing', 'Insufficient Data', 'Pending']) {
      if (fastCategoryMatchCompact(peC, cat)) { peSets[cat].add(pk); peMatched = true; }
    }
    if (!peMatched && pe) addDynamicOtherByPart(peOthers, pe, pk);

    if (enroll) {
      const matched = addMatchedCategory(enrollSets, enrollC, enrollCats, pk);
      if (!matched) addDynamicOtherByPart(enrollOthers, enroll, pk);
    }
    if (rem) {
      const matched = addMatchedCategory(remarksSets, remC, remarksCats, pk);
      if (!matched) addDynamicOtherByPart(remarksOthers, rem, pk);
    }
    if (trs) {
      const matched = addMatchedCategory(trsSets, trsC, trsCats, pk);
      if (!matched) addDynamicOtherByPart(trsOthers, trs, pk);
    }
    if (fin) {
      const matched = addMatchedCategory(finalSets, finC, finalCats, pk);
      if (!matched) addDynamicOtherByPart(finalOthers, fin, pk);
    }
    if (week) {
      if (!weekMap.has(week)) weekMap.set(week, new Set());
      weekMap.get(week).add(pk);
    }
  }

  return {
    indexes: { partIdx, enrollIdx, remarksIdx, trsIdx, peIdx, finalIdx, weekIdx },
    partnames_count: partSet.size,
    pe_counts: setsToCounts(peSets, peOthers),
    enrollment_counts: setsToCounts(enrollSets, enrollOthers),
    remarks_counts: setsToCounts(remarksSets, remarksOthers),
    trs_counts: setsToCounts(trsSets, trsOthers),
    final_counts: setsToCounts(finalSets, finalOthers),
    week_counts: Object.fromEntries([...weekMap.entries()].map(([k, v]) => [k, v.size])),
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
