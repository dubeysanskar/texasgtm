import { NextResponse } from 'next/server';
const { queryAll } = require('@/lib/db');

// GET /api/projects/public — minimal list of active projects for the signup form (no auth)
export async function GET() {
  try {
    const projects = await queryAll(
      'SELECT id, name, slug, country, color, icon, language FROM gtm_projects WHERE is_active = true ORDER BY created_at ASC'
    );
    return NextResponse.json(projects);
  } catch {
    return NextResponse.json([]);
  }
}
