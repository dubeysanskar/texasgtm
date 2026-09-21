import { NextResponse } from 'next/server';
const fs = require('fs');
const path = require('path');
const { queryOne } = require('@/lib/db');
const { getUserFromRequest, isStaff } = require('@/lib/auth');

const UPLOAD_ROOT = path.join(process.cwd(), 'data', 'uploads', 'daily');

// GET /api/daily-updates/files/[fileId] — stream an attached file (any signed-in team member)
export async function GET(request, { params }) {
  const user = getUserFromRequest(request);
  if (!user || !isStaff(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { fileId } = await params;
  const file = await queryOne('SELECT * FROM gtm_daily_update_files WHERE id = $1', [fileId]);
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const full = path.join(UPLOAD_ROOT, String(file.update_id), file.filename);
  if (!full.startsWith(UPLOAD_ROOT) || !fs.existsSync(full)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const buf = fs.readFileSync(full);
  const inline = (file.mime || '').startsWith('image/') || file.mime === 'application/pdf';
  const utf8Name = encodeURIComponent(file.original_name || file.filename);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': file.mime || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${(file.original_name || file.filename).replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${utf8Name}`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
