'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { MI, TONE, bucketOf, sameDay, startOfDay, FollowUpRow, useFollowUpActions } from '@/components/FollowUps';

const GROUPS = [
  { key: 'overdue', label: 'Overdue', icon: 'warning' },
  { key: 'today', label: 'Today', icon: 'today' },
  { key: 'tomorrow', label: 'Tomorrow', icon: 'wb_sunny' },
  { key: 'week', label: 'Next 7 days', icon: 'date_range' },
  { key: 'later', label: 'Later', icon: 'event' },
];

export default function FollowUpsPage() {
  const { user, isAdmin } = useAuth();
  const { projectId, t, lang } = useProject();
  const router = useRouter();
  // Super admins rarely have follow-ups assigned to themselves, so default them to the whole team's
  // list — matches the Dashboard's "Team follow-ups" widget, which does the same for the same reason.
  const [scope, setScope] = useState(isAdmin ? 'all' : 'mine');
  const [tab, setTab] = useState('open');       // open | done
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState(null);         // selected calendar day (Date) or null = agenda
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ status: tab });
    if (projectId) p.set('project_id', projectId);
    if (scope === 'mine') p.set('mine', '1');
    try { const d = await (await fetch(`/api/followups?${p}`)).json(); setItems(d.followups || []); } catch { setItems([]); }
    setLoading(false);
  }, [tab, scope, projectId]);
  useEffect(() => { if (user) load(); }, [user, load]);

  const { actions, modals, create } = useFollowUpActions(load);
  const openLead = (f) => router.push(`/leads?log=${f.lead_id}`);

  // Calendar grid (weeks start on Monday)
  const cells = useMemo(() => {
    const first = new Date(month); const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const f of items) { const k = startOfDay(tab === 'done' ? f.done_at : f.due_at).getTime(); m.set(k, [...(m.get(k) || []), f]); }
    return m;
  }, [items, tab]);
  const loc = lang === 'ru' ? 'ru-RU' : 'en-GB';
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: 'short' }));
  const today = new Date();

  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, week: 0 };
    if (tab === 'open') for (const f of items) { const b = bucketOf(f.due_at); if (b === 'overdue') c.overdue++; else if (b === 'today') c.today++; else if (b === 'tomorrow' || b === 'week') c.week++; }
    return c;
  }, [items, tab]);

  const listItems = day ? (byDay.get(startOfDay(day).getTime()) || []) : items;
  const grouped = tab === 'open' && !day
    ? GROUPS.map(g => ({ ...g, items: listItems.filter(f => bucketOf(f.due_at) === g.key) })).filter(g => g.items.length)
    : [{ key: 'list', label: day ? day.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }) : t('Completed'), icon: day ? 'event' : 'task_alt', items: listItems }];

  async function runReminders() {
    setRunning(true);
    try { const r = await (await fetch('/api/followups/run-reminders', { method: 'POST' })).json(); alert(t('Reminders checked: {sent} sent, {failed} failed', { sent: r.sent ?? 0, failed: r.failed ?? 0 })); load(); }
    catch { alert(t('Failed')); }
    setRunning(false);
  }

  const tabBtn = (active) => ({ padding: '7px 14px', borderRadius: 8, border: 'none', background: active ? '#fff' : 'transparent', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', color: active ? 'var(--text)' : 'var(--text-dim)', fontFamily: 'inherit' });

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1><MI name="event_upcoming" size={26} /> {t('Follow-ups')}</h1>
          <p>{t('Reminders for your leads — plan the next call, email or meeting and never miss a deadline.')}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && <button className="btn btn-sm btn-ghost" onClick={runReminders} disabled={running} title={t('Send due email reminders now')}><MI name="forward_to_inbox" size={16} /> {running ? t('Sending…') : t('Send due reminders')}</button>}
          <button className="btn btn-primary" onClick={() => create(null)}><MI name="add" size={18} /> {t('New follow-up')}</button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { k: 'overdue', label: t('Overdue'), v: counts.overdue, icon: 'warning' },
          { k: 'today', label: t('Due today'), v: counts.today, icon: 'today' },
          { k: 'week', label: t('Next 7 days'), v: counts.week, icon: 'date_range' },
        ].map(s => (
          <div key={s.k} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, borderLeft: `4px solid ${TONE[s.k].dot}`, padding: '12px 16px' }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: TONE[s.k].bg, color: TONE[s.k].text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MI name={s.icon} size={20} /></span>
            <div><div style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1, color: TONE[s.k].text }}>{tab === 'open' ? s.v : '—'}</div><div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 3 }}>{s.label}</div></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
          <button style={tabBtn(tab === 'open')} onClick={() => { setTab('open'); setDay(null); }}>{t('To do')}</button>
          <button style={tabBtn(tab === 'done')} onClick={() => { setTab('done'); setDay(null); }}>{t('Completed')}</button>
        </div>
        <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
          <button style={tabBtn(scope === 'mine')} onClick={() => setScope('mine')}><MI name="person" size={14} /> {t('Mine')}</button>
          <button style={tabBtn(scope === 'all')} onClick={() => setScope('all')}><MI name="group" size={14} /> {t('Whole team')}</button>
        </div>
        {day && <button className="btn btn-sm btn-ghost" onClick={() => setDay(null)}><MI name="close" size={14} /> {t('Show all dates')}</button>}
      </div>

      <div className="followups-grid">
        {/* Calendar */}
        <div className="card" style={{ padding: 14, alignSelf: 'start' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><MI name="chevron_left" /></button>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', textTransform: 'capitalize' }}>{month.toLocaleDateString(loc, { month: 'long', year: 'numeric' })}</div>
            <button className="btn btn-sm btn-ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><MI name="chevron_right" /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {weekdays.map(w => <div key={w} style={{ textAlign: 'center', fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 0' }}>{w}</div>)}
            {cells.map(d => {
              const list = byDay.get(startOfDay(d).getTime()) || [];
              const inMonth = d.getMonth() === month.getMonth();
              const isToday = sameDay(d, today);
              const isSel = day && sameDay(d, day);
              const hasOverdue = tab === 'open' && list.some(f => bucketOf(f.due_at) === 'overdue');
              const tone = hasOverdue ? TONE.overdue : tab === 'done' ? TONE.done : TONE.tomorrow;
              return (
                <button key={d.toISOString()} onClick={() => setDay(isSel ? null : d)}
                  style={{ aspectRatio: '1 / 0.9', border: isSel ? '2px solid var(--primary)' : '1px solid ' + (isToday ? 'var(--primary)' : '#eef2f7'), borderRadius: 8, background: isSel ? '#eef2ff' : list.length ? tone.bg : '#fff', opacity: inMonth ? 1 : 0.4, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 2, fontFamily: 'inherit' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--primary)' : 'var(--text)' }}>{d.getDate()}</span>
                  {list.length > 0 && <span style={{ minWidth: 18, padding: '0 5px', height: 16, borderRadius: 8, background: tone.dot, color: '#fff', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{list.length}</span>}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: '0.66rem', color: 'var(--text-dim)' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: TONE.overdue.dot }} /> {t('Overdue')}</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: TONE.tomorrow.dot }} /> {t('Planned')}</span>
            <span>{t('Click a day to see its follow-ups')}</span>
          </div>
        </div>

        {/* Agenda */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{t('Loading…')}</div>
            : listItems.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <MI name={tab === 'done' ? 'task_alt' : 'event_available'} size={40} />
                <div style={{ marginTop: 8, fontSize: '0.86rem' }}>{tab === 'done' ? t('No completed follow-ups yet') : day ? t('Nothing planned for this day') : t('No follow-ups planned. You are all caught up!')}</div>
                {tab === 'open' && <button className="btn btn-sm btn-primary" style={{ marginTop: 14 }} onClick={() => create(null)}><MI name="add" size={16} /> {t('New follow-up')}</button>}
              </div>
            ) : grouped.map(g => (
              <div key={g.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: TONE[g.key]?.bg || '#f8fafc', color: TONE[g.key]?.text || 'var(--text)', fontWeight: 700, fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #f1f5f9' }}>
                  <MI name={g.icon} size={16} /> {t(g.label)} <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{g.items.length}</span>
                </div>
                {g.items.map(f => <FollowUpRow key={f.id} f={f} {...actions} onOpenLead={openLead} />)}
              </div>
            ))}
        </div>
      </div>
      {modals(projectId)}
    </div>
  );
}
