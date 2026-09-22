import { NextResponse } from 'next/server';
const { queryAll } = require('@/lib/db');
const { getUserFromRequest, isAdmin } = require('@/lib/auth');

// GET /api/admin/impersonate/sessions — super admin only: full "view as" audit trail (everyone's, not
// just the caller's own — this is the security oversight log).
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  const sessions = await queryAll('SELECT * FROM gtm_impersonation_sessions ORDER BY started_at DESC LIMIT 200');
  return NextResponse.json({ sessions });
}
