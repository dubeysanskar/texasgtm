import { NextResponse } from 'next/server';
const { queryAll, queryOne, query } = require('@/lib/db');
const { getUserFromRequest, isAdmin, getUserProjectIds } = require('@/lib/auth');

// GET /api/projects — list projects user has access to
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

  if (isAdmin(user.role)) {
    // Super admins see all projects
    const projects = await queryAll(
      'SELECT p.*, (SELECT COUNT(*) FROM gtm_leads WHERE project_id = p.id AND deleted_at IS NULL) as lead_count FROM gtm_projects p WHERE p.is_active = true ORDER BY p.created_at ASC'
    );
    return NextResponse.json(projects);
  }

  // Non-admins only see their assigned projects
  const projectIds = await getUserProjectIds(user.id, user.role);
  if (!projectIds.length) return NextResponse.json([]);

  const placeholders = projectIds.map((_, i) => `$${i + 1}`).join(',');
  const projects = await queryAll(
    `SELECT p.*, (SELECT COUNT(*) FROM gtm_leads WHERE project_id = p.id AND deleted_at IS NULL) as lead_count
     FROM gtm_projects p
     WHERE p.is_active = true AND p.id IN (${placeholders})
     ORDER BY p.created_at ASC`,
    projectIds
  );
  return NextResponse.json(projects);
}

// POST /api/projects — create new project (admin only)
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { name, country, description, color, icon, language } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  
  // Check slug uniqueness
  const existing = await queryOne('SELECT id FROM gtm_projects WHERE slug = $1', [slug]);
  if (existing) return NextResponse.json({ error: 'A project with this name already exists' }, { status: 409 });

  const result = await query(
    'INSERT INTO gtm_projects (name, slug, country, description, color, icon, language, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [name.trim(), slug, country || '', description || '', color || '#3B82F6', icon || 'language', language === 'ru' ? 'ru' : 'en', user.id]
  );

  return NextResponse.json(result.rows[0], { status: 201 });
}
