import { NextResponse } from 'next/server';
const { queryAll, queryOne, query, nextProjectSeq } = require('@/lib/db');
const { getUserFromRequest, isManager } = require('@/lib/auth');

export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  let sql = 'SELECT * FROM gtm_leads WHERE 1=1';
  const params = [];
  const projectId = searchParams.get('project_id'); if (projectId) { params.push(projectId); sql += ` AND project_id = $${params.length}`; }
  const status = searchParams.get('status'); if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
  const priority = searchParams.get('priority'); if (priority) { params.push(priority); sql += ` AND priority = $${params.length}`; }
  const sector = searchParams.get('sector'); if (sector) { params.push(sector); sql += ` AND sector = $${params.length}`; }
  const search = searchParams.get('search'); if (search) { params.push(`%${search}%`); sql += ` AND (company_name ILIKE $${params.length} OR city ILIKE $${params.length} OR email ILIKE $${params.length} OR CAST(project_seq AS TEXT) ILIKE $${params.length})`; }

  // Pagination
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  // Count total
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as c');
  const countRes = await queryOne(countSql, params);
  const total = parseInt(countRes?.c || 0);

  const sortOrder = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY created_at ${sortOrder}`;
  params.push(limit); sql += ` LIMIT $${params.length}`;
  params.push(offset); sql += ` OFFSET $${params.length}`;

  const leads = await queryAll(sql, params);
  return NextResponse.json({ leads, total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await request.json();
  if (!b.company_name?.trim()) return NextResponse.json({ error: 'Company name required' }, { status: 400 });
  const dedup = `${b.company_name.trim().toLowerCase()}_${(b.city||'').toLowerCase()}`;
  const existing = await queryOne('SELECT id FROM gtm_leads WHERE dedup_key = $1', [dedup]);
  if (existing) return NextResponse.json({ error: 'Duplicate lead' }, { status: 409 });

  const seq = await nextProjectSeq(b.project_id || null);
  const result = await query(
    `INSERT INTO gtm_leads (company_name,domain,sector,priority,status,city,region,country,company_size,pain_point,decision_maker_title,phone,email,contact_method,source_url,find_instructions,notes,dedup_key,created_by,project_id,mobile_personal,project_seq) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
    [b.company_name.trim(),b.domain||'',b.sector||'other',b.priority||'MEDIUM',b.status||'not_contacted',b.city||'',b.region||'',b.country||'',b.company_size||'',b.pain_point||'',b.decision_maker_title||'',b.phone||'',b.email||'',b.contact_method||'',b.source_url||'',b.find_instructions||'',b.notes||'',dedup,user.id,b.project_id||null,b.mobile_personal||'',seq]
  );
  await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id, project_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [user.id, user.name, user.role, `Added lead "${b.company_name}"`, 'lead', 'lead', result.rows[0].id, b.project_id || null]);

  return NextResponse.json({ id: result.rows[0].id, project_seq: seq });
}

// Bulk status / template update
export async function PATCH(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { ids, status, template_id } = await request.json();
  if (!ids?.length) return NextResponse.json({ error: 'ids required' }, { status: 400 });
  if (!status && template_id === undefined) return NextResponse.json({ error: 'status or template_id required' }, { status: 400 });

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  
  if (status) {
    // Per-lead history so each lead's log shows the bulk change
    const before = await queryAll(`SELECT id, status FROM gtm_leads WHERE id IN (${placeholders})`, ids);
    await query(`UPDATE gtm_leads SET status = $${ids.length + 1}, updated_at = NOW() WHERE id IN (${placeholders})`, [...ids, status]);
    for (const l of before) {
      if (l.status !== status) await query('INSERT INTO gtm_lead_status_history (lead_id, old_status, new_status, changed_by, changed_by_name, note) VALUES ($1,$2,$3,$4,$5,$6)', [l.id, l.status, status, user.id, user.name, 'bulk']);
    }
    await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type) VALUES ($1,$2,$3,$4,$5,$6)',
      [user.id, user.name, user.role, `Bulk updated ${ids.length} leads to "${status}"`, 'lead', 'lead']);
  }
  
  if (template_id !== undefined) {
    await query(`UPDATE gtm_leads SET last_template_id = $${ids.length + 1}, updated_at = NOW() WHERE id IN (${placeholders})`, [...ids, template_id]);
    await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type) VALUES ($1,$2,$3,$4,$5,$6)',
      [user.id, user.name, user.role, `Bulk assigned template to ${ids.length} leads`, 'lead', 'lead']);
  }

  return NextResponse.json({ updated: ids.length });
}
