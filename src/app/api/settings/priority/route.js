import { NextResponse } from 'next/server';
const { queryAll, query } = require('@/lib/db');
const { getUserFromRequest, isManager, isAdmin } = require('@/lib/auth');
const { getPriorityConfig, savePriorityConfig, normalize, DEFAULTS, hiddenSql } = require('@/lib/priority-config');
const { rankLeads } = require('@/lib/lead-priority');

// GET  /api/settings/priority            → current Priority settings (+ defaults); anyone who works with leads
// PUT  /api/settings/priority { config } → save (super admin); { reset: true } restores the defaults
// POST /api/settings/priority { config, project_id } → preview: the top leads ranked with these (unsaved) settings
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ config: await getPriorityConfig(), defaults: DEFAULTS });
}

export async function PUT(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const config = await savePriorityConfig(b.reset ? DEFAULTS : b.config);
  await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type) VALUES ($1,$2,$3,$4,$5,$6)',
    [user.id, user.name, user.role, b.reset ? 'Reset Priority settings to defaults' : 'Updated Priority settings', 'settings', 'settings']);
  return NextResponse.json({ config });
}

export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const config = normalize(b.config);
  const params = []; let where = `deleted_at IS NULL AND achieved_at IS NULL AND status NOT IN (${hiddenSql(config)})`;
  if (b.project_id) { params.push(Number(b.project_id)); where += ` AND project_id = $${params.length}`; }
  const rows = await queryAll(`SELECT gtm_leads.*, (SELECT MIN(f.due_at) FROM gtm_followups f WHERE f.lead_id = gtm_leads.id AND f.status = 'open') AS next_followup_at FROM gtm_leads WHERE ${where}`, params);
  const ranked = rankLeads(rows, Date.now(), config);
  const byRule = {}; for (const l of ranked) byRule[l.priority_rule] = (byRule[l.priority_rule] || 0) + 1;
  const hidden = await queryAll(`SELECT status, COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL AND achieved_at IS NULL AND status IN (${hiddenSql(config)})${b.project_id ? ' AND project_id = ' + Number(b.project_id) : ''} GROUP BY status`);
  return NextResponse.json({
    total: ranked.length, byRule,
    hidden: Object.fromEntries(hidden.map(h => [h.status, parseInt(h.c)])),
    top: ranked.slice(0, 15).map(l => ({ id: l.id, project_seq: l.project_seq, company_name: l.company_name, priority: l.priority, status: l.status, priority_rank: l.priority_rank, priority_rule: l.priority_rule, priority_reason: l.priority_reason })),
  });
}
