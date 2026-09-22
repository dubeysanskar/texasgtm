import { NextResponse } from 'next/server';
const XLSX = require('xlsx');
const { queryOne, queryAll, query, nextProjectSeq } = require('@/lib/db');
const { getUserFromRequest, isManager } = require('@/lib/auth');

const { autoMapColumns, normalizeLeadValues, validateRow, MSG } = require('@/lib/lead-fields');

/**
 * POST /api/leads/upload — Parse uploaded Excel/CSV, validate, return preview
 */
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let lang = 'en';

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const customMapping = formData.get('mapping'); // Optional JSON string of {header: field}
    const projectId = formData.get('project_id');
    lang = formData.get('lang') === 'ru' ? 'ru' : 'en';

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rawData.length) return NextResponse.json({ error: lang === 'ru' ? 'Файл пуст' : 'File is empty' }, { status: 400 });
    if (rawData.length > 5000) return NextResponse.json({ error: lang === 'ru' ? 'Максимум 5000 строк за одну загрузку' : 'Max 5000 rows per upload' }, { status: 400 });

    // Get headers and auto-map
    const headers = Object.keys(rawData[0]);
    let mapping = customMapping ? JSON.parse(customMapping) : autoMapColumns(headers);

    // Map raw rows to lead fields
    const leads = rawData.map((raw, idx) => {
      const lead = {};
      for (const [header, field] of Object.entries(mapping)) {
        if (raw[header] !== undefined && raw[header] !== '') {
          lead[field] = String(raw[header]).trim();
        }
      }
      // Russian (or English) labels for sector / priority / status → machine values
      return normalizeLeadValues(lead);
    });

    // Validate all rows
    const preview = leads.map((lead, idx) => {
      const errors = validateRow(lead, lang);
      return { ...lead, _row: idx + 2, _errors: errors, _hasErrors: errors.length > 0 };
    });

    // Check duplicates against DB
    const existingLeads = projectId
      ? await queryAll('SELECT company_name, domain FROM gtm_leads WHERE deleted_at IS NULL AND project_id = $1', [projectId])
      : await queryAll('SELECT company_name, domain FROM gtm_leads WHERE deleted_at IS NULL');
    
    const existingKeys = new Set(existingLeads.map(l => 
      (l.company_name || '').toLowerCase().replace(/[^a-zA-Zа-яА-Я0-9]/g, '') + (l.domain || '').toLowerCase()
    ));

    for (const row of preview) {
      const key = (row.company_name || '').toLowerCase().replace(/[^a-zA-Zа-яА-Я0-9]/g, '') + (row.domain || '').toLowerCase();
      if (existingKeys.has(key)) {
        row._errors.push({ field: 'company_name', msg: MSG[lang].duplicate });
        row._hasErrors = true;
        row._isDuplicate = true;
      }
    }

    const totalErrors = preview.filter(r => r._hasErrors).length;
    const totalDuplicates = preview.filter(r => r._isDuplicate).length;

    return NextResponse.json({
      success: true,
      total: preview.length,
      errors: totalErrors,
      duplicates: totalDuplicates,
      clean: preview.length - totalErrors,
      headers,
      mapping,
      preview,
    });

  } catch (err) {
    console.error('Upload parse error:', err);
    return NextResponse.json({ error: (lang === 'ru' ? 'Не удалось прочитать файл: ' : 'Failed to parse file: ') + err.message }, { status: 500 });
  }
}

/**
 * PUT /api/leads/upload — Confirm import of validated leads
 */
export async function PUT(request) {
  const user = getUserFromRequest(request);
  if (!user || !isManager(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { leads, project_id, skipDuplicates, lang: reqLang } = await request.json();
    const lang = reqLang === 'ru' ? 'ru' : 'en';
    if (!leads || !leads.length) return NextResponse.json({ error: lang === 'ru' ? 'Нет лидов для импорта' : 'No leads provided' }, { status: 400 });

    let added = 0, skipped = 0, errors = 0, firstError = null;
    let seq = await nextProjectSeq(project_id || null);

    for (const rawLead of leads) {
      const lead = normalizeLeadValues(rawLead);
      if (lead._isDuplicate && skipDuplicates) { skipped++; continue; }

      const companyName = (lead.company_name || '').trim();
      if (!companyName || companyName.length < 2) { errors++; continue; }

      const dedupKey = companyName.toLowerCase().replace(/[^a-zA-Zа-яА-Я0-9]/g, '') + (lead.domain || '').toLowerCase();
      
      try {
        const existing = await queryOne('SELECT id FROM gtm_leads WHERE dedup_key = $1', [dedupKey]);
        if (existing) { skipped++; continue; }

        await query(
          `INSERT INTO gtm_leads (company_name, domain, sector, priority, status, city, company_size, pain_point, decision_maker_title, contact_person, phone, email, source_url, notes, scraped_from, dedup_key, created_by, project_id, mobile_personal, find_instructions, project_seq, telegram, max_messenger)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            companyName,
            lead.domain || '',
            lead.sector || 'general',
            (lead.priority || 'MEDIUM').toUpperCase(),
            (lead.status || 'not_contacted').toLowerCase(),
            lead.city || '',
            lead.company_size || '',
            lead.pain_point || '',
            lead.decision_maker_title || '',
            lead.contact_person || '',
            lead.phone || '',
            lead.email || '',
            lead.source_url || '',
            lead.notes || '',
            'bulk_upload',
            dedupKey,
            user.id,
            project_id || null,
            lead.mobile_personal || '',
            lead.find_instructions || '',
            seq,
            lead.telegram || '',
            lead.max_messenger || '',
          ]
        );
        seq++;
        added++;
      } catch (err) {
        console.error('Insert error:', err.message);
        if (!firstError) firstError = err.message;
        errors++;
      }
    }

    // Log the upload
    try {
      await query(
        `INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, metadata, project_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [user.id, user.name || 'System', user.role || '', `Bulk upload: ${added} added, ${skipped} skipped, ${errors} errors`, 'leads', JSON.stringify({ added, skipped, errors, total: leads.length }), project_id || null]
      );
    } catch (e) { console.error('[upload] activity log failed:', e.message); }

    return NextResponse.json({ success: true, added, skipped, errors, total: leads.length, error_sample: firstError });

  } catch (err) {
    console.error('Upload confirm error:', err);
    return NextResponse.json({ error: 'Import failed: ' + err.message }, { status: 500 });
  }
}
