import { NextResponse } from 'next/server';
const crypto = require('crypto');
const { queryOne, query } = require('@/lib/db');
const { sendPasswordReset } = require('@/lib/mailer');

export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const user = await queryOne('SELECT id, email, language FROM gtm_users WHERE email = $1', [email.toLowerCase().trim()]);
    // Always return success to prevent email enumeration
    if (!user) return NextResponse.json({ success: true });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    await query('UPDATE gtm_users SET setup_otp = $1, setup_otp_expires = $2 WHERE id = $3', [token, expires, user.id]);

    const resetUrl = `${process.env.APP_URL || 'http://localhost:3005'}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

    try {
      await sendPasswordReset(user.email, resetUrl, user.language);
    } catch (err) {
      console.error('[mailer] Reset email failed:', err.message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[auth/forgot-password]', err.message);
    return NextResponse.json({ error: 'Database unavailable — please try again shortly or contact the administrator.' }, { status: 503 });
  }
}
