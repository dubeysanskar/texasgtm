import { NextResponse } from 'next/server';
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest, verifyToken, signToken, isAdmin, IMPERSONATION_MAX_SECONDS } = require('@/lib/auth');

const COOKIE_OPTS = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };

// POST /api/admin/impersonate { user_id } — super admin only: "log in as" another (non-super-admin)
// user. The admin's own session is preserved untouched in a separate httpOnly cookie so exiting always
// returns them to their own account; the target's own session (if any, elsewhere) is never touched —
// nothing about their account changes and nothing is shown to them.
export async function POST(request) {
  const admin = getUserFromRequest(request);
  // Nesting is impossible by construction: a target can never be a super admin (checked below), so
  // whoever is "logged in" during an active impersonation session can never pass this check — no
  // separate "already impersonating" branch is needed. The one real leftover-state case (a stale
  // gtm-admin-token cookie from a session that wasn't cleanly exited) is still guarded explicitly.
  if (!admin || !isAdmin(admin.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  if (request.cookies.get('gtm-admin-token')) return NextResponse.json({ error: 'Exit your current "view as" session first' }, { status: 409 });

  const { user_id } = await request.json();
  const targetId = Number(user_id);
  if (!targetId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  if (targetId === admin.id) return NextResponse.json({ error: "You're already logged in as yourself" }, { status: 400 });

  const target = await queryOne('SELECT id, name, email, role FROM gtm_users WHERE id = $1', [targetId]);
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (target.role === 'super_admin') return NextResponse.json({ error: 'Cannot view as another super admin' }, { status: 403 });

  const adminCookie = request.cookies.get('gtm-token');
  if (!adminCookie || !verifyToken(adminCookie.value)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || '';
  const row = await queryOne(
    'INSERT INTO gtm_impersonation_sessions (admin_id, admin_name, target_user_id, target_user_name, target_role, ip, started_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [admin.id, admin.name, target.id, target.name, target.role, ip, new Date().toISOString()]
  );
  await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [admin.id, admin.name, admin.role, `${admin.name} started viewing the portal as ${target.name} (${target.role})`, 'security', 'user', target.id, JSON.stringify({ kind: 'impersonate_start', session_id: row.id, ip })]);

  const impToken = signToken({ id: target.id, name: target.name, email: target.email, role: target.role, impersonating: true, adminId: admin.id, adminName: admin.name, sessionId: row.id });

  const res = NextResponse.json({ ok: true, user: { id: target.id, name: target.name, email: target.email, role: target.role } });
  res.cookies.set('gtm-admin-token', adminCookie.value, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 });
  res.cookies.set('gtm-token', impToken, { ...COOKIE_OPTS, maxAge: IMPERSONATION_MAX_SECONDS });
  res.cookies.set('gtm-imp', '1', { ...COOKIE_OPTS, httpOnly: false, maxAge: IMPERSONATION_MAX_SECONDS + 60 * 15 });
  return res;
}
