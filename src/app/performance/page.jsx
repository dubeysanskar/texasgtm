'use client';
// Team Performance (super admin) — pick a person (or the whole team) and a period; see exactly what they
// did, when they were logged in, how long they were actually active, and charts of it all.
import { useState, useEffect, useCallback, useMemo, useRef, Component } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { ColumnChart, HBarChart, VIZ } from '@/components/Charts';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

const METRIC_LABELS = {
  leads_added: 'Leads added', leads_achieved: 'Leads achieved', status_changes: 'Status changes', comments: 'Comments', lead_updates: 'Lead edits & updates',
  followups_scheduled: 'Follow-ups scheduled', followups_done: 'Follow-ups completed', todos_done: 'To-dos completed',
  daily_updates: 'Daily updates posted', messages_sent: 'Messages sent', other: 'Other actions',
};
const METRIC_ICONS = { leads_added: 'person_add', leads_achieved: 'emoji_events', status_changes: 'swap_horiz', comments: 'chat', lead_updates: 'edit_note', followups_scheduled: 'event', followups_done: 'event_available', todos_done: 'task_alt', daily_updates: 'event_note', messages_sent: 'forum', other: 'more_horiz' };
const RANGES = [['today', 'Today'], ['3d', 'Last 3 days'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['custom', 'Custom']];

// Runs its render function as its own component, so errors in it land in the nearest boundary
const Deferred = ({ render }) => render() || null;

// If drawing the report ever fails, keep the page (filters included) usable and offer a retry
// instead of the whole screen going blank.
class ReportBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('[performance] could not display the report:', error); }
  componentDidUpdate(prev) { if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false }); }
  render() {
    if (!this.state.failed) return this.props.children;
    const { t, onRetry } = this.props;
    return (
      <div className="card" style={{ padding: 28, textAlign: 'center' }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('This report could not be displayed.')}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>{t('Try again, or pick another period or person.')}</div>
        <button className="btn btn-primary" onClick={() => { this.setState({ failed: false }); onRetry(); }}>{t('Try again')}</button>
      </div>
    );
  }
}

export default function PerformancePage() {
  const { isAdmin } = useAuth();
  const { projectId, t, lang } = useProject();
  const router = useRouter();
  const loc = lang === 'ru' ? 'ru-RU' : 'en-GB';
  const [userId, setUserId] = useState(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('user')) || 'all');
  const [range, setRange] = useState('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [loadCount, setLoadCount] = useState(0); // bumps on every newly loaded report (resets the error boundary)

  const dur = (min) => { const m = Math.round(min || 0), h = Math.floor(m / 60), r = m % 60; return lang === 'ru' ? (h ? `${h} ч${r ? ` ${r} мин` : ''}` : `${r} мин`) : (h ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`); };
  const time = (iso) => iso ? new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', timeZone: data?.timezone }) : '—';
  const dateTime = (iso) => iso ? new Date(iso).toLocaleString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: data?.timezone }) : '—';
  const dayLabel = (d, long) => new Date(`${d}T12:00:00Z`).toLocaleDateString(loc, long ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' });

  // Only the newest request may update the page: switching quickly between people/periods on a slow
  // connection must never leave an older (e.g. 7-day) answer showing under a newer choice (e.g. Today).
  const reqSeq = useRef(0);
  const load = useCallback(async () => {
    if (range === 'custom' && (!from || !to)) return;
    const mine = ++reqSeq.current;
    setLoading(true); setErr('');
    const p = new URLSearchParams({ range, lang });
    if (userId && userId !== 'all') p.set('user_id', userId);
    if (projectId) p.set('project_id', projectId);
    if (range === 'custom') { p.set('from', from); p.set('to', to); }
    let message = '';
    try {
      const r = await fetch(`/api/reports/activity?${p}`, { cache: 'no-store' });
      let d = null; try { d = await r.json(); } catch { /* not JSON: e.g. the server restarting during an update */ }
      if (mine !== reqSeq.current) return;
      if (!r.ok || !d?.detail) message = d?.error ? t(d.error) : t('Could not load the report (error {code}). Please try again.', { code: r.status });
      else { setData(d); setLoadCount(n => n + 1); }
    } catch {
      if (mine !== reqSeq.current) return;
      message = t('Cannot reach the server. Check your connection and try again.');
    }
    setErr(message);
    setLoading(false);
  }, [userId, range, from, to, projectId, lang, t]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);
  useEffect(() => { if (userId) window.history.replaceState(null, '', userId === 'all' ? '/performance' : `/performance?user=${userId}`); }, [userId]);

  const d = data?.detail;
  // The person shown is the one the loaded report is about (never a newer pick whose data hasn't arrived)
  const selected = d?.id != null ? (data?.team || []).find(m => String(m.id) === String(d.id)) || null : null;

  const metricRows = useMemo(() => d ? Object.keys(METRIC_LABELS).map(k => ({ key: k, label: t(METRIC_LABELS[k]), value: d.counts?.[k] || 0 })).filter(r => r.value > 0 || r.key !== 'other').sort((a, b) => b.value - a.value) : [], [d, t]);

  if (!isAdmin) return <div className="page-content"><div className="card" style={{ padding: 40, textAlign: 'center' }}>{t('Super admin only')}</div></div>;

  const chip = (active) => ({ padding: '7px 13px', borderRadius: 8, border: 'none', background: active ? '#fff' : 'transparent', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: active ? 700 : 500, fontSize: '0.78rem', cursor: 'pointer', color: active ? 'var(--text)' : 'var(--text-dim)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 });
  const card = { background: VIZ.surface, border: '1px solid rgba(11,11,11,0.08)', borderRadius: 12, padding: 16 };
  const h3 = { fontSize: '0.86rem', fontWeight: 700, color: VIZ.ink, margin: 0 };
  const sub = { fontSize: '0.72rem', color: VIZ.muted, margin: '2px 0 12px' };

  const dayTip = (day) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <b>{dayLabel(day.date, true)}</b>
      <span>{t('Actions')}: {day.actions} · {t('Active')}: {dur(day.active_minutes)}</span>
      {day.first_login && <span>{t('First login')}: {time(day.first_login)} · {t('Last seen')}: {time(day.last_seen)}</span>}
      {Object.keys(METRIC_LABELS).filter(k => day[k] > 0).map(k => <span key={k} style={{ color: VIZ.ink2 }}>{t(METRIC_LABELS[k])}: {day[k]}</span>)}
    </div>
  );

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1><MI name="monitoring" size={26} /> {t('Team performance')}</h1>
          <p>{t('What each person did, when they were logged in and how long they were actually active.')}{data?.timezone ? ` · ${t('Days counted in')} ${data.timezone}` : ''}</p>
        </div>
      </div>

      {/* Filters — one row above the charts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <select value={userId} onChange={e => setUserId(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.82rem', fontFamily: 'inherit', minWidth: 230, background: '#fff' }}>
          <option value="all">{t('Whole team')}</option>
          {(data?.team || []).map(m => <option key={m.id} value={m.id}>{m.online_now ? '🟢 ' : ''}{m.name}{m.job_title ? ` — ${m.job_title}` : ''}</option>)}
        </select>
        <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 10, padding: 3, flexWrap: 'wrap' }}>
          {RANGES.map(([k, l]) => <button key={k} style={chip(range === k)} onClick={() => { setRange(k); if (k === 'custom' && !from) { setFrom(data?.from || ''); setTo(data?.to || ''); } }}>{range === k && <MI name="check" size={14} />}{t(l)}</button>)}
        </div>
        {range === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="date" value={from} max={to || data?.today} onChange={e => setFrom(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem', fontFamily: 'inherit' }} />
            <span style={{ color: 'var(--text-muted)' }}>→</span>
            <input type="date" value={to} min={from} max={data?.today} onChange={e => setTo(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem', fontFamily: 'inherit' }} />
          </div>
        )}
        {data && <span style={{ marginLeft: 'auto', fontSize: '0.74rem', color: 'var(--text-muted)' }}>{dayLabel(data.from)}{data.from !== data.to ? ` – ${dayLabel(data.to)}` : ''} · {data.days} {t(data.days === 1 ? 'day' : 'days')}</span>}
      </div>

      {err && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <MI name="error" size={16} /> <span style={{ flex: 1 }}>{err}</span>
          <button className="btn btn-sm btn-ghost" style={{ background: '#fff' }} onClick={load} disabled={loading}><MI name="refresh" size={14} /> {t('Try again')}</button>
        </div>
      )}
      {loading && !data && !err && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{t('Loading…')}</div>}

      <ReportBoundary t={t} onRetry={load} resetKey={loadCount}>
      {/* Drawn inside <Deferred> so anything that fails while building the report is caught by the boundary */}
      <Deferred render={() => d && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          {/* Who */}
          {selected && (
            <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ width: 42, height: 42, borderRadius: '50%', background: VIZ.blue, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{selected.name?.charAt(0)}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: VIZ.ink }}>{selected.name}</div>
                <div style={{ fontSize: '0.74rem', color: VIZ.muted }}>{selected.job_title || t(selected.role)}</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: selected.online_now ? '#f0fdf4' : '#f1f5f9', color: selected.online_now ? '#006300' : VIZ.ink2, fontSize: '0.72rem', fontWeight: 700 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: selected.online_now ? '#0ca30c' : '#b0b0a8' }} />
                {selected.online_now ? t('Online now') : t('Offline')}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 20, fontSize: '0.76rem', color: VIZ.ink2 }}>
                <div><div style={{ color: VIZ.muted, fontSize: '0.68rem' }}>{t('First login in period')}</div><b>{dateTime(selected.first_login)}</b></div>
                <div><div style={{ color: VIZ.muted, fontSize: '0.68rem' }}>{t('Last seen')}</div><b>{dateTime(selected.last_seen)}</b></div>
              </div>
            </div>
          )}

          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              ['Active time', dur(d.active_minutes), 'bolt', t('actually using the CRM')],
              ['Time logged in', dur(d.online_minutes), 'schedule', `${d.sessions_count} ${t('sessions')}`],
              ['Days active', `${d.days_active} / ${data.days}`, 'calendar_month', ''],
              ['Total actions', d.total_actions, 'touch_app', ''],
              ['Leads added', d.counts.leads_added, 'person_add', ''],
              ['Leads achieved', d.counts?.leads_achieved || 0, 'emoji_events', ''],
              ['Status changes', d.counts.status_changes, 'swap_horiz', ''],
              ['Follow-ups completed', d.counts.followups_done, 'event_available', ''],
              ['To-dos completed', d.counts.todos_done, 'task_alt', ''],
            ].map(([label, value, icon, note]) => (
              <div key={label} style={{ ...card, padding: '12px 14px' }}>
                <div style={{ fontSize: '0.7rem', color: VIZ.muted, display: 'flex', alignItems: 'center', gap: 5 }}><MI name={icon} size={14} /> {t(label)}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: VIZ.ink, marginTop: 4, whiteSpace: 'nowrap' }}>{value}</div>
                {note && <div style={{ fontSize: '0.66rem', color: VIZ.muted }}>{note}</div>}
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="perf-grid">
            <div style={card}>
              <h3 style={h3}>{t('Actions per day')}</h3>
              <p style={sub}>{t('Everything logged: lead work, comments, follow-ups, to-dos, daily updates, messages')}</p>
              <ColumnChart data={d.daily.map(x => ({ key: x.date, label: dayLabel(x.date), value: x.actions, tip: dayTip(x) }))} color={VIZ.blue} emptyText={t('No activity in this period')} ariaLabel={t('Actions per day')} />
            </div>
            <div style={card}>
              <h3 style={h3}>{t('Active time per day')}</h3>
              <p style={sub}>{t('Hours actually spent working in the CRM (idle time not counted)')}</p>
              <ColumnChart data={d.daily.map(x => ({ key: x.date, label: dayLabel(x.date), value: Math.round(x.active_minutes / 6) / 10, tip: dayTip(x) }))} color={VIZ.violet} format={(v) => lang === 'ru' ? `${v} ч` : `${v}h`} emptyText={t('No login sessions recorded in this period')} ariaLabel={t('Active time per day')} />
            </div>
            <div style={card}>
              <h3 style={h3}>{t('What was done')}</h3>
              <p style={sub}>{t('Breakdown of all actions in the period')}</p>
              <HBarChart rows={metricRows} color={VIZ.blue} labelWidth={170} />
            </div>
            <div style={card}>
              <h3 style={h3}>{t('Working hours')}</h3>
              <p style={sub}>{t('Actions by hour of the day')} ({data.timezone})</p>
              <ColumnChart data={d.hours.map((v, h) => ({ key: h, label: `${String(h).padStart(2, '0')}`, value: v, tip: <span><b>{String(h).padStart(2, '0')}:00–{String(h).padStart(2, '0')}:59</b> · {v} {t('actions')}</span> }))} labelEvery={3} color={VIZ.blue} height={190} emptyText={t('No activity in this period')} ariaLabel={t('Working hours')} />
            </div>
          </div>

          {/* Team comparison */}
          <div className="perf-grid" style={{ marginTop: 14 }}>
            <div style={card}>
              <h3 style={h3}>{t('Team comparison — actions')}</h3>
              <p style={sub}>{t('Click a name to open their report')}</p>
              <HBarChart rows={[...data.team].sort((a, b) => b.total_actions - a.total_actions).map(m => ({ key: m.id, id: m.id, label: m.name, value: m.total_actions, emphasis: String(m.id) === String(userId), sub: m.online_now ? '● ' + t('online') : '' }))} color={VIZ.blue} onRowClick={(r) => setUserId(String(r.id))} />
            </div>
            <div style={card}>
              <h3 style={h3}>{t('Team comparison — active time')}</h3>
              <p style={sub}>{t('Time actually spent working in the CRM')}</p>
              <HBarChart rows={[...data.team].sort((a, b) => b.active_minutes - a.active_minutes).map(m => ({ key: m.id, id: m.id, label: m.name, value: m.active_minutes, emphasis: String(m.id) === String(userId), sub: `${t('logged in')} ${dur(m.online_minutes)}` }))} color={VIZ.violet} format={dur} onRowClick={(r) => setUserId(String(r.id))} />
            </div>
          </div>

          {/* Day by day (the table view of the charts) */}
          <div style={{ ...card, padding: 0, marginTop: 14, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 0' }}><h3 style={h3}>{t('Day by day')}</h3><p style={sub}>{t('Login, logout and work for each day')}</p></div>
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead><tr>
                  <th>{t('Date')}</th>{selected && <><th>{t('First login')}</th><th>{t('Last seen')}</th></>}<th>{t('Time logged in')}</th><th>{t('Active time')}</th><th>{t('Actions')}</th><th>{t('Leads added')}</th><th>{t('Status changes')}</th><th>{t('Comments')}</th><th>{t('Follow-ups completed')}</th><th>{t('To-dos completed')}</th>
                </tr></thead>
                <tbody>
                  {[...d.daily].reverse().map(x => (
                    <tr key={x.date} style={{ opacity: x.actions || x.online_minutes ? 1 : 0.5 }}>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{dayLabel(x.date, true)}</td>
                      {selected && <><td>{time(x.first_login)}</td><td>{time(x.last_seen)}</td></>}
                      <td>{dur(x.online_minutes)}</td><td>{dur(x.active_minutes)}</td>
                      <td style={{ fontWeight: 700 }}>{x.actions}</td><td>{x.leads_added || '—'}</td><td>{x.status_changes || '—'}</td><td>{x.comments || '—'}</td><td>{x.followups_done || '—'}</td><td>{x.todos_done || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selected && (
            <div className="perf-grid" style={{ marginTop: 14, alignItems: 'start' }}>
              {/* Sessions */}
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 0' }}><h3 style={h3}>{t('Login sessions')}</h3><p style={sub}>{t('Each time they signed in — when, until when, and how long they were actually active')}</p></div>
                {(d.sessions || []).length === 0 ? <p className="no-data" style={{ padding: 20 }}>{t('No login sessions recorded in this period')}</p> : (
                  <div className="table-container" style={{ border: 'none', maxHeight: 420, overflowY: 'auto' }}>
                    <table>
                      <thead><tr><th>{t('Login')}</th><th>{t('Logout / last seen')}</th><th>{t('Logged in')}</th><th>{t('Active')}</th></tr></thead>
                      <tbody>
                        {d.sessions.map((s, i) => (
                          <tr key={i}>
                            <td style={{ whiteSpace: 'nowrap' }}>{dateTime(s.started_at)}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {s.still_online ? <span style={{ color: '#006300', fontWeight: 700 }}>● {t('Online now')}</span>
                                : <>{dateTime(s.ended_at || s.last_seen_at)} <span style={{ fontSize: '0.66rem', color: VIZ.muted }}>{s.ended_reason === 'logout' ? t('signed out') : t('went inactive')}</span></>}
                            </td>
                            <td>{dur(s.online_minutes)}</td>
                            <td style={{ fontWeight: 600 }}>{dur(s.active_minutes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 0' }}><h3 style={h3}>{t('Activity timeline')}</h3><p style={sub}>{t('Everything they did, newest first')}</p></div>
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  {(d.feed || []).length === 0 ? <p className="no-data" style={{ padding: 20 }}>{t('No activity in this period')}</p> : d.feed.map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 16px', borderTop: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, background: '#eef2ff', color: VIZ.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><MI name={METRIC_ICONS[f.metric] || 'bolt'} size={15} /></span>
                      <div style={{ flex: 1, minWidth: 0, fontSize: '0.78rem' }}>
                        <div style={{ color: VIZ.ink }}>
                          {f.lead && <a href={`/leads?log=${f.lead.id}`} onClick={(e) => { e.preventDefault(); router.push(`/leads?log=${f.lead.id}`); }} style={{ color: VIZ.blue, fontWeight: 600, textDecoration: 'none' }}>#{f.lead.seq} {f.lead.company}</a>}
                          {f.lead && ' · '}{f.text || t(METRIC_LABELS[f.metric] || 'Other actions')}
                        </div>
                        {f.comment && <div style={{ marginTop: 3, color: '#78350f', background: '#fffbeb', borderRadius: 6, padding: '3px 8px', whiteSpace: 'pre-wrap' }}>💬 {f.comment}</div>}
                        <div style={{ fontSize: '0.66rem', color: VIZ.muted, marginTop: 2 }}>{dateTime(f.at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )} />
      </ReportBoundary>
    </div>
  );
}
