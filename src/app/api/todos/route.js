import { NextResponse } from 'next/server';
const { queryOne, queryAll, query } = require('@/lib/db');
const { getUserFromRequest, isStaff, isAdmin } = require('@/lib/auth');
const { normalizeDate } = require('@/lib/tz');

// GET /api/todos?status=open|done|all&from=&to=&user_id= — the caller's own list; a super admin can
// pass user_id to view anyone else's (private otherwise — no one but the owner and a super admin sees it)
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const ownerId = sp.get('user_id') ? Number(sp.get('user_id')) : user.id;
  if (ownerId !== user.id && !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  let sql = 'SELECT t.*, u.name AS owner_name FROM gtm_todos t JOIN gtm_users u ON u.id = t.user_id WHERE t.user_id = $1';
  const params = [ownerId];
  const status = sp.get('status') || 'open';
  if (status !== 'all') { params.push(status); sql += ` AND t.status = $${params.length}`; }
  if (sp.get('from')) { params.push(normalizeDate(sp.get('from'))); sql += ` AND t.todo_date >= $${params.length}`; }
  if (sp.get('to')) { params.push(normalizeDate(sp.get('to'))); sql += ` AND t.todo_date <= $${params.length}`; }
  sql += status === 'done' ? ' ORDER BY t.done_at DESC LIMIT 300' : ' ORDER BY t.todo_date ASC, t.id ASC LIMIT 500';
  return NextResponse.json({ todos: await queryAll(sql, params) });
}

// POST /api/todos { text, todo_date? } — defaults to today (server/browser local date)
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await request.json();
  const text = String(b.text || '').trim().slice(0, 500);
  if (!text) return NextResponse.json({ error: 'Write something' }, { status: 400 });
  const todoDate = normalizeDate(b.todo_date);
  const row = await queryOne(
    'INSERT INTO gtm_todos (user_id, text, todo_date, status, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [user.id, text, todoDate, 'open', new Date().toISOString()]
  );
  return NextResponse.json(row, { status: 201 });
}
