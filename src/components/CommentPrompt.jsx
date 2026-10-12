'use client';
// Shared "why are you making this change?" prompt — every status/priority/field change on a lead
// requires a comment, which is saved with the log entry. Used by the Leads page and Priority Leads page.
//
// askDate: also ask WHEN (used for "Follow Up Later") — onConfirm(comment, { followup_at, tz }) and the
// leads API schedules a follow-up for that date, so it shows on the Dashboard and Follow-ups calendar.
import { useState } from 'react';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>;

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dateStr(d); };
const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); return dateStr(d); };

export function FollowUpDateFields({ t, date, time, setDate, setTime }) {
  const chips = [[t('Tomorrow'), inDays(1)], [t('In 3 days'), inDays(3)], [t('Next Monday'), nextMonday()], [t('In 2 weeks'), inDays(14)], [t('In a month'), inDays(30)]];
  const chip = (active) => ({ padding: '4px 10px', borderRadius: 20, border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : '#fff', color: active ? '#fff' : 'var(--text)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });
  return (
    <div style={{ padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, marginBottom: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', fontWeight: 700, color: '#92400e', marginBottom: 8 }}><MI name="event" size={16} /> {t('When should we follow up?')} *</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {chips.map(([label, d]) => <button type="button" key={label} style={chip(date === d)} onClick={() => setDate(d)}>{label}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
        <input type="date" value={date} min={dateStr(new Date())} onChange={e => setDate(e.target.value)} required style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem', fontFamily: 'inherit' }} />
        <input type="time" value={time} onChange={e => setTime(e.target.value)} required style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem', fontFamily: 'inherit' }} />
      </div>
      <div style={{ fontSize: '0.68rem', color: '#92400e', marginTop: 6 }}>{t("A follow-up reminder is created for this date — it shows on the Dashboard and the Follow-ups calendar, with an email 1 hour before.")}</div>
    </div>
  );
}

/** Build the request fields for a follow-up date, or null if invalid. */
export function followupFields(date, time) {
  const d = new Date(`${date}T${time || '10:00'}`);
  if (!date || Number.isNaN(d.getTime())) return null;
  return { followup_at: d.toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

export default function CommentPrompt({ t, title, detail, danger, askDate, onCancel, onConfirm }) {
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(inDays(1));
  const [time, setTime] = useState('10:00');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function confirm(e) {
    e?.preventDefault();
    if (!comment.trim()) { setErr(t('Please enter a comment describing this change')); return; }
    let extra = {};
    if (askDate) {
      const f = followupFields(date, time);
      if (!f) { setErr(t('Pick a date and time')); return; }
      extra = { ...f, followup_title: t('Follow up later') };
    }
    setBusy(true);
    try { await onConfirm(comment.trim(), extra); }
    catch (e) { setErr(t('Cannot reach the server. Check your connection and try again.')); setBusy(false); }
  }
  return (
    <div className="leads-modal-overlay" onClick={onCancel}>
      <div className="leads-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <form onSubmit={confirm}>
          <h3 style={{ fontSize:'1rem', fontWeight:700, display:'flex', alignItems:'center', gap:8 }}><MI name={askDate ? 'event_upcoming' : 'edit_note'} size={20}/> {askDate ? t('Follow up later') : t('Comment for this change')}</h3>
          <div style={{ fontSize:'0.8rem', color:'var(--text-dim)', margin:'6px 0 12px' }}><strong>{title}</strong> — {detail}</div>
          {err && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'6px 10px', borderRadius:8, fontSize:'0.76rem', marginBottom:8 }}>{err}</div>}
          {askDate && <FollowUpDateFields t={t} date={date} time={time} setDate={setDate} setTime={setTime} />}
          <div className="leads-form-field">
            {askDate && <label>{t('Comment')} *</label>}
            <textarea autoFocus rows={3} value={comment} onChange={e => { setComment(e.target.value); setErr(''); }} placeholder={t(askDate ? 'e.g. Asked to call back after the budget is approved' : 'Why are you making this change?')} style={{ fontFamily:'inherit', fontSize:'0.84rem' }} />
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:14 }}>
            <button type="button" onClick={onCancel} className="btn btn-ghost">{t('Cancel')}</button>
            <button type="submit" disabled={busy} className={danger ? 'btn btn-danger' : 'btn btn-primary'}>{busy ? t('Saving…') : danger ? t('Delete') : askDate ? t('Save & schedule') : t('Save change')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
