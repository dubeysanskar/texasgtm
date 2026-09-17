import { NextResponse } from 'next/server';
const { queryOne, queryAll, query } = require('@/lib/db');
const { getUserFromRequest, isAdmin } = require('@/lib/auth');
const { enrichLeadContacts } = require('@/lib/scraper');

/**
 * POST /api/leads/enrich
 * 
 * Body: {
 *   mode: 'missing' | 'force_all' | 'selected' | 'bad_only',
 *   leadIds?: number[],       // for mode='selected'
 *   maxLeads?: number,        // max leads to process
 *   rangeFrom?: number,       // start lead ID (for range filtering)
 *   rangeTo?: number,         // end lead ID (for range filtering)
 * }
 */
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { mode = 'missing', leadIds, maxLeads = 200, rangeFrom, rangeTo } = await request.json();
  const apiKey2GIS = process.env.TWOGIS_API_KEY || null;
  const force = mode === 'force_all' || mode === 'selected';

  let leads = [];

  if (mode === 'selected' && leadIds?.length) {
    // Specific lead IDs
    const placeholders = leadIds.map((_, i) => `$${i + 1}`).join(',');
    leads = await queryAll(`SELECT * FROM gtm_leads WHERE deleted_at IS NULL AND id IN (${placeholders})`, leadIds);

  } else if (rangeFrom && rangeTo) {
    // Range filter: leads between ID rangeFrom and rangeTo
    if (mode === 'force_all') {
      leads = await queryAll(
        `SELECT * FROM gtm_leads WHERE deleted_at IS NULL AND id >= $1 AND id <= $2 ORDER BY id LIMIT $3`,
        [rangeFrom, rangeTo, maxLeads]
      );
    } else {
      leads = await queryAll(
        `SELECT * FROM gtm_leads WHERE deleted_at IS NULL AND id >= $1 AND id <= $2 AND (email IS NULL OR email = '' OR phone IS NULL OR phone = '') ORDER BY id LIMIT $3`,
        [rangeFrom, rangeTo, maxLeads]
      );
    }

  } else if (mode === 'force_all') {
    leads = await queryAll(
      `SELECT * FROM gtm_leads WHERE deleted_at IS NULL ORDER BY id LIMIT $1`,
      [maxLeads]
    );

  } else {
    // Only missing
    leads = await queryAll(
      `SELECT * FROM gtm_leads WHERE deleted_at IS NULL AND (email IS NULL OR email = '' OR phone IS NULL OR phone = '') ORDER BY id LIMIT $1`,
      [maxLeads]
    );
  }

  if (leads.length === 0) {
    return NextResponse.json({ total: 0, enriched: 0, emails_found: 0, phones_found: 0, failed: 0, changes: [], message: 'No leads to enrich' });
  }

  // Create tracking job
  const rangeLabel = rangeFrom && rangeTo ? ` (IDs ${rangeFrom}-${rangeTo})` : '';
  const job = await query(
    "INSERT INTO gtm_scrape_jobs (source, query, status, started_at, created_by) VALUES ($1, $2, 'running', NOW(), $3) RETURNING id",
    ['enrichment', `${force ? 'Force' : 'Missing'}: ${leads.length} leads${rangeLabel}`, user.id]
  );
  const jobId = job.rows[0].id;

  let enriched = 0, emailsFound = 0, phonesFound = 0, failed = 0;
  const changes = []; // Track what changed for UI

  try {
    for (const lead of leads) {
      try {
        // 15s timeout per lead to prevent one slow site from stalling the batch
        const result = await Promise.race([
          enrichLeadContacts(lead, apiKey2GIS, force),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout (15s)')), 15000))
        ]);

        const hasNewEmail = result.email && result.email !== lead.email;
        const hasNewPhone = result.phone && result.phone !== lead.phone;
        const hasNewDomain = result.domain && result.domain !== lead.domain;
        const hasNewSize = result.company_size && result.company_size !== lead.company_size;

        if (hasNewEmail || hasNewPhone || hasNewDomain || hasNewSize) {
          const updates = [];
          const params = [];
          let paramIdx = 1;

          if (hasNewEmail) { updates.push(`email = $${paramIdx++}`); params.push(result.email); emailsFound++; }
          if (hasNewPhone) { updates.push(`phone = $${paramIdx++}`); params.push(result.phone); phonesFound++; }
          if (hasNewDomain) { updates.push(`domain = $${paramIdx++}`); params.push(result.domain); }
          if (hasNewSize) { updates.push(`company_size = $${paramIdx++}`); params.push(result.company_size); }
          updates.push(`updated_at = NOW()`);
          updates.push(`notes = COALESCE(notes, '') || $${paramIdx++}`);
          params.push(` | Enriched via: ${[...new Set(result.source_used)].join(', ')}`);

          params.push(lead.id);
          await query(`UPDATE gtm_leads SET ${updates.join(', ')} WHERE id = $${paramIdx}`, params);
          enriched++;

          // Track change for UI (limit to 50 for response size)
          if (changes.length < 50) {
            changes.push({
              id: lead.id,
              company: lead.company_name,
              old_email: lead.email || '(empty)',
              new_email: hasNewEmail ? result.email : lead.email,
              old_phone: lead.phone || '(empty)',
              new_phone: hasNewPhone ? result.phone : lead.phone,
              sources: [...new Set(result.source_used)],
            });
          }
        }
      } catch (e) {
        console.error(`[enrich] Lead #${lead.id} (${lead.company_name}) error:`, e.message);
        failed++;
      }

      await new Promise(r => setTimeout(r, 50));
    }

    await query("UPDATE gtm_scrape_jobs SET status = 'completed', leads_found = $1, leads_added = $2, leads_skipped = $3, completed_at = NOW() WHERE id = $4",
      [leads.length, enriched, failed, jobId]);

    return NextResponse.json({ total: leads.length, enriched, emails_found: emailsFound, phones_found: phonesFound, failed, changes });

  } catch (err) {
    console.error('[enrich] job failed:', err);
    await query("UPDATE gtm_scrape_jobs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2", [err.message, jobId]);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** GET /api/leads/enrich — enrichment statistics */
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const pid = searchParams.get('project_id');
  const pf = pid ? ` AND project_id = ${parseInt(pid)}` : '';

  const total = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL${pf}`);
  const missingEmail = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL AND (email IS NULL OR email = '')${pf}`);
  const missingPhone = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL AND (phone IS NULL OR phone = '')${pf}`);
  const missingBoth = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL AND (email IS NULL OR email = '') AND (phone IS NULL OR phone = '')${pf}`);
  const hasEmail = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL AND email IS NOT NULL AND email != ''${pf}`);
  const hasPhone = await queryOne(`SELECT COUNT(*) as c FROM gtm_leads WHERE deleted_at IS NULL AND phone IS NOT NULL AND phone != ''${pf}`);
  const minId = await queryOne(`SELECT MIN(id) as v FROM gtm_leads WHERE deleted_at IS NULL${pf}`);
  const maxId = await queryOne(`SELECT MAX(id) as v FROM gtm_leads WHERE deleted_at IS NULL${pf}`);

  return NextResponse.json({
    total: parseInt(total?.c || 0),
    missing_email: parseInt(missingEmail?.c || 0),
    missing_phone: parseInt(missingPhone?.c || 0),
    missing_both: parseInt(missingBoth?.c || 0),
    has_email: parseInt(hasEmail?.c || 0),
    has_phone: parseInt(hasPhone?.c || 0),
    min_id: parseInt(minId?.v || 0),
    max_id: parseInt(maxId?.v || 0),
  });
}
