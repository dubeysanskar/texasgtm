/**
 * Priority ranking for the working lead list (Lead Management "Priority" view and the Dashboard).
 * Every lead gets a rank (#1 = act on it first) and a reason. The rules and their order come from the
 * super admin's Priority settings (lib/priority-config.js); out of the box they are, most urgent first:
 *   overdue follow-up → follow-up today → hot deal in progress → follow-up in the next N days →
 *   everything else (by priority, longest without contact first) → parked (follow up later / signed)
 * A lead falls under the first switched-on rule it matches; "everything else" catches the rest.
 * Hidden (closed) statuses never reach this function — the API filters them out.
 */
const { DEFAULTS } = require('./priority-config');
const DAY = 86400000;

const ms = (v) => { if (!v) return null; const n = new Date(v).getTime(); return Number.isNaN(n) ? null : n; };
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

function scoreLead(l, now, c) {
  const prIdx = c.priority_order.indexOf(l.priority); const pr = prIdx < 0 ? 9 : prIdx;
  const due = ms(l.next_followup_at);
  const lastTouch = ms(l.last_contacted_at);
  const created = ms(l.created_at) ?? now;
  const today0 = startOfDay(now), tomorrow0 = today0 + DAY, soonEnd = today0 + (c.due_soon_days + 1) * DAY;
  // "close" = due today or within the coming-up window (past days are the Overdue group's business;
  // with Overdue switched off they simply rank like any other lead)
  const dueClose = due !== null && due >= today0 && due < soonEnd;
  const match = {
    overdue: () => due !== null && due < now
      && { keyA: due, keyB: pr, reason: { code: 'overdue', days: Math.max(0, Math.round((today0 - startOfDay(due)) / DAY)), at: l.next_followup_at } },
    due_today: () => due !== null && due >= today0 && due < tomorrow0
      && { keyA: due, keyB: pr, reason: { code: due < now ? 'overdue' : 'due_today', days: 0, at: l.next_followup_at } },
    due_soon: () => dueClose
      && { keyA: due, keyB: pr, reason: due < tomorrow0 ? { code: due < now ? 'overdue' : 'due_today', days: 0, at: l.next_followup_at } : { code: 'due_soon', days: Math.round((startOfDay(due) - today0) / DAY), at: l.next_followup_at } },
    hot_deal: () => c.hot_deal_statuses.includes(l.status) && c.hot_deal_priorities.includes(l.priority) && !(c.parked_statuses.includes(l.status) && !dueClose)
      && { keyA: pr, keyB: lastTouch ?? 0, reason: { code: 'hot_deal', status: l.status } },
    parked: () => c.parked_statuses.includes(l.status) && !dueClose
      && { keyA: due ?? Number.MAX_SAFE_INTEGER, keyB: pr, reason: l.status === 'contract_signed' ? { code: 'signed' } : { code: 'parked', status: l.status, at: l.next_followup_at || null } },
    rest: () => {
      const never = lastTouch === null;
      const order = c.rest_sort === 'newest' ? -created : c.rest_sort === 'oldest' ? created : (never ? created - 1e13 : lastTouch);
      return { keyA: pr * 2 + (c.never_contacted_first && never ? 0 : 1), keyB: order,
        reason: never ? { code: 'never_contacted', days: Math.max(0, Math.floor((now - created) / DAY)) } : { code: 'stale', days: Math.max(0, Math.floor((now - lastTouch) / DAY)) } };
    },
  };
  // A lead joins the first switched-on group (top to bottom) that fits it; "Everything else" is the
  // catch-all for leads no other group takes. Each group ranks by its position in the list.
  const rules = c.rules.filter(r => r.enabled || r.id === 'rest');
  for (let i = 0; i < rules.length; i++) {
    if (rules[i].id === 'rest') continue;
    const hit = match[rules[i].id]();
    if (hit) return { tier: i, rule: rules[i].id, ...hit };
  }
  const restAt = rules.findIndex(r => r.id === 'rest');
  return { tier: restAt < 0 ? rules.length : restAt, rule: 'rest', ...match.rest() };
}

/** Sorts leads by priority and adds `priority_rank` (1-based), `priority_rule` and `priority_reason` to each. */
function rankLeads(leads, now = Date.now(), config = DEFAULTS) {
  return leads
    .map(l => ({ l, s: scoreLead(l, now, config) }))
    .sort((a, b) => a.s.tier - b.s.tier || a.s.keyA - b.s.keyA || a.s.keyB - b.s.keyB || a.l.id - b.l.id)
    .map(({ l, s }, i) => ({ ...l, priority_rank: i + 1, priority_tier: s.tier, priority_rule: s.rule, priority_reason: s.reason }));
}

module.exports = { rankLeads, scoreLead };
