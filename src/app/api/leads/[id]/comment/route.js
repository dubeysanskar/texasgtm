import { NextResponse } from 'next/server';
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isManager } = require('@/lib/auth');
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
