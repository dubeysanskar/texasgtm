'use client';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useTodos, TodoQuickAdd, TodoRow, bucketOf, TONE, todayStr } from '@/components/Todos';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

export default function TodosPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useProject();

  // Super admins can view (not edit) anyone else's list — to-dos are otherwise private to their owner.
  const [team, setTeam] = useState([]);
  const [viewingId, setViewingId] = useState(() => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('user') || '');
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/team').then(r => r.json()).then(d => setTeam((d.members || []).filter(m => m.is_active !== 0 && m.is_active !== false))).catch(() => {});
  }, [isAdmin]);
  useEffect(() => { if (viewingId) window.history.replaceState(null, '', '/todos'); }, [viewingId]);

  const viewingOther = isAdmin && viewingId && Number(viewingId) !== user?.id;
  const { todos, tab, setTab, loading, err, reload } = useTodos(viewingOther ? viewingId : undefined);
  const today = todayStr();
  const viewingName = viewingOther ? team.find(m => m.id === Number(viewingId))?.name : null;

  const groups = useMemo(() => {
    if (tab === 'done') return [{ key: 'done', label: t('Completed'), items: todos }];
    const by = { overdue: [], today: [], upcoming: [] };
    for (const td of todos) by[bucketOf(td.todo_date, today)].push(td);
    return [
      { key: 'overdue', label: t('Overdue'), icon: 'warning', items: by.overdue },
      { key: 'today', label: t('Today'), icon: 'today', items: by.today },
      { key: 'upcoming', label: t('Upcoming'), icon: 'event', items: by.upcoming },
    ].filter(g => g.items.length);
  }, [todos, tab, today, t]);

  const tabBtn = (active) => ({ padding: '7px 14px', borderRadius: 8, border: 'none', background: active ? '#fff' : 'transparent', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', color: active ? 'var(--text)' : 'var(--text-dim)', fontFamily: 'inherit' });

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1><MI name="checklist" size={26} /> {t('To-Do List')}</h1>
          <p>{t('Your personal checklist, by date — write it down, check it off. Private to you — a super admin can view it, no one else.')}</p>
        </div>
        {isAdmin && (
          <div className="leads-form-field" style={{ minWidth: 220 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MI name="visibility" size={14} /> {t('Viewing')}</label>
            <select value={viewingId} onChange={e => setViewingId(e.target.value)}>
              <option value="">{t('Me')}</option>
              {team.filter(m => m.id !== user?.id).map(m => <option key={m.id} value={m.id}>{m.name} — {t(m.role)}</option>)}
            </select>
          </div>
        )}
      </div>

      {viewingOther ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, fontSize: '0.8rem', color: '#3730a3', marginBottom: 14 }}>
          <MI name="visibility" size={16} /> {t('Viewing {name}’s to-dos — read-only.', { name: viewingName || '—' })}
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <TodoQuickAdd onAdded={() => { if (tab !== 'open') setTab('open'); else reload(); }} />
        </div>
      )}

      <div style={{ display: 'inline-flex', background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 14 }}>
        <button style={tabBtn(tab === 'open')} onClick={() => setTab('open')}>{t('To do')}</button>
        <button style={tabBtn(tab === 'done')} onClick={() => setTab('done')}>{t('Completed')}</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {err && <div style={{ padding: '10px 14px', color: '#dc2626', fontSize: '0.8rem' }}>{t(err)}</div>}
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{t('Loading…')}</div>
          : todos.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <MI name={tab === 'done' ? 'task_alt' : 'checklist'} size={40} />
              <div style={{ marginTop: 8, fontSize: '0.86rem' }}>{tab === 'done' ? t('No completed to-dos yet') : viewingOther ? t('Nothing on this list.') : t('Nothing on your list. Add your first to-do above.')}</div>
            </div>
          ) : groups.map(g => (
            <div key={g.key}>
              {tab === 'open' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: TONE[g.key]?.bg || '#f8fafc', color: TONE[g.key]?.text || 'var(--text)', fontWeight: 700, fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #f1f5f9' }}>
                  <MI name={g.icon} size={16} /> {g.label} <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{g.items.length}</span>
                </div>
              )}
              {g.items.map(td => <TodoRow key={td.id} todo={td} today={today} readOnly={viewingOther} onToggled={reload} onDeleted={reload} />)}
            </div>
          ))}
      </div>
    </div>
  );
}
