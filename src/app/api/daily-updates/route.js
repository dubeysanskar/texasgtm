import { NextResponse } from 'next/server';
const fs = require('fs');
const path = require('path');
const { queryOne, queryAll, query } = require('@/lib/db');
const { getUserFromRequest, isStaff } = require('@/lib/auth');
const { normalizeDate, todayInTz, getProjectTimezone } = require('@/lib/tz');

const UPLOAD_ROOT = path.join(process.cwd(), 'data', 'uploads', 'daily');
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_FILES = 6;
const BLOCKED_EXT = /\.(exe|bat|cmd|sh|ps1|com|msi|scr|js|vbs|jar)$/i;

function safeName(name) {
  return String(name || 'file').replace(/[\\/]/g, '_').replace(/[^\w.\-А-Яа-яЁё ]/g, '_').slice(-150) || 'file';
}

async function attachFiles(rows) {
  if (!rows.length) return rows;
  const ids = rows.map(r => r.id);
  const files = await queryAll(`SELECT id, update_id, filename, original_name, size, mime FROM gtm_daily_update_files WHERE update_id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids);
  const byUpdate = {};
  for (const f of files) (byUpdate[f.update_id] ||= []).push(f);
  return rows.map(r => ({ ...r, files: byUpdate[r.id] || [] }));
}

// GET /api/daily-updates?project_id=&from=YYYY-MM-DD&to=YYYY-MM-DD (default: current month, in the
// project's timezone) — the full range powers the calendar's day dots; the client groups by work_date.
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = new URL(request.url).searchParams;
  const projectId = sp.get('project_id') ? Number(sp.get('project_id')) : null;
  const tz = await getProjectTimezone(projectId);
  const today = todayInTz(tz);
  const from = sp.get('from') ? normalizeDate(sp.get('from'), tz) : today.slice(0, 8) + '01';
  const to = sp.get('to') ? normalizeDate(sp.get('to'), tz) : today;

  let sql = "SELECT u.*, gu.name AS author_name FROM gtm_daily_updates u LEFT JOIN gtm_users gu ON gu.id = u.user_id WHERE u.work_date >= $1 AND u.work_date <= $2";
  const params = [from, to];
  if (projectId) { params.push(projectId); sql += ` AND u.project_id = $${params.length}`; }
  sql += ' ORDER BY u.work_date DESC, u.created_at DESC LIMIT 500';
  const rows = await queryAll(sql, params);
  return NextResponse.json({ updates: await attachFiles(rows), today, timezone: tz });
}

// POST /api/daily-updates — multipart/form-data: project_id, text, work_date? (defaults to today in
// the project's timezone), files (0-6, up to 15MB each)
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const form = await request.formData();
  const projectId = form.get('project_id') ? Number(form.get('project_id')) : null;
  const text = String(form.get('text') || '').trim().slice(0, 4000);
  const files = form.getAll('files').filter(f => f && typeof f === 'object' && f.size !== undefined);
  if (!text && !files.length) return NextResponse.json({ error: 'Write something or attach a file' }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Max ${MAX_FILES} files` }, { status: 400 });
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) return NextResponse.json({ error: `"${f.name}" is over 15MB` }, { status: 400 });
    if (BLOCKED_EXT.test(f.name || '')) return NextResponse.json({ error: `"${f.name}" file type is not allowed` }, { status: 400 });
  }

  const tz = await getProjectTimezone(projectId);
  const workDate = normalizeDate(form.get('work_date'), tz);
  const row = await queryOne(
    'INSERT INTO gtm_daily_updates (project_id, user_id, user_name, work_date, text, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [projectId, user.id, user.name, workDate, text, new Date().toISOString()]
  );

  if (files.length) {
    const dir = path.join(UPLOAD_ROOT, String(row.id));
    fs.mkdirSync(dir, { recursive: true });
    for (const f of files) {
      const stored = `${Date.now()}_${safeName(f.name)}`;
      fs.writeFileSync(path.join(dir, stored), Buffer.from(await f.arrayBuffer()));
      await query('INSERT INTO gtm_daily_update_files (update_id, filename, original_name, size, mime, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [row.id, stored, f.name || stored, f.size || 0, f.type || '', new Date().toISOString()]);
    }
  }

  return NextResponse.json({ id: row.id, work_date: workDate }, { status: 201 });
}
