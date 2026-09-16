import { NextResponse } from 'next/server';
const { getUserFromRequest, getUserProjectIds } = require('@/lib/auth');
const { queryOne } = require('@/lib/db');

export async function GET(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const user = await queryOne('SELECT id, name, name_en, email, role, company, phone, avatar, bio, job_title, job_title_en, language FROM gtm_users WHERE id = $1', [payload.id]);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Include accessible project IDs
  const project_ids = await getUserProjectIds(user.id, user.role);

  return NextResponse.json({ user: { ...user, project_ids } });
}
