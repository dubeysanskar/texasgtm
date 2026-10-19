import { NextResponse } from 'next/server';
const { queryAll, queryOne, query } = require('@/lib/db');
const { getUserFromRequest } = require('@/lib/auth');

export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const search = searchParams.get('search');
  const pid = searchParams.get('project_id');

  let sql = `SELECT t.*, COALESCE(u.name, '—') as assigned_to_name,
    (SELECT COUNT(*) FROM gtm_task_comments WHERE task_id = t.id AND deleted_at IS NULL) as comment_count
    FROM gtm_tasks t LEFT JOIN gtm_users u ON t.assigned_to = u.id WHERE 1=1`;
  const params = [];
  if (pid) { params.push(pid); sql += ` AND t.project_id = $${params.length}`; }
  if (status) { params.push(status); sql += ` AND t.status = $${params.length}`; }
  if (priority) { params.push(priority); sql += ` AND t.priority = $${params.length}`; }
  if (search) { params.push(`%${search}%`, `%${search}%`); sql += ` AND (t.title ILIKE $${params.length - 1} OR t.description ILIKE $${params.length})`; }
  sql += ' ORDER BY t.created_at DESC';

  const tasks = await queryAll(sql, params);
  const users = await queryAll("SELECT id, name, role FROM gtm_users WHERE is_active = 1 ORDER BY name");

  // Stats
  const pf = pid ? ` AND project_id = ${parseInt(pid)}` : '';
  const pending = await queryOne(`SELECT COUNT(*) as c FROM gtm_tasks WHERE status = 'pending'${pf}`);
  const progress = await queryOne(`SELECT COUNT(*) as c FROM gtm_tasks WHERE status IN ('in_progress','progress')${pf}`);
  const review = await queryOne(`SELECT COUNT(*) as c FROM gtm_tasks WHERE status = 'review'${pf}`);
  const complete = await queryOne(`SELECT COUNT(*) as c FROM gtm_tasks WHERE status = 'complete'${pf}`);

  return NextResponse.json({
    tasks, users,
    stats: {
      pending: parseInt(pending?.c || 0),
      progress: parseInt(progress?.c || 0),
      review: parseInt(review?.c || 0),
      complete: parseInt(complete?.c || 0),
      total: tasks.length,
    }
  });
}

export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { title, description, assigned_to, priority, completion_days, project_id } = await request.json();
  const desc = typeof description === 'string' ? description.trim().slice(0, 5000) : '';
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const result = await query(
    'INSERT INTO gtm_tasks (title, description, assigned_by, assigner_name, assigned_to, priority, completion_days, project_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [title.trim(), desc, user.id, user.name, assigned_to || null, priority || 'normal', completion_days || 2, project_id || null]
  );

  if (assigned_to) {
    await query('INSERT INTO gtm_notifications (user_id, type, title, message, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [assigned_to, 'task', 'New Task Assigned', `"${title}" assigned by ${user.name}`, 'task', result.rows[0].id]);
  }

  // Activity log
  await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [user.id, user.name, user.role, `Created task "${title}"`, 'task', 'task', result.rows[0].id]);

  return NextResponse.json({ id: result.rows[0].id });
}

export async function PUT(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();

  if (body.task_id && body.status) {
    const task = await queryOne('SELECT * FROM gtm_tasks WHERE id = $1', [body.task_id]);
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await query('UPDATE gtm_tasks SET status = $1, completed_at = $2 WHERE id = $3',
      [body.status, body.status === 'complete' ? new Date().toISOString() : null, body.task_id]);

    await query('INSERT INTO gtm_task_status_history (task_id, old_status, new_status, changed_by, changed_by_name, changed_by_role) VALUES ($1,$2,$3,$4,$5,$6)',
      [body.task_id, task.status, body.status, user.id, user.name, user.role]);

    // Activity log
    await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [user.id, user.name, user.role, `Changed task #${body.task_id} from ${task.status} to ${body.status}`, 'task', 'task', body.task_id]);
  }

  // Full task edit
  if (body.task_id && body.title) {
    const updates = []; const vals = [];
    if (typeof body.description === 'string') body.description = body.description.trim().slice(0, 5000);
    ['title', 'description', 'priority', 'completion_days', 'status'].forEach(f => {
      if (body[f] !== undefined) { vals.push(body[f]); updates.push(`${f} = $${vals.length}`); }
    });
    if (body.assigned_to !== undefined) { vals.push(body.assigned_to || null); updates.push(`assigned_to = $${vals.length}`); }
    if (updates.length) { vals.push(body.task_id); await query(`UPDATE gtm_tasks SET ${updates.join(',')} WHERE id = $${vals.length}`, vals); }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  await query('DELETE FROM gtm_task_comments WHERE task_id = $1', [id]);
  await query('DELETE FROM gtm_task_status_history WHERE task_id = $1', [id]);
  await query('DELETE FROM gtm_tasks WHERE id = $1', [id]);

  await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [user.id, user.name, user.role, `Deleted task #${id}`, 'task', 'task', parseInt(id)]);

  return NextResponse.json({ success: true });
}
