'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TONE, bucketOf, FollowUpRow, useFollowUpActions } from '@/components/FollowUps';
import { useTodos, TodoQuickAdd, TodoRow, bucketOf as todoBucketOf, TONE as TODO_TONE, todayStr } from '@/components/Todos';
import LeadLogModal from '@/components/LeadLogModal';
import { RankBadge, PriorityReason } from '@/components/LeadPriority';
import { SC, PC } from '@/lib/lead-status';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

export default function DashboardPage() {
  const { user, isAdmin, canSee } = useAuth();
  const router = useRouter();
  const { projectId, activeProject, t, lang } = useProject();
  // A lead's log opens right here (no jump to Lead Management)
  const [logLead, setLogLead] = useState(null);

  // Priority leads: the top of the same ranking as Lead Management's Priority view.
  // Super admins see the whole team's; everyone else sees their own leads (added by them or CC'd).
  const showLeads = canSee('leads');
  const [prio, setPrio] = useState({ leads: [], total: 0, reasons: {} });
  const loadPrio = useCallback(() => {
    if (!showLeads) return;
    fetch(`/api/settings/priority${projectId ? `?project_id=${projectId}` : ''}`).then(r => r.ok ? r.json() : null).catch(() => null).then(s => {
    const c = s?.config || { dashboard_count: 8, dashboard_scope: 'own' };
    const q = new URLSearchParams({ view: 'priority', limit: String(c.dashboard_count) });
    if (projectId) q.set('project_id', projectId);
    if (!isAdmin && c.dashboard_scope === 'own') q.set('mine', '1');
    return fetch(`/api/leads?${q}`).then(r => r.json()).then(d => setPrio({ leads: d.leads || [], total: d.total || 0, reasons: d.reasons || {} }));
    }).catch(() => {});
  }, [showLeads, isAdmin, projectId]);
  useEffect(() => { loadPrio(); }, [loadPrio]);
  const [data, setData] = useState({ stats: {} });
  const [loading, setLoading] = useState(true);

  // Follow-ups: a super admin rarely has reminders assigned to themselves, so "mine only" would
  // almost always show empty for them — show the whole team's open reminders instead. Everyone else
  // sees just their own, as before.
  const showFollowups = canSee('leads');
  const [followups, setFollowups] = useState([]);
  const loadFollowups = useCallback(() => {
    if (!showFollowups) return;
    const mine = isAdmin ? '' : '&mine=1';
    fetch(`/api/followups?status=open&exclude_closed=1${mine}${projectId ? '&project_id=' + projectId : ''}`).then(r => r.json()).then(d => setFollowups(d.followups || [])).catch(() => {});
  }, [showFollowups, isAdmin, projectId]);
  useEffect(() => { loadFollowups(); }, [loadFollowups]);
  const fu = useFollowUpActions(loadFollowups);

  // My to-do list
  const showTodos = canSee('todos');
  const { todos, reload: reloadTodos } = useTodos();
  const today = todayStr();

  // Team overview (super admin only) — what everyone's been up to: to-dos, follow-ups, today's
  // daily update, last activity. Without this an admin had to open each person's pages one by one.
  const [team, setTeam] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);
  useEffect(() => {
    if (!isAdmin) { setTeamLoading(false); return; }
    fetch(`/api/dashboard/team${projectId ? '?project_id=' + projectId : ''}`).then(r => r.json()).then(d => setTeam(d.team || [])).catch(() => {}).finally(() => setTeamLoading(false));
  }, [isAdmin, projectId]);

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
      <div className="m-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: t('Total Tasks'), value: stats.total_tasks || 0, icon: 'task_alt', color: '#6366f1', href: '/tasks' },
          { label: t('Completed'), value: stats.completed_tasks || 0, icon: 'check_circle', color: '#10b981', href: '/tasks' },
          { label: t('Pending'), value: stats.pending_tasks || 0, icon: 'schedule', color: '#f59e0b', href: '/tasks' },
          { label: t('Total Leads'), value: stats.total_leads || 0, icon: 'leaderboard', color: '#3b82f6', href: '/leads' },
          { label: t('HOT Leads'), value: stats.hot_leads || 0, icon: 'local_fire_department', color: '#ef4444', href: '/leads?priority=HOT' },
          ...(isAdmin ? [{ label: t('Team Members'), value: stats.total_users || 0, icon: 'group', color: '#8b5cf6', href: '/admin' }] : []),
          // Leads that left the working list: one click opens Lead Management already filtered to them
          ...(showLeads ? [
            { label: t('Not Interested'), value: stats.not_interested_leads || 0, icon: 'thumb_down', color: '#A32D2D', href: '/leads?status=not_interested' },
            { label: t('Closed'), value: stats.closed_leads || 0, icon: 'block', color: '#4b5563', href: '/leads?status=closed' },
            { label: t('Achieved Leads'), value: stats.achieved_leads || 0, icon: 'emoji_events', color: '#b45309', href: '/leads/achieved' },
          ] : []),
        ].map(m => (
          <div key={m.label} className="stat-card" style={{ borderTopColor: m.color, cursor: 'pointer' }} onClick={() => router.push(m.href)}>
            <div className="stat-icon"><MI name={m.icon} size={18} /></div>
            <div className="stat-value" style={{ color: m.color }}>{m.value}</div>
            <div className="stat-label">{m.label}</div>
          </div>
        ))}
      </div>

      {showLeads && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}><MI name="local_fire_department" size={18} /> {t(isAdmin ? 'Priority leads' : 'My priority leads')}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {[['overdue', t('Overdue'), '#b91c1c', '#fef2f2'], ['due_today', t('Today'), '#c2410c', '#fff7ed'], ['hot_deal', t('Hot deals'), '#6d28d9', '#f5f3ff'], ['due_soon', t('Next 3 days'), '#1d4ed8', '#eff6ff']].map(([k, l, c, bg]) => (
                <span key={k} style={{ padding: '3px 10px', borderRadius: 20, background: bg, color: c, fontSize: '0.72rem', fontWeight: 700 }}>{l}: {prio.reasons[k] || 0}</span>
              ))}
              <Link href={isAdmin ? '/leads' : '/leads?mine=1'} style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', marginLeft: 6 }}>{t('All {n} in Lead Management', { n: prio.total })} →</Link>
            </div>
          </div>
          {prio.leads.length === 0
            ? <p className="no-data" style={{ padding: 24 }}>{t('Nothing urgent — no open leads need attention right now.')}</p>
            : prio.leads.map(l => {
              const sc = SC[l.status] || SC.not_contacted, pc = PC[l.priority] || PC.MEDIUM;
              return (
                <div key={l.id} onClick={() => setLogLead(l)} role="button"
                  style={{ display: 'flex', gap: 12, padding: '10px 18px', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start', cursor: 'pointer', borderLeft: `3px solid ${pc.text}` }}>
                  <RankBadge n={l.priority_rank} t={t} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text)', wordBreak: 'break-word' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>#{l.project_seq ?? l.id}</span> {l.company_name}
                    </div>
                    <PriorityReason r={l.priority_reason} t={t} lang={lang} />
                    {(l.last_comment || l.notes) && <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>💬 {l.last_comment || l.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 20, background: pc.bg, color: pc.text, fontSize: '0.66rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{t(pc.label)}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 20, background: sc.bg, color: sc.text, fontSize: '0.66rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{t(sc.label)}</span>
                  </div>
                </div>
              );
            })}
        </div>
      )}
      {logLead && <LeadLogModal lead={logLead} projectId={projectId} onChanged={() => { loadPrio(); loadFollowups(); }} onClose={() => setLogLead(null)} />}

      {showFollowups && (() => {
        const b = { overdue: [], today: [], week: [], later: [] };
        for (const f of followups) { const k = bucketOf(f.due_at); if (k === 'overdue') b.overdue.push(f); else if (k === 'today') b.today.push(f); else if (k === 'tomorrow' || k === 'week') b.week.push(f); else b.later.push(f); }
        // includes "later" ones (e.g. a lead set to Follow Up Later in a month) so nothing scheduled is invisible here
        const upcoming = [...b.overdue, ...b.today, ...b.week, ...b.later].slice(0, 8);
        return (
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}><MI name="event_upcoming" size={18} /> {t(isAdmin ? 'Team follow-ups' : 'My follow-ups')}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {[['overdue', t('Overdue'), b.overdue.length], ['today', t('Today'), b.today.length], ['week', t('Next 7 days'), b.week.length], ['later', t('Later'), b.later.length]].map(([k, l, n]) => (
                  <span key={k} style={{ padding: '3px 10px', borderRadius: 20, background: TONE[k].bg, color: TONE[k].text, border: `1px solid ${TONE[k].border}`, fontSize: '0.72rem', fontWeight: 700 }}>{l}: {n}</span>
                ))}
                <Link href="/followups" style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', marginLeft: 6 }}>{t('Open calendar')} →</Link>
              </div>
            </div>
            {upcoming.length === 0
              ? <p className="no-data" style={{ padding: 24 }}>{t('No follow-ups scheduled. Schedule one from a lead or the Follow-ups page.')}</p>
              : upcoming.map(f => <FollowUpRow key={f.id} f={f} {...fu.actions} onOpenLead={(x) => setLogLead({ id: x.lead_id, company_name: x.company_name, project_seq: x.project_seq })} />)}
          </div>
        );
      })()}
      {fu.modals(projectId)}

      {showTodos && (() => {
        const overdue = todos.filter(td => todoBucketOf(td.todo_date, today) === 'overdue').length;
        const dueToday = todos.filter(td => todoBucketOf(td.todo_date, today) === 'today').length;
        return (
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}><MI name="checklist" size={18} /> {t('My to-dos')}</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {overdue > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, background: TODO_TONE.overdue.bg, color: TODO_TONE.overdue.text, border: `1px solid ${TODO_TONE.overdue.border}`, fontSize: '0.72rem', fontWeight: 700 }}>{t('Overdue')}: {overdue}</span>}
                <span style={{ padding: '3px 10px', borderRadius: 20, background: TODO_TONE.today.bg, color: TODO_TONE.today.text, border: `1px solid ${TODO_TONE.today.border}`, fontSize: '0.72rem', fontWeight: 700 }}>{t('Today')}: {dueToday}</span>
                <Link href="/todos" style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', marginLeft: 6 }}>{t('Open list')} →</Link>
              </div>
            </div>
            <div style={{ padding: '10px 18px 4px' }}><TodoQuickAdd compact onAdded={reloadTodos} /></div>
            {todos.length === 0
              ? <p className="no-data" style={{ padding: 24 }}>{t('Nothing on your list. Add your first to-do above.')}</p>
              : todos.slice(0, 8).map(td => <TodoRow key={td.id} todo={td} today={today} onToggled={reloadTodos} onDeleted={reloadTodos} />)}
          </div>
        );
      })()}

      {isAdmin && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 8 }}><MI name="groups" size={18} /> {t('Team activity')}</span>
            <Link href="/team" style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>{t('Team')} →</Link>
          </div>
          {teamLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>{t('Loading…')}</div>
          ) : team.length === 0 ? (
            <p className="no-data" style={{ padding: 24 }}>{t('No team members yet.')}</p>
          ) : (
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead><tr>
                  <th>{t('Member')}</th><th>{t('Today’s update')}</th><th>{t('To-dos')}</th><th>{t('Follow-ups')}</th><th>{t('Last activity')}</th>
                </tr></thead>
                <tbody>
                  {team.map(m => (
                    <tr key={m.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 26, height: 26, borderRadius: '50%', background: m.role === 'super_admin' ? '#dc2626' : '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.68rem', flexShrink: 0 }}>{m.name?.charAt(0).toUpperCase()}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{m.name}</div>
                            {m.job_title && <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>{m.job_title}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        {m.daily_update_today
                          ? <span style={{ fontSize: '0.74rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: 4 }}><MI name="check_circle" size={14} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.daily_update_today.snippet || t('Posted')}</span></span>
                          : <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>— {t('nothing logged')}</span>}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>{m.todos_open}</span> <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t('open')}</span>
                        {m.todos_done_today > 0 && <span style={{ marginLeft: 6, fontSize: '0.68rem', color: '#15803d' }}>· {m.todos_done_today} {t('done today')}</span>}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.76rem', fontWeight: 600 }}>{m.followups_open}</span> <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{t('open')}</span>
                        {m.followups_overdue > 0 && <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 20, background: '#fef2f2', color: '#b91c1c', fontSize: '0.66rem', fontWeight: 700 }}>{m.followups_overdue} {t('overdue')}</span>}
                      </td>
                      <td style={{ fontSize: '0.7rem', color: 'var(--text-muted)', maxWidth: 220 }}>
                        {m.last_active_at ? (
                          <span title={m.last_action || ''}>{new Date(m.last_active_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, marginBottom: 24 }}>
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
