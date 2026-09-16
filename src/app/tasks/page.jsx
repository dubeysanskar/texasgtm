'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

const STATUS_LABELS = {
  pending: { label: 'Pending', icon: 'hourglass_empty', color: '#d97706', bg: 'rgba(245,158,11,0.1)' },
  in_progress: { label: 'In Progress', icon: 'sync', color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  review: { label: 'Under Review', icon: 'rate_review', color: '#0891b2', bg: 'rgba(8,145,178,0.1)' },
  complete: { label: 'Complete', icon: 'check_circle', color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
};
const PRIORITY_LABELS = {
  low: { label: 'Low', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  normal: { label: 'Normal', color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  high: { label: 'High', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  urgent: { label: 'Urgent', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
};

const getDeadlineInfo = (task, t = (s) => s) => {
  if (task.status === 'complete') return { label: t('Completed'), color: '#16a34a', bg: 'rgba(22,163,74,0.1)', icon: 'check_circle' };
  const created = new Date(task.created_at);
  const deadline = new Date(created.getTime() + (task.completion_days || 2) * 86400000);
  const msLeft = deadline - new Date();
  const hoursLeft = msLeft / 3600000;
  const daysLeft = msLeft / 86400000;
  if (msLeft <= 0) return { label: t('OVERDUE {n}d', { n: Math.abs(Math.floor(daysLeft)) }), color: '#fff', bg: '#dc2626', icon: 'error', overdue: true };
  if (hoursLeft <= 12) return { label: t('{n}h left', { n: Math.ceil(hoursLeft) }), color: '#dc2626', bg: 'rgba(220,38,38,0.12)', icon: 'alarm' };
  if (daysLeft <= 2) return { label: t('{n}d left', { n: Math.ceil(daysLeft) }), color: '#ea580c', bg: 'rgba(234,88,12,0.1)', icon: 'schedule' };
  return { label: t('{n}d left', { n: Math.ceil(daysLeft) }), color: '#16a34a', bg: 'rgba(22,163,74,0.08)', icon: 'schedule' };
};

export default function TasksPage() {
  const { user, isAdmin, isManager } = useAuth();
  const { projectId, t } = useProject();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: '', search: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', assigned_to: '', priority: 'normal', completion_days: 2 });
  const [selectedTask, setSelectedTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchTasks = useCallback(() => {
    const p = new URLSearchParams();
    if (filter.status) p.set('status', filter.status);
    if (filter.search) p.set('search', filter.search);
    if (projectId) p.set('project_id', projectId);
    fetch(`/api/tasks?${p}`).then(r => r.json()).then(d => { setTasks(d.tasks || []); setUsers(d.users || []); setStats(d.stats || {}); }).finally(() => setLoading(false));
  }, [filter, projectId]);
  useEffect(fetchTasks, [fetchTasks]);

  const createTask = async (e) => {
    e.preventDefault();
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, project_id: projectId }) });
    setForm({ title: '', assigned_to: '', priority: 'normal', completion_days: 2 }); setShowForm(false); fetchTasks();
  };

  const quickStatusChange = async (taskId, newStatus) => {
    await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, status: newStatus }) });
    fetchTasks();
  };

  const startEdit = (task) => { setEditingTask(task.id); setEditForm({ title: task.title, status: task.status, priority: task.priority, assigned_to: task.assigned_to || '', completion_days: task.completion_days }); };
  const saveEdit = async (taskId) => { await fetch('/api/tasks', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId, ...editForm }) }); setEditingTask(null); fetchTasks(); };
  const deleteTask = async (taskId) => { await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' }); setDeleteConfirm(null); fetchTasks(); };

  if (loading) return <div className="page-content"><div className="skeleton" style={{ height: 400, borderRadius: 12 }} /></div>;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1><MI name="task_alt" size={26} /> {t('Task Management')}</h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>{t('{p} pending, {i} in progress, {c} complete', { p: stats.pending || 0, i: stats.progress || 0, c: stats.complete || 0 })}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" placeholder={t('Search tasks...')} value={filter.search} onChange={e => setFilter(p => ({ ...p, search: e.target.value }))} style={{ width: 180 }} />
          <select className="form-input" style={{ width: 130 }} value={filter.status} onChange={e => setFilter(p => ({ ...p, status: e.target.value }))}>
            <option value="">{t('All Status')}</option><option value="pending">{t('Pending')}</option><option value="in_progress">{t('In Progress')}</option><option value="review">{t('Review')}</option><option value="complete">{t('Complete')}</option>
          </select>
          {isManager && <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}><MI name={showForm ? 'close' : 'add_task'} size={16} /> {showForm ? t('Cancel') : t('New Task')}</button>}
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, animation: 'slideUp 0.2s ease' }}>
          <form onSubmit={createTask}>
            <div className="form-row">
              <div className="form-group"><label>{t('Title')} *</label><input className="form-input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required /></div>
              <div className="form-group"><label>{t('Assign To')}</label><select className="form-input" value={form.assigned_to} onChange={e => setForm(p => ({ ...p, assigned_to: e.target.value }))}>
                <option value="">{t('Unassigned')}</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>{t('Priority')}</label><select className="form-input" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="low">{t('Low')}</option><option value="normal">{t('Normal')}</option><option value="high">{t('High')}</option><option value="urgent">🔥 {t('Urgent')}</option></select></div>
              <div className="form-group"><label>{t('Days to Complete')}</label><input type="number" className="form-input" value={form.completion_days} onChange={e => setForm(p => ({ ...p, completion_days: parseInt(e.target.value) || 2 }))} min={1} /></div>
            </div>
            <button type="submit" className="btn btn-success"><MI name="check" size={16} /> {t('Create Task')}</button>
          </form>
        </div>
      )}

      {/* Task cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tasks.map(task => {
          const si = STATUS_LABELS[task.status] || STATUS_LABELS.pending;
          const pi = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.normal;
          const dl = getDeadlineInfo(task, t);

          if (editingTask === task.id) return (
            <div key={task.id} className="card" style={{ animation: 'slideUp 0.2s ease' }}>
              <div className="form-group"><input className="form-input" value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} /></div>
              <div className="form-row">
                <div className="form-group"><label>{t('Status')}</label><select className="form-input" value={editForm.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}>
                  <option value="pending">{t('Pending')}</option><option value="in_progress">{t('In Progress')}</option><option value="review">{t('Review')}</option><option value="complete">{t('Complete')}</option></select></div>
                <div className="form-group"><label>{t('Priority')}</label><select className="form-input" value={editForm.priority} onChange={e => setEditForm(p => ({ ...p, priority: e.target.value }))}>
                  <option value="low">{t('Low')}</option><option value="normal">{t('Normal')}</option><option value="high">{t('High')}</option><option value="urgent">{t('Urgent')}</option></select></div>
                <div className="form-group"><label>{t('Assign')}</label><select className="form-input" value={editForm.assigned_to} onChange={e => setEditForm(p => ({ ...p, assigned_to: e.target.value }))}>
                  <option value="">{t('None')}</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                <div className="form-group"><label>{t('Days')}</label><input type="number" className="form-input" value={editForm.completion_days} onChange={e => setEditForm(p => ({ ...p, completion_days: e.target.value }))} min="1" /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-success btn-sm" onClick={() => saveEdit(task.id)}><MI name="check" size={14} /> {t('Save')}</button><button className="btn btn-ghost btn-sm" onClick={() => setEditingTask(null)}>{t('Cancel')}</button></div>
            </div>
          );

          return (
            <div key={task.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', borderLeft: `3px solid ${si.color}`, transition: 'transform 0.1s, box-shadow 0.1s' }} onClick={() => setSelectedTask(task)}>
              <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: si.bg, color: si.color, flexShrink: 0 }}><MI name={si.icon} size={16} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', textDecoration: task.status === 'complete' ? 'line-through' : 'none', color: task.status === 'complete' ? 'var(--text-muted)' : 'var(--text)' }}>{task.title}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{t('by')} {task.assigner_name} → {task.assigned_to_name} • {new Date(task.created_at).toLocaleDateString()}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {task.priority !== 'normal' && <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: pi.bg, color: pi.color }}>{task.priority === 'urgent' ? '🔥 ' : ''}{t(pi.label)}</span>}
                <span style={{ fontSize: '0.66rem', padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: dl.bg, color: dl.color, animation: dl.overdue ? 'pulse 1s infinite' : 'none', display: 'flex', alignItems: 'center', gap: 3 }}><MI name={dl.icon} size={12} /> {dl.label}</span>
                {isAdmin && <select value={task.status} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); quickStatusChange(task.id, e.target.value); }} style={{ fontSize: '0.72rem', padding: '3px 8px', border: `1px solid ${si.color}44`, borderRadius: 6, background: si.bg, color: si.color, cursor: 'pointer' }}>
                  <option value="pending">{t('Pending')}</option><option value="in_progress">{t('In Progress')}</option><option value="review">{t('Review')}</option><option value="complete">{t('Complete')}</option></select>}
                {task.comment_count > 0 && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}><MI name="chat_bubble" size={12} /> {task.comment_count}</span>}
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                    <button className="btn btn-sm btn-ghost" style={{ padding: '2px 5px' }} onClick={() => startEdit(task)}><MI name="edit" size={14} /></button>
                    <button className="btn btn-sm btn-ghost" style={{ padding: '2px 5px', color: '#ef4444' }} onClick={() => setDeleteConfirm(task.id)}><MI name="delete" size={14} /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {tasks.length === 0 && <div className="card no-data" style={{ padding: 40 }}>{t('No tasks found. Create one to get started.')}</div>}
      </div>

      {/* Task Detail Panel */}
      {selectedTask && <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} onRefresh={fetchTasks} user={user} />}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="leads-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 380, width: '90%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><MI name="warning" size={20} /> {t('Delete Task?')}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 16 }}>{t('This will permanently delete the task and all comments.')}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>{t('Cancel')}</button>
              <button className="btn btn-danger" onClick={() => deleteTask(deleteConfirm)}>{t('Delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══ Task Detail Panel ═══ */
function TaskDetailPanel({ task, onClose, onRefresh, user }) {
  const [comments, setComments] = useState([]);
  const [statusHistory, setStatusHistory] = useState([]);
  const [taskDetail, setTaskDetail] = useState(task);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const chatRef = useRef();
  const pollRef = useRef();

  const { roleColors } = useAuth();
  const { t } = useProject();

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/tasks/${task.id}`);
    const data = await res.json();
    if (data.task) setTaskDetail(data.task);
    if (data.comments) setComments(data.comments);
    if (data.status_history) setStatusHistory(data.status_history);
  }, [task.id]);

  useEffect(() => { fetchDetail(); pollRef.current = setInterval(fetchDetail, 5000); return () => clearInterval(pollRef.current); }, [fetchDetail]);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [comments]);

  const sendComment = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    await fetch(`/api/tasks/${task.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message.trim() }) });
    setMessage(''); setSending(false); fetchDetail();
  };

  const editComment = async (id) => {
    if (!editText.trim()) return;
    await fetch(`/api/tasks/${task.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment_id: id, message: editText.trim() }) });
    setEditingId(null); setEditText(''); fetchDetail();
  };

  const deleteComment = async (id) => { if (!confirm(t('Delete this message?'))) return; await fetch(`/api/tasks/${task.id}?comment_id=${id}`, { method: 'DELETE' }); fetchDetail(); };

  const si = STATUS_LABELS[taskDetail.status] || STATUS_LABELS.pending;
  const dl = getDeadlineInfo(taskDetail, t);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)', zIndex: 999 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, background: '#fff', zIndex: 1000, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)', animation: 'slideUp 0.2s ease' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 4 }}>{t('Task Details')}</div>
              <h2 style={{ fontSize: '1.05rem', marginBottom: 6 }}>{taskDetail.title}</h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 10, fontWeight: 600, background: si.bg, color: si.color, display: 'flex', alignItems: 'center', gap: 4 }}><MI name={si.icon} size={12} /> {t(si.label)}</span>
                <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: dl.bg, color: dl.color }}><MI name={dl.icon} size={12} /> {dl.label}</span>
              </div>
            </div>
            <button onClick={onClose} className="panel-close"><MI name="close" size={16} /></button>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.8 }}>
            <span>{t('Created by')} <strong>{taskDetail.assigner_name}</strong></span>
            {taskDetail.assigned_to_name && taskDetail.assigned_to_name !== '—' && <span> → {t('Assigned to')} <strong>{taskDetail.assigned_to_name}</strong></span>}
            <br /><span>{new Date(taskDetail.created_at).toLocaleString()}</span>
          </div>
          <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setShowHistory(!showHistory)}><MI name="history" size={14} /> {showHistory ? t('Hide History') : t('Show History')} ({statusHistory.length})</button>
          {showHistory && statusHistory.length > 0 && (
            <div style={{ marginTop: 8, padding: 10, background: 'var(--bg)', borderRadius: 8, maxHeight: 120, overflowY: 'auto', fontSize: '0.72rem' }}>
              {statusHistory.map(h => (
                <div key={h.id} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{new Date(h.changed_at).toLocaleString()}</span>
                  <span><strong>{h.changed_by_name}</strong> {t('changed')} {t(h.old_status || '')} → <strong>{t(h.new_status || '')}</strong></span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {comments.length === 0 && <p className="no-data" style={{ padding: 30 }}>{t('No comments yet. Start the conversation.')}</p>}
          {comments.map(c => (
            <div key={c.id} style={{ alignSelf: c.user_id === user.id ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
              <div style={{ padding: '10px 14px', borderRadius: 14, background: c.user_id === user.id ? 'var(--primary)' : '#f1f5f9', color: c.user_id === user.id ? '#fff' : 'var(--text)', borderBottomRightRadius: c.user_id === user.id ? 4 : 14, borderBottomLeftRadius: c.user_id === user.id ? 14 : 4 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, marginBottom: 3, color: c.user_id === user.id ? 'rgba(255,255,255,0.7)' : (roleColors[c.user_role] || 'var(--text-dim)') }}>
                  {c.user_name} {c.edited_at && <span style={{ fontStyle: 'italic', opacity: 0.6 }}>({t('edited')})</span>}
                </div>
                {editingId === c.id ? (
                  <div>
                    <input style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.82rem' }} value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key === 'Enter' && editComment(c.id)} autoFocus />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}><button className="btn btn-sm btn-success" onClick={() => editComment(c.id)}>{t('Save')}</button><button className="btn btn-sm btn-ghost" onClick={() => setEditingId(null)}>{t('Cancel')}</button></div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>{c.message}</div>
                )}
                <div style={{ fontSize: '0.6rem', marginTop: 4, opacity: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                  {(c.user_id === user.id || user.role === 'super_admin') && editingId !== c.id && (
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setEditingId(c.id); setEditText(c.message); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6rem', textDecoration: 'underline', color: 'inherit' }}>{t('edit')}</button>
                      <button onClick={() => deleteComment(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.6rem', textDecoration: 'underline', color: 'inherit' }}>{t('delete')}</button>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={e => { e.preventDefault(); sendComment(); }} style={{ display: 'flex', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <input placeholder={t('Type a comment...')} value={message} onChange={e => setMessage(e.target.value)} disabled={sending} style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 24, fontSize: '0.85rem', outline: 'none' }} />
          <button type="submit" disabled={sending || !message.trim()} className="btn btn-primary" style={{ borderRadius: 24 }}>{sending ? '...' : t('Send')}</button>
        </form>
      </div>
    </>
  );
}
