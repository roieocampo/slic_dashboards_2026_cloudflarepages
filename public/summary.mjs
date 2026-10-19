// Browser-side identical copy of the accepted row-reconciliation algorithm.
// Used for CIP/Admin only; User Access never receives row details.
export function normText(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')     // zero-width/invisible characters
    .replace(/\u00A0/g, ' ')                       // non-breaking spaces
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

function rowCountKey(row) {
  // Use the Excel/source row as the primary counting key. This prevents two
  // different Excel rows from being accidentally merged just because their
  // partnames become equal after removing spaces/punctuation/invisible chars.
  return `__source_row_${row?.source_row ?? ''}`;
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
  const validRowSet = new Set();
  const uniquePartSet = new Set();
  const peSets = makeSets(peCats), enrollSets = makeSets(enrollCats), remarksSets = makeSets(remarksCats), trsSets = makeSets(trsCats), finalSets = makeSets(finalCats);
  const peOthers = new Map(), enrollOthers = new Map(), remarksOthers = new Map(), trsOthers = new Map(), finalOthers = new Map(), weekMap = new Map();

  for (const row of rows) {
    const partValue = rowCell(row, partIdx);
    if (!partValue) continue; // Ignore only true blank Excel data rows without Partname.

    const rk = rowCountKey(row);
    validRowSet.add(rk);
    uniquePartSet.add(searchNorm(partValue));

    const pe = rowCell(row, peIdx);
    const fin = rowCell(row, finalIdx);
    const enroll = rowCell(row, enrollIdx);
    const rem = rowCell(row, remarksIdx);
    const trs = rowCell(row, trsIdx);
    const week = rowCell(row, weekIdx);

    // One Excel/source row must be counted only once per summary box.
    // This prevents totals from becoming higher/lower than Partnames Counts.
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
    // Count source Excel rows with a valid nonblank Partname. This is the
    // dashboard reconciliation total. unique_partnames_count is still returned
    // for debugging/future display, but the visible Partnames Counts uses this.
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

