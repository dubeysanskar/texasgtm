/**
 * Shared helpers for the Priority settings page: rank a project's working leads with given settings,
 * and summarise the result per team member (lead owner = whoever added the lead).
 */
const { queryAll } = require('./db');
const { hiddenSql } = require('./priority-config');
const { rankLeads } = require('./lead-priority');
const DAY = 86400000;

async function rankWorkingLeads({ config, projectId, ownerId }) {
  const params = []; let where = `deleted_at IS NULL AND achieved_at IS NULL AND status NOT IN (${hiddenSql(config)})`;
  if (projectId) { params.push(Number(projectId)); where += ` AND project_id = $${params.length}`; }
  if (ownerId === 'none') where += ' AND (created_by IS NULL OR created_by NOT IN (SELECT id FROM gtm_users WHERE is_active != 0))';
  else if (ownerId) { params.push(Number(ownerId)); where += ` AND created_by = $${params.length}`; }
  const rows = await queryAll(`SELECT gtm_leads.*, (SELECT MIN(f.due_at) FROM gtm_followups f WHERE f.lead_id = gtm_leads.id AND f.status = 'open') AS next_followup_at FROM gtm_leads WHERE ${where}`, params);
  const ranked = rankLeads(rows, Date.now(), config);
  const hp = []; let hw = `deleted_at IS NULL AND achieved_at IS NULL AND status IN (${hiddenSql(config)})`;
  if (projectId) { hp.push(Number(projectId)); hw += ` AND project_id = $${hp.length}`; }
  const hiddenRows = await queryAll(`SELECT status, COUNT(*) as c FROM gtm_leads WHERE ${hw} GROUP BY status`, hp);
  return { ranked, hidden: Object.fromEntries(hiddenRows.map(h => [h.status, parseInt(h.c)])) };
}

/** One row per active team member (+ "no owner"): how their open leads split over the priority groups. */
async function teamSummary({ config, projectId }) {
  const { ranked } = await rankWorkingLeads({ config, projectId });
  const users = await queryAll("SELECT id, name, role, job_title FROM gtm_users WHERE is_active != 0 ORDER BY name");
  const ids = new Set(users.map(u => u.id));
  const blank = () => ({ open: 0, overdue: 0, due_today: 0, hot_deal: 0, due_soon: 0, rest: 0, parked: 0, never_contacted: 0, longest_wait_days: 0, top: null });
  const rows = new Map(users.map(u => [u.id, { id: u.id, name: u.name, role: u.role, job_title: u.job_title, ...blank() }]));
  const none = { id: 'none', name: null, role: null, ...blank() };
  const now = Date.now();
  for (const l of ranked) {
    const r = ids.has(l.created_by) ? rows.get(l.created_by) : none;
    r.open++; r[l.priority_rule] = (r[l.priority_rule] || 0) + 1;
    const last = l.last_contacted_at ? new Date(l.last_contacted_at).getTime() : null;
    if (last === null) r.never_contacted++;
    const since = last ?? (l.created_at ? new Date(l.created_at).getTime() : now);
    r.longest_wait_days = Math.max(r.longest_wait_days, Math.floor((now - since) / DAY));
    if (!r.top) r.top = { id: l.id, project_seq: l.project_seq, company_name: l.company_name, priority_reason: l.priority_reason };
  }
  const list = [...rows.values()].sort((a, b) => (b.overdue - a.overdue) || (b.open - a.open) || String(a.name).localeCompare(String(b.name)));
  if (none.open) list.push(none);
  return list;
}

module.exports = { rankWorkingLeads, teamSummary };
