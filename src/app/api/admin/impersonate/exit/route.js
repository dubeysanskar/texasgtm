import { NextResponse } from 'next/server';
const { query } = require('@/lib/db');
const { verifyToken } = require('@/lib/auth');

const COOKIE_OPTS = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' };

// POST /api/admin/impersonate/exit — restore the super admin's own session from the preserved
// gtm-admin-token cookie and close out the audit record. Safe to call even if the impersonation
// token already expired (that's the normal path back once the 1-hour cap is hit).
export async function POST(request) {
  const adminCookie = request.cookies.get('gtm-admin-token');
  const admin = adminCookie ? verifyToken(adminCookie.value) : null;

  if (admin) {
    const impPayload = verifyToken(request.cookies.get('gtm-token')?.value || '');
    await query("UPDATE gtm_impersonation_sessions SET ended_at = $1 WHERE admin_id = $2 AND ended_at IS NULL", [new Date().toISOString(), admin.id]);
    await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [admin.id, admin.name, admin.role, `${admin.name} stopped viewing the portal as ${impPayload?.name || 'a user'}`, 'security', 'user', impPayload?.id || null, JSON.stringify({ kind: 'impersonate_end', session_id: impPayload?.sessionId })]);
  }

  const res = NextResponse.json({ ok: true, restored: !!admin });
  res.cookies.set('gtm-admin-token', '', { ...COOKIE_OPTS, maxAge: 0 });
  res.cookies.set('gtm-imp', '', { ...COOKIE_OPTS, httpOnly: false, maxAge: 0 });
  res.cookies.set('gtm-token', admin ? adminCookie.value : '', { ...COOKIE_OPTS, maxAge: admin ? 7 * 24 * 60 * 60 : 0 });
  return res;
}
