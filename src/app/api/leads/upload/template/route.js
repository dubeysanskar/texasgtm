import { NextResponse } from 'next/server';
const XLSX = require('xlsx');
const { getUserFromRequest } = require('@/lib/auth');
const { LEAD_FIELDS, HEADERS, SAMPLE_ROW, fieldGuide } = require('@/lib/lead-fields');

/**
 * GET /api/leads/upload/template?lang=en|ru
 * Download an Excel template with column headers + 1 sample row + a field guide sheet,
 * fully in the requested language (Russian projects get Russian headers, sample and guide).
 */
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const lang = searchParams.get('lang') === 'ru' ? 'ru' : 'en';
  const headers = LEAD_FIELDS.map(f => HEADERS[lang][f]);
  const sample = LEAD_FIELDS.map(f => SAMPLE_ROW[lang][f] || '');

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(String(h).length + 4, 20) }));
  XLSX.utils.book_append_sheet(wb, ws, lang === 'ru' ? 'Лиды' : 'Leads');

  const guide = fieldGuide(lang);
  const helpWs = XLSX.utils.aoa_to_sheet(guide.rows);
  helpWs['!cols'] = guide.widths;
  XLSX.utils.book_append_sheet(wb, helpWs, guide.sheet);

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = lang === 'ru' ? 'shablon_zagruzki_lidov.xlsx' : 'lead_upload_template.xlsx';
  const utf8Name = lang === 'ru' ? encodeURIComponent('Шаблон_загрузки_лидов.xlsx') : filename;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${utf8Name}`,
    },
  });
}
