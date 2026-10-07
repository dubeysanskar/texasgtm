'use client';
// Shared "why are you making this change?" prompt — every status/priority/field change on a lead
// requires a comment, which is saved with the log entry. Used by the Leads page and Priority Leads page.
import { useState } from 'react';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>;

export default function CommentPrompt({ t, title, detail, danger, onCancel, onConfirm }) {
  const [comment, setComment] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function confirm(e) {
    e?.preventDefault();
    if (!comment.trim()) { setErr(t('Please enter a comment describing this change')); return; }
    setBusy(true);
    try { await onConfirm(comment.trim()); }
    catch (e) { setErr(t('Cannot reach the server. Check your connection and try again.')); setBusy(false); }
  }
  return (
    <div className="leads-modal-overlay" onClick={onCancel}>
      <div className="leads-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <form onSubmit={confirm}>
          <h3 style={{ fontSize:'1rem', fontWeight:700, display:'flex', alignItems:'center', gap:8 }}><MI name="edit_note" size={20}/> {t('Comment for this change')}</h3>
          <div style={{ fontSize:'0.8rem', color:'var(--text-dim)', margin:'6px 0 12px' }}><strong>{title}</strong> — {detail}</div>
          {err && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'6px 10px', borderRadius:8, fontSize:'0.76rem', marginBottom:8 }}>{err}</div>}
          <div className="leads-form-field">
            <textarea autoFocus rows={3} value={comment} onChange={e => { setComment(e.target.value); setErr(''); }} placeholder={t('Why are you making this change?')} style={{ fontFamily:'inherit', fontSize:'0.84rem' }} />
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:14 }}>
            <button type="button" onClick={onCancel} className="btn btn-ghost">{t('Cancel')}</button>
            <button type="submit" disabled={busy} className={danger ? 'btn btn-danger' : 'btn btn-primary'}>{busy ? t('Saving…') : danger ? t('Delete') : t('Save change')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
