import { NextResponse } from 'next/server';
const bcrypt = require('bcryptjs');
const { queryOne, initSchema } = require('@/lib/db');
const { signToken } = require('@/lib/auth');

let schemaReady = false;

export async function POST(request) {
  try {
    if (!schemaReady) { try { await initSchema(); schemaReady = true; } catch (e) { console.error('[db] init error:', e.message); } }

    const { email, password } = await request.json();
    if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 });

    const user = await queryOne('SELECT * FROM gtm_users WHERE email = $1', [email.toLowerCase().trim()]);
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    if (!user.is_active) return NextResponse.json({ error: 'Account disabled' }, { status: 403 });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    const userData = { id: user.id, name: user.name, email: user.email, role: user.role, company: user.company, phone: user.phone, avatar: user.avatar };
    const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });

    // Set cookie here too (OTP verify will also set it — this is the fallback if OTP send fails)
    const res = NextResponse.json({ user: userData, needs_otp: true });
    // Don't set cookie yet — OTP verification will set it
    // If SMTP fails on client side, client will call login again and we set cookie as fallback
    return res;
  } catch (err) {
    console.error('[auth/login]', err.message);
    return NextResponse.json({ error: 'Database unavailable — please try again shortly or contact the administrator.' }, { status: 503 });
  }
}
