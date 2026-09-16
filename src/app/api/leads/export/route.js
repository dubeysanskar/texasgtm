import { NextResponse } from 'next/server';
const { queryAll } = require('@/lib/db');
const { getUserFromRequest, isManager } = require('@/lib/auth');
const { SECTOR_LABELS, STATUS_LABELS, PRIORITY_LABELS } = require('@/lib/lead-fields');

const HEADERS = {
  en: ['#', 'Company', 'Domain', 'Sector', 'City/Region', 'Size', 'Why They Need Workers', 'Decision Maker', 'Contact Person', 'Contact Method', 'Phone', 'Email', 'Where to Find', 'Priority', 'Status', 'Last Contacted', 'Notes'],
  ru: ['№', 'Компания', 'Сайт', 'Отрасль', 'Город/Регион', 'Размер', 'Зачем нужны работники', 'ЛПР', 'Контактное лицо', 'Способ связи', 'Телефон', 'Email', 'Где найти', 'Приоритет', 'Статус', 'Последний контакт', 'Заметки'],
};
const SHEETS = { en: ['All Leads', 'HOT Leads'], ru: ['Все лиды', 'Горячие лиды'] };

/**
 * POST /api/leads/export
 * Body: { leadIds?: number[], project_id?: number, lang?: 'en'|'ru' }
 */
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const XLSX = require('xlsx');

  let body = {};
  try { body = await request.json(); } catch {}
  const lang = body.lang === 'ru' ? 'ru' : 'en';

  let leads;
  if (body.leadIds && body.leadIds.length) {
    const placeholders = body.leadIds.map((_, i) => `$${i + 1}`).join(',');
    leads = await queryAll(`SELECT * FROM gtm_leads WHERE id IN (${placeholders}) ORDER BY priority, created_at DESC`, body.leadIds);
  } else if (body.project_id) {
    leads = await queryAll('SELECT * FROM gtm_leads WHERE project_id = $1 ORDER BY priority, created_at DESC', [body.project_id]);
  } else {
    leads = await queryAll('SELECT * FROM gtm_leads ORDER BY priority, created_at DESC');
  }

  const sector = (v) => SECTOR_LABELS[lang][v] || SECTOR_LABELS.en[v] || v || '';
  const status = (v) => STATUS_LABELS[lang][v] || STATUS_LABELS.en[v] || v || '';
  const priority = (v) => PRIORITY_LABELS[lang][v] || v || '';
  const date = (v) => v ? new Date(v).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB') : '';

  const toRow = (lead, i) => [
    i + 1, lead.company_name, lead.domain || '',
    sector(lead.sector),
    [lead.city, lead.region].filter(Boolean).join(', '),
    lead.company_size || '', lead.pain_point || '', lead.decision_maker_title || '', lead.contact_person || '',
    lead.contact_method || '', lead.phone || '', lead.email || '',
    lead.find_instructions || '', priority(lead.priority),
    status(lead.status),
    date(lead.last_contacted_at),
    lead.notes || '',
  ];

  const cols = [{ wch: 4 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 10 }, { wch: 42 }, { wch: 24 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 28 }, { wch: 28 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 30 }];

  const ws = XLSX.utils.aoa_to_sheet([HEADERS[lang], ...leads.map(toRow)]);
  ws['!cols'] = cols;
  const hot = leads.filter(l => l.priority === 'HOT');
  const ws2 = XLSX.utils.aoa_to_sheet([HEADERS[lang], ...hot.map(toRow)]);
  ws2['!cols'] = cols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEETS[lang][0]);
  XLSX.utils.book_append_sheet(wb, ws2, SHEETS[lang][1]);

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const stamp = new Date().toISOString().split('T')[0];
  const filename = lang === 'ru' ? `GTM_CRM_Lidy_${stamp}.xlsx` : `GTM_CRM_Leads_${stamp}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
