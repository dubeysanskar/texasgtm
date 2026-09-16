import { NextResponse } from 'next/server';
const { queryOne, query } = require('@/lib/db');
const { sendOTP } = require('@/lib/mailer');
const { getUserFromRequest, signToken } = require('@/lib/auth');

// POST /api/auth/otp/send — Send OTP to user email
export async function POST(request) {
  try {
    const { email, purpose } = await request.json();
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const user = await queryOne('SELECT id, email, language FROM gtm_users WHERE email = $1', [email.toLowerCase().trim()]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 600000).toISOString(); // 10 minutes

    await query('UPDATE gtm_users SET setup_otp = $1, setup_otp_expires = $2 WHERE id = $3', [otp, expires, user.id]);

    try {
      await sendOTP(user.email, otp, user.language);
    } catch (err) {
      console.error('[mailer] OTP send failed:', err.message);
      return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[auth/otp/send]', err.message);
    return NextResponse.json({ error: 'Database unavailable — please try again shortly or contact the administrator.' }, { status: 503 });
  }
}

// PUT /api/auth/otp/send — Verify OTP
export async function PUT(request) {
  try {
    const { email, otp } = await request.json();
    if (!email || !otp) return NextResponse.json({ error: 'Email and OTP required' }, { status: 400 });

    const user = await queryOne('SELECT id, name, email, role, language, setup_otp, setup_otp_expires FROM gtm_users WHERE email = $1', [email.toLowerCase().trim()]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (user.setup_otp !== otp) return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 });
    if (new Date(user.setup_otp_expires) < new Date()) return NextResponse.json({ error: 'OTP expired' }, { status: 400 });

    // Clear OTP
    await query('UPDATE gtm_users SET setup_otp = NULL, setup_otp_expires = NULL WHERE id = $1', [user.id]);

    // Issue token
    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
    const userData = { id: user.id, name: user.name, email: user.email, role: user.role, language: user.language || 'en' };

    const res = NextResponse.json({ user: userData, verified: true });
    res.cookies.set('gtm-token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60, path: '/' });
    return res;
  } catch (err) {
    console.error('[auth/otp/send]', err.message);
    return NextResponse.json({ error: 'Database unavailable — please try again shortly or contact the administrator.' }, { status: 503 });
  }
}
