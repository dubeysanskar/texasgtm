'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

const ROLE_MAP = {
  super_admin: { label: 'Super Admin', bg: '#fef2f2', text: '#dc2626', icon: 'shield' },
  manager: { label: 'Manager', bg: '#eff6ff', text: '#2563eb', icon: 'manage_accounts' },
  staff: { label: 'Staff', bg: '#f0fdf4', text: '#16a34a', icon: 'person' },
  marketing: { label: 'Marketing', bg: '#fdf4ff', text: '#9333ea', icon: 'campaign' },
};

export default function TeamPage() {
  const { user, isAdmin } = useAuth();
  const { t, lang } = useProject();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'staff', job_title: '', language: lang });
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function fetchTeam() {
    setLoading(true);
    fetch('/api/team').then(r => r.json()).then(d => setMembers(d.members || [])).finally(() => setLoading(false));
  }
  useEffect(() => { fetchTeam(); }, []);

  async function handleInvite(e) {
    e.preventDefault(); setInviting(true); setErr(''); setMsg('');
    const r = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inviteForm) });
    const d = await r.json();
    if (r.ok) {
      setMsg(t('{name} invited successfully!', { name: inviteForm.name }));
      setInviteForm({ name: '', email: '', role: 'staff', job_title: '', language: lang });
      setShowInvite(false);
      fetchTeam();
    } else setErr(t(d.error || 'Failed'));
    setInviting(false);
  }

  const isSuperAdmin = user?.role === 'super_admin';

  if (loading) return <div className="page-content"><div className="skeleton" style={{ height: 300, borderRadius: 12 }} /></div>;

  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2, fontSize: '1.3rem' }}><MI name="group" size={22} /> {t('Team')}</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('{n} members', { n: members.length })}</p>
        </div>
        {isSuperAdmin && (
          <button onClick={() => setShowInvite(!showInvite)} className="btn btn-primary" style={{ fontSize: '0.75rem' }}>
            <MI name="person_add" size={15} /> {t('Invite User')}
          </button>
        )}
      </div>

      {msg && <div style={{ background: '#dcfce7', color: '#166534', padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', marginBottom: 12 }}>{msg}</div>}
      {err && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 14px', borderRadius: 8, fontSize: '0.78rem', marginBottom: 12 }}>{err}</div>}

      {/* Invite Form */}
      {showInvite && isSuperAdmin && (
        <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 12 }}>{t('Invite New Team Member')}</h3>
          <form onSubmit={handleInvite}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div className="leads-form-field"><label>{t('Full Name')} *</label>
                <input required value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} placeholder={t('e.g. John Doe')} />
              </div>
              <div className="leads-form-field"><label>{t('Email')} *</label>
                <input required type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="user@email.com" />
              </div>
              <div className="leads-form-field"><label>{t('Role')}</label>
                <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="super_admin">{t('Super Admin')}</option>
                  <option value="manager">{t('Manager')}</option>
                  <option value="staff">{t('Staff')}</option>
                  <option value="marketing">{t('Marketing')}</option>
                </select>
              </div>
              <div className="leads-form-field"><label>{t('Job title')}</label>
                <input value={inviteForm.job_title} onChange={e => setInviteForm(f => ({ ...f, job_title: e.target.value }))} placeholder={t('e.g. Sales Manager')} />
              </div>
              <div className="leads-form-field"><label>{t('Interface language')}</label>
                <select value={inviteForm.language} onChange={e => setInviteForm(f => ({ ...f, language: e.target.value }))}>
                  <option value="en">🇬🇧 English</option>
                  <option value="ru">🇷🇺 Русский</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="submit" disabled={inviting} className="btn btn-primary" style={{ fontSize: '0.75rem' }}>
                {inviting ? t('Sending…') : t('Send Invite')}
              </button>
              <button type="button" onClick={() => setShowInvite(false)} className="btn btn-ghost" style={{ fontSize: '0.75rem' }}>{t('Cancel')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Members Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {members.map(m => {
          const r = ROLE_MAP[m.role] || ROLE_MAP.staff;
          return (
            <div key={m.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: r.text, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
                {m.name?.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{m.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>{m.email}</div>
                {m.job_title && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>{m.job_title}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: '0.66rem', padding: '2px 10px', borderRadius: 20, background: r.bg, color: r.text, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MI name={r.icon} size={12} /> {t(r.label)}
                  </span>
                  <span style={{ fontSize: '0.64rem', fontWeight: 600, color: m.is_active ? '#10b981' : '#ef4444' }}>
                    {m.is_active ? '● ' + t('Active') : '○ ' + t('Inactive')}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
