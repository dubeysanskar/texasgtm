import { NextResponse } from 'next/server';
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isManager } = require('@/lib/auth');

export async function PUT(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const b = await request.json();
  const lead = await queryOne('SELECT * FROM gtm_leads WHERE id = $1', [id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Every change carries the user's comment (why it was made); it is stored with the log entry.
  const comment = typeof b.comment === 'string' ? b.comment.trim().slice(0, 1000) : '';
  const log = (action, kind, extra = {}) => query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id, project_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [user.id, user.name, user.role, action, 'lead', 'lead', id, lead.project_id || null, JSON.stringify({ kind, comment, ...extra })]);

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
  const editable = ['company_name','domain','sector','city','region','country','company_size','pain_point','decision_maker_title','phone','mobile_personal','email','contact_method','source_url','find_instructions','notes'];
  const changedFields = editable.filter(f => b[f] !== undefined && String(b[f] ?? '') !== String(lead[f] ?? ''));
  if (changedFields.length) {
    const changes = Object.fromEntries(changedFields.map(f => [f, { from: lead[f] ?? '', to: b[f] ?? '' }]));
    await log(`Edited "${lead.company_name}": ${changedFields.join(', ')}`, 'edit', { fields: changedFields, changes });
  }

  const fields = ['company_name','domain','sector','priority','status','city','region','country','company_size','pain_point','decision_maker_title','phone','mobile_personal','email','contact_method','source_url','find_instructions','notes','last_contacted_at','next_followup_at','contacted_by','last_template_id'];
  const updates = []; const vals = [];
  fields.forEach(f => { if (b[f] !== undefined) { vals.push(b[f]); updates.push(`${f} = $${vals.length}`); } });
  vals.push(id);
  if (updates.length > 0) await query(`UPDATE gtm_leads SET ${updates.join(',')}, updated_at = NOW() WHERE id = $${vals.length}`, vals);
  // Any status that implies an actual touch (call, email, meeting, reply…) counts as a contact
  if (b.status && b.status !== lead.status && !['not_contacted'].includes(b.status) && b.last_contacted_at === undefined) {
    await query('UPDATE gtm_leads SET last_contacted_at = NOW() WHERE id = $1', [id]);
  }

  return NextResponse.json({ success: true });
}

// GET /api/leads/[id] — lead + its full history (status changes + activity log entries)
export async function GET(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { queryAll } = require('@/lib/db');
  const lead = await queryOne('SELECT * FROM gtm_leads WHERE id = $1', [id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const history = await queryAll('SELECT id, old_status, new_status, changed_by_name, note, changed_at FROM gtm_lead_status_history WHERE lead_id = $1 ORDER BY changed_at DESC', [id]);
  const rawLogs = await queryAll("SELECT id, user_name, user_role, action, metadata, created_at FROM gtm_activity_logs WHERE entity_type = 'lead' AND entity_id = $1 ORDER BY created_at DESC LIMIT 200", [id]);
  const logs = rawLogs.map(l => { let meta = {}; try { meta = typeof l.metadata === 'string' ? JSON.parse(l.metadata || '{}') : (l.metadata || {}); } catch {} const { metadata, ...rest } = l; return { ...rest, ...meta }; });
  const sends = await queryAll('SELECT id, subject, status, sent_at, opened_at, created_at FROM gtm_email_sends WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 50', [id]);
  return NextResponse.json({ lead, history, logs, sends });
}

// DELETE /api/leads/[id] — soft delete (kept in "Deleted leads", restorable). Body: { comment }
export async function DELETE(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  let body = {}; try { body = await request.json(); } catch {}
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';
  const lead = await queryOne('SELECT id, company_name, project_id, dedup_key, deleted_at FROM gtm_leads WHERE id = $1', [id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (lead.deleted_at) return NextResponse.json({ success: true });
  // Free the dedup key so the same company can be added again while this copy sits in the bin
  await query("UPDATE gtm_leads SET deleted_at = NOW(), deleted_by = $1, deleted_by_name = $2, delete_comment = $3, dedup_key = dedup_key || '__deleted_' || CAST(id AS TEXT), updated_at = NOW() WHERE id = $4",
    [user.id, user.name, comment, id]);
  await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id, project_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [user.id, user.name, user.role, `Deleted lead "${lead.company_name}"`, 'lead', 'lead', id, lead.project_id || null, JSON.stringify({ kind: 'delete', comment })]);
  return NextResponse.json({ success: true });
}

// POST /api/leads/[id] — restore a deleted lead. Body: { comment }
export async function POST(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  let body = {}; try { body = await request.json(); } catch {}
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 1000) : '';
  const lead = await queryOne('SELECT id, company_name, project_id, dedup_key, deleted_at FROM gtm_leads WHERE id = $1', [id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!lead.deleted_at) return NextResponse.json({ success: true });
  const originalKey = String(lead.dedup_key || '').replace(/__deleted_\d+$/, '');
  const clash = originalKey ? await queryOne('SELECT id FROM gtm_leads WHERE dedup_key = $1 AND deleted_at IS NULL', [originalKey]) : null;
  await query("UPDATE gtm_leads SET deleted_at = NULL, deleted_by = NULL, deleted_by_name = '', delete_comment = '', dedup_key = $1, updated_at = NOW() WHERE id = $2",
    [clash ? lead.dedup_key : originalKey, id]);
  await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id, project_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [user.id, user.name, user.role, `Restored lead "${lead.company_name}"`, 'lead', 'lead', id, lead.project_id || null, JSON.stringify({ kind: 'restore', comment })]);
  return NextResponse.json({ success: true, duplicate_of_live_lead: !!clash });
}
