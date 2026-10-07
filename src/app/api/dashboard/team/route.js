import { NextResponse } from 'next/server';
const { queryOne, queryAll } = require('@/lib/db');
const { getUserFromRequest, isAdmin } = require('@/lib/auth');

// GET /api/dashboard/team?project_id= — super admin only: a per-person overview of what the team has
// been doing — to-dos, follow-ups, today's daily update, last activity — the stuff that otherwise only
// shows up if you go dig through each person's own pages individually.
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const pid = sp.get('project_id') ? Number(sp.get('project_id')) : null;
  const today = new Date().toISOString().slice(0, 10);

  const members = await queryAll("SELECT id, name, role, job_title, is_active FROM gtm_users WHERE is_active != 0 ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'marketing' THEN 2 ELSE 3 END, name");

  const rows = [];
  for (const m of members) {
    const todosOpen = await queryOne("SELECT COUNT(*) c FROM gtm_todos WHERE user_id = $1 AND status = 'open'", [m.id]);
    const todosDoneToday = await queryOne("SELECT COUNT(*) c FROM gtm_todos WHERE user_id = $1 AND status = 'done' AND done_at >= $2", [m.id, today]);
    const fuParams = pid ? [m.id, pid] : [m.id];
    const fuProjectFilter = pid ? ' AND project_id = $2' : '';
    const followupsOpen = await queryOne(`SELECT COUNT(*) c FROM gtm_followups WHERE assigned_to = $1 AND status = 'open'${fuProjectFilter}`, fuParams);
    const followupsOverdue = await queryOne(`SELECT COUNT(*) c FROM gtm_followups WHERE assigned_to = $1 AND status = 'open' AND due_at < NOW()${fuProjectFilter}`, fuParams);
    const duParams = pid ? [m.id, today, pid] : [m.id, today];
    const duProjectFilter = pid ? ' AND project_id = $3' : '';
    const dailyUpdate = await queryOne(`SELECT id, text FROM gtm_daily_updates WHERE user_id = $1 AND work_date = $2${duProjectFilter} ORDER BY created_at DESC LIMIT 1`, duParams);
    const lastActivity = await queryOne('SELECT action, created_at FROM gtm_activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [m.id]);

    rows.push({
      id: m.id, name: m.name, role: m.role, job_title: m.job_title,
      todos_open: parseInt(todosOpen?.c || 0), todos_done_today: parseInt(todosDoneToday?.c || 0),
      followups_open: parseInt(followupsOpen?.c || 0), followups_overdue: parseInt(followupsOverdue?.c || 0),
      daily_update_today: dailyUpdate ? { id: dailyUpdate.id, snippet: String(dailyUpdate.text || '').slice(0, 140) } : null,
      last_action: lastActivity?.action || null, last_active_at: lastActivity?.created_at || null,
    });
  }

  return NextResponse.json({ team: rows, today });
}
