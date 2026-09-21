'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TONE, bucketOf, FollowUpRow, useFollowUpActions } from '@/components/FollowUps';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

export default function DashboardPage() {
  const { user, isAdmin, canSee } = useAuth();
  const router = useRouter();
  const { projectId, activeProject, t } = useProject();
  const [data, setData] = useState({ stats: {} });
  const [loading, setLoading] = useState(true);

  // Follow-ups assigned to me (lead reminders)
  const showFollowups = canSee('leads');
  const [followups, setFollowups] = useState([]);
  const loadFollowups = useCallback(() => {
    if (!showFollowups) return;
    fetch(`/api/followups?status=open&mine=1${projectId ? '&project_id=' + projectId : ''}`).then(r => r.json()).then(d => setFollowups(d.followups || [])).catch(() => {});
  }, [showFollowups, projectId]);
  useEffect(() => { loadFollowups(); }, [loadFollowups]);
  const fu = useFollowUpActions(loadFollowups);

  useEffect(() => { fetch(`/api/dashboard${projectId ? '?project_id=' + projectId : ''}`).then(r => r.json()).then(setData).finally(() => setLoading(false)); }, [projectId]);

  if (loading) return (
    <div className="page-content">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 60 }}>
        {[1,2,3,4,5,6].map(i => <div key={i} className="card"><div className="skeleton" style={{ height: 60, borderRadius: 8 }} /></div>)}
      </div>
    </div>
  );

  const { stats } = data;
  const rate = stats.completion_rate || 0;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (rate / 100) * circumference;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1><MI name="dashboard" size={26} /> {t('Dashboard')}</h1>
          <p>{t('Welcome back,')} <strong>{user?.name}</strong></p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/tasks" className="btn btn-sm btn-ghost"><MI name="task_alt" size={16} /> {t('Tasks')}</Link>
          <Link href="/messages" className="btn btn-sm btn-info"><MI name="chat" size={16} /> {t('Messages')} {stats.unread_messages > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700 }}>{stats.unread_messages}</span>}</Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: t('Total Tasks'), value: stats.total_tasks || 0, icon: 'task_alt', color: '#6366f1' },
          { label: t('Completed'), value: stats.completed_tasks || 0, icon: 'check_circle', color: '#10b981' },
          { label: t('Pending'), value: stats.pending_tasks || 0, icon: 'schedule', color: '#f59e0b' },
          { label: t('Total Leads'), value: stats.total_leads || 0, icon: 'leaderboard', color: '#3b82f6' },
          { label: t('HOT Leads'), value: stats.hot_leads || 0, icon: 'local_fire_department', color: '#ef4444' },
          ...(isAdmin ? [{ label: t('Team Members'), value: stats.total_users || 0, icon: 'group', color: '#8b5cf6' }] : []),
        ].map(m => (
          <div key={m.label} className="stat-card" style={{ borderTopColor: m.color, cursor: 'pointer' }}>
            <div className="stat-icon"><MI name={m.icon} size={18} /></div>
            <div className="stat-value" style={{ color: m.color }}>{m.value}</div>
            <div className="stat-label">{m.label}</div>
          </div>
        ))}
      </div>

      {showFollowups && (() => {
        const b = { overdue: [], today: [], week: [] };
        for (const f of followups) { const k = bucketOf(f.due_at); if (k === 'overdue') b.overdue.push(f); else if (k === 'today') b.today.push(f); else if (k === 'tomorrow' || k === 'week') b.week.push(f); }
        const upcoming = [...b.overdue, ...b.today, ...b.week].slice(0, 6);
        return (
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}><MI name="event_upcoming" size={18} /> {t('My follow-ups')}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {[['overdue', t('Overdue'), b.overdue.length], ['today', t('Today'), b.today.length], ['week', t('Next 7 days'), b.week.length]].map(([k, l, n]) => (
                  <span key={k} style={{ padding: '3px 10px', borderRadius: 20, background: TONE[k].bg, color: TONE[k].text, border: `1px solid ${TONE[k].border}`, fontSize: '0.72rem', fontWeight: 700 }}>{l}: {n}</span>
                ))}
                <Link href="/followups" style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', marginLeft: 6 }}>{t('Open calendar')} →</Link>
              </div>
            </div>
            {upcoming.length === 0
              ? <p className="no-data" style={{ padding: 24 }}>{t('No follow-ups in the next 7 days. Schedule one from a lead or the Follow-ups page.')}</p>
              : upcoming.map(f => <FollowUpRow key={f.id} f={f} {...fu.actions} onOpenLead={(x) => router.push(`/leads?log=${x.lead_id}`)} />)}
          </div>
        );
      })()}
      {fu.modals(projectId)}

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, marginBottom: 24 }}>
        {/* Completion Ring */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{t('Task Completion')}</div>
          <div style={{ position: 'relative', width: 120, height: 120 }}>
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="8" />
              <circle cx="60" cy="60" r="54" fill="none" stroke={rate >= 75 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444'} strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" transform="rotate(-90 60 60)" style={{ transition: 'stroke-dashoffset 1s ease' }} />
            </svg>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{rate}%</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{stats.completed_tasks}/{stats.total_tasks}</div>
            </div>
          </div>
        </div>

        {/* Recent Tasks */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}><MI name="task_alt" size={18} /> {t('Recent Tasks')}</span>
            <Link href="/tasks" style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>{t('View All')} →</Link>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {(!stats.recentTasks || stats.recentTasks.length === 0) ? (
              <p className="no-data" style={{ padding: 30 }}>{t('No tasks yet. Create one from the Tasks page.')}</p>
            ) : stats.recentTasks.map(task => (
              <div key={task.id} style={{ display: 'flex', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: task.status === 'complete' ? '#10b981' : 'var(--bg)', color: task.status === 'complete' ? '#fff' : 'var(--text-muted)', flexShrink: 0 }}>
                  <MI name={task.status === 'complete' ? 'check' : 'radio_button_unchecked'} size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, textDecoration: task.status === 'complete' ? 'line-through' : 'none', color: task.status === 'complete' ? 'var(--text-muted)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t('Assigned to:')} {task.assigned_to_name}</div>
                </div>
                <span className={`badge badge-${task.status}`}>{t(task.status)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
