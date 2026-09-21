import { NextResponse } from 'next/server';
const fs = require('fs');
const path = require('path');
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isStaff, isAdmin } = require('@/lib/auth');

const UPLOAD_ROOT = path.join(process.cwd(), 'data', 'uploads', 'daily');

// PUT /api/daily-updates/[id] { text } — author or super admin only
export async function PUT(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const row = await queryOne('SELECT id, user_id FROM gtm_daily_updates WHERE id = $1', [id]);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.user_id !== user.id && !isAdmin(user.role)) return NextResponse.json({ error: 'You can only edit your own entry' }, { status: 403 });
  const { text } = await request.json();
  const clean = String(text || '').trim().slice(0, 4000);
  if (!clean) return NextResponse.json({ error: 'Write something' }, { status: 400 });
  await query("UPDATE gtm_daily_updates SET text = $1, translated_text = '', translated_lang = '' WHERE id = $2", [clean, id]);
  return NextResponse.json({ ok: true });
}

// DELETE /api/daily-updates/[id] — author or super admin only
export async function DELETE(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const row = await queryOne('SELECT id, user_id FROM gtm_daily_updates WHERE id = $1', [id]);
  if (!row) return NextResponse.json({ ok: true });
  if (row.user_id !== user.id && !isAdmin(user.role)) return NextResponse.json({ error: 'You can only delete your own entry' }, { status: 403 });
  await query('DELETE FROM gtm_daily_update_files WHERE update_id = $1', [id]);
  await query('DELETE FROM gtm_daily_updates WHERE id = $1', [id]);
  try { fs.rmSync(path.join(UPLOAD_ROOT, String(id)), { recursive: true, force: true }); } catch {}
  return NextResponse.json({ ok: true });
}
