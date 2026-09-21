import { NextResponse } from 'next/server';
const { queryOne, queryAll, query } = require('@/lib/db');
const { getUserFromRequest, isStaff } = require('@/lib/auth');
const { normalizeDate } = require('@/lib/tz');

// GET /api/todos?status=open|done|all&from=&to= — always just the caller's own list
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  let sql = 'SELECT * FROM gtm_todos WHERE user_id = $1';
  const params = [user.id];
  const status = sp.get('status') || 'open';
  if (status !== 'all') { params.push(status); sql += ` AND status = $${params.length}`; }
  if (sp.get('from')) { params.push(normalizeDate(sp.get('from'))); sql += ` AND todo_date >= $${params.length}`; }
  if (sp.get('to')) { params.push(normalizeDate(sp.get('to'))); sql += ` AND todo_date <= $${params.length}`; }
  sql += status === 'done' ? ' ORDER BY done_at DESC LIMIT 300' : ' ORDER BY todo_date ASC, id ASC LIMIT 500';
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
