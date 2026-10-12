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

// ─── Human-readable change descriptions (email + bell notification) ─────────────────────────────
// The log stores machine values ("not_contacted → replied"); notifications describe the change in the
// recipient's own language with real labels, and always use the lead's project number (#26), never
// the internal database id.
const { STATUS_LABELS, PRIORITY_LABELS } = require('./lead-fields');

const FIELD_LABELS = {
  en: { company_name: 'Company', domain: 'Website', sector: 'Industry', city: 'City', region: 'Region', country: 'Country', company_size: 'Size', pain_point: 'Requirement', decision_maker_title: 'Decision maker', phone: 'Telephone', mobile_personal: 'Mobile', email: 'Email', telegram: 'Telegram', max_messenger: 'Max', contact_method: 'Contact', source_url: 'Source URL', find_instructions: 'Source of lead', notes: 'Comment' },
  ru: { company_name: 'Компания', domain: 'Сайт', sector: 'Отрасль', city: 'Город', region: 'Регион', country: 'Страна', company_size: 'Размер', pain_point: 'Потребность', decision_maker_title: 'ЛПР', phone: 'Телефон', mobile_personal: 'Мобильный', email: 'Email', telegram: 'Telegram', max_messenger: 'Max', contact_method: 'Контакт', source_url: 'Ссылка', find_instructions: 'Источник лида', notes: 'Комментарий' },
};

const COPY = {
  en: {
    status: 'Status', priority: 'Priority', template: 'Template assigned', templateCleared: 'Template cleared', edited: 'Details edited',
    note: 'New comment', created: 'Lead added', deleted: 'Lead deleted', restored: 'Lead restored', purged: 'Lead permanently deleted',
    fu: { created: 'Follow-up scheduled', done: 'Follow-up completed', rescheduled: 'Follow-up rescheduled', updated: 'Follow-up updated', deleted: 'Follow-up removed', reopened: 'Follow-up reopened' },
    ccAdded: (n) => `${n} added to CC`, ccRemoved: (n) => `${n} removed from CC`, subscribed: 'Subscribed to updates', unsubscribed: 'Unsubscribed from updates',
    bulk: 'bulk change', by: 'by', comment: 'Comment', now: 'Lead now', contact: 'Contact', nextFu: 'Next follow-up', none: '—',
    open: (n) => `Open lead #${n}`, heading: 'Lead update', whyOwner: 'you added this lead (you are its owner)', whyCc: 'you are CC’d on this lead',
    whyWatch: (n) => `you are watching ${n}’s activity`, footer: (w) => `You receive this because ${w}.`,
    bulkSubject: (n, who) => `${who} updated ${n} of your leads`, bulkHeading: (n) => `${n} leads updated`, more: (n) => `…and ${n} more`,
  },
  ru: {
    status: 'Статус', priority: 'Приоритет', template: 'Назначен шаблон', templateCleared: 'Шаблон снят', edited: 'Изменены данные',
    note: 'Новый комментарий', created: 'Лид добавлен', deleted: 'Лид удалён', restored: 'Лид восстановлен', purged: 'Лид удалён навсегда',
    fu: { created: 'Запланирован follow-up', done: 'Follow-up выполнен', rescheduled: 'Follow-up перенесён', updated: 'Follow-up изменён', deleted: 'Follow-up удалён', reopened: 'Follow-up возвращён в работу' },
    ccAdded: (n) => `${n} добавлен(а) в копию`, ccRemoved: (n) => `${n} убран(а) из копии`, subscribed: 'Подписка на обновления', unsubscribed: 'Отписка от обновлений',
    bulk: 'массовое изменение', by: '—', comment: 'Комментарий', now: 'Сейчас по лиду', contact: 'Контакт', nextFu: 'Следующий follow-up', none: '—',
    open: (n) => `Открыть лид #${n}`, heading: 'Обновление по лиду', whyOwner: 'вы добавили этот лид (вы его владелец)', whyCc: 'вы в копии (CC) по этому лиду',
    whyWatch: (n) => `вы следите за активностью: ${n}`, footer: (w) => `Вы получили это письмо, потому что ${w}.`,
    bulkSubject: (n, who) => `${who} изменил(а) ${n} ваших лидов`, bulkHeading: (n) => `Изменено лидов: ${n}`, more: (n) => `…и ещё ${n}`,
  },
};

const statusLabel = (v, L) => STATUS_LABELS[L][v] || STATUS_LABELS.en[v] || v || '—';
const priorityLabel = (v, L) => PRIORITY_LABELS[L][v] || v || '—';
function fmtDate(iso, L, tz) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(L === 'ru' ? 'ru-RU' : 'en-GB', { timeZone: tz || 'UTC', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

/** { headline, details: [string], bulk } describing one logged change, in language L. */
function describe(meta, action, L, tz) {
  const c = COPY[L];
  const k = meta?.kind;
  if (k === 'status') return { headline: `${c.status}: ${statusLabel(meta.from, L)} → ${statusLabel(meta.to, L)}` };
  if (k === 'priority') return { headline: `${c.priority}: ${priorityLabel(meta.from, L)} → ${priorityLabel(meta.to, L)}` };
  if (k === 'template') return { headline: meta.template ? `${c.template}: ${meta.template}` : c.templateCleared };
  if (k === 'edit') {
    const fields = meta.fields || [];
    const details = fields.map(f => {
      const ch = meta.changes?.[f] || {};
      const name = FIELD_LABELS[L][f] || f;
      const from = String(ch.from ?? '').trim() || '—', to = String(ch.to ?? '').trim() || '—';
      return `${name}: ${from.slice(0, 120)} → ${to.slice(0, 120)}`;
    });
    return { headline: `${c.edited}: ${fields.map(f => FIELD_LABELS[L][f] || f).join(', ')}`, details };
  }
  if (k === 'note') return { headline: c.note };
  if (k === 'create') return { headline: c.created };
  if (k === 'delete') return { headline: c.deleted };
  if (k === 'restore') return { headline: c.restored };
  if (k === 'purge') return { headline: c.purged };
  if (k === 'followup') {
    const when = fmtDate(meta.due_at, L, tz);
    const head = `${c.fu[meta.event] || c.fu.updated}: «${meta.title || ''}»${when ? ' · ' + when : ''}`;
    return { headline: head, details: meta.assignee ? [`→ ${meta.assignee}`] : [] };
  }
  if (k === 'watch') {
    if (meta.event === 'added') return { headline: meta.self ? c.subscribed : c.ccAdded(meta.watcher) };
    if (meta.event === 'removed') return { headline: meta.self ? c.unsubscribed : c.ccRemoved(meta.watcher) };
  }
  return { headline: action };
}

const BASE_URL = () => process.env.NEXT_PUBLIC_URL || process.env.APP_URL || 'https://gtm.tahaairwavescrm.cloud';
const shell = (L, inner, why) => `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 18px;background:#f5f0f2;border-radius:16px;" lang="${L}">
      <div style="text-align:center;margin-bottom:16px;"><span style="font-size:1.15rem;font-weight:800;color:#8A0029;">GTM CRM</span></div>
      <div style="background:#fff;border-radius:12px;padding:20px 22px;border:1px solid #e2e8f0;">${inner}</div>
      <p style="text-align:center;margin-top:14px;font-size:0.72rem;color:#94a3b8;">${COPY[L].footer(why)}</p>
    </div>`;

function leadSnapshotHtml(lead, L, nextFuIso, tz) {
  const c = COPY[L];
  const contact = [lead.decision_maker_title, lead.mobile_personal, lead.phone, lead.email, lead.telegram].filter(Boolean).map(esc).join(' · ');
  const row = (k, v) => v ? `<tr><td style="padding:4px 10px 4px 0;color:#94a3b8;font-size:0.78rem;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:4px 0;color:#1e293b;font-size:0.82rem;">${v}</td></tr>` : '';
  return `<table style="width:100%;border-collapse:collapse;margin-top:14px;border-top:1px solid #f1f5f9;padding-top:8px;">
      ${row(c.now, `${esc(statusLabel(lead.status, L))} · ${esc(priorityLabel(lead.priority, L))}`)}
      ${row(c.contact, contact)}
      ${row(c.nextFu, nextFuIso ? esc(fmtDate(nextFuIso, L, tz)) : '')}
    </table>`;
}

async function sendChangeEmail(recipient, lead, actor, d, meta, why, nextFuIso, tz, whenIso) {
  const { sendMail } = require('./mailer');
  const L = recipient.language === 'ru' ? 'ru' : 'en';
  const c = COPY[L];
  const num = lead.project_seq ?? lead.id;
  const details = (d.details || []).map(x => `<div style="font-size:0.82rem;color:#475569;margin-top:3px;">${esc(x)}</div>`).join('');
  const comment = meta?.comment ? `<div style="margin-top:12px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:0.86rem;color:#78350f;white-space:pre-wrap;">💬 ${esc(meta.comment)}</div>` : '';
  const inner = `
      <div style="font-size:0.78rem;color:#94a3b8;">${c.heading}</div>
      <div style="font-size:1.05rem;font-weight:800;color:#1e293b;margin:2px 0 12px;">#${num} · ${esc(lead.company_name)}${lead.city ? `<span style="font-weight:500;color:#64748b;"> · ${esc(lead.city)}</span>` : ''}</div>
      <div style="font-size:0.95rem;font-weight:700;color:#8A0029;">${esc(d.headline)}${meta?.bulk ? ` <span style="font-weight:500;color:#94a3b8;font-size:0.78rem;">(${c.bulk})</span>` : ''}</div>
      ${details}
      ${comment}
      <div style="margin-top:10px;font-size:0.78rem;color:#64748b;">${esc(actor?.name || 'System')} · ${esc(fmtDate(whenIso, L, tz))}</div>
      ${leadSnapshotHtml(lead, L, nextFuIso, tz)}
      <div style="text-align:center;margin-top:18px;">
        <a href="${BASE_URL()}/leads?log=${lead.id}" style="display:inline-block;padding:11px 26px;background:#8A0029;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:0.88rem;">${c.open(num)}</a>
      </div>`;
  const subject = `#${num} ${lead.company_name} — ${d.headline}`.slice(0, 180);
  return sendMail({ to: recipient.email, subject, html: shell(L, inner, why), projectId: lead.project_id || null });
}

/**
 * Who hears about a change to a lead: its owner (the person who added it), anyone CC'd on it, and
 * anyone watching the person who made the change. Never the actor themselves. Returns
 * [{ user, why: 'owner'|'cc'|'watch' }].
 */
async function recipientsFor(actor, lead) {
  const reasons = new Map(); // user id → reason (owner wins over cc wins over watch)
  if (lead.created_by) reasons.set(Number(lead.created_by), 'owner');
  const leadWatchers = await queryAll("SELECT watcher_id FROM gtm_watch_subscriptions WHERE scope = 'lead' AND lead_id = $1", [lead.id]);
  for (const w of leadWatchers) if (!reasons.has(w.watcher_id)) reasons.set(w.watcher_id, 'cc');
  if (actor?.id) {
    const userWatchers = await queryAll("SELECT watcher_id FROM gtm_watch_subscriptions WHERE scope = 'user' AND target_user_id = $1", [actor.id]);
    for (const w of userWatchers) if (!reasons.has(w.watcher_id)) reasons.set(w.watcher_id, 'watch');
  }
  if (actor?.id) reasons.delete(Number(actor.id));
  const ids = [...reasons.keys()];
  if (!ids.length) return [];
  const users = await queryAll(`SELECT id, name, email, language, is_active FROM gtm_users WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids);
  return users.filter(u => u.is_active !== 0 && u.is_active !== false).map(u => ({ user: u, why: reasons.get(u.id) }));
}
const whyText = (why, L, actor) => why === 'owner' ? COPY[L].whyOwner : why === 'cc' ? COPY[L].whyCc : COPY[L].whyWatch(actor?.name || '');

async function leadContext(lead) {
  // Always reload: callers often pass a partial lead (no project number / owner / contacts). A purged
  // lead is gone from the table, so fall back to what the caller passed.
  const fresh = await queryOne('SELECT * FROM gtm_leads WHERE id = $1', [lead.id]);
  const full = fresh ? { ...lead, ...fresh } : lead;
  const nextFu = fresh ? await queryOne("SELECT MIN(due_at) AS d FROM gtm_followups WHERE lead_id = $1 AND status = 'open'", [lead.id]) : null;
  const { getProjectTimezone } = require('./tz');
  const tz = await getProjectTimezone(full.project_id);
  return { full, nextFuIso: nextFu?.d || null, tz };
}

/**
 * Write a lead activity log row and notify its owner + watchers (portal bell + email).
 * Pass { notify: false } for bulk loops and call notifyBulk() once afterwards instead.
 */
async function logLeadActivity(user, lead, action, meta = {}, opts = {}) {
  await query(
    'INSERT INTO gtm_activity_logs (user_id, user_name, user_role, action, category, entity_type, entity_id, project_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [user?.id || null, user?.name || 'System', user?.role || 'system', action, 'lead', 'lead', lead.id, lead.project_id || null, JSON.stringify(meta)]
  );
  if (opts.notify === false) return;
  notifyWatchers(user, lead, action, meta).catch(e => console.error('[watchers] notify failed:', e.message));
}

async function notifyWatchers(actor, lead, action, meta) {
  const { full, nextFuIso, tz } = await leadContext(lead);
  let recipients = await recipientsFor(actor, full);
  // CC bookkeeping isn't news for the owner/watchers — only the person someone else just CC'd hears about it
  if (meta?.kind === 'watch') {
    if (meta.self || meta.event !== 'added' || !meta.watcher_id) return;
    const u = await queryOne('SELECT id, name, email, language, is_active FROM gtm_users WHERE id = $1', [meta.watcher_id]);
    recipients = u && u.is_active !== 0 && u.is_active !== false && u.id !== actor?.id ? [{ user: u, why: 'cc' }] : [];
  }
  const whenIso = new Date().toISOString();
  const num = full.project_seq ?? full.id;
  for (const { user: u, why } of recipients) {
    const L = u.language === 'ru' ? 'ru' : 'en';
    const d = describe(meta, action, L, tz);
    // For edits, the bell shows the actual values ("Телефон: — → +7 495…"), not just which fields changed
    const what = meta?.kind === 'edit' && d.details?.length ? d.details.join('; ').slice(0, 220) : d.headline;
    const msg = `${actor?.name || 'System'}: ${what}${meta?.comment ? ` — «${String(meta.comment).slice(0, 140)}»` : ''}`;
    try {
      await query('INSERT INTO gtm_notifications (user_id, type, title, message, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5,$6)',
        [u.id, 'lead_watch', `#${num} · ${full.company_name}`, msg, 'lead', full.id]);
    } catch (e) { console.error('[watchers] notification insert failed:', e.message); }
    if (!u.email) continue;
    try { await sendChangeEmail(u, full, actor, d, meta, whyText(why, L, actor), nextFuIso, tz, whenIso); }
    catch (e) { console.error(`[watchers] email to ${u.email} failed:`, e.message); }
  }
}

/**
 * One digest per recipient for a bulk change (bulk status / template) instead of an email per lead.
 * `leads` are the affected lead rows; `meta` is the shared change (kind/from/to/template/comment).
 */
async function notifyBulk(actor, leads, metaFor, action) {
  try {
    const perUser = new Map(); // user id → { user, why, items: [{ lead, meta }] }
    let tz = 'UTC';
    for (const lead of leads) {
      const ctx = await leadContext(lead);
      tz = ctx.tz;
      for (const { user: u, why } of await recipientsFor(actor, ctx.full)) {
        if (!perUser.has(u.id)) perUser.set(u.id, { user: u, why, items: [] });
        perUser.get(u.id).items.push({ lead: ctx.full, meta: metaFor(lead) });
      }
    }
    const { sendMail } = require('./mailer');
    for (const { user: u, why, items } of perUser.values()) {
      const L = u.language === 'ru' ? 'ru' : 'en';
      const c = COPY[L];
      const comment = items[0]?.meta?.comment;
      const shown = items.slice(0, 40);
      const lines = shown.map(({ lead, meta }) => `<tr><td style="padding:5px 8px 5px 0;font-size:0.8rem;color:#94a3b8;white-space:nowrap;">#${lead.project_seq ?? lead.id}</td><td style="padding:5px 0;font-size:0.82rem;"><a href="${BASE_URL()}/leads?log=${lead.id}" style="color:#1e293b;font-weight:600;text-decoration:none;">${esc(lead.company_name)}</a><div style="color:#8A0029;font-size:0.78rem;">${esc(describe(meta, action, L, tz).headline)}</div></td></tr>`).join('');
      const more = items.length > shown.length ? `<div style="font-size:0.78rem;color:#94a3b8;margin-top:6px;">${c.more(items.length - shown.length)}</div>` : '';
      const inner = `
        <div style="font-size:1.02rem;font-weight:800;color:#1e293b;margin-bottom:4px;">${esc(c.bulkHeading(items.length))}</div>
        <div style="font-size:0.78rem;color:#64748b;margin-bottom:10px;">${esc(actor?.name || 'System')} · ${esc(fmtDate(new Date().toISOString(), L, tz))} · ${c.bulk}</div>
        ${comment ? `<div style="margin-bottom:12px;padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:0.86rem;color:#78350f;white-space:pre-wrap;">💬 ${esc(comment)}</div>` : ''}
        <table style="width:100%;border-collapse:collapse;">${lines}</table>${more}`;
      try {
        await query('INSERT INTO gtm_notifications (user_id, type, title, message, entity_type, entity_id) VALUES ($1,$2,$3,$4,$5,$6)',
          [u.id, 'lead_watch', c.bulkHeading(items.length), `${actor?.name || 'System'}: ${describe(items[0].meta, action, L, tz).headline}${items.length > 1 ? ` (+${items.length - 1})` : ''}`, 'lead', items[0].lead.id]);
      } catch (e) { console.error('[watchers] notification insert failed:', e.message); }
      if (!u.email) continue;
      try { await sendMail({ to: u.email, subject: c.bulkSubject(items.length, actor?.name || 'System'), html: shell(L, inner, whyText(why, L, actor)), projectId: items[0].lead.project_id || null }); }
      catch (e) { console.error(`[watchers] bulk email to ${u.email} failed:`, e.message); }
    }
  } catch (e) { console.error('[watchers] bulk notify failed:', e.message); }
}

module.exports = { listLeadWatchers, listUserWatchers, addWatcher, removeWatcher, logLeadActivity, notifyBulk, describe, recipientsFor };
