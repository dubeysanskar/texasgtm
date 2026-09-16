import { NextResponse } from 'next/server';
const { queryAll, queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isManager, isAdmin } = require('@/lib/auth');

export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const members = await queryAll('SELECT id, name, name_en, email, role, company, phone, job_title, job_title_en, language, is_active, created_at FROM gtm_users ORDER BY role, name');
  return NextResponse.json({ members });
}

// POST /api/team — Invite new user (super_admin only)
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });

  const { name, email, role, job_title, language } = await request.json();
  if (!name?.trim() || !email?.trim()) return NextResponse.json({ error: 'Name and email required' }, { status: 400 });

  const validRoles = ['super_admin', 'manager', 'staff', 'marketing'];
  const assignRole = validRoles.includes(role) ? role : 'staff';

  const existing = await queryOne('SELECT id FROM gtm_users WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing) return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });

  // Create user with temp password (they'll use forgot-password to set their own)
  const bcrypt = require('bcryptjs');
  const tempHash = await bcrypt.hash('temp_' + Date.now(), 10);

  const res = await query(
    'INSERT INTO gtm_users (name, email, password_hash, role, job_title, language, is_active) VALUES ($1, $2, $3, $4, $5, $6, 1) RETURNING id',
    [name.trim(), email.toLowerCase().trim(), tempHash, assignRole, (job_title || '').trim(), language === 'ru' ? 'ru' : 'en']
  );

  // Send invite email
  try {
    const { sendInvite } = require('@/lib/mailer');
    await sendInvite({ email: email.toLowerCase().trim(), name, roleName: assignRole.replace('_', ' '), lang: language === 'ru' ? 'ru' : 'en' });
  } catch (e) {
    console.error('[invite] Email send failed:', e.message);
  }

  await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [user.id, user.name, user.role, `Invited "${name}" (${email}) as ${assignRole}`, 'team', 'user', res.rows[0].id]);

  return NextResponse.json({ id: res.rows[0].id, message: 'User invited' }, { status: 201 });
}
