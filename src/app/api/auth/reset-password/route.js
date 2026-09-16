import { NextResponse } from 'next/server';
const bcrypt = require('bcryptjs');
const { queryOne, query } = require('@/lib/db');

export async function POST(request) {
  try {
    const { email, token, password } = await request.json();
    if (!email || !token || !password) return NextResponse.json({ error: 'All fields required' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: 'Password must be 6+ chars' }, { status: 400 });

    const user = await queryOne('SELECT id, setup_otp, setup_otp_expires FROM gtm_users WHERE email = $1', [email.toLowerCase().trim()]);
    if (!user || user.setup_otp !== token) return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });

    if (new Date(user.setup_otp_expires) < new Date()) {
      return NextResponse.json({ error: 'Reset link expired' }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 10);
    await query('UPDATE gtm_users SET password_hash = $1, setup_otp = NULL, setup_otp_expires = NULL WHERE id = $2', [hash, user.id]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[auth/reset-password]', err.message);
    return NextResponse.json({ error: 'Database unavailable — please try again shortly or contact the administrator.' }, { status: 503 });
  }
}
