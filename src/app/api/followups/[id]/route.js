import { NextResponse } from 'next/server';
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isManager } = require('@/lib/auth');
const { remindAt, toIso, logToLead } = require('@/lib/followups');

async function load(id) {
  const f = await queryOne('SELECT * FROM gtm_followups WHERE id = $1', [id]);
  const lead = f && await queryOne('SELECT id, company_name, project_id FROM gtm_leads WHERE id = $1', [f.lead_id]);
  return { f, lead };
}

// PUT /api/followups/[id]
//   { status: 'done', comment }  → mark done (comment goes to the lead log)
//   { status: 'open', comment }  → reopen
//   { due_at, remind_before, title, note, assigned_to, tz, comment } → edit / reschedule (re-arms the email reminder)
export async function PUT(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { f, lead } = await load(id);
  if (!f || !lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await request.json();
  const comment = String(b.comment || '').trim().slice(0, 1000);
  const now = new Date().toISOString();

  if (b.status === 'done' && f.status !== 'done') {
    await query("UPDATE gtm_followups SET status = 'done', done_at = $1, done_by_name = $2, done_comment = $3 WHERE id = $4", [now, user.name, comment, id]);
    await query('UPDATE gtm_leads SET updated_at = NOW(), last_contacted_at = NOW() WHERE id = $1', [lead.id]);
    await logToLead(user, lead, `Completed follow-up "${f.title}"`, { kind: 'followup', event: 'done', title: f.title, due_at: f.due_at, comment });
    return NextResponse.json({ ok: true });
  }
  if (b.status === 'open' && f.status === 'done') {
    await query("UPDATE gtm_followups SET status = 'open', done_at = NULL, done_by_name = '', done_comment = '' WHERE id = $1", [id]);
    await logToLead(user, lead, `Reopened follow-up "${f.title}"`, { kind: 'followup', event: 'reopened', title: f.title, due_at: f.due_at, comment });
    return NextResponse.json({ ok: true });
  }

  const title = b.title !== undefined ? (String(b.title).trim().slice(0, 200) || f.title) : f.title;
  const note = b.note !== undefined ? String(b.note).trim().slice(0, 2000) : f.note;
  const due = b.due_at !== undefined ? toIso(b.due_at) : f.due_at;
  if (!due) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  let assignee = { id: f.assigned_to, name: f.assigned_to_name };
  if (b.assigned_to) { const u = await queryOne('SELECT id, name FROM gtm_users WHERE id = $1', [b.assigned_to]); if (u) assignee = u; }
  // Keep the same "minutes before" unless a new value was sent
  const before = b.remind_before !== undefined ? b.remind_before : (f.remind_at ? Math.round((new Date(f.due_at) - new Date(f.remind_at)) / 60000) : null);
  const rAt = remindAt(due, before);
  const reArm = rAt !== f.remind_at;
  await query(`UPDATE gtm_followups SET title = $1, note = $2, due_at = $3, remind_at = $4, assigned_to = $5, assigned_to_name = $6, tz = COALESCE($7, tz)${reArm ? ', reminder_sent_at = NULL' : ''} WHERE id = $8`,
    [title, note, due, rAt, assignee.id, assignee.name, b.tz || null, id]);
  if (due !== f.due_at) await logToLead(user, lead, `Rescheduled follow-up "${title}"`, { kind: 'followup', event: 'rescheduled', title, from: f.due_at, due_at: due, comment });
  else await logToLead(user, lead, `Updated follow-up "${title}"`, { kind: 'followup', event: 'updated', title, due_at: due, comment });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { f, lead } = await load(id);
  if (!f) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let body = {}; try { body = await request.json(); } catch {}
  await query('DELETE FROM gtm_followups WHERE id = $1', [id]);
  if (lead) await logToLead(user, lead, `Removed follow-up "${f.title}"`, { kind: 'followup', event: 'deleted', title: f.title, due_at: f.due_at, comment: String(body.comment || '').trim().slice(0, 1000) });
  return NextResponse.json({ ok: true });
}
