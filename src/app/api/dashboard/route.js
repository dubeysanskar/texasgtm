import { NextResponse } from 'next/server';
const { queryOne, queryAll } = require('@/lib/db');
const { getUserFromRequest, isAdmin } = require('@/lib/auth');

export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const pid = searchParams.get('project_id');
  const pf = pid ? ' AND project_id = ' + parseInt(pid) : '';

  const totalTasks = await queryOne('SELECT COUNT(*) as c FROM gtm_tasks');
  const completedTasks = await queryOne("SELECT COUNT(*) as c FROM gtm_tasks WHERE status = 'complete'");
  const pendingTasks = await queryOne("SELECT COUNT(*) as c FROM gtm_tasks WHERE status = 'pending'");
  const totalLeads = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL${pf}`);
  const hotLeads = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL AND priority = 'HOT'${pf}`);
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
    unread_messages: parseInt(unreadMsgs?.c || 0),
    total_users: parseInt(totalUsers?.c || 0),
    recentTasks,
  };

  return NextResponse.json({ stats });
}
