import { NextResponse } from 'next/server';
const { queryOne, queryAll, query, NOT_A_LEAD_COMMENT } = require('@/lib/db');
const { getUserFromRequest, isManager, isAdmin } = require('@/lib/auth');
const { logToLead } = require('@/lib/followups');
const { addWatcher } = require('@/lib/watchers');

// POST /api/leads/[id]/comment { comment } — add an update to the lead's log without changing any field.
// Commenting auto-subscribes you to the lead, so you keep getting notified of what happens to it next.
export async function POST(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { comment: raw } = await request.json();
  const comment = typeof raw === 'string' ? raw.trim().slice(0, 2000) : '';
  if (!comment) return NextResponse.json({ error: 'Please enter a comment' }, { status: 400 });
  const lead = await queryOne('SELECT id, company_name, project_id, project_seq FROM gtm_leads WHERE id = $1', [id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await logToLead(user, lead, 'Added a comment', { kind: 'note', comment });
  await query('UPDATE gtm_leads SET updated_at = NOW() WHERE id = $1', [id]);
  await addWatcher({ scope: 'lead', leadId: lead.id, watcherId: user.id, addedBy: user, source: 'comment' }).catch(() => {});
  return NextResponse.json({ ok: true }, { status: 201 });
}

// PATCH /api/leads/[id]/comment { comment } — correct the lead's latest comment (the "Last comment" shown in
// the list). Only its author or a super admin may. The log entry keeps the original text and is marked
// edited; leads whose only comment is the one they were added with (no log entry) edit that instead.
export async function PATCH(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { comment: raw } = await request.json();
  const comment = typeof raw === 'string' ? raw.trim().slice(0, 2000) : '';
  if (!comment) return NextResponse.json({ error: 'Please enter a comment' }, { status: 400 });
  const lead = await queryOne('SELECT id, company_name, project_id, project_seq, notes, created_by, last_comment FROM gtm_leads WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const logs = await queryAll("SELECT id, user_id, metadata FROM gtm_activity_logs WHERE entity_type = 'lead' AND entity_id = $1 ORDER BY id DESC LIMIT 300", [id]);
  let entry = null;
  for (const l of logs) {
    let meta = l.metadata; if (typeof meta === 'string') { try { meta = JSON.parse(meta || '{}'); } catch { meta = {}; } }
    if (typeof meta?.comment === 'string' && meta.comment.trim() && !NOT_A_LEAD_COMMENT.has(meta.kind)) { entry = { ...l, meta }; break; }
  }
  const authorId = entry ? entry.user_id : lead.created_by;
  if (authorId !== user.id && !isAdmin(user.role)) return NextResponse.json({ error: 'Only the person who wrote this comment (or a super admin) can edit it' }, { status: 403 });
  const before = entry ? entry.meta.comment : (lead.last_comment || lead.notes || '');
  if (before.trim() === comment) return NextResponse.json({ ok: true, unchanged: true });

  const now = new Date().toISOString();
  if (entry) {
    const meta = { ...entry.meta, comment, edited_at: now, edited_by: user.name, original_comment: entry.meta.original_comment ?? entry.meta.comment };
    await query('UPDATE gtm_activity_logs SET metadata = $1 WHERE id = $2', [JSON.stringify(meta), entry.id]);
    // the comment the lead was added with is also kept on the lead itself
    if (entry.meta.kind === 'create' && String(lead.notes || '').trim() === entry.meta.comment.trim()) await query('UPDATE gtm_leads SET notes = $1 WHERE id = $2', [comment, id]);
  } else {
    await query('UPDATE gtm_leads SET notes = $1 WHERE id = $2', [comment, id]);
  }
  if (entry || lead.last_comment) await query('UPDATE gtm_leads SET last_comment = $1, updated_at = NOW() WHERE id = $2', [comment, id]);
  await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id, project_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [user.id, user.name, user.role, `Edited a comment on "${lead.company_name}"`, 'lead', 'lead', lead.id, lead.project_id || null, JSON.stringify({ kind: 'comment_edit', from: before.slice(0, 500), to: comment.slice(0, 500) })]);
  return NextResponse.json({ ok: true });
}
