import { NextResponse } from 'next/server';
const { queryAll, queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isManager } = require('@/lib/auth');
const { remindAt, toIso, logToLead } = require('@/lib/followups');

const SELECT = `SELECT f.*, l.company_name, l.project_seq, l.city, l.status AS lead_status, l.priority AS lead_priority,
  l.phone, l.mobile_personal, l.email AS lead_email, l.decision_maker_title
  FROM gtm_followups f JOIN gtm_leads l ON l.id = f.lead_id WHERE l.deleted_at IS NULL`;

// GET /api/followups?project_id=&lead_id=&status=open|done|all&mine=1&from=ISO&to=ISO
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  let sql = SELECT; const params = [];
  const add = (cond, v) => { params.push(v); sql += ` AND ${cond.replace('?', '$' + params.length)}`; };
  if (sp.get('project_id')) add('f.project_id = ?', Number(sp.get('project_id')));
  if (sp.get('lead_id')) add('f.lead_id = ?', Number(sp.get('lead_id')));
  const status = sp.get('status') || 'open';
  if (status !== 'all') add('f.status = ?', status);
  if (sp.get('mine') === '1') add('COALESCE(f.assigned_to, f.created_by) = ?', user.id);
  if (sp.get('from') && toIso(sp.get('from'))) add('f.due_at >= ?', toIso(sp.get('from')));
  if (sp.get('to') && toIso(sp.get('to'))) add('f.due_at < ?', toIso(sp.get('to')));
  sql += status === 'done' ? ' ORDER BY f.done_at DESC LIMIT 300' : ' ORDER BY f.due_at ASC LIMIT 1000';
  return NextResponse.json({ followups: await queryAll(sql, params) });
}

// POST /api/followups { lead_id, title, note, due_at, remind_before (minutes | null), assigned_to, tz }
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await request.json();
  const title = String(b.title || '').trim().slice(0, 200);
  const due = toIso(b.due_at);
  if (!b.lead_id || !title || !due) return NextResponse.json({ error: 'Lead, title and date are required' }, { status: 400 });
  const lead = await queryOne('SELECT id, company_name, project_id FROM gtm_leads WHERE id = $1 AND deleted_at IS NULL', [b.lead_id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const assignee = b.assigned_to ? await queryOne('SELECT id, name FROM gtm_users WHERE id = $1', [b.assigned_to]) : { id: user.id, name: user.name };
  if (!assignee) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const note = String(b.note || '').trim().slice(0, 2000);

  const row = await queryOne(
    `INSERT INTO gtm_followups (lead_id, project_id, title, note, due_at, remind_at, tz, assigned_to, assigned_to_name, created_by, created_by_name, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open',$12) RETURNING id`,
    [lead.id, lead.project_id || null, title, note, due, remindAt(due, b.remind_before), String(b.tz || '').slice(0, 64), assignee.id, assignee.name, user.id, user.name, new Date().toISOString()]
  );
  await logToLead(user, lead, `Scheduled follow-up "${title}"`, { kind: 'followup', event: 'created', title, due_at: due, assignee: assignee.name, comment: note });
  if (assignee.id !== user.id) {
    await query('INSERT INTO gtm_notifications (user_id, type, title, message, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [assignee.id, 'followup', 'New follow-up assigned', `${user.name}: ${title} — ${lead.company_name}`, 'lead', lead.id]).catch(() => {});
  }
  return NextResponse.json({ id: row.id }, { status: 201 });
}
