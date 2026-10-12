/**
 * Lead search — shared by the Leads search box and Bulk Lookup (GET /api/leads).
 *
 * Every text field on a lead is searchable (company, contact name, email, both phones, Telegram, Max,
 * city, domain, requirement, source, comment, …). Phone numbers also match on digits alone, so
 * "8 916 000-00-00", "+79160000000" and "9160000000" all find the same lead.
 *
 * Both functions append SQL to the caller's WHERE clause and push their values onto `params`
 * ($n placeholders), so they work unchanged on PostgreSQL and SQLite.
 */

const TEXT_FIELDS = [
  'company_name', 'domain', 'city', 'region', 'country', 'email', 'phone', 'mobile_personal',
  'telegram', 'max_messenger', 'decision_maker_title', 'contact_person', 'pain_point',
  'find_instructions', 'notes', 'source_url', 'sector', 'company_size',
];
const PHONE_FIELDS = ['phone', 'mobile_personal', 'telegram', 'max_messenger'];

// Strip the usual phone punctuation inside SQL so stored "+7 (916) 000-00-00" compares as digits
const digitsSql = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${col},''),' ',''),'-',''),'(',''),')',''),'+',''),'.','')`;

function onlyDigits(s) { return String(s || '').replace(/\D/g, ''); }

// One term matches if it appears in any text field (case-insensitive, Cyrillic-aware)
function anyFieldMatches(params, term) {
  params.push(`%${term}%`);
  const p = `$${params.length}`;
  return '(' + TEXT_FIELDS.map(f => `${f} ILIKE ${p}`).join(' OR ') + `) OR CAST(project_seq AS TEXT) = ${pushRaw(params, term)}`;
}
function pushRaw(params, v) { params.push(v); return `$${params.length}`; }

// Digits match: the last 10 digits ignore the 8 / +7 / 7 country-prefix difference
function phoneMatches(params, digits) {
  const tail = digits.length > 10 ? digits.slice(-10) : digits;
  const p = pushRaw(params, `%${tail}%`);
  return '(' + PHONE_FIELDS.map(f => `${digitsSql(f)} LIKE ${p}`).join(' OR ') + ')';
}

/**
 * Search box: every word must appear somewhere on the lead (so "Петров Москва" narrows to Petrov in
 * Moscow), OR the query's digits match a phone number.
 */
function searchClause(query, params) {
  const q = String(query || '').trim();
  if (!q) return '';
  const words = q.split(/\s+/).filter(Boolean).slice(0, 8);
  const allWords = words.map(w => `(${anyFieldMatches(params, w)})`).join(' AND ');
  const digits = onlyDigits(q);
  const phone = digits.length >= 5 ? ` OR ${phoneMatches(params, digits)}` : '';
  return ` AND ((${allWords})${phone})`;
}

/**
 * Bulk Lookup: a pasted list — one value per line or comma/semicolon-separated. A lead is returned if
 * it matches ANY value. Short numbers are lead IDs (#), anything else is searched across every field,
 * and phone-like values also match by digits.
 */
function parseLookup(text) {
  const chunks = String(text || '').split(/[\n,;\t]+/).map(s => s.trim()).filter(Boolean);
  const terms = [];
  for (const c of chunks) {
    // "12 15 18" pasted on one line = several IDs — unless it reads like a phone written with spaces
    // ("8 495 777 88 99": 10–12 digits, starts with 7/8/9, at most 5 groups)
    const groups = c.split(/\s+/);
    const digitCount = c.replace(/\D/g, '').length;
    const looksLikePhone = digitCount >= 10 && digitCount <= 12 && /^[789]/.test(c) && groups.length <= 5;
    if (/^\d{1,6}(\s+\d{1,6})+$/.test(c) && !looksLikePhone) terms.push(...groups);
    else terms.push(c);
  }
  return [...new Set(terms)].slice(0, 300);
}

function lookupClause(text, params) {
  const terms = parseLookup(text);
  if (!terms.length) return '';
  const parts = terms.map(term => {
    if (/^#?\d{1,6}$/.test(term)) return `CAST(project_seq AS TEXT) = ${pushRaw(params, term.replace('#', ''))}`;
    const digits = onlyDigits(term);
    const isPhoneLike = digits.length >= 7 && digits.length >= term.replace(/\s/g, '').length - 4;
    const text = `(${anyFieldMatches(params, term)})`;
    return isPhoneLike ? `(${text} OR ${phoneMatches(params, digits)})` : text;
  });
  return ` AND (${parts.join(' OR ')})`;
}

module.exports = { searchClause, lookupClause, parseLookup, TEXT_FIELDS };
