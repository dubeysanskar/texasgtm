/**
 * Watch subscriptions ("CC"): who gets a portal notification + email whenever something happens
 * on a lead, or whenever a specific team member does something on any lead.
 *
 *   scope='lead'  lead_id set        — watch one lead (source: 'cc' = added by a super admin,
 *                                       'comment' = auto-subscribed by commenting on it)
 *   scope='user'  target_user_id set — watch everything a team member does (super-admin only, "CC me
 *                                       on everything Danil does")
 *
 * `logLeadActivity` is the single place that writes a row to gtm_activity_logs for a lead AND fans it
 * out to watchers — every route that logs lead activity should go through it instead of inserting
 * directly, so no notification path is ever missed.
 */
const { query, queryOne, queryAll } = require('./db');

async function listLeadWatchers(leadId) {
  return queryAll(
    "SELECT w.id, w.watcher_id, w.source, w.added_by_name, w.created_at, u.name, u.email FROM gtm_watch_subscriptions w JOIN gtm_users u ON u.id = w.watcher_id WHERE w.scope = 'lead' AND w.lead_id = $1 ORDER BY w.created_at",
    [leadId]
  );
}

async function listUserWatchers(targetUserId) {
  return queryAll(
    "SELECT w.id, w.watcher_id, w.added_by_name, w.created_at, u.name, u.email FROM gtm_watch_subscriptions w JOIN gtm_users u ON u.id = w.watcher_id WHERE w.scope = 'user' AND w.target_user_id = $1 ORDER BY w.created_at",
    [targetUserId]
  );
}

async function addWatcher({ scope, leadId, targetUserId, watcherId, addedBy, source = 'cc' }) {
  const cond = scope === 'lead' ? "scope = 'lead' AND lead_id = $2" : "scope = 'user' AND target_user_id = $2";
  const key = scope === 'lead' ? leadId : targetUserId;
  const exists = await queryOne(`SELECT id FROM gtm_watch_subscriptions WHERE watcher_id = $1 AND ${cond}`, [watcherId, key]);
  if (exists) return exists.id;
  const row = await queryOne(
    'INSERT INTO gtm_watch_subscriptions (watcher_id, scope, lead_id, target_user_id, source, added_by, added_by_name, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [watcherId, scope, scope === 'lead' ? leadId : null, scope === 'user' ? targetUserId : null, source, addedBy?.id || null, addedBy?.name || '', new Date().toISOString()]
  );
  return row.id;
}

async function removeWatcher({ scope, leadId, targetUserId, watcherId }) {
  const cond = scope === 'lead' ? "scope = 'lead' AND lead_id = $2" : "scope = 'user' AND target_user_id = $2";
  const key = scope === 'lead' ? leadId : targetUserId;
  await query(`DELETE FROM gtm_watch_subscriptions WHERE watcher_id = $1 AND ${cond}`, [watcherId, key]);
}

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const COPY = {
  en: { subject: (company) => `Lead update: ${company}`, heading: 'Lead activity notification', lead: 'Lead', by: 'By', comment: 'Comment', open: 'Open lead', footer: (why) => `You receive this because ${why} in GTM CRM.` , cc: 'you are CC’d on this lead', watchUser: (name) => `you are watching ${name}’s activity` },
  ru: { subject: (company) => `Обновление по лиду: ${company}`, heading: 'Уведомление об активности по лиду', lead: 'Лид', by: 'Кто', comment: 'Комментарий', open: 'Открыть лид', footer: (why) => `Вы получили это письмо, потому что ${why} в GTM CRM.`, cc: 'вы в копии (CC) по этому лиду', watchUser: (name) => `вы следите за активностью: ${name}` },
};

async function sendWatchEmail(recipient, lead, actor, action, meta, why) {
  const { sendMail } = require('./mailer');
  const lang = recipient.language === 'ru' ? 'ru' : 'en';
  const c = COPY[lang];
  const base = process.env.NEXT_PUBLIC_URL || process.env.APP_URL || 'https://gtm.tahaairwavescrm.cloud';
  const row = (k, v) => v ? `<tr><td style="padding:6px 10px;color:#94a3b8;font-size:0.8rem;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 10px;color:#1e293b;font-size:0.86rem;">${v}</td></tr>` : '';
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;background:#f5f0f2;border-radius:16px;">
      <h1 style="font-size:1.3rem;color:#8A0029;margin:0 0 4px;text-align:center;">GTM CRM</h1>
      <p style="color:#94a3b8;font-size:0.85rem;margin:0 0 20px;text-align:center;">${c.heading}</p>
      <div style="background:#fff;border-radius:12px;padding:20px;border:1px solid #e2e8f0;">
        <div style="font-size:1.02rem;font-weight:700;color:#1e293b;margin-bottom:12px;">${esc(action)}</div>
        <table style="width:100%;border-collapse:collapse;">
          ${row(c.lead, `#${lead.project_seq ?? lead.id} · ${esc(lead.company_name)}${lead.city ? ' · ' + esc(lead.city) : ''}`)}
          ${row(c.by, esc(actor?.name || 'System'))}
          ${row(c.comment, meta?.comment ? esc(meta.comment).replace(/\n/g, '<br>') : '')}
        </table>
        <div style="text-align:center;margin-top:18px;">
          <a href="${base}/leads?log=${lead.id}" style="display:inline-block;padding:11px 28px;background:#8A0029;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:0.9rem;">${c.open}</a>
        </div>
      </div>
      <p style="text-align:center;margin-top:14px;font-size:0.72rem;color:#94a3b8;">${c.footer(why)}</p>
    </div>`;
  return sendMail({ to: recipient.email, subject: c.subject(lead.company_name), html, projectId: lead.project_id || null });
}

/**
 * Write a lead activity log row and notify every watcher (lead CC + anyone watching the actor).
 * The actor is never notified of their own action.
 */
async function logLeadActivity(user, lead, action, meta = {}) {
  await query(
    'INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id, project_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [user?.id || null, user?.name || 'System', user?.role || 'system', action, 'lead', 'lead', lead.id, lead.project_id || null, JSON.stringify(meta)]
  );
  notifyWatchers(user, lead, action, meta).catch(e => console.error('[watchers] notify failed:', e.message));
}

async function notifyWatchers(actor, lead, action, meta) {
  const leadWatchers = await queryAll("SELECT watcher_id FROM gtm_watch_subscriptions WHERE scope = 'lead' AND lead_id = $1", [lead.id]);
  const userWatchers = actor?.id ? await queryAll("SELECT watcher_id FROM gtm_watch_subscriptions WHERE scope = 'user' AND target_user_id = $1", [actor.id]) : [];
  const ids = [...new Set([...leadWatchers.map(w => w.watcher_id), ...userWatchers.map(w => w.watcher_id)])].filter(id => id !== actor?.id);
  if (!ids.length) return;
  const isLeadWatcher = new Set(leadWatchers.map(w => w.watcher_id));
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const users = await queryAll(`SELECT id, name, email, language, is_active FROM gtm_users WHERE id IN (${placeholders})`, ids);
  for (const u of users) {
    if (u.is_active === 0 || u.is_active === false) continue;
    const why = isLeadWatcher.has(u.id) ? (u.language === 'ru' ? 'вы в копии (CC) по этому лиду' : 'you are CC’d on this lead') : (u.language === 'ru' ? `вы следите за активностью: ${actor.name}` : `you are watching ${actor.name}’s activity`);
    try {
      await query('INSERT INTO gtm_notifications (user_id, type, title, message, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [u.id, 'lead_watch', u.language === 'ru' ? 'Обновление по лиду' : 'Lead update', `${action}${lead.company_name ? ' — ' + lead.company_name : ''}`, 'lead', lead.id]);
    } catch (e) { console.error('[watchers] notification insert failed:', e.message); }
    if (!u.email) continue;
    try { await sendWatchEmail(u, lead, actor, action, meta, why); }
    catch (e) { console.error(`[watchers] email to ${u.email} failed:`, e.message); }
  }
}

module.exports = { listLeadWatchers, listUserWatchers, addWatcher, removeWatcher, logLeadActivity };
