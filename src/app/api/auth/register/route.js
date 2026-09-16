import { NextResponse } from 'next/server';
const bcrypt = require('bcryptjs');
const { query, queryOne, initSchema } = require('@/lib/db');
const { signToken } = require('@/lib/auth');

export async function POST(request) {
  try {
    try { await initSchema(); } catch {}

    const { name, email, password, project_id } = await request.json();
    if (!name || !email || !password) return NextResponse.json({ error: 'Name, email, password required' }, { status: 400 });
    if (!project_id) return NextResponse.json({ error: 'Please select a project' }, { status: 400 });

    const project = await queryOne('SELECT id, name, language FROM gtm_projects WHERE id = $1 AND is_active = true', [project_id]);
    if (!project) return NextResponse.json({ error: 'Selected project not found' }, { status: 400 });

    const existing = await queryOne('SELECT id FROM gtm_users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });

    // Self-registration is always staff — roles are elevated by admins only
    const role = 'staff';
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO gtm_users (name, email, password_hash, role, language) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name.trim(), email.toLowerCase().trim(), hash, role, project.language === 'ru' ? 'ru' : 'en']
    );

    const userId = result.rows[0].id;

    await query(
      'INSERT INTO gtm_project_members (user_id, project_id, role, added_by) VALUES ($1, $2, $3, $1) ON CONFLICT (user_id, project_id) DO NOTHING',
      [userId, project.id, 'member']
    );

    // Welcome email (non-blocking — registration succeeds even if mail fails)
    try {
      const { sendInvite } = require('@/lib/mailer');
      await sendInvite({ email: email.toLowerCase().trim(), name: name.trim(), roleName: project.language === 'ru' ? 'Сотрудник' : 'Staff', projectNames: [project.name], isWelcome: true, lang: project.language });
    } catch (e) {
      console.error('[register] Welcome email failed:', e.message);
    }

    const userData = { id: userId, name: name.trim(), email: email.toLowerCase().trim(), role, language: project.language === 'ru' ? 'ru' : 'en' };
    const token = signToken(userData);

    const res = NextResponse.json({ user: userData, project: project.name });
    res.cookies.set('gtm-token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60, path: '/' });
    return res;
  } catch (err) {
    console.error('[auth/register]', err.message);
    return NextResponse.json({ error: 'Database unavailable — please try again shortly or contact the administrator.' }, { status: 503 });
  }
}
