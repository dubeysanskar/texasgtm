/**
 * Priority settings (super admin → Priority settings page). Stored as JSON in gtm_settings under
 * `priority_config`; anything missing falls back to DEFAULTS, so an empty table behaves exactly like
 * the built-in ranking.
 */
const { queryOne, query } = require('./db');

const ALL_STATUSES = ['not_contacted', 'touch_1', 'touch_2', 'touch_3', 'email_sent', 'call_made', 'replied', 'meeting_booked', 'proposal_sent', 'negotiating', 'contract_signed', 'not_interested', 'closed', 'follow_up_later'];
const ALL_PRIORITIES = ['HOT', 'HIGH', 'MEDIUM', 'PARTNER'];
const RULES = ['overdue', 'due_today', 'hot_deal', 'due_soon', 'rest', 'parked'];

const DEFAULTS = {
  // Ranking rules, most urgent first; a rule that is switched off simply drops its leads into "rest"
  rules: RULES.map(id => ({ id, enabled: true })),
  due_soon_days: 3,                                        // "follow-up soon" window
  hot_deal_priorities: ['HOT', 'HIGH'],
  hot_deal_statuses: ['replied', 'meeting_booked', 'proposal_sent', 'negotiating'],
  priority_order: ['HOT', 'HIGH', 'MEDIUM', 'PARTNER'],    // order inside "everything else"
  rest_sort: 'longest_silence',                            // longest_silence | newest | oldest
  never_contacted_first: true,
  parked_statuses: ['follow_up_later', 'contract_signed'], // sink to the bottom (until a follow-up is close)
  hidden_statuses: ['not_interested', 'closed'],           // leave the working list, search, Priority, Dashboard
  default_on: true,                                        // Priority toggle for people who never switched it
  show_rank: true,
  show_reason: true,
  dashboard_count: 8,
  dashboard_scope: 'own',                                  // own | all — what non-admins see on the Dashboard
};

const uniq = (a) => [...new Set(a)];
const pick = (arr, allowed) => Array.isArray(arr) ? uniq(arr.filter(x => allowed.includes(x))) : null;

/** Fills gaps with defaults and drops anything invalid. */
function normalize(raw) {
  const c = { ...DEFAULTS };
  const r = raw && typeof raw === 'object' ? raw : {};
  if (Array.isArray(r.rules)) {
    const seen = new Set(); const rules = [];
    for (const x of r.rules) if (x && RULES.includes(x.id) && !seen.has(x.id)) { seen.add(x.id); rules.push({ id: x.id, enabled: x.enabled !== false }); }
    for (const id of RULES) if (!seen.has(id)) rules.push({ id, enabled: true });
    c.rules = rules;
  }
  const n = Number(r.due_soon_days); if (Number.isFinite(n)) c.due_soon_days = Math.min(30, Math.max(1, Math.round(n)));
  c.hot_deal_priorities = pick(r.hot_deal_priorities, ALL_PRIORITIES) ?? c.hot_deal_priorities;
  c.hot_deal_statuses = pick(r.hot_deal_statuses, ALL_STATUSES) ?? c.hot_deal_statuses;
  const po = pick(r.priority_order, ALL_PRIORITIES); if (po) c.priority_order = [...po, ...ALL_PRIORITIES.filter(p => !po.includes(p))];
  if (['longest_silence', 'newest', 'oldest'].includes(r.rest_sort)) c.rest_sort = r.rest_sort;
  for (const k of ['never_contacted_first', 'default_on', 'show_rank', 'show_reason']) if (typeof r[k] === 'boolean') c[k] = r[k];
  c.parked_statuses = pick(r.parked_statuses, ALL_STATUSES) ?? c.parked_statuses;
  // never hide every status; at most the ones that are really "finished"
  const hs = pick(r.hidden_statuses, ALL_STATUSES); if (hs && hs.length < ALL_STATUSES.length - 1) c.hidden_statuses = hs;
  const dc = Number(r.dashboard_count); if (Number.isFinite(dc)) c.dashboard_count = Math.min(30, Math.max(3, Math.round(dc)));
  if (['own', 'all'].includes(r.dashboard_scope)) c.dashboard_scope = r.dashboard_scope;
  return c;
}

let cache = null, cacheAt = 0;
async function getPriorityConfig() {
  if (cache && Date.now() - cacheAt < 15000) return cache;
  let raw = null;
  try { const row = await queryOne("SELECT value FROM gtm_settings WHERE key = 'priority_config'"); raw = row?.value ? JSON.parse(row.value) : null; } catch { raw = null; }
  cache = normalize(raw); cacheAt = Date.now();
  return cache;
}
async function savePriorityConfig(raw) {
  const c = normalize(raw);
  await query("INSERT INTO gtm_settings (key, value) VALUES ('priority_config', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(c)]);
  cache = c; cacheAt = Date.now();
  return c;
}
/** SQL list of hidden statuses, e.g. "'not_interested','closed'" (values come from a fixed allow-list). */
const hiddenSql = (c) => (c.hidden_statuses.length ? c.hidden_statuses : ['__none__']).map(s => `'${s}'`).join(',');

module.exports = { DEFAULTS, RULES, ALL_STATUSES, ALL_PRIORITIES, normalize, getPriorityConfig, savePriorityConfig, hiddenSql };
