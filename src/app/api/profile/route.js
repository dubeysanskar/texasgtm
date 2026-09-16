import { NextResponse } from 'next/server';
const bcrypt = require('bcryptjs');
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest } = require('@/lib/auth');

export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profile = await queryOne('SELECT id, name, name_en, email, role, company, phone, avatar, bio, job_title, job_title_en, language, created_at FROM gtm_users WHERE id = $1', [user.id]);
  return NextResponse.json({ profile });
}

export async function PUT(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, company, phone, bio, job_title, language, current_password, new_password } = await request.json();

  if (new_password) {
    const u = await queryOne('SELECT password_hash FROM gtm_users WHERE id = $1', [user.id]);
    const valid = await bcrypt.compare(current_password, u.password_hash);
    if (!valid) return NextResponse.json({ error: 'Current password incorrect' }, { status: 400 });
    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE gtm_users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
  }

  await query('UPDATE gtm_users SET name = $1, company = $2, phone = $3, bio = $4, job_title = COALESCE($5, job_title), language = COALESCE($6, language) WHERE id = $7',
    [name || user.name, company || '', phone || '', bio || '', job_title ?? null, language ? (language === 'ru' ? 'ru' : 'en') : null, user.id]);

  return NextResponse.json({ success: true });
}
