import { NextResponse } from 'next/server';
const { queryAll, query } = require('@/lib/db');
const { getUserFromRequest, isManager } = require('@/lib/auth');

export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');
  const pid = searchParams.get('project_id');

  let sql = 'SELECT * FROM gtm_templates WHERE 1=1';
  const params = [];
  if (platform) { params.push(platform); sql += ` AND platform = $${params.length}`; }
  if (pid) { params.push(pid); sql += ` AND project_id = $${params.length}`; }
  sql += ' ORDER BY created_at DESC';

  const templates = await queryAll(sql, params);
  return NextResponse.json(templates);
}

export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, platform, status, subject, body, language, translations, project_id } = await request.json();
  if (!name || !body) return NextResponse.json({ error: 'Name and body are required' }, { status: 400 });

  const res = await query(
    'INSERT INTO gtm_templates (name, platform, status, subject, body, language, translations, created_by, project_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [name, platform || 'email', status || 'active', subject || '', body, language || 'en', JSON.stringify(translations || {}), user.id, project_id || null]
  );

  return NextResponse.json(res.rows[0], { status: 201 });
}
