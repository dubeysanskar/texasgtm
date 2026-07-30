import { NextResponse } from 'next/server';
const XLSX = require('xlsx');
const { queryOne, queryAll, query } = require('@/lib/db');
const { getUserFromRequest, isAdmin } = require('@/lib/auth');

const VALID_STATUSES = ['not_contacted','touch_1','touch_2','touch_3','email_sent','call_made','replied','meeting_booked','proposal_sent','negotiating','contract_signed','not_interested','follow_up_later'];
const VALID_PRIORITIES = ['HOT','HIGH','MEDIUM','PARTNER'];
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_RE = /^[+\d\s\-()]{6,20}$/;

// Known column name aliases → standard field names
const COLUMN_ALIASES = {
  company_name: ['company_name', 'company', 'company name', 'organization', 'org', 'business', 'business name', 'name'],
  email: ['email', 'email address', 'e-mail', 'mail', 'contact email'],
  phone: ['phone', 'phone number', 'telephone', 'tel', 'mobile', 'contact phone', 'cell'],
  city: ['city', 'location', 'town', 'area'],
  domain: ['domain', 'website domain', 'web domain'],
  sector: ['sector', 'industry', 'type', 'category', 'business type'],
  company_size: ['company_size', 'company size', 'size', 'employees', 'staff', 'headcount'],
  decision_maker_title: ['decision_maker_title', 'decision maker title', 'title', 'position', 'job title', 'designation'],
  contact_person: ['contact_person', 'contact person', 'contact name', 'contact', 'person', 'poc', 'point of contact'],
  pain_point: ['pain_point', 'pain point', 'need', 'requirement', 'challenge'],
  notes: ['notes', 'note', 'remarks', 'comments', 'description'],
  source_url: ['source_url', 'source url', 'source', 'url', 'link', 'website'],
  priority: ['priority', 'lead priority', 'importance'],
  status: ['status', 'lead status', 'stage', 'state'],
};

function autoMapColumns(headers) {
  const mapping = {};
  const usedFields = new Set();
  for (const header of headers) {
    const h = header.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (usedFields.has(field)) continue;
      if (aliases.includes(h)) {
        mapping[header] = field;
        usedFields.add(field);
        break;
      }
    }
  }
  return mapping;
}

function validateRow(row, idx) {
  const errors = [];
  if (!row.company_name || String(row.company_name).trim().length < 2) {
    errors.push({ field: 'company_name', msg: 'Company name is required (min 2 chars)' });
  }
  if (row.company_name && String(row.company_name).length > 120) {
    errors.push({ field: 'company_name', msg: 'Company name too long (max 120 chars)' });
  }
  if (row.email && !EMAIL_RE.test(String(row.email).trim())) {
    errors.push({ field: 'email', msg: 'Invalid email format' });
  }
  if (row.phone && !PHONE_RE.test(String(row.phone).trim())) {
    errors.push({ field: 'phone', msg: 'Invalid phone format (use +country digits)' });
  }
  if (row.priority && !VALID_PRIORITIES.includes(String(row.priority).toUpperCase().trim())) {
    errors.push({ field: 'priority', msg: `Invalid priority. Use: ${VALID_PRIORITIES.join(', ')}` });
  }
  if (row.status && !VALID_STATUSES.includes(String(row.status).toLowerCase().trim())) {
    errors.push({ field: 'status', msg: `Invalid status. Use: ${VALID_STATUSES.join(', ')}` });
  }
  return errors;
}

/**
 * POST /api/leads/upload — Parse uploaded Excel/CSV, validate, return preview
 */
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const customMapping = formData.get('mapping'); // Optional JSON string of {header: field}
    const projectId = formData.get('project_id');

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rawData.length) return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    if (rawData.length > 5000) return NextResponse.json({ error: 'Max 5000 rows per upload' }, { status: 400 });

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
      // Include unmapped fields
      for (const header of headers) {
        if (!mapping[header] && raw[header] !== '') {
          // Skip unmapped
        }
      }
      return lead;
    });

    // Validate all rows
    const preview = leads.map((lead, idx) => {
      const errors = validateRow(lead, idx);
      return { ...lead, _row: idx + 2, _errors: errors, _hasErrors: errors.length > 0 };
    });

    // Check duplicates against DB
    const existingLeads = projectId
      ? await queryAll('SELECT company_name, domain FROM gtm_leads WHERE project_id = $1', [projectId])
      : await queryAll('SELECT company_name, domain FROM gtm_leads');
    
    const existingKeys = new Set(existingLeads.map(l => 
      (l.company_name || '').toLowerCase().replace(/[^a-zA-Zа-яА-Я0-9]/g, '') + (l.domain || '').toLowerCase()
    ));

    for (const row of preview) {
      const key = (row.company_name || '').toLowerCase().replace(/[^a-zA-Zа-яА-Я0-9]/g, '') + (row.domain || '').toLowerCase();
      if (existingKeys.has(key)) {
        row._errors.push({ field: 'company_name', msg: 'Duplicate — already exists in leads' });
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
    return NextResponse.json({ error: 'Failed to parse file: ' + err.message }, { status: 500 });
  }
}

/**
 * PUT /api/leads/upload — Confirm import of validated leads
 */
export async function PUT(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  try {
    const { leads, project_id, skipDuplicates } = await request.json();
    if (!leads || !leads.length) return NextResponse.json({ error: 'No leads provided' }, { status: 400 });

    let added = 0, skipped = 0, errors = 0, firstError = null;

    for (const lead of leads) {
      if (lead._isDuplicate && skipDuplicates) { skipped++; continue; }

      const companyName = (lead.company_name || '').trim();
      if (!companyName || companyName.length < 2) { errors++; continue; }

      const dedupKey = companyName.toLowerCase().replace(/[^a-zA-Zа-яА-Я0-9]/g, '') + (lead.domain || '').toLowerCase();
      
      try {
        const existing = await queryOne('SELECT id FROM gtm_leads WHERE dedup_key = $1', [dedupKey]);
        if (existing) { skipped++; continue; }

        await query(
          `INSERT INTO gtm_leads (company_name, domain, sector, priority, status, city, company_size, pain_point, decision_maker_title, contact_person, phone, email, source_url, notes, scraped_from, dedup_key, created_by, project_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
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
          ]
        );
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
