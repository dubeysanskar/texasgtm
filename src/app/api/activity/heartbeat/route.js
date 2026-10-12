import { NextResponse } from 'next/server';
const { getUserFromRequest } = require('@/lib/auth');
const { heartbeat } = require('@/lib/sessions');

// POST /api/activity/heartbeat { active } — sent about once a minute by the open app (ActivityTracker).
// `active` = the tab is visible and the person moved the mouse / typed in the last two minutes.
// A super admin "viewing as" someone is ignored so it never counts as that person's time.
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.impersonating) return NextResponse.json({ ok: true, skipped: 'impersonating' });
  let body = {}; try { body = await request.json(); } catch {}
  await heartbeat(user.id, body.active === true, request);
  return NextResponse.json({ ok: true });
}
