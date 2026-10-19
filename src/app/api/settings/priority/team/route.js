import { NextResponse } from 'next/server';
const { getUserFromRequest, isAdmin } = require('@/lib/auth');
const { getPriorityConfig } = require('@/lib/priority-config');
const { teamSummary, rankWorkingLeads } = require('@/lib/priority-team');

// GET /api/settings/priority/team?project_id=            → per-person summary of the priority groups (super admin)
// GET /api/settings/priority/team?project_id=&owner=ID    → that person's ranked list (owner=none: leads without an owner)
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const projectId = sp.get('project_id');
  const config = await getPriorityConfig(projectId);
  const owner = sp.get('owner');
  if (owner) {
    const { ranked } = await rankWorkingLeads({ config, projectId, ownerId: owner === 'none' ? 'none' : Number(owner) });
    return NextResponse.json({
      total: ranked.length,
      leads: ranked.slice(0, 50).map(l => ({ id: l.id, project_seq: l.project_seq, company_name: l.company_name, priority: l.priority, status: l.status, priority_rank: l.priority_rank, priority_rule: l.priority_rule, priority_reason: l.priority_reason, last_comment: l.last_comment || l.notes || '' })),
    });
  }
  return NextResponse.json({ team: await teamSummary({ config, projectId }) });
}
