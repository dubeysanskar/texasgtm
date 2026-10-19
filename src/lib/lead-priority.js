/**
 * Priority ranking for the working lead list (Lead Management "Priority" view and the Dashboard).
 *
 * Every open lead gets a rank (#1 = act on it first) and a reason saying why it is there.
 * Order, most urgent first:
 *   1. Follow-up overdue            — the oldest-overdue first
 *   2. Follow-up due today          — earliest time first
 *   3. Hot deal in progress          — HOT/HIGH lead at replied / meeting / proposal / negotiating
 *   4. Follow-up due in the next 3 days
 *   5. Everything else, by priority (HOT → HIGH → MEDIUM → PARTNER); inside a priority the lead
 *      that has gone longest without any contact comes first (never-contacted before contacted)
 *   6. Parked: "Follow Up Later" with its follow-up more than 3 days away, and signed contracts
 *      — they sink to the bottom until their date comes close
 * Closed leads (Not Interested / Closed) never reach this function; the API filters them out.
 */
const DAY = 86400000;
const PRIORITY_RANK = { HOT: 0, HIGH: 1, MEDIUM: 2, PARTNER: 3 };
const HOT_STAGES = new Set(['replied', 'meeting_booked', 'proposal_sent', 'negotiating']);

const ms = (v) => { if (!v) return null; const n = new Date(v).getTime(); return Number.isNaN(n) ? null : n; };
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Scores one lead. Returns { tier, keyA, keyB, reason: { code, days?, at? } }. Lower sorts first. */
function scoreLead(l, now = Date.now()) {
  const pr = PRIORITY_RANK[l.priority] ?? 4;
  const due = ms(l.next_followup_at);
  const lastTouch = ms(l.last_contacted_at);
  const today0 = startOfDay(now), tomorrow0 = today0 + DAY;
  if (due !== null && due < now) {
    return { tier: 1, keyA: due, keyB: pr, reason: { code: 'overdue', days: Math.max(0, Math.round((today0 - startOfDay(due)) / DAY)), at: l.next_followup_at } };
  }
  if (due !== null && due < tomorrow0) return { tier: 2, keyA: due, keyB: pr, reason: { code: 'due_today', at: l.next_followup_at } };
  const soon = due !== null && due < today0 + 4 * DAY;
  const parked = (l.status === 'follow_up_later' && !soon) || l.status === 'contract_signed';
  if (!parked && HOT_STAGES.has(l.status) && pr <= 1) {
    return { tier: 3, keyA: pr, keyB: lastTouch ?? 0, reason: { code: 'hot_deal', status: l.status } };
  }
  if (soon) return { tier: 4, keyA: due, keyB: pr, reason: { code: 'due_soon', days: Math.round((startOfDay(due) - today0) / DAY), at: l.next_followup_at } };
  if (parked) {
    return { tier: 6, keyA: due ?? Number.MAX_SAFE_INTEGER, keyB: pr, reason: l.status === 'contract_signed' ? { code: 'signed' } : { code: 'parked', at: l.next_followup_at || null } };
  }
  // Not contacted yet → ranks above contacted ones of the same priority; then longest silence first
  const created = ms(l.created_at) ?? now;
  if (lastTouch === null) return { tier: 5, keyA: pr, keyB: -1e15 + created, reason: { code: 'never_contacted', days: Math.max(0, Math.floor((now - created) / DAY)) } };
  return { tier: 5, keyA: pr, keyB: lastTouch, reason: { code: 'stale', days: Math.max(0, Math.floor((now - lastTouch) / DAY)) } };
}

/** Sorts leads by priority and adds `priority_rank` (1-based) and `priority_reason` to each. */
function rankLeads(leads, now = Date.now()) {
  return leads
    .map(l => ({ l, s: scoreLead(l, now) }))
    .sort((a, b) => a.s.tier - b.s.tier || a.s.keyA - b.s.keyA || a.s.keyB - b.s.keyB || a.l.id - b.l.id)
    .map(({ l, s }, i) => ({ ...l, priority_rank: i + 1, priority_tier: s.tier, priority_reason: s.reason }));
}

module.exports = { rankLeads, scoreLead };
