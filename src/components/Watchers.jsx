'use client';
// CC / watch subscriptions: who gets a portal + email notification for a lead's activity, or for
// everything a specific team member does. Shared by the lead log modal and the Team page.
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';

const MI = ({ name, size = 15 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

async function send(url, method, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Failed');
  return d;
}

function Chip({ w, canRemove, onRemove, t }) {
  const mine = w.source === 'comment';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 6px 3px 10px', borderRadius: 20, background: mine ? '#f1f5f9' : '#fdf2f8', border: `1px solid ${mine ? '#e2e8f0' : '#fbcfe8'}`, fontSize: '0.72rem', fontWeight: 600, color: mine ? '#475569' : '#9d174d' }}>
      <MI name={mine ? 'chat' : 'push_pin'} size={12} /> {w.name}
      <span style={{ fontWeight: 500, opacity: 0.7, fontSize: '0.64rem' }}>{mine ? t('via comment') : 'CC'}</span>
      {canRemove && <button type="button" onClick={onRemove} title={t('Stop notifying')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: 0, display: 'flex' }}><MI name="close" size={13} /></button>}
    </span>
  );
}

/** CC panel for one lead — shown inside the lead log modal. */
export function LeadWatchersPanel({ leadId }) {
  const { user, isAdmin } = useAuth();
  const { t } = useProject();
  const [watchers, setWatchers] = useState(null);
  const [team, setTeam] = useState([]);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    fetch(`/api/watchers?lead_id=${leadId}`).then(r => r.json()).then(d => setWatchers(d.watchers || [])).catch(() => setWatchers([]));
  }, [leadId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isAdmin) fetch('/api/team').then(r => r.json()).then(d => setTeam((d.members || []).filter(m => m.is_active !== 0 && m.is_active !== false))).catch(() => {}); }, [isAdmin]);

  const iAmWatching = watchers?.some(w => w.watcher_id === user?.id);
  const candidates = team.filter(m => !watchers?.some(w => w.watcher_id === m.id));

  async function toggleSelf() {
    setErr('');
    try {
      if (iAmWatching) await send('/api/watchers', 'DELETE', { lead_id: leadId });
      else await send('/api/watchers', 'POST', { lead_id: leadId });
      load();
    } catch (e) { setErr(t(e.message)); }
  }
  async function addPicked() {
    if (!pick) return;
    setErr('');
    try { await send('/api/watchers', 'POST', { lead_id: leadId, watcher_id: pick }); setPick(''); setAdding(false); load(); }
    catch (e) { setErr(t(e.message)); }
  }
  async function remove(watcherId) {
    setErr('');
    try { await send('/api/watchers', 'DELETE', { lead_id: leadId, watcher_id: watcherId }); load(); }
    catch (e) { setErr(t(e.message)); }
  }

  if (watchers === null) return null;
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: watchers.length ? 8 : 4 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 5 }}><MI name="visibility" size={15} /> {t('CC / notify on updates')}</span>
        <button type="button" onClick={toggleSelf} className="btn btn-sm btn-ghost" style={{ padding: '2px 9px', fontSize: '0.68rem', marginLeft: 'auto' }}>
          <MI name={iAmWatching ? 'notifications_off' : 'notifications_active'} size={13} /> {iAmWatching ? t('Stop notifying me') : t('Notify me')}
        </button>
        {isAdmin && <button type="button" onClick={() => setAdding(a => !a)} className="btn btn-sm btn-ghost" style={{ padding: '2px 9px', fontSize: '0.68rem' }}><MI name="person_add" size={13} /> {t('Add CC')}</button>}
      </div>
      {err && <div style={{ color: '#dc2626', fontSize: '0.7rem', marginBottom: 6 }}>{err}</div>}
      {adding && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <select value={pick} onChange={e => setPick(e.target.value)} style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.76rem', fontFamily: 'inherit' }}>
            <option value="">{t('Choose a team member…')}</option>
            {candidates.map(m => <option key={m.id} value={m.id}>{m.name} — {t(m.role)}</option>)}
          </select>
          <button type="button" onClick={addPicked} disabled={!pick} className="btn btn-sm btn-primary" style={{ fontSize: '0.7rem' }}>{t('Add')}</button>
        </div>
      )}
      {watchers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {watchers.map(w => <Chip key={w.id} w={w} t={t} canRemove={isAdmin || w.watcher_id === user?.id} onRemove={() => remove(w.watcher_id)} />)}
        </div>
      )}
      {watchers.length === 0 && !adding && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('No one is CC’d — commenting on this lead subscribes you automatically.')}</div>}
    </div>
  );
}

/** Super admin: manage who is CC'd on everything a given team member does. Used on the Team page. */
export function UserWatchModal({ member, onClose }) {
  const { t } = useProject();
  const [watchers, setWatchers] = useState(null);
  const [team, setTeam] = useState([]);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    fetch(`/api/watchers?target_user_id=${member.id}`).then(r => r.json()).then(d => setWatchers(d.watchers || [])).catch(() => setWatchers([]));
  }, [member.id]);
  useEffect(() => { load(); fetch('/api/team').then(r => r.json()).then(d => setTeam((d.members || []).filter(m => m.role === 'super_admin' && m.id !== member.id))).catch(() => {}); }, [load, member.id]);

  const candidates = team.filter(m => !watchers?.some(w => w.watcher_id === m.id));
  async function addPicked() {
    if (!pick) return;
    setErr('');
    try { await send('/api/watchers', 'POST', { target_user_id: member.id, watcher_id: pick }); setPick(''); load(); }
    catch (e) { setErr(t(e.message)); }
  }
  async function remove(watcherId) {
    setErr('');
    try { await send('/api/watchers', 'DELETE', { target_user_id: member.id, watcher_id: watcherId }); load(); }
    catch (e) { setErr(t(e.message)); }
  }

  return (
    <div className="leads-modal-overlay" onClick={onClose}>
      <div className="leads-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><MI name="visibility" size={19} /> {t('Watch this member’s activity')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: 12 }}>{t('Whoever is CC’d here gets a portal notification and an email for every comment, status change and lead update {name} makes, on any lead.', { name: member.name })}</div>
        {err && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '7px 10px', borderRadius: 8, fontSize: '0.74rem', marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <select value={pick} onChange={e => setPick(e.target.value)} style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem', fontFamily: 'inherit' }}>
            <option value="">{t('Choose a super admin…')}</option>
            {candidates.map(m => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
          </select>
          <button type="button" onClick={addPicked} disabled={!pick} className="btn btn-sm btn-primary">{t('Add CC')}</button>
        </div>
        {watchers === null ? <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('Loading…')}</div>
          : watchers.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('No one is watching {name} yet.', { name: member.name })}</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {watchers.map(w => (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.8rem' }}>
                  <MI name="shield" size={15} /> <span style={{ flex: 1, fontWeight: 600 }}>{w.name}</span> <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{w.email}</span>
                  <button type="button" onClick={() => remove(w.watcher_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex' }}><MI name="close" size={16} /></button>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
