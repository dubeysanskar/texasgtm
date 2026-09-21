import { NextResponse } from 'next/server';
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isStaff } = require('@/lib/auth');
const { normalizeDate } = require('@/lib/tz');

// PUT /api/todos/[id] { status?: 'open'|'done', text?, todo_date? } — owner only
export async function PUT(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const row = await queryOne('SELECT * FROM gtm_todos WHERE id = $1', [id]);
  if (!row || row.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await request.json();
  const updates = []; const vals = [];
  if (b.status === 'done' || b.status === 'open') {
    updates.push(`status = $${vals.push(b.status)}`);
    updates.push(`done_at = $${vals.push(b.status === 'done' ? new Date().toISOString() : null)}`);
  }
  if (b.text !== undefined) { const t = String(b.text).trim().slice(0, 500); if (!t) return NextResponse.json({ error: 'Write something' }, { status: 400 }); updates.push(`text = $${vals.push(t)}`); }
  if (b.todo_date !== undefined) updates.push(`todo_date = $${vals.push(normalizeDate(b.todo_date))}`);
  if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  vals.push(id);
  await query(`UPDATE gtm_todos SET ${updates.join(', ')} WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}

// DELETE /api/todos/[id] — owner only
export async function DELETE(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const row = await queryOne('SELECT id FROM gtm_todos WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!row) return NextResponse.json({ ok: true });
  await query('DELETE FROM gtm_todos WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}
