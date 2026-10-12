import { NextResponse } from 'next/server';
const { query } = require('@/lib/db');
const { verifyToken } = require('@/lib/auth');

export async function POST(request) {
  // If "Sign Out" is used mid-impersonation (instead of the banner's "Exit"), still fully close it out:
  // clear the admin's preserved session too and end the audit record, so nothing is left lingering.
  const adminCookie = request.cookies.get('gtm-admin-token');
  if (adminCookie) {
    const admin = verifyToken(adminCookie.value);
    if (admin) {
      const impPayload = verifyToken(request.cookies.get('gtm-token')?.value || '');
      await query("UPDATE gtm_impersonation_sessions SET ended_at = $1 WHERE admin_id = $2 AND ended_at IS NULL", [new Date().toISOString(), admin.id]);
      await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [admin.id, admin.name, admin.role, `${admin.name} signed out while viewing the portal as ${impPayload?.name || 'a user'}`, 'security', 'user', impPayload?.id || null, JSON.stringify({ kind: 'impersonate_end', reason: 'logout', session_id: impPayload?.sessionId })]);
    }
  }

  // Close the login session of whoever really is signing out (the super admin, if they were "viewing as")
  const realUser = (adminCookie && verifyToken(adminCookie.value)) || verifyToken(request.cookies.get('gtm-token')?.value || '');
  if (realUser && !realUser.impersonating) await require('@/lib/sessions').endSession(realUser.id).catch(() => {});

  const opts = { secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0, path: '/' };
  const res = NextResponse.json({ success: true });
  res.cookies.set('gtm-token', '', { ...opts, httpOnly: true });
  res.cookies.set('gtm-admin-token', '', { ...opts, httpOnly: true });
  res.cookies.set('gtm-imp', '', opts);
  return res;
}
