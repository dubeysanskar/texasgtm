'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

export default function ProfilePage() {
  const { roleLabel, roleColor } = useAuth();
  const { t, lang, setLang } = useProject();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => { fetch('/api/profile').then(r => r.json()).then(d => { setProfile(d.profile); setForm(d.profile || {}); }); }, []);

  const save = async () => {
    await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setEditing(false); setMsg(t('Profile updated')); setTimeout(() => setMsg(''), 3000);
    if (form.language) setLang(form.language);
  };

  const changePw = async () => {
    const res = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pwForm) });
    if (res.ok) { setMsg(t('Password changed')); setPwForm({ current_password: '', new_password: '' }); } else { const d = await res.json(); setMsg(t(d.error || 'Request failed')); }
    setTimeout(() => setMsg(''), 3000);
  };

  if (!profile) return <div className="page-content"><div className="skeleton" style={{ height: 300, borderRadius: 12 }} /></div>;

  return (
    <div className="page-content">
      <div className="page-header"><h1><MI name="person" size={26} /> {t('My Profile')}</h1></div>
      {msg && <div style={{ padding: '10px 16px', background: /error|incorrect|невер|ошибк/i.test(msg) ? '#fef2f2' : '#f0fdf4', color: /error|incorrect|невер|ошибк/i.test(msg) ? '#ef4444' : '#10b981', borderRadius: 10, marginBottom: 16, fontSize: '0.82rem' }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: roleColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800 }}>{profile.name?.charAt(0)}</div>
            <div><h2 style={{ fontSize: '1.1rem' }}>{profile.name}</h2><span style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: 20, background: `${roleColor}15`, color: roleColor, fontWeight: 600 }}>{t(roleLabel)}</span>{profile.job_title && <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 4 }}>{profile.job_title}</div>}</div>
          </div>
          {editing ? (
            <>
              <div className="form-group"><label>{t('Name')}</label><input className="form-input" value={form.name || ''} onChange={e => setForm(p => ({...p, name: e.target.value}))} /></div>
              <div className="form-group"><label>{t('Company')}</label><input className="form-input" value={form.company || ''} onChange={e => setForm(p => ({...p, company: e.target.value}))} /></div>
              <div className="form-group"><label>{t('Phone')}</label><input className="form-input" value={form.phone || ''} onChange={e => setForm(p => ({...p, phone: e.target.value}))} /></div>
              <div className="form-group"><label>{t('Job title')}</label><input className="form-input" value={form.job_title || ''} onChange={e => setForm(p => ({...p, job_title: e.target.value}))} /></div>
              <div className="form-group"><label>{t('Interface language')}</label><select className="form-input" value={form.language || 'en'} onChange={e => setForm(p => ({...p, language: e.target.value}))}><option value="en">🇬🇧 English</option><option value="ru">🇷🇺 Русский</option></select></div>
              <div className="form-group"><label>{t('Bio')}</label><textarea className="form-input" rows={3} value={form.bio || ''} onChange={e => setForm(p => ({...p, bio: e.target.value}))} /></div>
              <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-success" onClick={save}>{t('Save')}</button><button className="btn btn-ghost" onClick={() => setEditing(false)}>{t('Cancel')}</button></div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '0.85rem', lineHeight: 2 }}><p><strong>{t('Email')}:</strong> {profile.email}</p><p><strong>{t('Job title')}:</strong> {profile.job_title || '—'}</p><p><strong>{t('Company')}:</strong> {profile.company || '—'}</p><p><strong>{t('Phone')}:</strong> {profile.phone || '—'}</p><p><strong>{t('Interface language')}:</strong> {profile.language === 'ru' ? 'Русский' : 'English'}</p><p><strong>{t('Bio')}:</strong> {profile.bio || '—'}</p><p><strong>{t('Joined')}:</strong> {new Date(profile.created_at).toLocaleDateString(lang === 'ru' ? 'ru-RU' : undefined)}</p></div>
              <button className="btn btn-info" style={{ marginTop: 12 }} onClick={() => setEditing(true)}><MI name="edit" size={14} /> {t('Edit Profile')}</button>
            </>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 16 }}><MI name="lock" size={18} /> {t('Change Password')}</h3>
          <div className="form-group"><label>{t('Current Password')}</label><input type="password" className="form-input" value={pwForm.current_password} onChange={e => setPwForm(p => ({...p, current_password: e.target.value}))} /></div>
          <div className="form-group"><label>{t('New Password')}</label><input type="password" className="form-input" value={pwForm.new_password} onChange={e => setPwForm(p => ({...p, new_password: e.target.value}))} /></div>
          <button className="btn btn-primary" onClick={changePw} disabled={!pwForm.current_password || !pwForm.new_password}>{t('Update Password')}</button>
        </div>
      </div>
    </div>
  );
}
