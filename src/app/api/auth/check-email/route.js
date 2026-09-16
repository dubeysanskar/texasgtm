import { NextResponse } from 'next/server';
const { queryOne } = require('@/lib/db');

// Check if email exists and if user is admin (OTP-only login)
export async function POST(request) {
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const user = await queryOne('SELECT id, role, is_active FROM gtm_users WHERE email = $1', [email.toLowerCase().trim()]);

    if (!user) return NextResponse.json({ exists: false, is_admin: false });
    if (!user.is_active) return NextResponse.json({ error: 'Account disabled' }, { status: 403 });

    const isAdmin = user.role === 'super_admin' || user.role === 'manager';

    return NextResponse.json({ exists: true, is_admin: isAdmin });
  } catch (err) {
    console.error('[auth/check-email]', err.message);
    return NextResponse.json({ error: 'Database unavailable — please try again shortly or contact the administrator.' }, { status: 503 });
  }
}
