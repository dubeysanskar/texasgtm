import { NextResponse } from 'next/server';
const { queryAll, query } = require('@/lib/db');
const { getUserFromRequest, isManager, isAdmin } = require('@/lib/auth');
const { getPriorityConfig, getPriorityConfigInfo, savePriorityConfig, clearProjectConfig, normalize, DEFAULTS, RULES } = require('@/lib/priority-config');
const { rankWorkingLeads } = require('@/lib/priority-team');

// GET  /api/settings/priority?project_id=   → settings in force for that project (or the CRM-wide default)
//        { config, custom (project has its own), defaults (CRM-wide), factory (built-in) } — anyone who works with leads
// PUT  { project_id?, config }               → save (super admin). Without project_id: the CRM-wide default
// PUT  { project_id, use_default: true }     → that project goes back to the CRM-wide default
// PUT  { reset: true }                       → CRM-wide default back to the built-in settings
// POST { config, project_id }                → preview with unsaved settings: counts + examples per group + top 15
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const pid = new URL(request.url).searchParams.get('project_id');
  const info = await getPriorityConfigInfo(pid);
  return NextResponse.json({ ...info, factory: DEFAULTS });
}

export async function PUT(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const pid = b.project_id ? Number(b.project_id) : null;
  let action;
  if (pid && b.use_default) { await clearProjectConfig(pid); action = `Project #${pid} now uses the default Priority settings`; }
  else if (b.reset && !pid) { await savePriorityConfig(DEFAULTS, null); action = 'Reset the default Priority settings'; }
  else { await savePriorityConfig(b.config, pid); action = pid ? `Updated Priority settings for project #${pid}` : 'Updated the default Priority settings'; }
  await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, project_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [user.id, user.name, user.role, action, 'settings', 'settings', pid]);
  return NextResponse.json({ ...(await getPriorityConfigInfo(pid)), factory: DEFAULTS });
}

export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  const config = b.config ? normalize(b.config) : await getPriorityConfig(b.project_id);
  const { ranked, hidden } = await rankWorkingLeads({ config, projectId: b.project_id });
  const byRule = Object.fromEntries(RULES.map(r => [r, 0]));
  const examples = Object.fromEntries(RULES.map(r => [r, []]));
  for (const l of ranked) {
    byRule[l.priority_rule] = (byRule[l.priority_rule] || 0) + 1;
    if (examples[l.priority_rule].length < 2) examples[l.priority_rule].push({ id: l.id, project_seq: l.project_seq, company_name: l.company_name });
  }
  const slim = (l) => ({ id: l.id, project_seq: l.project_seq, company_name: l.company_name, priority: l.priority, status: l.status, priority_rank: l.priority_rank, priority_rule: l.priority_rule, priority_reason: l.priority_reason });
  return NextResponse.json({ total: ranked.length, byRule, examples, hidden, top: ranked.slice(0, 15).map(slim) });
}
