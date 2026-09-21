'use client';
// Lead follow-ups — shared UI used by the Follow-ups page, the Dashboard, the Leads table and the lead log.
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';

export const MI = ({ name, size = 18, style }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle', ...style }}>{name}</span>;

// ── Date helpers ────────────────────────────────────────────────────────────
const DAY = 86400000;
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
const pad = (n) => String(n).padStart(2, '0');
const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' */
export function bucketOf(iso, now = new Date()) {
  const d = new Date(iso);
  if (d < now && !sameDay(d, now)) return 'overdue';
  if (sameDay(d, now)) return d < now ? 'overdue' : 'today';
  const days = Math.round((startOfDay(d) - startOfDay(now)) / DAY);
  if (days === 1) return 'tomorrow';
  if (days <= 7) return 'week';
  return 'later';
}

export const TONE = {
  overdue:  { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', dot: '#ef4444' },
  today:    { bg: '#fffbeb', border: '#fde68a', text: '#b45309', dot: '#f59e0b' },
  tomorrow: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#3b82f6' },
  week:     { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#3b82f6' },
  later:    { bg: '#f8fafc', border: '#e2e8f0', text: '#475569', dot: '#94a3b8' },
  done:     { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', dot: '#22c55e' },
};

/** Human label: "Overdue 2 days · 14:00", "Today 15:00", "Tomorrow 10:00", "Mon 28 Sep, 10:00" */
export function dueLabel(iso, t, lang) {
  const d = new Date(iso), now = new Date();
  const loc = lang === 'ru' ? 'ru-RU' : 'en-GB';
  const time = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  const b = bucketOf(iso, now);
  if (b === 'overdue') {
    const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
    return days === 0 ? `${t('Overdue')} · ${t('today')} ${time}` : `${t('Overdue')} · ${t('{n}d ago', { n: days })}`;
  }
  if (b === 'today') return `${t('Today')} ${time}`;
  if (b === 'tomorrow') return `${t('Tomorrow')} ${time}`;
  return d.toLocaleString(loc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const QUICK_TITLES = ['Call back', 'Send email', 'Send proposal', 'Meeting', 'WhatsApp message', 'Check reply'];
export const REMIND_CHOICES = [
  { v: '', label: 'No email reminder' },
  { v: '0', label: 'Email at the due time' },
  { v: '15', label: 'Email 15 minutes before' },
  { v: '60', label: 'Email 1 hour before' },
  { v: '1440', label: 'Email 1 day before' },
];

async function send(url, method, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || (r.status >= 500 ? 'Server error — the database may be unavailable. Please try again shortly.' : 'Failed'));
  return d;
}

// ── Chip shown in tables / lists ────────────────────────────────────────────
export function DueChip({ iso, done, t, lang, onClick, compact }) {
  const tone = TONE[done ? 'done' : bucketOf(iso)];
  return (
    <button type="button" onClick={onClick} title={new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : undefined)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: compact ? '2px 7px' : '3px 9px', borderRadius: 20, border: `1px solid ${tone.border}`, background: tone.bg, color: tone.text, fontSize: compact ? '0.64rem' : '0.7rem', fontWeight: 700, cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
      <MI name={done ? 'check_circle' : 'event'} size={compact ? 12 : 14} /> {dueLabel(iso, t, lang)}
    </button>
  );
}

// ── Create / edit modal ─────────────────────────────────────────────────────
/**
 * props: lead (optional — when absent a lead search is shown), followup (edit mode), projectId, onClose, onDone
 */
export function FollowUpModal({ lead: fixedLead, followup, projectId, onClose, onDone }) {
  const { user } = useAuth();
  const { t, lang } = useProject();
  const isEdit = !!followup;
  const initial = followup ? new Date(followup.due_at) : (() => { const d = new Date(Date.now() + DAY); d.setHours(10, 0, 0, 0); return d; })();
  const [lead, setLead] = useState(fixedLead || (followup ? { id: followup.lead_id, company_name: followup.company_name, project_seq: followup.project_seq } : null));
  const [title, setTitle] = useState(followup?.title || '');
  const [date, setDate] = useState(toDateInput(initial));
  const [time, setTime] = useState(toTimeInput(initial));
  const [note, setNote] = useState(followup?.note || '');
  const [remind, setRemind] = useState(followup ? (followup.remind_at ? String(Math.round((new Date(followup.due_at) - new Date(followup.remind_at)) / 60000)) : '') : '60');
  const [assignee, setAssignee] = useState(String(followup?.assigned_to || user?.id || ''));
  const [team, setTeam] = useState([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { fetch('/api/team').then(r => r.json()).then(d => setTeam((d.members || []).filter(m => m.is_active !== 0 && m.is_active !== false && ['super_admin', 'manager'].includes(m.role)))).catch(() => {}); }, []);
  useEffect(() => {
    if (lead || q.trim().length < 1) { setResults([]); return; }
    const h = setTimeout(() => {
      const p = new URLSearchParams({ search: q.trim(), limit: '8', page: '1' }); if (projectId) p.set('project_id', projectId);
      fetch(`/api/leads?${p}`).then(r => r.json()).then(d => setResults(d.leads || [])).catch(() => {});
    }, 250);
    return () => clearTimeout(h);
  }, [q, lead, projectId]);

  const quickDate = (days, hour) => { const d = startOfDay(new Date(Date.now() + days * DAY)); setDate(toDateInput(d)); if (hour !== undefined) setTime(`${pad(hour)}:00`); };
  const nextMonday = () => { const d = new Date(); const add = ((8 - d.getDay()) % 7) || 7; return add; };
  const dueDate = new Date(`${date}T${time || '10:00'}`);

  async function save(e) {
    e.preventDefault(); setErr('');
    if (!lead) return setErr(t('Choose a lead'));
    if (!title.trim()) return setErr(t('What needs to be done?'));
    if (Number.isNaN(dueDate.getTime())) return setErr(t('Pick a date and time'));
    setSaving(true);
    try {
      const body = { lead_id: lead.id, title: title.trim(), note, due_at: dueDate.toISOString(), remind_before: remind === '' ? null : Number(remind), assigned_to: assignee ? Number(assignee) : null, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
      if (isEdit) await send(`/api/followups/${followup.id}`, 'PUT', body); else await send('/api/followups', 'POST', body);
      onDone?.();
    } catch (e2) { setErr(t(e2.message)); }
    finally { setSaving(false); }
  }

  const chip = (active) => ({ padding: '5px 11px', borderRadius: 20, border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : '#fff', color: active ? '#fff' : 'var(--text)', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });
  const selectedDay = toDateInput(dueDate);
  const DATE_CHIPS = [[t('Today'), 0], [t('Tomorrow'), 1], [t('In 3 days'), 3], [t('Next Monday'), nextMonday()]];

  return (
    <div className="leads-modal-overlay" onClick={onClose}>
      <div className="leads-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><MI name="event_upcoming" size={20} /> {isEdit ? t('Edit follow-up') : t('Schedule a follow-up')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>
        {err && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem', marginBottom: 12 }}>{err}</div>}
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 1. Lead */}
          <div className="leads-form-field">
            <label>1 · {t('Lead')}</label>
            {lead ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: '#f8fafc', fontSize: '0.84rem' }}>
                <MI name="apartment" size={16} /> <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}>#{lead.project_seq ?? lead.id}</span> <strong style={{ flex: 1 }}>{lead.company_name}</strong>
                {!fixedLead && !isEdit && <button type="button" onClick={() => { setLead(null); setQ(''); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600 }}>{t('Change')}</button>}
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search by company, city or lead number…')} />
                {results.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 5, marginTop: 4, maxHeight: 240, overflowY: 'auto' }}>
                    {results.map(r => (
                      <button type="button" key={r.id} onClick={() => setLead(r)} style={{ display: 'flex', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>
                        <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}>#{r.project_seq ?? r.id}</span> <strong>{r.company_name}</strong> <span style={{ color: '#9ca3af' }}>{r.city}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. What */}
          <div className="leads-form-field">
            <label>2 · {t('What needs to be done?')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {QUICK_TITLES.map(q2 => <button type="button" key={q2} style={chip(title === t(q2))} onClick={() => setTitle(t(q2))}>{t(q2)}</button>)}
            </div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('e.g. Call back about the quote')} maxLength={200} />
          </div>

          {/* 3. When */}
          <div className="leads-form-field">
            <label>3 · {t('When?')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {DATE_CHIPS.map(([label, days]) => { const d = toDateInput(startOfDay(new Date(Date.now() + days * DAY))); return <button type="button" key={label} style={chip(selectedDay === d)} onClick={() => quickDate(days)}>{label}</button>; })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 8 }}>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              <input type="time" value={time} onChange={e => setTime(e.target.value)} required />
            </div>
            {!Number.isNaN(dueDate.getTime()) && <div style={{ marginTop: 6 }}><DueChip iso={dueDate.toISOString()} t={t} lang={lang} /></div>}
          </div>

          {/* 4. Who + reminder */}
          <div className="leads-form-grid">
            <div className="leads-form-field">
              <label>4 · {t('Assigned to')}</label>
              <select value={assignee} onChange={e => setAssignee(e.target.value)}>
                {user && !team.some(m => m.id === user.id) && <option value={user.id}>{user.name} ({t('me')})</option>}
                {team.map(m => <option key={m.id} value={m.id}>{m.name}{m.id === user?.id ? ` (${t('me')})` : ''}</option>)}
              </select>
            </div>
            <div className="leads-form-field">
              <label><MI name="mail" size={13} /> {t('Email reminder')}</label>
              <select value={remind} onChange={e => setRemind(e.target.value)}>
                {REMIND_CHOICES.map(c => <option key={c.v} value={c.v}>{t(c.label)}</option>)}
              </select>
            </div>
          </div>

          <div className="leads-form-field">
            <label>{t('Note (optional)')}</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={t('Anything to remember for this follow-up')} />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">{t('Cancel')}</button>
            <button type="submit" disabled={saving} className="btn btn-primary"><MI name="event_available" size={16} /> {saving ? t('Saving…') : isEdit ? t('Save changes') : t('Schedule follow-up')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── "Mark as done" prompt (outcome comment + optional next follow-up) ───────
export function DoneModal({ followup, onClose, onDone }) {
  const { t } = useProject();
  const [comment, setComment] = useState('');
  const [scheduleNext, setScheduleNext] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    if (!comment.trim()) return setErr(t('Please write what happened'));
    setSaving(true);
    try { await send(`/api/followups/${followup.id}`, 'PUT', { status: 'done', comment: comment.trim() }); onDone?.(scheduleNext); }
    catch (e2) { setErr(t(e2.message)); setSaving(false); }
  }
  return (
    <div className="leads-modal-overlay" onClick={onClose}>
      <div className="leads-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><MI name="task_alt" size={20} style={{ color: '#16a34a' }} /> {t('Mark follow-up as done')}</h3>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 12 }}><strong>{followup.title}</strong> · {followup.company_name}</div>
        {err && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem', marginBottom: 10 }}>{err}</div>}
        <form onSubmit={submit}>
          <div className="leads-form-field">
            <label>{t('What happened?')} *</label>
            <textarea autoFocus rows={3} value={comment} onChange={e => { setComment(e.target.value); setErr(''); }} placeholder={t('e.g. Spoke to the director, sending a proposal on Friday')} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', marginTop: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={scheduleNext} onChange={e => setScheduleNext(e.target.checked)} /> {t('Schedule the next follow-up after this')}
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">{t('Cancel')}</button>
            <button type="submit" disabled={saving} className="btn btn-primary" style={{ background: '#16a34a' }}><MI name="check" size={16} /> {saving ? t('Saving…') : t('Mark as done')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── One row in an agenda list ───────────────────────────────────────────────
export function FollowUpRow({ f, showLead = true, onDone, onEdit, onReopen, onDelete, onOpenLead }) {
  const { t, lang } = useProject();
  const done = f.status === 'done';
  const tone = TONE[done ? 'done' : bucketOf(f.due_at)];
  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 12px', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start', borderLeft: `3px solid ${tone.dot}` }}>
      <button type="button" title={done ? t('Reopen') : t('Mark as done')} onClick={() => done ? onReopen?.(f) : onDone?.(f)}
        style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 8, border: `2px solid ${done ? '#22c55e' : '#cbd5e1'}`, background: done ? '#22c55e' : '#fff', color: done ? '#fff' : '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
        <MI name="check" size={16} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: done ? 'var(--text-muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none', wordBreak: 'break-word' }}>{f.title}</div>
        {showLead && (
          <button type="button" onClick={() => onOpenLead?.(f)} style={{ background: 'none', border: 'none', padding: 0, cursor: onOpenLead ? 'pointer' : 'default', fontSize: '0.74rem', color: 'var(--primary)', fontWeight: 600, textAlign: 'left', fontFamily: 'inherit' }}>
            #{f.project_seq ?? f.lead_id} · {f.company_name}{f.city ? ` · ${f.city}` : ''}
          </button>
        )}
        {(f.phone || f.mobile_personal) && !done && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}><MI name="call" size={12} /> {[f.mobile_personal, f.phone].filter(Boolean).join(' · ')}</div>}
        {f.note && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{f.note}</div>}
        {done && f.done_comment && <div style={{ fontSize: '0.72rem', color: '#15803d', background: '#f0fdf4', borderRadius: 6, padding: '3px 8px', marginTop: 4, whiteSpace: 'pre-wrap' }}>✓ {f.done_comment} — {f.done_by_name}</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 5 }}>
          <DueChip iso={f.due_at} done={done} t={t} lang={lang} compact />
          <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}><MI name="person" size={12} /> {f.assigned_to_name || f.created_by_name}</span>
          {f.remind_at && !done && <span title={t('Email reminder')} style={{ fontSize: '0.66rem', color: f.reminder_sent_at ? '#15803d' : 'var(--text-muted)' }}><MI name={f.reminder_sent_at ? 'mark_email_read' : 'mail'} size={12} /> {f.reminder_sent_at ? t('Reminder sent') : t('Email reminder on')}</span>}
        </div>
      </div>
      {!done && (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          {onEdit && <button type="button" title={t('Edit / reschedule')} onClick={() => onEdit(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: 4 }}><MI name="edit_calendar" size={17} /></button>}
          {onDelete && <button type="button" title={t('Delete')} onClick={() => onDelete(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}><MI name="delete" size={17} /></button>}
        </div>
      )}
    </div>
  );
}

// ── Hook: all modals + actions for a list of follow-ups ─────────────────────
export function useFollowUpActions(reload) {
  const [editing, setEditing] = useState(null);   // follow-up being edited
  const [creating, setCreating] = useState(null); // { lead } | {} to create
  const [finishing, setFinishing] = useState(null);
  const { t } = useProject();
  const actions = {
    onEdit: (f) => setEditing(f),
    onDone: (f) => setFinishing(f),
    onReopen: async (f) => { try { await send(`/api/followups/${f.id}`, 'PUT', { status: 'open' }); reload(); } catch (e) { alert(t(e.message)); } },
    onDelete: async (f) => {
      const c = window.prompt(t('Delete this follow-up? Add a short reason (saved in the lead log):'));
      if (c === null) return;
      try { await send(`/api/followups/${f.id}`, 'DELETE', { comment: c }); reload(); } catch (e) { alert(t(e.message)); }
    },
  };
  const modals = (projectId) => (<>
    {creating && <FollowUpModal lead={creating.lead} projectId={projectId} onClose={() => setCreating(null)} onDone={() => { setCreating(null); reload(); }} />}
    {editing && <FollowUpModal followup={editing} projectId={projectId} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
    {finishing && <DoneModal followup={finishing} onClose={() => setFinishing(null)} onDone={(next) => {
      const f = finishing; setFinishing(null); reload();
      if (next) setCreating({ lead: { id: f.lead_id, company_name: f.company_name, project_seq: f.project_seq } });
    }} />}
  </>);
  return { actions, modals, create: (lead) => setCreating({ lead }) };
}
