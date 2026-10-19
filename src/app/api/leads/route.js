import { NextResponse } from 'next/server';
const { queryAll, queryOne, query, nextProjectSeq } = require('@/lib/db');
const { getUserFromRequest, isManager, isAdmin } = require('@/lib/auth');
const { logLeadActivity, notifyBulk } = require('@/lib/watchers');
const { searchClause, lookupClause } = require('@/lib/lead-search');
const { createFollowup } = require('@/lib/followups');
const { CLOSED_STATUSES } = require('@/lib/lead-fields');
const { rankLeads } = require('@/lib/lead-priority');

export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const showDeleted = searchParams.get('deleted') === '1';
  if (showDeleted && !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  const achieved = searchParams.get('achieved');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const priorityView = searchParams.get('view') === 'priority';

  // WHERE clause; `withPriority: false` leaves the priority filter out (for the HOT/HIGH/… tab counts)
  const build = (withPriority) => {
    let w = `deleted_at IS ${showDeleted ? 'NOT NULL' : 'NULL'}`;
    const p = [];
    // Achieved leads live on their own page: achieved=1 → only them, achieved=all → both, default → working list only
    if (!showDeleted && achieved === '1') w += ' AND achieved_at IS NOT NULL';
    else if (!showDeleted && achieved !== 'all') w += ' AND achieved_at IS NULL';
    // Not Interested / Closed leave the working list (and search, lookup, Priority, Dashboard). They only
    // show up when someone asks for that status explicitly (status filter or the Dashboard cards).
    if (!showDeleted && achieved !== '1' && !CLOSED_STATUSES.includes(status) && searchParams.get('include_closed') !== '1') {
      w += ` AND status NOT IN (${CLOSED_STATUSES.map(s => `'${s}'`).join(',')})`;
    }
    const projectId = searchParams.get('project_id'); if (projectId) { p.push(projectId); w += ` AND project_id = $${p.length}`; }
    if (status) { p.push(status); w += ` AND status = $${p.length}`; }
    if (priority && withPriority) { p.push(priority); w += ` AND priority = $${p.length}`; }
    const sector = searchParams.get('sector'); if (sector) { p.push(sector); w += ` AND sector = $${p.length}`; }
    // "My leads": leads I added (owner) or am CC'd on
    if (searchParams.get('mine') === '1') {
      p.push(user.id, user.id);
      w += ` AND (created_by = $${p.length - 1} OR id IN (SELECT lead_id FROM gtm_watch_subscriptions WHERE scope = 'lead' AND watcher_id = $${p.length}))`;
    }
    // Search box: every word matched across all lead fields (+ phone digits); Bulk Lookup: a pasted list, any match
    w += searchClause(searchParams.get('search'), p);
    w += lookupClause(searchParams.get('lookup'), p);
    return { where: w, params: p };
  };
  const NEXT_FU = "(SELECT MIN(f.due_at) FROM gtm_followups f WHERE f.lead_id = gtm_leads.id AND f.status = 'open') AS next_followup_at";

  // Pagination
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '50')));
  const offset = (page - 1) * limit;

  // Priority view: rank every matching lead (overdue/today follow-ups, hot deals, due soon, then by
  // priority and how long since the last contact; parked "follow up later" last) — see lib/lead-priority
  if (priorityView && !showDeleted) {
    const { where, params: p } = build(true);
    const all = rankLeads(await queryAll(`SELECT gtm_leads.*, ${NEXT_FU} FROM gtm_leads WHERE ${where}`, p));
    const tierQ = build(false);
    const tierRows = await queryAll(`SELECT priority, COUNT(*) as c FROM gtm_leads WHERE ${tierQ.where} GROUP BY priority`, tierQ.params);
    const tiers = { all: 0 }; for (const r of tierRows) { tiers[r.priority] = parseInt(r.c); tiers.all += parseInt(r.c); }
    const reasons = {}; for (const l of all) reasons[l.priority_reason.code] = (reasons[l.priority_reason.code] || 0) + 1;
    return NextResponse.json({ leads: all.slice(offset, offset + limit), total: all.length, page, limit, totalPages: Math.max(1, Math.ceil(all.length / limit)), tiers, reasons, view: 'priority' });
  }

  const { where, params } = build(true);
  let sql = `SELECT * FROM gtm_leads WHERE ${where}`;

  // Count total
  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as c');
  const countRes = await queryOne(countSql, params);
  const total = parseInt(countRes?.c || 0);

  // Next open follow-up per lead (shown in the table)
  sql = sql.replace('SELECT *', `SELECT gtm_leads.*, ${NEXT_FU}`);
  const sortOrder = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
  const PRIORITY_RANK = "CASE gtm_leads.priority WHEN 'HOT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'PARTNER' THEN 3 ELSE 4 END";
  if (showDeleted) sql += ' ORDER BY deleted_at DESC';
  else if (achieved === '1') sql += ` ORDER BY achieved_at ${sortOrder}`;
  else if (searchParams.get('sort') === 'priority') sql += ` ORDER BY ${PRIORITY_RANK} ASC, COALESCE(last_contacted_at, created_at) ASC`;
  else sql += ` ORDER BY created_at ${sortOrder}`;
  params.push(limit); sql += ` LIMIT $${params.length}`;
  params.push(offset); sql += ` OFFSET $${params.length}`;

  const leads = await queryAll(sql, params);
  return NextResponse.json({ leads, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
}

export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await request.json();
  if (!b.company_name?.trim()) return NextResponse.json({ error: 'Company name required' }, { status: 400 });
  const dedup = `${b.company_name.trim().toLowerCase()}_${(b.city||'').toLowerCase()}`;
  const existing = await queryOne('SELECT id FROM gtm_leads WHERE dedup_key = $1 AND deleted_at IS NULL', [dedup]);
  if (existing) return NextResponse.json({ error: 'Duplicate lead' }, { status: 409 });

  // The comment written when the lead is added is its first comment: kept on the lead (notes) and logged
  // as the first entry of its history; it is also the "last comment" until someone writes another one.
  const comment = (typeof b.comment === 'string' && b.comment.trim() ? b.comment : (b.notes || '')).trim().slice(0, 1000);
  b.notes = (b.notes || '').trim() || comment;
  const seq = await nextProjectSeq(b.project_id || null);
  const result = await query(
    `INSERT INTO gtm_leads (company_name,domain,sector,priority,status,city,region,country,company_size,pain_point,decision_maker_title,phone,email,contact_method,source_url,find_instructions,notes,dedup_key,created_by,project_id,mobile_personal,project_seq,telegram,max_messenger,whatsapp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING id`,
    [b.company_name.trim(),b.domain||'',b.sector||'other',b.priority||'MEDIUM',b.status||'not_contacted',b.city||'',b.region||'',b.country||'',b.company_size||'',b.pain_point||'',b.decision_maker_title||'',b.phone||'',b.email||'',b.contact_method||'',b.source_url||'',b.find_instructions||'',b.notes||'',dedup,user.id,b.project_id||null,b.mobile_personal||'',seq,b.telegram||'',b.max_messenger||'',b.whatsapp||'']
  );
  const created = { id: result.rows[0].id, company_name: b.company_name.trim(), project_id: b.project_id || null, project_seq: seq };
  await logLeadActivity(user, created, `Added lead "${b.company_name}"`, { kind: 'create', comment, source: 'manual' });
  // Added straight into "Follow Up Later" with a date: schedule the follow-up too
  if (b.status === 'follow_up_later' && b.followup_at) {
    await createFollowup({ user, lead: created, title: b.followup_title || 'Follow up later', note: comment, dueAt: b.followup_at, tz: b.tz });
  }

  return NextResponse.json({ id: result.rows[0].id, project_seq: seq });
}

// Bulk status / template update
export async function PATCH(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { ids, status, template_id, achieved, comment: rawComment, followup_at, followup_title, tz } = await request.json();
  const comment = typeof rawComment === 'string' ? rawComment.trim().slice(0, 1000) : '';
  if (!ids?.length) return NextResponse.json({ error: 'ids required' }, { status: 400 });
  if (!status && template_id === undefined && typeof achieved !== 'boolean') return NextResponse.json({ error: 'status, template_id or achieved required' }, { status: 400 });

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');

  // Bulk "Mark as achieved" / "Move back to working list"
  if (typeof achieved === 'boolean') {
    const leads = await queryAll(`SELECT id, company_name, project_id, project_seq, created_by, achieved_at FROM gtm_leads WHERE deleted_at IS NULL AND id IN (${placeholders})`, ids);
    const changed = leads.filter(l => achieved ? !l.achieved_at : !!l.achieved_at);
    const kind = achieved ? 'achieved' : 'unachieved';
    for (const l of changed) {
      if (achieved) await query('UPDATE gtm_leads SET achieved_at = $1, achieved_by = $2, achieved_by_name = $3, achieve_comment = $4 WHERE id = $5', [new Date().toISOString(), user.id, user.name, comment, l.id]);
      else await query("UPDATE gtm_leads SET achieved_at = NULL, achieved_by = NULL, achieved_by_name = '', achieve_comment = '' WHERE id = $1", [l.id]);
      await logLeadActivity(user, l, achieved ? `Marked "${l.company_name}" as achieved (bulk)` : `Moved "${l.company_name}" back from Achieved (bulk)`, { kind, comment, bulk: true }, { notify: false });
    }
    if (changed.length) notifyBulk(user, changed, () => ({ kind, comment, bulk: true }), achieved ? 'bulk achieved' : 'bulk unachieved');
    return NextResponse.json({ updated: changed.length });
  }

  if (status) {
    // Per-lead history so each lead's log (and its watchers) shows the bulk change
    const before = await queryAll(`SELECT id, status, company_name, project_id, project_seq, created_by FROM gtm_leads WHERE id IN (${placeholders})`, ids);
    const changed = [];
    await query(`UPDATE gtm_leads SET status = $${ids.length + 1}, updated_at = NOW()${status !== 'not_contacted' ? ', last_contacted_at = NOW()' : ''} WHERE id IN (${placeholders})`, [...ids, status]);
    for (const l of before) {
      if (l.status !== status) {
        await query('INSERT INTO gtm_lead_status_history (lead_id, old_status, new_status, changed_by, changed_by_name, note) VALUES ($1,$2,$3,$4,$5,$6)', [l.id, l.status, status, user.id, user.name, comment]);
        // logged per lead, but notified once per person below (a digest, not one email per lead)
        await logLeadActivity(user, l, `Changed status: ${l.status} → ${status} (bulk)`, { kind: 'status', comment, from: l.status, to: status, bulk: true }, { notify: false });
        if (status === 'follow_up_later' && followup_at) {
          await createFollowup({ user, lead: l, title: followup_title || 'Follow up later', note: comment, dueAt: followup_at, tz, notify: false });
        }
        changed.push(l);
      }
    }
    if (changed.length) notifyBulk(user, changed, (l) => ({ kind: 'status', comment, from: l.status, to: status, bulk: true }), 'bulk status');
    await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type) VALUES ($1,$2,$3,$4,$5,$6)',
      [user.id, user.name, user.role, `Bulk updated ${ids.length} leads to "${status}"`, 'lead', 'lead']);
  }

  if (template_id !== undefined) {
    const leads = await queryAll(`SELECT id, company_name, project_id, project_seq, created_by FROM gtm_leads WHERE id IN (${placeholders})`, ids);
    await query(`UPDATE gtm_leads SET last_template_id = $${ids.length + 1}, updated_at = NOW() WHERE id IN (${placeholders})`, [...ids, template_id]);
    const tpl = template_id ? await queryOne('SELECT name FROM gtm_templates WHERE id = $1', [template_id]) : null;
    for (const l of leads) {
      await logLeadActivity(user, l, tpl ? `Assigned template "${tpl.name}" (bulk)` : 'Cleared template (bulk)', { kind: 'template', comment, template: tpl?.name || null, bulk: true }, { notify: false });
    }
    if (leads.length) notifyBulk(user, leads, () => ({ kind: 'template', comment, template: tpl?.name || null, bulk: true }), 'bulk template');
    await query('INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type) VALUES ($1,$2,$3,$4,$5,$6)',
      [user.id, user.name, user.role, `Bulk assigned template to ${ids.length} leads`, 'lead', 'lead']);
  }

  return NextResponse.json({ updated: ids.length });
}
