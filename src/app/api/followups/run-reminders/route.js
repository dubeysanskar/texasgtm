import { NextResponse } from 'next/server';
const { getUserFromRequest, isAdmin } = require('@/lib/auth');
const { sendDueReminders } = require('@/lib/followups');

// POST /api/followups/run-reminders — super admin: send due reminder emails now (the background loop does this every minute)
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  return NextResponse.json(await sendDueReminders());
}
