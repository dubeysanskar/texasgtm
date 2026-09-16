import { NextResponse } from 'next/server';
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isManager } = require('@/lib/auth');

export async function PUT(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const fields = [];
  const values = [];
  let idx = 1;

  ['name', 'platform', 'status', 'subject', 'body', 'language'].forEach(f => {
    if (body[f] !== undefined) { fields.push(`${f} = $${idx}`); values.push(body[f]); idx++; }
  });
  if (body.translations !== undefined) {
    fields.push(`translations = $${idx}`);
    values.push(JSON.stringify(body.translations));
    idx++;
  }
  fields.push(`updated_at = NOW()`);
  values.push(id);

  const res = await query(`UPDATE gtm_templates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
  if (!res.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(res.rows[0]);
}

export async function DELETE(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await query('DELETE FROM gtm_templates WHERE id = $1', [id]);
  return NextResponse.json({ ok: true });
}

export async function GET(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const t = await queryOne('SELECT * FROM gtm_templates WHERE id = $1', [id]);
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(t);
}
