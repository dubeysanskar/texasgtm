'use client';
import { useState, useEffect } from 'react';
import { useAuth, DEFAULT_NAV_FEATURES } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

const TABS = [
  { id: 'users', label: 'Users', icon: 'group' },
  { id: 'project_access', label: 'Project Access', icon: 'lock_person' },
  { id: 'features', label: 'Features', icon: 'toggle_on' },
  { id: 'smtp', label: 'Email / SMTP', icon: 'mail' },
  { id: 'security', label: 'Security', icon: 'shield_person' },
  { id: 'settings', label: 'Settings', icon: 'tune' },
];

const EMPTY_SMTP = { label: '', host: 'smtp.gmail.com', port: 465, secure: true, username: '', password: '', from_email: '', from_name: '', daily_limit: 30, project_id: '' };

const ROLES = ['super_admin', 'manager', 'staff', 'marketing', 'viewer'];
const FEATURE_ROLES = ['manager', 'staff', 'marketing', 'viewer'];

// Side-nav features that can be toggled per role. Admin Panel and My Profile are not gated.
const NAV_FEATURES = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'messages', label: 'Messages', icon: 'chat' },
  { key: 'tasks', label: 'Tasks', icon: 'task_alt' },
  { key: 'todos', label: 'To-Do List', icon: 'checklist' },
  { key: 'daily_updates', label: 'Daily Updates', icon: 'event_note' },
  { key: 'leads', label: 'Lead Management', icon: 'leaderboard' },
  { key: 'lead_scraper', label: 'Lead Scraper', icon: 'travel_explore' },
  { key: 'templates', label: 'Templates', icon: 'description' },
  { key: 'auto_email', label: 'Auto Email', icon: 'forward_to_inbox' },
  { key: 'team', label: 'Team', icon: 'group' },
  { key: 'marketing', label: 'Marketing', icon: 'campaign' },
  { key: 'documents', label: 'Documents', icon: 'folder_shared' },
  { key: 'logs', label: 'Activity Logs', icon: 'history' },
];

export default function AdminPage() {
  const { user, isAdmin, roleLabels, roleColors, startImpersonation } = useAuth();
  const { t, lang, refreshProjects } = useProject();
  const [activeTab, setActiveTab] = useState('users');
  const [impBusyId, setImpBusyId] = useState(null);
  const [impSessions, setImpSessions] = useState([]);
  async function loginAsUser(u) {
    if (!window.confirm(t('View the portal as {name}? This is logged and visible to every super admin.', { name: u.name }))) return;
    setImpBusyId(u.id); setError('');
    try { await startImpersonation(u.id); }
    catch (e) { setError(t(e.message)); setImpBusyId(null); }
  }
  useEffect(() => { if (activeTab === 'security') fetch('/api/admin/impersonate/sessions').then(r => r.json()).then(d => setImpSessions(d.sessions || [])).catch(() => {}); }, [activeTab]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff', project_ids: [], project_role: 'member', job_title: '', language: 'en' });
  const [editUser, setEditUser] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Settings
  const [roleLabelEdits, setRoleLabelEdits] = useState({});
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Features matrix: { role: [feature keys] }
  const [featureMatrix, setFeatureMatrix] = useState(DEFAULT_NAV_FEATURES);
  const [featuresSaved, setFeaturesSaved] = useState(false);

  // SMTP accounts
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [smtpForm, setSmtpForm] = useState(EMPTY_SMTP);
  const [smtpEditId, setSmtpEditId] = useState(null);
  const [showSmtpForm, setShowSmtpForm] = useState(false);
  const [smtpTestTo, setSmtpTestTo] = useState('');
  const [smtpBusy, setSmtpBusy] = useState(false);

  // Project Access
  const [projects, setProjects] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [memberRole, setMemberRole] = useState('member');
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [allMemberships, setAllMemberships] = useState([]);

  const fetchUsers = () => { fetch('/api/users').then(r => r.json()).then(d => setUsers(d.users || [])).finally(() => setLoading(false)); };
  const fetchAllMemberships = () => { fetch('/api/projects/members').then(r => r.json()).then(d => setAllMemberships(d.memberships || [])).catch(() => {}); };

  useEffect(() => {
    fetchUsers(); fetchProjects(); fetchAllMemberships();
    fetch('/api/settings').then(r => r.json()).then(d => {
      if (d.settings?.nav_features) {
        try { setFeatureMatrix({ ...DEFAULT_NAV_FEATURES, ...JSON.parse(d.settings.nav_features) }); } catch {}
      }
    }).catch(() => {});
  }, []);
  useEffect(() => { setRoleLabelEdits({ ...roleLabels }); }, [roleLabels]);
  useEffect(() => { if (selectedProject) fetchProjectMembers(selectedProject); }, [selectedProject]);

  const fetchProjects = () => {
    fetch('/api/projects').then(r => r.json()).then(d => {
      setProjects(Array.isArray(d) ? d : []);
      if (Array.isArray(d) && d.length > 0 && !selectedProject) setSelectedProject(d[0].id);
    });
  };

  const fetchProjectMembers = (projectId) => {
    setLoadingMembers(true);
    fetch(`/api/projects/members?project_id=${projectId}`).then(r => r.json()).then(d => setMemberships(d.members || [])).finally(() => setLoadingMembers(false));
  };

  const addMember = async () => {
    if (!selectedUserId || !selectedProject) return;
    setError('');
    const res = await fetch('/api/projects/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: Number(selectedUserId), project_id: selectedProject, role: memberRole }),
    });
    if (res.ok) {
      setSuccess(t('Member added!')); setTimeout(() => setSuccess(''), 3000);
      fetchProjectMembers(selectedProject);
      fetchAllMemberships();
      setSelectedUserId('');
    } else { const d = await res.json(); setError(t(d.error || 'Request failed')); setTimeout(() => setError(''), 3000); }
  };

  const removeMember = async (userId) => {
    if (!confirm(t('Remove this user from the project?'))) return;
    await fetch('/api/projects/members', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, project_id: selectedProject }),
    });
    setSuccess(t('Member removed')); setTimeout(() => setSuccess(''), 3000);
    fetchProjectMembers(selectedProject);
    fetchAllMemberships();
  };

  if (!isAdmin) return <div className="page-content"><p>{t('Access denied')}</p></div>;

  const createUser = async (e) => {
    e.preventDefault(); setError('');
    const payload = { ...form, project_ids: form.role === 'super_admin' ? [] : form.project_ids.map(Number) };
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { setForm({ name: '', email: '', password: '', role: 'staff', project_ids: [], project_role: 'member', job_title: '', language: 'en' }); setShowForm(false); setSuccess(t('User created!')); fetchUsers(); fetchAllMemberships(); setTimeout(() => setSuccess(''), 3000); }
    else { const d = await res.json(); setError(t(d.error || 'Request failed')); setTimeout(() => setError(''), 3000); }
  };

  // Inline project mapping from the Users table
  const addUserToProject = async (userId, projectId) => {
    if (!projectId) return;
    setError('');
    const res = await fetch('/api/projects/members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, project_id: Number(projectId), role: 'member' }),
    });
    if (res.ok) { setSuccess(t('Project assigned!')); setTimeout(() => setSuccess(''), 2000); fetchAllMemberships(); if (selectedProject) fetchProjectMembers(selectedProject); }
    else { const d = await res.json(); setError(t(d.error || 'Request failed')); setTimeout(() => setError(''), 3000); }
  };

  const removeUserFromProject = async (userId, projectId, projectName) => {
    if (!confirm(t('Remove this user from {project}?', { project: projectName }))) return;
    await fetch('/api/projects/members', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, project_id: projectId }),
    });
    setSuccess(t('Project removed')); setTimeout(() => setSuccess(''), 2000);
    fetchAllMemberships(); if (selectedProject) fetchProjectMembers(selectedProject);
  };

  const updateUser = async (id, updates) => {
    await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...updates }) });
    fetchUsers(); setEditUser(null); setSuccess(t('Updated!')); setTimeout(() => setSuccess(''), 3000);
  };

  // ─── SMTP handlers ───
  const fetchSmtp = () => { fetch('/api/smtp').then(r => r.json()).then(d => setSmtpAccounts(d.accounts || [])).catch(() => {}); };
  useEffect(() => { if (activeTab === 'smtp') fetchSmtp(); }, [activeTab]);

  const saveSmtp = async (e) => {
    e.preventDefault(); setError(''); setSmtpBusy(true);
    const method = smtpEditId ? 'PUT' : 'POST';
    const body = smtpEditId ? { ...smtpForm, id: smtpEditId } : smtpForm;
    if (body.project_id === '') body.project_id = null;
    const res = await fetch('/api/smtp', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSmtpBusy(false);
    if (res.ok) { setSuccess(smtpEditId ? t('SMTP account updated!') : t('SMTP account added!')); setTimeout(() => setSuccess(''), 3000); setSmtpForm(EMPTY_SMTP); setSmtpEditId(null); setShowSmtpForm(false); fetchSmtp(); }
    else { const d = await res.json(); setError(t(d.error || 'Request failed')); setTimeout(() => setError(''), 4000); }
  };

  const editSmtp = (a) => {
    setSmtpEditId(a.id);
    setSmtpForm({ label: a.label || '', host: a.host, port: a.port, secure: a.secure, username: a.username, password: '', from_email: a.from_email || '', from_name: a.from_name || '', daily_limit: a.daily_limit, project_id: a.project_id || '' });
    setShowSmtpForm(true);
  };

  const deleteSmtp = async (id) => {
    if (!confirm(t('Delete this SMTP account?'))) return;
    await fetch('/api/smtp', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setSuccess(t('SMTP account deleted')); setTimeout(() => setSuccess(''), 3000); fetchSmtp();
  };

  const toggleSmtpActive = async (a) => {
    await fetch('/api/smtp', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, is_active: !a.is_active }) });
    fetchSmtp();
  };

  const testSmtp = async (a) => {
    const to = prompt(t('Send a test email to:'), smtpTestTo || user.email);
    if (!to) return;
    setSmtpTestTo(to);
    setSuccess(t('Sending test email…'));
    const res = await fetch('/api/smtp/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, to }) });
    const d = await res.json();
    if (res.ok) { setSuccess('✅ ' + t('Test email sent from {from} to {to}', { from: d.from, to: d.to })); setTimeout(() => setSuccess(''), 5000); }
    else { setError(t('Test failed') + ': ' + d.error); setTimeout(() => setError(''), 6000); setSuccess(''); }
  };

  const toggleFeature = (role, featureKey) => {
    setFeatureMatrix(prev => {
      const current = prev[role] || [];
      return {
        ...prev,
        [role]: current.includes(featureKey) ? current.filter(k => k !== featureKey) : [...current, featureKey],
      };
    });
  };

  const saveFeatures = async () => {
    const res = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { nav_features: JSON.stringify(featureMatrix) } }),
    });
    if (res.ok) { setFeaturesSaved(true); setTimeout(() => setFeaturesSaved(false), 3000); }
    else { const d = await res.json(); setError(t(d.error || 'Request failed')); setTimeout(() => setError(''), 3000); }
  };

  // Change the language of the selected project (switches its UI for members)
  const setProjectLanguage = async (projectId, language) => {
    const res = await fetch(`/api/projects/${projectId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language }) });
    if (res.ok) { setSuccess(t('Project language updated')); setTimeout(() => setSuccess(''), 3000); fetchProjects(); refreshProjects(); }
    else { const d = await res.json(); setError(t(d.error || 'Request failed')); setTimeout(() => setError(''), 3000); }
  };

  const saveRoleLabels = async () => {
    const settings = {};
    for (const [role, label] of Object.entries(roleLabelEdits)) {
      settings[`role_label_${role}`] = label;
    }
    const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) });
    if (res.ok) { setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 3000); }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div><h1><MI name="settings" size={26} /> {t('Admin Panel')}</h1><p>{t('Manage users, roles, and system settings')}</p></div>
        {activeTab === 'users' && <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}><MI name={showForm ? 'close' : 'person_add'} size={16} /> {showForm ? t('Cancel') : t('Add User')}</button>}
      </div>

      {success && <div style={{ padding: '10px 16px', background: '#f0fdf4', color: '#10b981', borderRadius: 10, marginBottom: 12, fontSize: '0.82rem' }}>{success}</div>}
      {error && <div style={{ padding: '10px 16px', background: '#fef2f2', color: '#ef4444', borderRadius: 10, marginBottom: 12, fontSize: '0.82rem' }}>{error}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)', overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '10px 18px', border: 'none', background: activeTab === tab.id ? 'var(--bg-card)' : 'transparent',
            color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-dim)',
            fontWeight: activeTab === tab.id ? 700 : 500, fontSize: '0.82rem', cursor: 'pointer',
            borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: '-2px', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
          }}>
            <MI name={tab.icon} size={16} /> {t(tab.label)}
          </button>
        ))}
      </div>

      {/* ════ USERS TAB ════ */}
      {activeTab === 'users' && (
        <>
          {/* Stats */}
          <div className="stats-grid" style={{ gridTemplateColumns: `repeat(${ROLES.length}, 1fr)`, marginBottom: 20 }}>
            {ROLES.map(r => (
              <div key={r} className="stat-card" style={{ borderTopColor: roleColors[r] }}>
                <div className="stat-value" style={{ color: roleColors[r] }}>{users.filter(u => u.role === r).length}</div>
                <div className="stat-label">{t(roleLabels[r] || r)}</div>
              </div>
            ))}
          </div>

          {showForm && (
            <div className="card" style={{ marginBottom: 16, animation: 'slideUp 0.2s ease' }}>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 16 }}>{t('Create New User')}</h3>
              <form onSubmit={createUser}>
                <div className="form-row">
                  <div className="form-group"><label>{t('Full Name')} *</label><input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required /></div>
                  <div className="form-group"><label>{t('Email')} *</label><input type="email" className="form-input" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} required /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>{t('Password')} *</label><input type="password" className="form-input" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required /></div>
                  <div className="form-group"><label>{t('Role')}</label><select className="form-input" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{t(roleLabels[r] || r)}</option>)}</select></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>{t('Job title')}</label><input className="form-input" value={form.job_title} onChange={e => setForm(p => ({ ...p, job_title: e.target.value }))} placeholder={t('e.g. Sales Manager')} /></div>
                  <div className="form-group"><label>{t('Interface language')}</label><select className="form-input" value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))}><option value="en">🇬🇧 English</option><option value="ru">🇷🇺 Русский</option></select></div>
                </div>
                {form.role !== 'super_admin' ? (
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t('Projects')} * ({t('select one or more')})</label>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0' }}>
                        {projects.map(p => {
                          const checked = form.project_ids.includes(String(p.id)) || form.project_ids.includes(p.id);
                          return (
                            <label key={p.id} style={{
                              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                              border: checked ? `2px solid ${p.color || '#3b82f6'}` : '1px solid var(--border)',
                              background: checked ? `${p.color || '#3b82f6'}10` : 'transparent',
                              fontSize: '0.8rem', fontWeight: checked ? 700 : 500,
                              color: checked ? (p.color || '#3b82f6') : 'var(--text-dim)',
                            }}>
                              <input
                                type="checkbox" checked={checked} style={{ accentColor: p.color || '#3b82f6' }}
                                onChange={e => setForm(prev => ({
                                  ...prev,
                                  project_ids: e.target.checked
                                    ? [...prev.project_ids, p.id]
                                    : prev.project_ids.filter(id => Number(id) !== p.id),
                                }))}
                              />
                              {p.name}{p.country ? ` — ${p.country}` : ''}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>{t('Project Role')}</label>
                      <select className="form-input" value={form.project_role} onChange={e => setForm(p => ({ ...p, project_role: e.target.value }))}>
                        <option value="owner">{t('Owner')}</option>
                        <option value="admin">{t('Admin')}</option>
                        <option value="member">{t('Member')}</option>
                        <option value="viewer">{t('Viewer')}</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    <MI name="info" size={14} /> {t('Super Admins automatically have access to all projects — no project mapping needed.')}
                  </p>
                )}
                <button type="submit" className="btn btn-success"><MI name="check" size={16} /> {t('Create')}</button>
              </form>
            </div>
          )}

          {/* Users Table */}
          <div className="card" style={{ padding: 0 }}>
            <div className="table-container" style={{ border: 'none' }}>
              <table>
                <thead><tr><th>{t('User')}</th><th>{t('Email')}</th><th>{t('Role')}</th><th>{t('Projects')}</th><th>{t('Status')}</th><th>{t('Joined')}</th><th>{t('Actions')}</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td><strong>{u.name}</strong>{u.job_title && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{u.job_title}</div>}</td>
                      <td style={{ fontSize: '0.78rem' }}>{u.email}{u.language === 'ru' && <span title={t('Russian')} style={{ marginLeft: 4 }}>🇷🇺</span>}</td>
                      <td>
                        {editUser === u.id ? (
                          <select defaultValue={u.role} onChange={e => updateUser(u.id, { role: e.target.value })} style={{ fontSize: '0.75rem', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 8 }}>
                            {ROLES.map(r => <option key={r} value={r}>{t(roleLabels[r] || r)}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: 20, fontWeight: 600, background: `${roleColors[u.role]}15`, color: roleColors[u.role] }}>{t(roleLabels[u.role] || u.role)}</span>
                        )}
                      </td>
                      <td>
                        {u.role === 'super_admin' ? (
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8b5cf6' }}>{t('All projects')}</span>
                        ) : (() => {
                          const userProjects = allMemberships.filter(m => m.user_id === u.id);
                          const available = projects.filter(p => !userProjects.find(m => m.project_id === p.id));
                          return (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                              {userProjects.map(m => (
                                <span key={m.id} style={{ fontSize: '0.68rem', padding: '2px 4px 2px 8px', borderRadius: 12, fontWeight: 600, background: `${m.project_color || '#3b82f6'}15`, color: m.project_color || '#3b82f6', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  {m.project_name} · {t(m.role)}
                                  <button
                                    onClick={() => removeUserFromProject(u.id, m.project_id, m.project_name)}
                                    title={t('Remove from {project}', { project: m.project_name })}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: '0 3px', fontSize: '0.75rem', lineHeight: 1, opacity: 0.7 }}
                                  >✕</button>
                                </span>
                              ))}
                              {userProjects.length === 0 && (
                                <span style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 600 }}>{t('No project')}</span>
                              )}
                              {available.length > 0 && (
                                <select
                                  value=""
                                  onChange={e => addUserToProject(u.id, e.target.value)}
                                  title={t('Assign to project')}
                                  style={{ fontSize: '0.68rem', padding: '2px 4px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', maxWidth: 70 }}
                                >
                                  <option value="">+ {t('Add')}</option>
                                  {available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td><span style={{ fontSize: '0.72rem', fontWeight: 600, color: u.is_active ? '#10b981' : '#ef4444' }}>{u.is_active ? '● ' + t('Active') : '○ ' + t('Disabled')}</span></td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => setEditUser(editUser === u.id ? null : u.id)} title={t('Edit role')}><MI name="edit" size={14} /></button>
                          {u.id !== user.id && (
                            <>
                              <button className="btn btn-sm btn-ghost" style={{ color: u.is_active ? '#ef4444' : '#10b981' }} onClick={() => updateUser(u.id, { is_active: !u.is_active })} title={u.is_active ? t('Disable') : t('Enable')}>
                                <MI name={u.is_active ? 'block' : 'check_circle'} size={14} />
                              </button>
                              <button className="btn btn-sm btn-ghost" onClick={() => { const pw = prompt(t('New password:')); if (pw) updateUser(u.id, { password: pw }); }} title={t('Reset password')}><MI name="lock_reset" size={14} /></button>
                              {u.role !== 'super_admin' && (
                                <button className="btn btn-sm btn-ghost" style={{ color: '#7c2d12' }} disabled={impBusyId === u.id} onClick={() => loginAsUser(u)} title={t('View the portal as this user')}>
                                  <MI name="visibility" size={14} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ════ PROJECT ACCESS TAB ════ */}
      {activeTab === 'project_access' && (
        <div>
          {/* Project selector */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <MI name="folder" size={20} /> {t('Select Project')}
            </h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProject(p.id)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: selectedProject === p.id ? `2px solid ${p.color || '#3b82f6'}` : '1px solid #e5e7eb',
                    background: selectedProject === p.id ? `${p.color || '#3b82f6'}10` : '#fff',
                    cursor: 'pointer', fontSize: '0.82rem', fontWeight: selectedProject === p.id ? 700 : 500,
                    color: selectedProject === p.id ? (p.color || '#3b82f6') : '#6b7280',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || '#3b82f6' }} />
                  {p.name}{p.language === 'ru' ? ' 🇷🇺' : ''}
                </button>
              ))}
            </div>
            {selectedProject && (() => { const sp = projects.find(p => p.id === selectedProject); return sp ? (
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-dim)' }}><MI name="translate" size={16} /> {t('Project language')}</label>
                <select className="form-input" style={{ width: 200 }} value={sp.language || 'en'} onChange={e => setProjectLanguage(sp.id, e.target.value)}>
                  <option value="en">🇬🇧 English</option>
                  <option value="ru">🇷🇺 Русский</option>
                </select>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('Members of this project see the interface, emails and upload templates in this language.')}</span>
              </div>
            ) : null; })()}
          </div>

          {selectedProject && (
            <>
              {/* Add member */}
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MI name="person_add" size={20} /> {t('Add Member')}
                </h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
                    <label>{t('User')}</label>
                    <select className="form-input" value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}>
                      <option value="">{t('Select user...')}</option>
                      {users.filter(u => u.role !== 'super_admin' && !memberships.find(m => m.user_id === u.id)).map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>{t('Role')}</label>
                    <select className="form-input" value={memberRole} onChange={e => setMemberRole(e.target.value)}>
                      <option value="owner">{t('Owner')}</option>
                      <option value="admin">{t('Admin')}</option>
                      <option value="member">{t('Member')}</option>
                      <option value="viewer">{t('Viewer')}</option>
                    </select>
                  </div>
                  <button className="btn btn-primary" onClick={addMember} disabled={!selectedUserId}>
                    <MI name="add" size={16} /> {t('Add')}
                  </button>
                </div>
              </div>

              {/* Members list */}
              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '0.92rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MI name="groups" size={20} /> {t('Members')} ({memberships.length})
                  </h3>
                </div>
                {loadingMembers ? (
                  <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>{t('Loading...')}</div>
                ) : memberships.length === 0 ? (
                  <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: '0.82rem' }}>
                    <MI name="group_off" size={32} />
                    <div style={{ marginTop: 8 }}>{t('No members assigned to this project yet')}</div>
                  </div>
                ) : (
                  <div className="table-container" style={{ border: 'none' }}>
                    <table>
                      <thead><tr><th>{t('User')}</th><th>{t('Email')}</th><th>{t('System Role')}</th><th>{t('Project Role')}</th><th>{t('Added')}</th><th>{t('Actions')}</th></tr></thead>
                      <tbody>
                        {memberships.map(m => (
                          <tr key={m.id}>
                            <td><strong>{m.user_name}</strong></td>
                            <td style={{ fontSize: '0.78rem' }}>{m.user_email}</td>
                            <td>
                              <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12, background: `${roleColors[m.user_role] || '#6b7280'}15`, color: roleColors[m.user_role] || '#6b7280', fontWeight: 600 }}>
                                {t(roleLabels[m.user_role] || m.user_role)}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 12, background: '#eff6ff', color: '#1e40af', fontWeight: 600, textTransform: 'capitalize' }}>
                                {t(m.role)}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(m.created_at).toLocaleDateString()}</td>
                            <td>
                              <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => removeMember(m.user_id)} title={t('Remove from project')}>
                                <MI name="person_remove" size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ════ FEATURES TAB ════ */}
      {activeTab === 'features' && (
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><MI name="toggle_on" size={20} /> {t('Feature Access by Role')}</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 6 }}>
            {t('Control which side-nav features each role can see. Changes apply to everyone with that role after their next page refresh.')}
          </p>
          <p style={{ fontSize: '0.74rem', color: '#8b5cf6', fontWeight: 600, marginBottom: 16 }}>
            <MI name="shield_person" size={14} /> {t('Super Admins always see all features — they are not listed here. Admin Panel and My Profile are never gated.')}
          </p>
          {featuresSaved && <div style={{ padding: '10px 16px', background: '#f0fdf4', color: '#10b981', borderRadius: 10, marginBottom: 16, fontSize: '0.82rem' }}>✅ {t('Feature access saved!')}</div>}

          <div className="table-container" style={{ marginBottom: 20 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>{t('Feature')}</th>
                  {FEATURE_ROLES.map(role => (
                    <th key={role} style={{ textAlign: 'center' }}>
                      <span style={{ color: roleColors[role], fontWeight: 700 }}>{t(roleLabels[role] || role)}</span>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {(featureMatrix[role] || []).length}/{NAV_FEATURES.length} {t('features')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NAV_FEATURES.map(f => (
                  <tr key={f.key}>
                    <td style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                      <MI name={f.icon} size={16} /> {t(f.label)}
                    </td>
                    {FEATURE_ROLES.map(role => {
                      const checked = (featureMatrix[role] || []).includes(f.key);
                      return (
                        <td key={role} style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFeature(role, f.key)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: roleColors[role] }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-success" onClick={saveFeatures}><MI name="save" size={18} /> {t('Save Feature Access')}</button>
            <button className="btn btn-ghost" onClick={() => setFeatureMatrix(DEFAULT_NAV_FEATURES)} title={t('Restore the default visibility rules')}>
              <MI name="restart_alt" size={18} /> {t('Reset to Defaults')}
            </button>
          </div>
        </div>
      )}

      {/* ════ EMAIL / SMTP TAB ════ */}
      {activeTab === 'smtp' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><MI name="mail" size={20} /> {t('SMTP Accounts')}</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', margin: 0 }}>
                  {t("Add as many sending accounts as you want. Assign each to a project (or leave global) — Auto Email rotates through that project's accounts and respects each daily limit.")}
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => { setShowSmtpForm(!showSmtpForm); setSmtpEditId(null); setSmtpForm(EMPTY_SMTP); }}>
                <MI name={showSmtpForm ? 'close' : 'add'} size={16} /> {showSmtpForm ? t('Cancel') : t('Add SMTP')}
              </button>
            </div>

            {showSmtpForm && (
              <form onSubmit={saveSmtp} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div className="form-row">
                  <div className="form-group"><label>{t('Label')}</label><input className="form-input" placeholder={t('e.g. Arabic outreach — Gmail 1')} value={smtpForm.label} onChange={e => setSmtpForm(p => ({ ...p, label: e.target.value }))} /></div>
                  <div className="form-group">
                    <label>{t('Project')}</label>
                    <select className="form-input" value={smtpForm.project_id} onChange={e => setSmtpForm(p => ({ ...p, project_id: e.target.value }))}>
                      <option value="">🌐 {t('Global (all projects)')}</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.country ? ` — ${p.country}` : ''}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>{t('SMTP Host')} *</label><input className="form-input" placeholder="smtp.gmail.com" value={smtpForm.host} onChange={e => setSmtpForm(p => ({ ...p, host: e.target.value }))} required /></div>
                  <div className="form-group"><label>{t('Port')} *</label><input type="number" className="form-input" value={smtpForm.port} onChange={e => setSmtpForm(p => ({ ...p, port: e.target.value }))} required /></div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', paddingBottom: 10 }}>
                      <input type="checkbox" checked={smtpForm.secure} onChange={e => setSmtpForm(p => ({ ...p, secure: e.target.checked }))} /> SSL/TLS ({t('secure')})
                    </label>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>{t('Username')} *</label><input className="form-input" placeholder="you@gmail.com" value={smtpForm.username} onChange={e => setSmtpForm(p => ({ ...p, username: e.target.value }))} required /></div>
                  <div className="form-group"><label>{t('Password / App Password')} {smtpEditId ? t('(leave blank to keep)') : '*'}</label><input type="password" className="form-input" placeholder={smtpEditId ? '••••••••' : t('app password')} value={smtpForm.password} onChange={e => setSmtpForm(p => ({ ...p, password: e.target.value }))} required={!smtpEditId} /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>{t('From Email')}</label><input className="form-input" placeholder={t('defaults to username')} value={smtpForm.from_email} onChange={e => setSmtpForm(p => ({ ...p, from_email: e.target.value }))} /></div>
                  <div className="form-group"><label>{t('From Name')}</label><input className="form-input" placeholder="Taha Airwaves" value={smtpForm.from_name} onChange={e => setSmtpForm(p => ({ ...p, from_name: e.target.value }))} /></div>
                  <div className="form-group"><label>{t('Daily Limit')}</label><input type="number" className="form-input" value={smtpForm.daily_limit} onChange={e => setSmtpForm(p => ({ ...p, daily_limit: e.target.value }))} /></div>
                </div>
                <button type="submit" className="btn btn-success" disabled={smtpBusy}><MI name="check" size={16} /> {smtpBusy ? t('Saving…') : smtpEditId ? t('Update Account') : t('Add Account')}</button>
              </form>
            )}
          </div>

          <div className="card" style={{ padding: 0 }}>
            {smtpAccounts.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: '0.82rem' }}>
                <MI name="mail_off" size={32} />
                <div style={{ marginTop: 8 }}>{t('No SMTP accounts yet. Add one to start sending Auto Email.')}</div>
                <div style={{ marginTop: 4, fontSize: '0.72rem' }}>{t('Until then, the system falls back to the SMTP settings in the server .env file.')}</div>
              </div>
            ) : (
              <div className="table-container" style={{ border: 'none' }}>
                <table>
                  <thead><tr><th>{t('Account')}</th><th>{t('Project')}</th><th>{t('Host')}</th><th>{t('From')}</th><th>{t('Daily Limit')}</th><th>{t('Status')}</th><th>{t('Actions')}</th></tr></thead>
                  <tbody>
                    {smtpAccounts.map(a => (
                      <tr key={a.id}>
                        <td><strong>{a.label || a.username}</strong><div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{a.username}</div></td>
                        <td>
                          {a.project_id ? (
                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 12, fontWeight: 600, background: `${a.project_color || '#3b82f6'}15`, color: a.project_color || '#3b82f6' }}>{a.project_name}</span>
                          ) : (
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#8b5cf6' }}>🌐 {t('Global')}</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.75rem' }}>{a.host}:{a.port}{a.secure ? ' 🔒' : ''}</td>
                        <td style={{ fontSize: '0.75rem' }}>{a.from_name ? `${a.from_name} · ` : ''}{a.from_email || a.username}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{a.daily_limit}/{t('day')}</td>
                        <td><span style={{ fontSize: '0.72rem', fontWeight: 600, color: a.is_active ? '#10b981' : '#ef4444' }}>{a.is_active ? '● ' + t('Active') : '○ ' + t('Off')}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm btn-ghost" onClick={() => testSmtp(a)} title={t('Send test email')}><MI name="send" size={14} /></button>
                            <button className="btn btn-sm btn-ghost" onClick={() => editSmtp(a)} title={t('Edit')}><MI name="edit" size={14} /></button>
                            <button className="btn btn-sm btn-ghost" style={{ color: a.is_active ? '#ef4444' : '#10b981' }} onClick={() => toggleSmtpActive(a)} title={a.is_active ? t('Disable') : t('Enable')}><MI name={a.is_active ? 'block' : 'check_circle'} size={14} /></button>
                            <button className="btn btn-sm btn-ghost" style={{ color: '#ef4444' }} onClick={() => deleteSmtp(a.id)} title={t('Delete')}><MI name="delete" size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ SECURITY TAB — "view as" audit trail ════ */}
      {activeTab === 'security' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><MI name="shield_person" size={20} /> {t('"View as" audit trail')}</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('Every time any super admin views the portal as another user — who, as whom, when, and for how long. Sessions auto-expire after 1 hour.')}</p>
          </div>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead><tr><th>{t('Super Admin')}</th><th>{t('Viewed as')}</th><th>{t('Role')}</th><th>{t('Started')}</th><th>{t('Duration')}</th><th>{t('Status')}</th></tr></thead>
              <tbody>
                {impSessions.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>{t('No "view as" sessions yet.')}</td></tr>}
                {impSessions.map(s => {
                  const started = new Date(s.started_at);
                  const ended = s.ended_at ? new Date(s.ended_at) : null;
                  const mins = Math.max(0, Math.round(((ended || new Date()) - started) / 60000));
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.admin_name}</strong></td>
                      <td>{s.target_user_name}</td>
                      <td><span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 20, background: `${roleColors[s.target_role]}15`, color: roleColors[s.target_role] }}>{t(roleLabels[s.target_role] || s.target_role)}</span></td>
                      <td style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{started.toLocaleString(lang === 'ru' ? 'ru-RU' : undefined)}</td>
                      <td style={{ fontSize: '0.76rem' }}>{mins} {t('min')}</td>
                      <td>{ended
                        ? <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280' }}>{t('Ended')}</span>
                        : <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#dc2626' }}>● {t('Active')}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════ SETTINGS TAB ════ */}
      {activeTab === 'settings' && (
        <div className="card">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}><MI name="badge" size={20} /> {t('Role Labels')}</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 20 }}>{t('Rename roles to match your organization. Changes apply across the entire app.')}</p>
          {settingsSaved && <div style={{ padding: '10px 16px', background: '#f0fdf4', color: '#10b981', borderRadius: 10, marginBottom: 16, fontSize: '0.82rem' }}>✅ {t('Role labels saved!')}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {ROLES.map(role => (
              <div className="form-group" key={role}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{role.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>role: {role}</span>
                </label>
                <input className="form-input" value={roleLabelEdits[role] || ''} onChange={e => setRoleLabelEdits(p => ({ ...p, [role]: e.target.value }))} placeholder={t('Display name for {role}', { role })} />
              </div>
            ))}
          </div>
          <button className="btn btn-success" onClick={saveRoleLabels}><MI name="save" size={18} /> {t('Save Role Labels')}</button>
        </div>
      )}
    </div>
  );
}
