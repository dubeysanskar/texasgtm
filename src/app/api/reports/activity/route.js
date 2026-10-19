import { NextResponse } from 'next/server';
const { queryAll } = require('@/lib/db');
const { getUserFromRequest, isAdmin } = require('@/lib/auth');
const { getProjectTimezone, todayInTz, dayStartUtcMs, dayKeyIn, hourIn, addDays } = require('@/lib/tz');
const { describe } = require('@/lib/watchers');

// GET /api/reports/activity?user_id=&range=today|3d|7d|30d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&project_id=&lang=
// Super admin only. What a team member (or the whole team) did in a period, day by day: lead work,
// follow-ups, to-dos, daily updates, messages — plus login sessions and real active time.
// Days are counted in the project's timezone (Moscow for the Russian project).

const METRICS = ['leads_added', 'leads_achieved', 'status_changes', 'comments', 'lead_updates', 'followups_scheduled', 'followups_done', 'todos_done', 'daily_updates', 'messages_sent'];
const RANGES = { today: 0, '3d': 2, '7d': 6, '30d': 29 };

function parseMeta(m) { if (!m) return {}; if (typeof m === 'object') return m; try { return JSON.parse(m); } catch { return {}; } }

/** Which metric a log row counts toward (null = don't count, e.g. bulk summary rows duplicating per-lead rows). */
function classify(row, meta) {
  const k = meta.kind;
  if (row.category === 'security') return null;
  if (k === 'create') return 'leads_added';
  if (k === 'status') return 'status_changes';
  if (k === 'achieved') return 'leads_achieved';
  if (k === 'unachieved') return 'lead_updates';
  if (k === 'note') return 'comments';
  if (k === 'edit' || k === 'priority' || k === 'template') return 'lead_updates';
  if (k === 'followup') return meta.event === 'created' ? 'followups_scheduled' : meta.event === 'done' ? 'followups_done' : 'lead_updates';
  if (k === 'delete' || k === 'restore' || k === 'purge') return 'lead_updates';
  if (k === 'watch') return null;
  if (row.category === 'leads' && meta.added !== undefined) return 'bulk_upload';   // bulk upload summary
  if (!row.entity_id) return null;                                                   // e.g. "Bulk updated 12 leads" summary
  return 'other';
}

const emptyCounts = () => Object.fromEntries([...METRICS, 'other'].map(m => [m, 0]));

async function memberStats(member, fromIso, toIso, days, tz, L, withDetail) {
  const counts = emptyCounts();
  const daily = Object.fromEntries(days.map(d => [d, { date: d, actions: 0, active_minutes: 0, online_minutes: 0, first_login: null, last_seen: null, ...emptyCounts() }]));
  const hours = Array(24).fill(0);
  const bump = (metric, iso, n = 1) => {
    counts[metric] = (counts[metric] || 0) + n;
    const d = daily[dayKeyIn(iso, tz)];
    if (d) { d[metric] = (d[metric] || 0) + n; d.actions += n; }
    hours[hourIn(iso, tz)] += n;
  };

  const logs = await queryAll(
    "SELECT id, action, category, metadata, entity_type, entity_id, created_at FROM gtm_activity_logs WHERE user_id = $1 AND created_at >= $2 AND created_at < $3 ORDER BY created_at DESC",
    [member.id, fromIso, toIso]);
  const feedRows = [];
  for (const r of logs) {
    const meta = parseMeta(r.metadata);
    const metric = classify(r, meta);
    if (!metric) continue;
    const at = new Date(r.created_at).toISOString();
    if (metric === 'bulk_upload') bump('leads_added', at, Number(meta.added) || 0);
    else bump(metric, at);
    if (withDetail && feedRows.length < 400) feedRows.push({ r, meta, at, metric });
  }

  const todos = await queryAll("SELECT text, done_at FROM gtm_todos WHERE user_id = $1 AND status = 'done' AND done_at >= $2 AND done_at < $3", [member.id, fromIso, toIso]);
  for (const t of todos) { bump('todos_done', t.done_at); if (withDetail) feedRows.push({ at: t.done_at, metric: 'todos_done', text: t.text }); }
  const updates = await queryAll('SELECT text, created_at FROM gtm_daily_updates WHERE user_id = $1 AND created_at >= $2 AND created_at < $3', [member.id, fromIso, toIso]);
  for (const u of updates) { bump('daily_updates', u.created_at); if (withDetail) feedRows.push({ at: u.created_at, metric: 'daily_updates', text: String(u.text || '').slice(0, 300) }); }
  const msgs = await queryAll('SELECT created_at FROM gtm_messages WHERE sender_id = $1 AND created_at >= $2 AND created_at < $3', [member.id, fromIso, toIso]);
  for (const m of msgs) bump('messages_sent', new Date(m.created_at).toISOString());

  // Sessions overlapping the range — online time is clipped to the range; active time is credited to
  // the day the session started (a session crossing midnight is rare in practice)
  const fromMs = new Date(fromIso).getTime(), toMs = new Date(toIso).getTime(), nowMs = Date.now();
  const sessions = await queryAll(
    'SELECT * FROM gtm_user_sessions WHERE user_id = $1 AND started_at < $2 AND COALESCE(ended_at, last_seen_at) >= $3 ORDER BY started_at DESC',
    [member.id, toIso, fromIso]);
  let activeSeconds = 0, onlineSeconds = 0, firstLogin = null, lastSeen = null;
  const sessionList = [];
  for (const s of sessions) {
    const start = new Date(s.started_at).getTime();
    const end = new Date(s.ended_at || s.last_seen_at).getTime();
    const online = Math.max(0, Math.min(end, toMs) - Math.max(start, fromMs)) / 1000;
    const active = Math.min(Number(s.active_seconds) || 0, online || Number(s.active_seconds) || 0);
    onlineSeconds += online; activeSeconds += active;
    if (!firstLogin || s.started_at < firstLogin) firstLogin = s.started_at;
    const seen = s.ended_at || s.last_seen_at;
    if (!lastSeen || seen > lastSeen) lastSeen = seen;
    const d = daily[dayKeyIn(Math.max(start, fromMs), tz)];
    if (d) {
      d.active_minutes += Math.round(active / 60); d.online_minutes += Math.round(online / 60);
      if (!d.first_login || s.started_at < d.first_login) d.first_login = s.started_at;
      if (!d.last_seen || seen > d.last_seen) d.last_seen = seen;
    }
    if (withDetail) sessionList.push({
      started_at: s.started_at, ended_at: s.ended_at, last_seen_at: s.last_seen_at,
      still_online: !s.ended_at && nowMs - new Date(s.last_seen_at).getTime() < 3 * 60 * 1000,
      ended_reason: s.ended_reason, online_minutes: Math.round(online / 60), active_minutes: Math.round(active / 60), method: s.login_method,
    });
  }
  const openNow = sessions.find(s => !s.ended_at && nowMs - new Date(s.last_seen_at).getTime() < 3 * 60 * 1000);

  const total = Object.entries(counts).reduce((a, [, v]) => a + v, 0);
  const out = {
    id: member.id, name: member.name, role: member.role, job_title: member.job_title,
    counts, total_actions: total,
    active_minutes: Math.round(activeSeconds / 60), online_minutes: Math.round(onlineSeconds / 60),
    sessions_count: sessions.length, first_login: firstLogin, last_seen: lastSeen, online_now: !!openNow,
    days_active: Object.values(daily).filter(d => d.actions > 0 || d.online_minutes > 0).length,
    daily: days.map(d => daily[d]), hours,
  };
  if (withDetail) {
    // Lead numbers/companies for the timeline (always the project number, not the database id)
    const ids = [...new Set(feedRows.filter(f => f.r?.entity_id && f.r.entity_type === 'lead').map(f => Number(f.r.entity_id)))];
    const leads = ids.length ? await queryAll(`SELECT id, project_seq, company_name FROM gtm_leads WHERE id IN (${ids.map((_, i) => `$${i + 1}`).join(',')})`, ids) : [];
    const byId = Object.fromEntries(leads.map(l => [l.id, l]));
    out.feed = feedRows.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 300).map(f => {
      if (!f.r) return { at: f.at, metric: f.metric, text: f.text };
      const lead = f.r.entity_type === 'lead' ? byId[Number(f.r.entity_id)] : null;
      return {
        at: f.at, metric: f.metric,
        text: describe(f.meta, f.r.action, L, tz).headline,
        comment: f.meta.comment || '',
        lead: lead ? { id: lead.id, seq: lead.project_seq ?? lead.id, company: lead.company_name } : null,
      };
    });
    out.sessions = sessionList;
  }
  return out;
}

export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Super admin only' }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const L = sp.get('lang') === 'ru' ? 'ru' : 'en';
  const tz = await getProjectTimezone(sp.get('project_id') ? Number(sp.get('project_id')) : null);
  const today = todayInTz(tz);

  // Resolve the period to calendar days in the project's timezone
  const range = sp.get('range') || '7d';
  let fromDate, toDate;
  if (range === 'custom') {
    fromDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('from') || '') ? sp.get('from') : today;
    toDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('to') || '') ? sp.get('to') : today;
    if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
    if (toDate > today) toDate = today;
  } else {
    toDate = today;
    fromDate = addDays(today, -(RANGES[range] ?? 6));
  }
  const days = [];
  for (let d = fromDate; d <= toDate && days.length < 400; d = addDays(d, 1)) days.push(d);
  if (days.length > 366) return NextResponse.json({ error: 'Pick a range of at most one year' }, { status: 400 });
  const fromIso = new Date(dayStartUtcMs(fromDate, tz)).toISOString();
  const toIso = new Date(dayStartUtcMs(addDays(toDate, 1), tz)).toISOString();

  const members = await queryAll("SELECT id, name, role, job_title FROM gtm_users WHERE is_active != 0 ORDER BY CASE role WHEN 'super_admin' THEN 0 WHEN 'manager' THEN 1 WHEN 'marketing' THEN 2 ELSE 3 END, name");
  const selectedId = sp.get('user_id') && sp.get('user_id') !== 'all' ? Number(sp.get('user_id')) : null;
  if (selectedId && !members.some(m => m.id === selectedId)) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const team = [];
  for (const m of members) team.push(await memberStats(m, fromIso, toIso, days, tz, L, m.id === selectedId));

  let detail;
  if (selectedId) detail = team.find(m => m.id === selectedId);
  else {
    // Whole team: sum everyone's numbers
    detail = { id: null, name: null, counts: emptyCounts(), total_actions: 0, active_minutes: 0, online_minutes: 0, sessions_count: 0, days_active: 0,
      daily: days.map(d => ({ date: d, actions: 0, active_minutes: 0, online_minutes: 0, ...emptyCounts() })), hours: Array(24).fill(0) };
    for (const m of team) {
      for (const k of Object.keys(detail.counts)) detail.counts[k] += m.counts[k] || 0;
      detail.total_actions += m.total_actions; detail.active_minutes += m.active_minutes; detail.online_minutes += m.online_minutes; detail.sessions_count += m.sessions_count;
      m.daily.forEach((d, i) => { const t = detail.daily[i]; t.actions += d.actions; t.active_minutes += d.active_minutes; t.online_minutes += d.online_minutes; for (const k of Object.keys(detail.counts)) t[k] += d[k] || 0; });
      m.hours.forEach((h, i) => { detail.hours[i] += h; });
    }
    detail.days_active = detail.daily.filter(d => d.actions > 0 || d.online_minutes > 0).length;
  }

  return NextResponse.json({
    range, from: fromDate, to: toDate, today, timezone: tz, days: days.length,
    detail,
    team: team.map(({ daily, hours, feed, sessions, ...rest }) => rest),
  });
}
