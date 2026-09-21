import { NextResponse } from 'next/server';
const { queryOne } = require('@/lib/db');
const { getUserFromRequest, isManager, isAdmin } = require('@/lib/auth');
const { listLeadWatchers, listUserWatchers, addWatcher, removeWatcher, logLeadActivity } = require('@/lib/watchers');

// GET /api/watchers?lead_id=123        — who is CC'd on this lead
// GET /api/watchers?target_user_id=5   — who is watching this team member's activity (super admin only)
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  if (sp.get('lead_id')) return NextResponse.json({ watchers: await listLeadWatchers(Number(sp.get('lead_id'))) });
  if (sp.get('target_user_id')) {
    if (!isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
    return NextResponse.json({ watchers: await listUserWatchers(Number(sp.get('target_user_id'))) });
  }
  return NextResponse.json({ error: 'lead_id or target_user_id required' }, { status: 400 });
}

// POST /api/watchers { lead_id } | { target_user_id, watcher_id? }
// A manager can CC themselves on a lead; adding someone ELSE (on a lead, or on any team member's
// activity) requires a super admin.
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await request.json();
  const watcherId = b.watcher_id ? Number(b.watcher_id) : user.id;
  if (watcherId !== user.id && !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  const watcher = await queryOne('SELECT id, name FROM gtm_users WHERE id = $1 AND is_active != 0', [watcherId]);
  if (!watcher) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (b.lead_id) {
    const lead = await queryOne('SELECT id, company_name, project_id, project_seq FROM gtm_leads WHERE id = $1 AND deleted_at IS NULL', [Number(b.lead_id)]);
    if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    await addWatcher({ scope: 'lead', leadId: lead.id, watcherId, addedBy: user, source: 'cc' });
    const self = watcherId === user.id;
    const action = self ? `${user.name} subscribed to notifications` : `${user.name} added ${watcher.name} as CC`;
    await logLeadActivity(user, lead, action, { kind: 'watch', event: 'added', watcher: watcher.name, self });
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  if (b.target_user_id) {
    if (!isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
    const target = await queryOne('SELECT id FROM gtm_users WHERE id = $1', [Number(b.target_user_id)]);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    await addWatcher({ scope: 'user', targetUserId: target.id, watcherId, addedBy: user, source: 'cc' });
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  return NextResponse.json({ error: 'lead_id or target_user_id required' }, { status: 400 });
}

// DELETE /api/watchers { lead_id | target_user_id, watcher_id? } — anyone can remove themselves; removing
// someone else requires a super admin.
export async function DELETE(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await request.json();
  const watcherId = b.watcher_id ? Number(b.watcher_id) : user.id;
  if (watcherId !== user.id && !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  if (b.target_user_id && !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  if (b.lead_id) {
    const lead = await queryOne('SELECT id, company_name, project_id, project_seq FROM gtm_leads WHERE id = $1', [Number(b.lead_id)]);
    await removeWatcher({ scope: 'lead', leadId: Number(b.lead_id), watcherId });
    if (lead) {
      const watcher = await queryOne('SELECT name FROM gtm_users WHERE id = $1', [watcherId]);
      const self = watcherId === user.id;
      const action = self ? `${user.name} unsubscribed from notifications` : `${user.name} removed ${watcher?.name || '—'} from CC`;
      await logLeadActivity(user, lead, action, { kind: 'watch', event: 'removed', watcher: watcher?.name, self });
    }
  } else if (b.target_user_id) {
    await removeWatcher({ scope: 'user', targetUserId: Number(b.target_user_id), watcherId });
  } else return NextResponse.json({ error: 'lead_id or target_user_id required' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
