import { NextResponse } from 'next/server';
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isManager, isAdmin } = require('@/lib/auth');
const { logLeadActivity } = require('@/lib/watchers');
const { createFollowup } = require('@/lib/followups');

export async function PUT(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const b = await request.json();
  const lead = await queryOne('SELECT * FROM gtm_leads WHERE id = $1', [id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Every change carries the user's comment (why it was made); it is stored with the log entry and
  // fanned out to anyone watching this lead (CC'd or watching this user).
  const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 1000) : '';
  // Changes are collected here and logged/notified only AFTER the lead row is updated, so the
  // notification email's "lead now" snapshot shows the new status, not the old one.
  const toLog = [];
  const log = async (action, kind, extra = {}) => { toLog.push([action, { kind, comment, ...extra }]); };

  // Achieved: move the lead to the Achieved Leads page (or back to the working list), with the comment
  if (b.achieved === true && !lead.achieved_at) {
    await query('UPDATE gtm_leads SET achieved_at = $1, achieved_by = $2, achieved_by_name = $3, achieve_comment = $4 WHERE id = $5',
      [new Date().toISOString(), user.id, user.name, comment, id]);
    await log(`Marked "${lead.company_name}" as achieved`, 'achieved');
  } else if (b.achieved === false && lead.achieved_at) {
    await query("UPDATE gtm_leads SET achieved_at = NULL, achieved_by = NULL, achieved_by_name = '', achieve_comment = '' WHERE id = $1", [id]);
    await log(`Moved "${lead.company_name}" back from Achieved`, 'unachieved');
  }
  if (b.status && b.status !== lead.status) {
    await query('INSERT INTO gtm_lead_status_history (lead_id, old_status, new_status, changed_by, changed_by_name, note) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, lead.status, b.status, user.id, user.name, comment]);
    await log(`Changed "${lead.company_name}" status: ${lead.status} → ${b.status}`, 'status', { from: lead.status, to: b.status });
  }
  if (b.priority && b.priority !== lead.priority) {
    await log(`Changed "${lead.company_name}" priority: ${lead.priority} → ${b.priority}`, 'priority', { from: lead.priority, to: b.priority });
  }
  if (b.last_template_id !== undefined && (b.last_template_id || null) !== (lead.last_template_id || null)) {
    let tplName = '';
    if (b.last_template_id) { const tpl = await queryOne('SELECT name FROM gtm_templates WHERE id = $1', [b.last_template_id]); tplName = tpl?.name || `#${b.last_template_id}`; }
    await log(b.last_template_id ? `Assigned template "${tplName}" to "${lead.company_name}"` : `Cleared template on "${lead.company_name}"`, 'template', { template: tplName || null });
  }
  const editable = ['company_name','domain','sector','city','region','country','company_size','pain_point','decision_maker_title','phone','mobile_personal','email','contact_method','source_url','find_instructions','notes','telegram','max_messenger','whatsapp'];
  const changedFields = editable.filter(f => b[f] !== undefined && String(b[f] ?? '') !== String(lead[f] ?? ''));
  if (changedFields.length) {
    const changes = Object.fromEntries(changedFields.map(f => [f, { from: lead[f] ?? '', to: b[f] ?? '' }]));
    await log(`Edited "${lead.company_name}": ${changedFields.join(', ')}`, 'edit', { fields: changedFields, changes });
  }

  const fields = ['company_name','domain','sector','priority','status','city','region','country','company_size','pain_point','decision_maker_title','phone','mobile_personal','email','contact_method','source_url','find_instructions','notes','last_contacted_at','next_followup_at','contacted_by','last_template_id','telegram','max_messenger','whatsapp'];
  const updates = []; const vals = [];
  fields.forEach(f => { if (b[f] !== undefined) { vals.push(b[f]); updates.push(`${f} = $${vals.length}`); } });
  vals.push(id);
  if (updates.length > 0) await query(`UPDATE gtm_leads SET ${updates.join(',')}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
  // Any status that implies an actual touch (call, email, meeting, reply…) counts as a contact
  if (b.status && b.status !== lead.status && !['not_contacted'].includes(b.status) && b.last_contacted_at === undefined) {
    await query('UPDATE gtm_leads SET last_contacted_at = NOW() WHERE id = $1', [id]);
  }
  for (const [action, meta] of toLog) await logLeadActivity(user, lead, action, meta);
  // "Follow Up Later" comes with a date: schedule it as a follow-up so it lands on the Dashboard / calendar
  if (b.status === 'follow_up_later' && b.followup_at) {
    await createFollowup({ user, lead, title: b.followup_title || 'Follow up later', note: comment, dueAt: b.followup_at, tz: b.tz });
  }

  return NextResponse.json({ success: true });
}

// GET /api/leads/[id] — lead + its full history (status changes + activity log entries)
export async function GET(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { queryAll } = require('@/lib/db');
  const lead = await queryOne('SELECT l.*, u.name AS created_by_name FROM gtm_leads l LEFT JOIN gtm_users u ON u.id = l.created_by WHERE l.id = $1', [id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const history = await queryAll('SELECT id, old_status, new_status, changed_by_name, note, changed_at FROM gtm_lead_status_history WHERE lead_id = $1 ORDER BY changed_at DESC', [id]);
  const rawLogs = await queryAll("SELECT id, user_name, user_role, action, metadata, created_at FROM gtm_activity_logs WHERE entity_type = 'lead' AND entity_id = $1 ORDER BY created_at DESC LIMIT 200", [id]);
  const logs = rawLogs.map(l => { let meta = {}; try { meta = typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : (l.metadata || {}); } catch {} const { metadata, ...rest } = l; return { ...rest, ...meta }; });
  // The comment the lead was added with is the first entry of its history. Leads added before that was
  // logged only carry it on the lead itself: put it on the creation entry, or — when the creation entry
  // has a different comment — show it as its own "First comment" entry. (Imported/scraped leads have no
  // creation entry; the log window shows theirs on the "Lead created" line it builds.)
  const initial = String(lead.notes || '').trim();
  const created = logs.find(l => l.kind === 'create');
  if (initial && created) {
    if (!String(created.comment || '').trim()) created.comment = initial;
    else if (!logs.some(l => String(l.comment || '').trim() === initial)) {
      logs.push({ id: `initial-${lead.id}`, kind: 'initial', action: 'First comment', user_name: lead.created_by_name || '', comment: initial, created_at: lead.created_at, synthetic: true });
    }
  }
  const sends = await queryAll('SELECT id, subject, status, sent_at, opened_at, created_at FROM gtm_email_sends WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50', [id]);
  return NextResponse.json({ lead, history, logs, sends });
}

// DELETE /api/leads/[id] — soft delete (kept in "Deleted leads"). Body: { comment }
// DELETE /api/leads/[id]?permanent=1 — super admin only: erase a lead that is already in the bin.
export async function DELETE(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  let body = {}; try { body = await request.json(); } catch {}
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';
  const lead = await queryOne('SELECT id, company_name, project_id, dedup_key, deleted_at, project_seq, created_by, city FROM gtm_leads WHERE id = $1', [id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { searchParams } = new URL(request.url);
  if (searchParams.get('permanent') === '1') {
    if (!isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
    if (!lead.deleted_at) return NextResponse.json({ error: 'Move the lead to Deleted leads first' }, { status: 400 });
    await query('DELETE FROM gtm_leads WHERE id = $1', [id]);
    await logLeadActivity(user, lead, `Permanently deleted lead #${lead.project_seq ?? lead.id} "${lead.company_name}"`, { kind: 'purge', comment });
    return NextResponse.json({ success: true, permanent: true });
  }
  if (lead.deleted_at) return NextResponse.json({ success: true });
  // Free the dedup key so the same company can be added again while this copy sits in the bin
  await query("UPDATE gtm_leads SET deleted_at = NOW(), deleted_by = $1, deleted_by_name = $2, delete_comment = $3, dedup_key = dedup_key || '__deleted_' || CAST(id AS TEXT), updated_at = NOW() WHERE id = $4",
    [user.id, user.name, comment, id]);
  await logLeadActivity(user, lead, `Deleted lead "${lead.company_name}"`, { kind: 'delete', comment });
  return NextResponse.json({ success: true });
}

// POST /api/leads/[id] — restore a deleted lead (super admin only). Body: { comment }
export async function POST(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  const { id } = await params;
  let body = {}; try { body = await request.json(); } catch {}
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';
  const lead = await queryOne('SELECT id, company_name, project_id, project_seq, dedup_key, deleted_at FROM gtm_leads WHERE id = $1', [id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!lead.deleted_at) return NextResponse.json({ success: true });
  const originalKey = String(lead.dedup_key || '').replace(/__deleted_\d+$/, '');
  const clash = originalKey ? await queryOne('SELECT id FROM gtm_leads WHERE dedup_key = $1 AND deleted_at IS NULL', [originalKey]) : null;
  await query("UPDATE gtm_leads SET deleted_at = NULL, deleted_by = NULL, deleted_by_name = '', delete_comment = '', dedup_key = $1, updated_at = NOW() WHERE id = $2",
    [clash ? lead.dedup_key : originalKey, id]);
  await logLeadActivity(user, lead, `Restored lead "${lead.company_name}"`, { kind: 'restore', comment });
  return NextResponse.json({ success: true, duplicate_of_live_lead: !!clash });
}
