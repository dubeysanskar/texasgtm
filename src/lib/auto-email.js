/**
 * Auto Email Service — Core orchestration module
 * Handles: lead retrieval, template resolution, LLM personalization, email sending
 */
const { queryAll, queryOne, query } = require('@/lib/db');
const { sendMail } = require('@/lib/mailer');

const APP_URL = process.env.APP_URL || process.env.AUTO_EMAIL_TRACKING_DOMAIN || 'http://localhost:3000';

// ─── 1. Lead Retrieval ─────────────────────────────────────────────────────

/**
 * Get eligible leads for a campaign based on its filters
 * Excludes: leads without email, already sent in this campaign, unsubscribed
 */
async function getEligibleLeads(campaignId) {
  const campaign = await queryOne('SELECT * FROM gtm_email_campaigns WHERE id = $1', [campaignId]);
  if (!campaign) throw new Error('Campaign not found');

  const filters = typeof campaign.filters === 'string'
    ? JSON.parse(campaign.filters || '{}')
    : (campaign.filters || {});

  let sql = `
    SELECT l.* FROM gtm_leads l
    WHERE l.deleted_at IS NULL AND l.email IS NOT NULL AND l.email != ''
      AND l.email NOT IN (SELECT email FROM gtm_email_unsubscribes)
      AND l.id NOT IN (
        SELECT lead_id FROM gtm_email_sends
        WHERE campaign_id = $1 AND status NOT IN ('failed')
      )
  `;
  const params = [campaignId];

  // Scope to the campaign's project (if set) so each project emails only its own leads
  if (campaign.project_id) {
    params.push(campaign.project_id);
    sql += ` AND l.project_id = $${params.length}`;
  }

  if (filters.sector) {
    params.push(filters.sector);
    sql += ` AND l.sector = $${params.length}`;
  }
  if (filters.priority) {
    params.push(filters.priority);
    sql += ` AND l.priority = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND l.status = $${params.length}`;
  }
  if (filters.region) {
    params.push(`%${filters.region}%`);
    sql += ` AND (l.region ILIKE $${params.length} OR l.country ILIKE $${params.length})`;
  }
  if (filters.country) {
    params.push(`%${filters.country}%`);
    sql += ` AND l.country ILIKE $${params.length}`;
  }

  sql += ' ORDER BY l.priority DESC, l.created_at DESC';

  return queryAll(sql, params);
}

/**
 * Count eligible leads for a campaign (for preview)
 */
async function countEligibleLeads(filters) {
  let sql = `
    SELECT COUNT(*) as c FROM gtm_leads l
    WHERE l.deleted_at IS NULL AND l.email IS NOT NULL AND l.email != ''
      AND l.email NOT IN (SELECT email FROM gtm_email_unsubscribes)
  `;
  const params = [];

  if (filters.sector) {
    params.push(filters.sector);
    sql += ` AND l.sector = $${params.length}`;
  }
  if (filters.priority) {
    params.push(filters.priority);
    sql += ` AND l.priority = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND l.status = $${params.length}`;
  }
  if (filters.region) {
    params.push(`%${filters.region}%`);
    sql += ` AND (l.region ILIKE $${params.length} OR l.country ILIKE $${params.length})`;
  }
  if (filters.country) {
    params.push(`%${filters.country}%`);
    sql += ` AND l.country ILIKE $${params.length}`;
  }

  const res = await queryOne(sql, params);
  return parseInt(res?.c || 0);
}

// ─── 2. Template Resolution ────────────────────────────────────────────────

/**
 * Resolve a template: fetch it, pick the right language, replace placeholder tokens
 */
async function resolveTemplate(templateId, language, leadData) {
  const template = await queryOne('SELECT * FROM gtm_templates WHERE id = $1', [templateId]);
  if (!template) throw new Error('Template not found');

  let subject = template.subject || '';
  let body = template.body || '';

  // Pick translation if needed
  if (language && language !== (template.language || 'en')) {
    const translations = typeof template.translations === 'string'
      ? JSON.parse(template.translations || '{}')
      : (template.translations || {});
    if (translations[language]) {
      subject = translations[language].subject || subject;
      body = translations[language].body || body;
    }
  }

  // Replace placeholder tokens
  const replacements = {
    '{{company}}': leadData.company_name || '',
    '{{company_name}}': leadData.company_name || '',
    '{{decision_maker}}': leadData.decision_maker_title || '',
    '{{decision_maker_title}}': leadData.decision_maker_title || '',
    '{{city}}': leadData.city || '',
    '{{region}}': leadData.region || '',
    '{{country}}': leadData.country || '',
    '{{sector}}': leadData.sector || '',
    '{{industry}}': leadData.sector || '',
    '{{pain_point}}': leadData.pain_point || '',
    '{{email}}': leadData.email || '',
    '{{phone}}': leadData.phone || '',
    '{{domain}}': leadData.domain || '',
    '{{first_name}}': (leadData.decision_maker_title || '').split(' ')[0] || '',
    '{{company_size}}': leadData.company_size || '',
  };

  for (const [token, value] of Object.entries(replacements)) {
    subject = subject.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'gi'), value);
    body = body.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'gi'), value);
  }

  return { subject, body, templateName: template.name };
}

// ─── 3. LLM Personalization ────────────────────────────────────────────────

/**
 * Call OpenAI API to generate personalized opener + value prop
 * Constrained to fill specific slots — not full email generation
 */
async function personalizeWithLLM(leadData, templateBody) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('[auto-email] No OPENAI_API_KEY set, skipping LLM personalization');
    return { opener: '', valueProp: '' };
  }

  const prompt = `You are an expert B2B sales copywriter. Generate two SHORT personalized sentences for a cold outreach email.

LEAD DATA:
- Company: ${leadData.company_name || 'Unknown'}
- Industry: ${leadData.sector || 'Unknown'}
- City/Region: ${leadData.city || ''} ${leadData.region || ''}
- Company Size: ${leadData.company_size || 'Unknown'}
- Pain Point: ${leadData.pain_point || 'Not specified'}
- Decision Maker: ${leadData.decision_maker_title || 'Unknown'}
- Website: ${leadData.domain || 'Unknown'}

TEMPLATE CONTEXT (for tone matching):
${(templateBody || '').substring(0, 300)}

Generate exactly TWO items in JSON format:
1. "opener" — One personalized opening sentence that references something specific about their business, industry, or region. Make it feel researched, not generic.
2. "valueProp" — One sentence connecting our staffing/workforce solutions to their specific pain point or industry need.

Rules:
- Each sentence must be under 30 words
- Professional but warm tone
- No exclamation marks
- No generic phrases like "I hope this finds you well"
- If data is thin, make industry-specific observations instead
- Match the language of the template context (if Russian, write in Russian, etc.)

Respond ONLY with valid JSON: {"opener": "...", "valueProp": "..."}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[auto-email] OpenAI API error:', err);
      return { opener: '', valueProp: '' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        opener: parsed.opener || '',
        valueProp: parsed.valueProp || parsed.value_prop || '',
      };
    }

    return { opener: '', valueProp: '' };
  } catch (err) {
    console.error('[auto-email] LLM personalization failed:', err.message);
    return { opener: '', valueProp: '' };
  }
}

// ─── 4. Email Sending ──────────────────────────────────────────────────────

/**
 * Build the final HTML email with tracking pixel and unsubscribe link
 */
function buildEmailHTML(subject, body, opener, valueProp, sendId) {
  const trackingPixelUrl = `${APP_URL}/api/auto-email/track?sid=${sendId}`;
  const unsubscribeUrl = `${APP_URL}/api/auto-email/unsubscribe?sid=${sendId}`;

  // Insert personalized content
  let finalBody = body;
  if (opener) {
    finalBody = opener + '\n\n' + finalBody;
  }
  if (valueProp) {
    // Insert value prop before the last paragraph or at the end
    const lines = finalBody.split('\n');
    const insertIdx = Math.max(lines.length - 2, 1);
    lines.splice(insertIdx, 0, valueProp);
    finalBody = lines.join('\n');
  }

  // Convert newlines to HTML
  const bodyHtml = finalBody
    .split('\n')
    .map(line => line.trim() ? `<p style="margin:0 0 12px;line-height:1.6;color:#374151;font-size:14px;">${line}</p>` : '')
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8f9fb;font-family:'Inter',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
      ${bodyHtml}
    </div>
    <div style="text-align:center;padding:20px 0;font-size:11px;color:#94a3b8;">
      <a href="${unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a>
    </div>
  </div>
  <img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />
</body>
</html>`;
}

/**
 * Send a single email and record the result
 */
async function sendCampaignEmail(sendId) {
  const send = await queryOne('SELECT * FROM gtm_email_sends WHERE id = $1', [sendId]);
  if (!send) throw new Error('Send record not found');

  try {
    await query('UPDATE gtm_email_sends SET status = $1 WHERE id = $2', ['sending', sendId]);

    // Resolve which project's SMTP accounts to send through
    let projectId = send.project_id || null;
    if (!projectId && send.campaign_id) {
      const camp = await queryOne('SELECT project_id FROM gtm_email_campaigns WHERE id = $1', [send.campaign_id]);
      projectId = camp?.project_id || null;
    }

    const result = await sendMail({
      to: send.to_email,
      subject: send.subject,
      html: send.body_html,
      projectId,
    });

    const messageId = result?.messageId || '';
    await query(
      'UPDATE gtm_email_sends SET status = $1, message_id = $2, sent_at = NOW() WHERE id = $3',
      ['sent', messageId, sendId]
    );

    // Update campaign counter
    if (send.campaign_id) {
      await query(
        'UPDATE gtm_email_campaigns SET total_sent = total_sent + 1, updated_at = NOW() WHERE id = $1',
        [send.campaign_id]
      );
    }

    // Update lead status
    if (send.lead_id) {
      await query(
        "UPDATE gtm_leads SET status = CASE WHEN status = 'not_contacted' THEN 'email_sent' ELSE status END, last_contacted_at = NOW(), updated_at = NOW() WHERE id = $1",
        [send.lead_id]
      );
    }

    return { success: true, messageId };
  } catch (err) {
    await query(
      'UPDATE gtm_email_sends SET status = $1, error_message = $2 WHERE id = $3',
      ['failed', err.message, sendId]
    );

    return { success: false, error: err.message };
  }
}

/**
 * Record an email open event
 */
async function recordOpen(sendId) {
  await query(
    'UPDATE gtm_email_sends SET status = CASE WHEN status IN (\'sent\', \'delivered\') THEN \'opened\' ELSE status END, opened_at = COALESCE(opened_at, NOW()) WHERE id = $1',
    [sendId]
  );
  // Update campaign counter (only first open)
  const send = await queryOne('SELECT campaign_id, opened_at FROM gtm_email_sends WHERE id = $1', [sendId]);
  if (send?.campaign_id) {
    // Recount opens for accuracy
    const count = await queryOne(
      'SELECT COUNT(*) as c FROM gtm_email_sends WHERE campaign_id = $1 AND opened_at IS NOT NULL',
      [send.campaign_id]
    );
    await query('UPDATE gtm_email_campaigns SET total_opened = $1 WHERE id = $2', [count?.c || 0, send.campaign_id]);
  }
}

/**
 * Get campaign stats summary
 */
async function getCampaignStats() {
  const stats = await queryOne(`
    SELECT
      COALESCE(SUM(total_sent), 0) as total_sent,
      COALESCE(SUM(total_opened), 0) as total_opened,
      COALESCE(SUM(total_replied), 0) as total_replied,
      COALESCE(SUM(total_bounced), 0) as total_bounced,
      COALESCE(SUM(total_unsubscribed), 0) as total_unsubscribed,
      COUNT(*) as total_campaigns
    FROM gtm_email_campaigns
  `);
  return stats;
}

module.exports = {
  getEligibleLeads,
  countEligibleLeads,
  resolveTemplate,
  personalizeWithLLM,
  buildEmailHTML,
  sendCampaignEmail,
  recordOpen,
  getCampaignStats,
};
