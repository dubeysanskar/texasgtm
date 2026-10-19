import { NextResponse } from 'next/server';
const { queryOne, queryAll } = require('@/lib/db');
const { getUserFromRequest, isAdmin } = require('@/lib/auth');
const { getPriorityConfig, hiddenSql } = require('@/lib/priority-config');

export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const pid = searchParams.get('project_id');
  const pf = pid ? ' AND project_id = ' + parseInt(pid) : '';

  const totalTasks = await queryOne('SELECT COUNT(*) as c FROM gtm_tasks');
  const completedTasks = await queryOne("SELECT COUNT(*) as c FROM gtm_tasks WHERE status = 'complete'");
  const pendingTasks = await queryOne("SELECT COUNT(*) as c FROM gtm_tasks WHERE status = 'pending'");
  // Lead counts are for the working list: Not Interested / Closed and Achieved have their own cards
  const working = `deleted_at IS NULL AND achieved_at IS NULL AND status NOT IN (${hiddenSql(await getPriorityConfig(pid))})${pf}`;
  const totalLeads = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE ${working}`);
  const hotLeads = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE ${working} AND priority = 'HOT'`);
  const notInterested = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL AND achieved_at IS NULL AND status = 'not_interested'${pf}`);
  const signedLeads = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL AND achieved_at IS NULL AND status = 'contract_signed'${pf}`);
  const achievedLeads = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL AND achieved_at IS NOT NULL${pf}`);
  const unreadMsgs = await queryOne('SELECT COUNT(*) as c FROM gtm_messages WHERE receiver_id = $1 AND is_read = 0', [user.id]);
  const totalUsers = isAdmin(user.role) ? await queryOne('SELECT COUNT(*) as c FROM gtm_users') : { c: 0 };

  const recentTasks = await queryAll(`
    SELECT t.*, COALESCE(u.name, '—') as assigned_to_name,
           (SELECT COUNT(*) FROM gtm_task_comments WHERE task_id = t.id AND deleted_at IS NULL) as comment_count
    FROM gtm_tasks t LEFT JOIN gtm_users u ON t.assigned_to = u.id
    ORDER BY t.created_at DESC LIMIT 8
  `);

  const stats = {
    total_tasks: parseInt(totalTasks?.c || 0),
    completed_tasks: parseInt(completedTasks?.c || 0),
    pending_tasks: parseInt(pendingTasks?.c || 0),
    completion_rate: parseInt(totalTasks?.c || 0) > 0 ? Math.round((parseInt(completedTasks?.c || 0) / parseInt(totalTasks?.c || 1)) * 100) : 0,
    total_leads: parseInt(totalLeads?.c || 0),
    hot_leads: parseInt(hotLeads?.c || 0),
    not_interested_leads: parseInt(notInterested?.c || 0),
    signed_leads: parseInt(signedLeads?.c || 0),
    achieved_leads: parseInt(achievedLeads?.c || 0),
    unread_messages: parseInt(unreadMsgs?.c || 0),
    total_users: parseInt(totalUsers?.c || 0),
    recentTasks,
  };

  return NextResponse.json({ stats });
}
