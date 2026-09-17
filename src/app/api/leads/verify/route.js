import { NextResponse } from 'next/server';
const { queryAll } = require('@/lib/db');
const { getUserFromRequest, isAdmin } = require('@/lib/auth');
const { analyzeEmailQuality, validateEmail, verifyEmailExistsSMTP } = require('@/lib/scraper');

// Generic email prefixes that are useless for outreach
const GENERIC_PREFIXES = ['info', 'hr', 'admin', 'support', 'contact', 'office', 'mail', 'sales', 'marketing', 'noreply', 'no-reply', 'help', 'feedback', 'webmaster', 'postmaster', 'service', 'reception', 'secretary', 'general', 'enquiry', 'inquiry', 'press', 'media', 'vacancy', 'job', 'career', 'careers', 'hiring', 'recruit', 'priemka', 'otdel', 'kadry'];

function classifyEmail(email) {
  if (!email || !email.trim()) return { type: 'empty', label: 'No email' };
  const e = email.trim().toLowerCase();
  if (e.includes('/') || e.includes(' ') || !e.includes('@')) return { type: 'invalid', label: 'Invalid format' };
  const prefix = e.split('@')[0];
  if (GENERIC_PREFIXES.includes(prefix)) return { type: 'generic', label: `Generic "${prefix}@" — won't reach decision maker` };
  if (/^(test|example|demo|tmp)/.test(prefix)) return { type: 'placeholder', label: 'Placeholder email' };
  return { type: 'personal', label: 'Looks like a real contact' };
}

/**
 * GET /api/leads/verify — Comprehensive quality scan
 */
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const pid = searchParams.get('project_id');
  const pf = pid ? ` WHERE project_id = ${parseInt(pid)}` : '';

  const leads = await queryAll(`SELECT id, email, domain, company_name FROM gtm_leads WHERE deleted_at IS NULL${pf ? pf.replace(' WHERE ', ' AND ') : ''} ORDER BY id`);

  const stats = {
    total: leads.length,
    personal: 0,      // Real person emails (good for outreach)
    generic: 0,       // info@, hr@, etc (useless for outreach)
    invalid_format: 0, // Broken format
    placeholder: 0,
    empty: 0,
    no_domain: 0,
    good_total: 0,     // personal only
    bad_total: 0,      // generic + invalid + placeholder + empty
    generic_breakdown: {}, // Count per prefix (info: 173, hr: 240, etc)
  };

  const badLeadIds = [];

  for (const lead of leads) {
    const cls = classifyEmail(lead.email);

    if (cls.type === 'empty') { stats.empty++; badLeadIds.push(lead.id); }
    else if (cls.type === 'invalid') { stats.invalid_format++; badLeadIds.push(lead.id); }
    else if (cls.type === 'placeholder') { stats.placeholder++; badLeadIds.push(lead.id); }
    else if (cls.type === 'generic') {
      stats.generic++;
      badLeadIds.push(lead.id);
      const prefix = lead.email.trim().toLowerCase().split('@')[0];
      stats.generic_breakdown[prefix] = (stats.generic_breakdown[prefix] || 0) + 1;
    }
    else { stats.personal++; }

    if (!lead.domain || !lead.domain.trim() || lead.domain.includes('/')) stats.no_domain++;
  }

  stats.good_total = stats.personal;
  stats.bad_total = stats.generic + stats.invalid_format + stats.placeholder + stats.empty;
  stats.bad_lead_ids = badLeadIds;

  return NextResponse.json(stats);
}

/**
 * POST /api/leads/verify — Deep verification with MX + SMTP
 */
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { maxLeads = 100, offset = 0, smtpCheck = false } = await request.json();

  const leads = await queryAll(
    "SELECT id, email, domain, company_name FROM gtm_leads WHERE deleted_at IS NULL AND email IS NOT NULL AND email != '' ORDER BY id LIMIT $1 OFFSET $2",
    [maxLeads, offset]
  );

  const results = {
    total_checked: leads.length,
    personal: 0,
    generic: 0,
    invalid_format: 0,
    no_mx: 0,
    placeholder: 0,
    suspicious: 0,
    domain_mismatch: 0,
    smtp_exists: 0,
    smtp_not_exists: 0,
    smtp_unknown: 0,
    details: [],
  };

  for (const lead of leads) {
    try {
      const cls = classifyEmail(lead.email);

      // If it's generic, flag it immediately
      if (cls.type === 'generic') {
        results.generic++;
        results.details.push({ id: lead.id, company: lead.company_name, email: lead.email, domain: lead.domain, status: 'generic', reason: cls.label });
        continue;
      }
      if (cls.type === 'invalid') {
        results.invalid_format++;
        results.details.push({ id: lead.id, company: lead.company_name, email: lead.email, domain: lead.domain, status: 'invalid', reason: cls.label });
        continue;
      }

      // MX analysis
      const analysis = await analyzeEmailQuality(lead.email, lead.domain);

      // SMTP check if requested
      let smtpResult = null;
      if (smtpCheck && analysis.status === 'valid') {
        try {
          smtpResult = await verifyEmailExistsSMTP(lead.email);
          if (smtpResult.exists === true) results.smtp_exists++;
          else if (smtpResult.exists === false) results.smtp_not_exists++;
          else results.smtp_unknown++;
        } catch { smtpResult = { exists: 'unknown', reason: 'SMTP check failed' }; results.smtp_unknown++; }
      }

      let finalStatus = analysis.status;
      let finalReason = analysis.reason;
      if (smtpResult && smtpResult.exists === false) { finalStatus = 'not_exists'; finalReason = `SMTP: ${smtpResult.reason}`; }

      if (finalStatus === 'valid') { results.personal++; }
      else {
        results[finalStatus] = (results[finalStatus] || 0) + 1;
        results.details.push({ id: lead.id, company: lead.company_name, email: lead.email, domain: lead.domain, status: finalStatus, reason: finalReason,
          smtp: smtpResult ? { exists: smtpResult.exists, reason: smtpResult.reason } : null });
      }
    } catch {
      results.details.push({ id: lead.id, company: lead.company_name, email: lead.email, status: 'error', reason: 'Verification failed' });
    }
  }

  const order = { not_exists: 0, no_mx: 1, invalid: 2, generic: 3, placeholder: 4, domain_mismatch: 5, suspicious: 6 };
  results.details.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

  return NextResponse.json(results);
}
