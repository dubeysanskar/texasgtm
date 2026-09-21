/**
 * Lead follow-ups: shared helpers for the API routes and the reminder loop.
 *
 * due_at / remind_at / done_at are ISO-8601 UTC strings (Date#toISOString), so they sort and compare
 * as plain text on both SQLite and PostgreSQL. `tz` is the creator's browser time zone, used to print
 * the time in reminder emails the way the user entered it.
 */
const { query, queryOne, queryAll } = require('./db');

// Offsets offered in the UI (minutes before the due time); null = no email reminder
const REMIND_OPTIONS = [null, 0, 15, 60, 1440];

function remindAt(dueIso, minutesBefore) {
  if (minutesBefore === null || minutesBefore === undefined || minutesBefore === '') return null;
  const m = Number(minutesBefore);
  if (!Number.isFinite(m) || m < 0) return null;
  return new Date(new Date(dueIso).getTime() - m * 60000).toISOString();
}

function toIso(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Write an entry into the lead's log (shown in "View log"). */
async function logToLead(user, lead, action, meta) {
  await query(
    'INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id, project_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [user?.id || null, user?.name || 'System', user?.role || 'system', action, 'lead', 'lead', lead.id, lead.project_id || null, JSON.stringify(meta)]
  );
}

function fmtWhen(iso, tz, lang) {
  try {
    return new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-GB', { timeZone: tz || 'UTC', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (tz ? '' : ' UTC');
  } catch { return iso; }
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const COPY = {
  en: {
    subject: (title, company) => `Follow-up due: ${title} — ${company}`,
    heading: 'Follow-up reminder', due: 'Due', lead: 'Lead', contact: 'Contact', note: 'Note', open: 'Open follow-ups',
    footer: 'You receive this because the follow-up is assigned to you in GTM CRM.',
  },
  ru: {
    subject: (title, company) => `Напоминание: ${title} — ${company}`,
    heading: 'Напоминание о follow-up', due: 'Срок', lead: 'Лид', contact: 'Контакт', note: 'Заметка', open: 'Открыть follow-up',
    footer: 'Вы получили это письмо, потому что follow-up назначен вам в GTM CRM.',
  },
};

async function sendReminderEmail(f, lead, assignee) {
  const { sendMail } = require('./mailer');
  const lang = assignee.language === 'ru' ? 'ru' : 'en';
  const c = COPY[lang];
  const base = process.env.NEXT_PUBLIC_URL || process.env.APP_URL || 'https://gtm.tahaairwavescrm.cloud';
  const row = (k, v) => v ? `<tr><td style="padding:6px 10px;color:#94a3b8;font-size:0.8rem;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 10px;color:#1e293b;font-size:0.86rem;">${v}</td></tr>` : '';
  const contact = [lead.decision_maker_title, lead.mobile_personal, lead.phone, lead.email].filter(Boolean).map(esc).join(' · ');
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;background:#f5f0f2;border-radius:16px;">
      <h1 style="font-size:1.3rem;color:#8A0029;margin:0 0 4px;text-align:center;">GTM CRM</h1>
      <p style="color:#94a3b8;font-size:0.85rem;margin:0 0 20px;text-align:center;">${c.heading}</p>
      <div style="background:#fff;border-radius:12px;padding:20px;border:1px solid #e2e8f0;">
        <div style="font-size:1.05rem;font-weight:700;color:#1e293b;margin-bottom:12px;">⏰ ${esc(f.title)}</div>
        <table style="width:100%;border-collapse:collapse;">
          ${row(c.due, `<strong>${esc(fmtWhen(f.due_at, f.tz, lang))}</strong>`)}
          ${row(c.lead, `#${lead.project_seq ?? lead.id} · ${esc(lead.company_name)}${lead.city ? ' · ' + esc(lead.city) : ''}`)}
          ${row(c.contact, contact)}
          ${row(c.note, f.note ? esc(f.note).replace(/\n/g, '<br>') : '')}
        </table>
        <div style="text-align:center;margin-top:18px;">
          <a href="${base}/followups" style="display:inline-block;padding:11px 28px;background:#8A0029;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:0.9rem;">${c.open}</a>
        </div>
      </div>
      <p style="text-align:center;margin-top:14px;font-size:0.72rem;color:#94a3b8;">${c.footer}</p>
    </div>`;
  return sendMail({ to: assignee.email, subject: c.subject(f.title, lead.company_name), html, projectId: lead.project_id || null });
}

/**
 * Send every reminder whose time has come. Each follow-up is claimed (reminder_sent_at set) before
 * sending, so overlapping runs never email twice. Returns { sent, failed }.
 */
async function sendDueReminders() {
  const now = new Date().toISOString();
  const due = await queryAll("SELECT * FROM gtm_followups WHERE status = 'open' AND remind_at IS NOT NULL AND reminder_sent_at IS NULL AND remind_at <= $1 ORDER BY remind_at LIMIT 50", [now]);
  let sent = 0, failed = 0;
  for (const f of due) {
    const claim = await query("UPDATE gtm_followups SET reminder_sent_at = $1 WHERE id = $2 AND reminder_sent_at IS NULL", [now, f.id]);
    if (!claim.rowCount) continue;
    const lead = await queryOne('SELECT * FROM gtm_leads WHERE id = $1', [f.lead_id]);
    const assignee = await queryOne('SELECT id, name, email, language, is_active FROM gtm_users WHERE id = $1', [f.assigned_to || f.created_by]);
    if (!lead || lead.deleted_at || !assignee?.email) continue;
    try {
      await query('INSERT INTO gtm_notifications (user_id, type, title, message, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [assignee.id, 'followup', assignee.language === 'ru' ? 'Напоминание о follow-up' : 'Follow-up reminder', `${f.title} — ${lead.company_name}`, 'lead', lead.id]);
    } catch {}
    try {
      await sendReminderEmail(f, lead, assignee);
      sent++;
    } catch (e) {
      failed++;
      console.error(`[followups] reminder #${f.id} email failed:`, e.message);
      await query("UPDATE gtm_followups SET reminder_sent_at = $1 WHERE id = $2", ['failed:' + now, f.id]);
    }
  }
  if (due.length) console.log(`[followups] reminders: ${sent} sent, ${failed} failed`);
  return { sent, failed, checked: due.length };
}

/** Start the background reminder loop once per process (called from instrumentation.js). */
function startReminderLoop() {
  if (globalThis.__gtmFollowupLoop) return;
  const every = Number(process.env.FOLLOWUP_REMINDER_INTERVAL_MS) || 60_000;
  const tick = () => sendDueReminders().catch(e => console.error('[followups] loop error:', e.message));
  globalThis.__gtmFollowupLoop = setInterval(tick, every);
  setTimeout(tick, 15_000);
  console.log(`[followups] reminder loop started (every ${Math.round(every / 1000)}s)`);
}

module.exports = { REMIND_OPTIONS, remindAt, toIso, logToLead, sendDueReminders, startReminderLoop };
