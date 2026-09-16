import { NextResponse } from 'next/server';
const { queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isAdmin } = require('@/lib/auth');

// GET /api/projects/[id]
export async function GET(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const { id } = await params;
  const project = await queryOne('SELECT * FROM gtm_projects WHERE id = $1', [id]);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(project);
}

// PUT /api/projects/[id] — update project
export async function PUT(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { id } = await params;
  const { name, country, description, color, icon, scraper_config, language } = await request.json();

  const result = await query(
    'UPDATE gtm_projects SET name=COALESCE($1,name), country=COALESCE($2,country), description=COALESCE($3,description), color=COALESCE($4,color), icon=COALESCE($5,icon), scraper_config=COALESCE($6,scraper_config), language=COALESCE($7,language) WHERE id=$8 RETURNING *',
    [name, country, description, color, icon, scraper_config ? JSON.stringify(scraper_config) : null, language ? (language === 'ru' ? 'ru' : 'en') : null, id]
  );

  if (result.rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(result.rows[0]);
}

// DELETE /api/projects/[id]
export async function DELETE(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { id } = await params;
  
  // Soft delete — just mark inactive
  await query('UPDATE gtm_projects SET is_active = false WHERE id = $1', [id]);
  return NextResponse.json({ success: true });
}
