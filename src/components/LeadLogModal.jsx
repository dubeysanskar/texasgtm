'use client';
// The lead's log window — history, comments, follow-ups, CC — used on Lead Management, Achieved Leads,
// the Dashboard, Follow-ups and Team performance, so a lead's log always opens right where you are.
import { useState, useEffect, useCallback } from 'react';
import { useProject } from '@/context/ProjectContext';
import { FollowUpRow, useFollowUpActions } from '@/components/FollowUps';
import { LeadWatchersPanel } from '@/components/Watchers';
import { FollowUpDateFields, followupFields } from '@/components/CommentPrompt';
import ContactBadges from '@/components/LeadContactBadges';
import { SC, PC } from '@/lib/lead-status';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>;

export default function LeadLogModal({ t: tProp, lang: langProp, lead: initialLead, projectId, readOnly, onChanged, onClose }) {
  const ctx = useProject();
  const t = tProp || ctx.t, lang = langProp || ctx.lang;
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [fus, setFus] = useState([]);
  const [note, setNote] = useState('');
  const [newStatus, setNewStatus] = useState('');
  // "Follow Up Later" in the composer also asks when (default: tomorrow 10:00)
  const [fuDate, setFuDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [fuTime, setFuTime] = useState('10:00');
  const [posting, setPosting] = useState(false);
  const [postErr, setPostErr] = useState('');
  const lead = data?.lead ? { ...initialLead, ...data.lead } : initialLead;
  const reload = useCallback(() => {
    fetch(`/api/leads/${initialLead.id}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed'); setData(d); }).catch(e => setErr(e.message));
    fetch(`/api/followups?lead_id=${initialLead.id}&status=all`).then(r => r.json()).then(d => setFus(d.followups || [])).catch(() => {});
  }, [initialLead.id]);
  useEffect(() => { reload(); }, [reload]);
  const fu = useFollowUpActions(() => { reload(); onChanged?.(); });
  // "Add an update": a comment, optionally together with a status change
  async function postUpdate(e) {
    e.preventDefault(); setPostErr('');
    if (!note.trim()) { setPostErr(t('Please enter a comment')); return; }
    let extra = {};
    if (newStatus === 'follow_up_later') {
      const f = followupFields(fuDate, fuTime);
      if (!f) { setPostErr(t('Pick a date and time')); return; }
      extra = { ...f, followup_title: t('Follow up later') };
    }
    setPosting(true);
    try {
      const r = newStatus && newStatus !== lead.status
        ? await fetch(`/api/leads/${lead.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status: newStatus, comment: note.trim(), ...extra }) })
        : await fetch(`/api/leads/${lead.id}/comment`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ comment: note.trim() }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
      setNote(''); setNewStatus(''); reload(); onChanged?.();
    } catch (e2) { setPostErr(t(e2.message)); }
    finally { setPosting(false); }
  }
  const openFus = fus.filter(f => f.status === 'open');
  const fmt = (v) => v ? new Date(v).toLocaleString(lang === 'ru' ? 'ru-RU' : undefined) : '—';
  // Merge status history, activity log and email sends into one timeline
  // How the lead got into the CRM (scraped_from); a missing value means it was added by hand
  const SOURCE = { manual: 'manually', bulk_upload: 'via bulk upload', excel_import: 'via initial data import', google_maps: 'via Lead Scraper (Google Maps)', '2gis': 'via Lead Scraper (2GIS)', web_search: 'via Lead Scraper (web search)', google_dork: 'via Lead Scraper (web search)', 'hh.ru': 'via Lead Scraper (hh.ru)', superjob: 'via Lead Scraper (SuperJob)' };
  const how = (src) => t(SOURCE[src] || (src ? 'via {src}' : 'manually'), { src });
  const createdBy = data?.lead?.created_by_name || '';
  // Leads added before creation was logged (bulk upload, scraper, initial import) get a synthesized entry
  // …carrying the comment the lead was added with, which is always the first comment in its history
  const firstComment = String(data?.lead?.notes || '').trim();
  const created = data && !data.logs.some(l => l.kind === 'create' || /^Added lead/.test(l.action)) ? [{ at: lead.created_at, who: createdBy, icon: 'add', text: `${t('Lead created')} ${how(lead.scraped_from)}`, first: true,
    comment: firstComment && !data.logs.some(l => String(l.comment || '').trim() === firstComment) ? firstComment : '' }] : [];
  const ICONS = { initial: 'chat', create: 'add', note: 'chat', followup: 'event', watch: 'visibility', status: 'swap_horiz', priority: 'flag', template: 'description', edit: 'edit_note', delete: 'delete', restore: 'restore_from_trash', purge: 'delete_forever', achieved: 'emoji_events', unachieved: 'undo', comment_edit: 'edit' };
  const describe = (l) => {
    if (l.kind === 'status') return `${t('Status')}: ${t(SC[l.from]?.label || l.from || '—')} → ${t(SC[l.to]?.label || l.to)}${l.bulk ? ` (${t('bulk')})` : ''}`;
    if (l.kind === 'priority') return `${t('Priority')}: ${t(PC[l.from]?.label || l.from || '—')} → ${t(PC[l.to]?.label || l.to)}`;
    if (l.kind === 'template') return `${t('Template')}: ${l.template || t('Clear template')}${l.bulk ? ` (${t('bulk')})` : ''}`;
    if (l.kind === 'edit') return `${t('Edited')}: ${(l.fields || []).map(f => t(FIELD_NAMES[f] || f)).join(', ')}`;
    if (l.kind === 'note') return t('Comment');
    if (l.kind === 'initial') return t('First comment');
    if (l.kind === 'comment_edit') return t('Comment edited');
    if (l.kind === 'followup') {
      const when = l.due_at ? new Date(l.due_at).toLocaleString(lang === 'ru' ? 'ru-RU' : undefined, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
      const EV = { created: 'Follow-up scheduled', done: 'Follow-up completed', rescheduled: 'Follow-up rescheduled', updated: 'Follow-up updated', deleted: 'Follow-up removed', reopened: 'Follow-up reopened' };
      return `${t(EV[l.event] || 'Follow-up')}: "${l.title}"${when ? ` · ${when}` : ''}${l.assignee ? ` · ${t('Assigned to')} ${l.assignee}` : ''}`;
    }
    if (l.kind === 'watch') {
      if (l.event === 'added') return l.self ? t('Subscribed to notifications') : t('Added {name} as CC', { name: l.watcher });
      if (l.event === 'removed') return l.self ? t('Unsubscribed from notifications') : t('Removed {name} from CC', { name: l.watcher });
      return l.action;
    }
    if (l.kind === 'delete') return t('Lead deleted');
    if (l.kind === 'restore') return t('Lead restored');
    if (l.kind === 'achieved') return `🏆 ${t('Marked as achieved')}${l.bulk ? ` (${t('bulk')})` : ''}`;
    if (l.kind === 'unachieved') return `${t('Moved back to leads')}${l.bulk ? ` (${t('bulk')})` : ''}`;
    if (l.kind === 'purge') return t('Permanently deleted');
    if (l.kind === 'create' || /^Added lead/.test(l.action)) return `${t('Lead created')} ${how(l.source || lead.scraped_from)}`;
    return l.action;
  };
  const entries = data ? [
    ...created,
    // status history rows only for legacy entries that have no matching activity log (new changes are logged with a comment)
    ...data.history.filter(h => !data.logs.some(l => l.kind === 'status' && Math.abs(new Date(l.created_at) - new Date(h.changed_at)) < 5000)).map(h => ({ at: h.changed_at, who: h.changed_by_name, icon: 'swap_horiz', text: `${t('Status')}: ${t(SC[h.old_status]?.label || h.old_status || '—')} → ${t(SC[h.new_status]?.label || h.new_status)}`, comment: h.note && h.note !== 'bulk' ? h.note : '' })),
    ...data.logs.filter(l => !/^Changed ".*" status:/.test(l.action) || l.kind).map(l => ({ at: l.created_at, who: l.user_name, icon: ICONS[l.kind] || (/^Added lead/.test(l.action) ? 'add' : 'edit_note'), text: describe(l), comment: l.comment || '', edited: l.edited_at ? { at: l.edited_at, by: l.edited_by } : null, changes: l.kind === 'comment_edit' ? { notes: { from: l.from, to: l.to } } : l.changes, kind: l.kind, first: l.kind === 'create' || l.kind === 'initial' })),
    ...data.sends.map(sd => ({ at: sd.sent_at || sd.created_at, who: t('Auto Email'), icon: 'mail', text: `${t('Email')}: "${sd.subject}" — ${t(sd.status)}${sd.opened_at ? ` · ${t('Opened')} ${fmt(sd.opened_at)}` : ''}` })),
  ].sort((a, b) => (new Date(b.at) - new Date(a.at)) || ((a.first ? 1 : 0) - (b.first ? 1 : 0)) || ((a.kind === 'initial' ? 1 : 0) - (b.kind === 'initial' ? 1 : 0))) : [];
  return (
    <div className="leads-modal-overlay" onClick={onClose}>
      <div className="leads-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
          <div>
            <h3 style={{ fontSize:'1rem', fontWeight:700 }}><MI name="history" size={18}/> {t('Lead log')}</h3>
            <div style={{ fontSize:'0.78rem', color:'var(--text-dim)', marginTop:2 }}>#{lead.project_seq ?? lead.id} · <strong>{lead.company_name}</strong>{lead.city ? ` · ${lead.city}` : ''}</div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6, flexWrap:'wrap' }}>
              {lead.email && <a href={`mailto:${lead.email}`} style={{ fontSize:'0.74rem', color:'#2563eb', textDecoration:'none' }}><MI name="mail" size={13}/> {lead.email}</a>}
              <ContactBadges l={lead} />
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.2rem', cursor:'pointer', color:'#94a3b8' }}>✕</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:8, marginBottom:14, fontSize:'0.74rem' }}>
          <div style={{ padding:'8px 10px', background:'#f8fafc', borderRadius:8 }}><div style={{ color:'#9ca3af', fontSize:'0.64rem', textTransform:'uppercase' }}>{t('Status')}</div><strong>{t(SC[lead.status]?.label || lead.status)}</strong></div>
          <div style={{ padding:'8px 10px', background:'#f8fafc', borderRadius:8 }}><div style={{ color:'#9ca3af', fontSize:'0.64rem', textTransform:'uppercase' }}>{t('Priority')}</div><strong>{t(PC[lead.priority]?.label || lead.priority)}</strong></div>
          <div style={{ padding:'8px 10px', background:'#f8fafc', borderRadius:8 }}><div style={{ color:'#9ca3af', fontSize:'0.64rem', textTransform:'uppercase' }}>{t('Created')}</div><strong>{fmt(lead.created_at)}</strong>{data && <div style={{ color:'var(--text-dim)', marginTop:2 }}>{t('Added by')} {createdBy || t('System')} · {how(lead.scraped_from)}</div>}</div>
          {/* Last update: the newest thing that happened on the lead — comment, edit, status change, follow-up… (CC bookkeeping aside) */}
          {(() => { const last = entries.find(e => e.kind !== 'watch'); return (
            <div style={{ padding:'8px 10px', background:'#f8fafc', borderRadius:8 }}><div style={{ color:'#9ca3af', fontSize:'0.64rem', textTransform:'uppercase' }}>{t('Last update')}</div>
              <strong>{data ? fmt(last?.at || lead.updated_at || lead.created_at) : '…'}</strong>
              {last && <div style={{ color:'var(--text-dim)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={last.text}>{last.who || t('System')} · {last.text}</div>}
              {lead.last_contacted_at && <div style={{ color:'var(--text-muted)', marginTop:2 }}>{t('Last Contacted')}: {fmt(lead.last_contacted_at)}</div>}
            </div>); })()}
        </div>
        <LeadWatchersPanel leadId={lead.id} />
        {lead.achieved_at && !lead.deleted_at && (
          <div style={{ background:'#fffbeb', border:'1px solid #fcd34d', color:'#92400e', padding:'10px 12px', borderRadius:8, fontSize:'0.8rem', marginBottom:12 }}>
            <strong><MI name="emoji_events" size={14}/> {t('Achieved')} — {lead.achieved_by_name || '—'}</strong> · {fmt(lead.achieved_at)}
            {lead.achieve_comment && <div style={{ marginTop:4, whiteSpace:'pre-wrap' }}>💬 {lead.achieve_comment}</div>}
          </div>
        )}
        {lead.deleted_at && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', color:'#991b1b', padding:'10px 12px', borderRadius:8, fontSize:'0.8rem', marginBottom:12 }}>
            <strong><MI name="delete" size={14}/> {t('Deleted by')} {lead.deleted_by_name || '—'}</strong> · {fmt(lead.deleted_at)}
            {lead.delete_comment && <div style={{ marginTop:4, whiteSpace:'pre-wrap' }}>💬 {lead.delete_comment}</div>}
          </div>
        )}
        {!readOnly && (
          <form onSubmit={postUpdate} style={{ border:'1px solid #e2e8f0', borderRadius:10, padding:10, marginBottom:12, background:'#fcfcfd' }}>
            <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-dim)', marginBottom:6, display:'flex', alignItems:'center', gap:6 }}><MI name="add_comment" size={15}/> {t('Add an update')}</div>
            <textarea rows={2} value={note} onChange={e => { setNote(e.target.value); setPostErr(''); }} placeholder={t('e.g. Called, spoke to the director — asked to send a proposal')} style={{ width:'100%', fontFamily:'inherit', fontSize:'0.82rem', border:'1px solid var(--border)', borderRadius:8, padding:'7px 10px', resize:'vertical' }} />
            {postErr && <div style={{ color:'#dc2626', fontSize:'0.74rem', marginTop:4 }}>{postErr}</div>}
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginTop:6 }}>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)} style={{ padding:'6px 8px', borderRadius:8, border:'1px solid var(--border)', fontSize:'0.76rem', fontFamily:'inherit' }}>
                <option value="">{t('Keep status')}: {t(SC[lead.status]?.label || lead.status)}</option>
                {Object.entries(SC).filter(([v]) => v !== lead.status).map(([v, c]) => <option key={v} value={v}>{t('Change status to')}: {t(c.label)}</option>)}
              </select>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => fu.create(lead)}><MI name="event" size={15}/> {t('Schedule follow-up')}</button>
              <button type="submit" disabled={posting} className="btn btn-sm btn-primary" style={{ marginLeft:'auto' }}><MI name="send" size={14}/> {posting ? t('Saving…') : t('Add to log')}</button>
            </div>
            {newStatus === 'follow_up_later' && <div style={{ marginTop:8 }}><FollowUpDateFields t={t} date={fuDate} time={fuTime} setDate={setFuDate} setTime={setFuTime} /></div>}
          </form>
        )}
        {openFus.length > 0 && (
          <div style={{ border:'1px solid #fde68a', borderRadius:10, overflow:'hidden', marginBottom:12 }}>
            <div style={{ padding:'7px 12px', background:'#fffbeb', color:'#92400e', fontWeight:700, fontSize:'0.72rem', display:'flex', alignItems:'center', gap:6 }}><MI name="event_upcoming" size={15}/> {t('Upcoming follow-ups')} ({openFus.length})</div>
            {openFus.map(f => <FollowUpRow key={f.id} f={f} showLead={false} {...(readOnly ? {} : fu.actions)} />)}
          </div>
        )}
        {fu.modals(projectId)}
        {err && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'8px 12px', borderRadius:8, fontSize:'0.78rem' }}>{err}</div>}
        {!data && !err && <div style={{ textAlign:'center', padding:30, color:'var(--text-muted)' }}>{t('Loading…')}</div>}
        {data && entries.length === 0 && <div style={{ textAlign:'center', padding:30, color:'var(--text-muted)', fontSize:'0.8rem' }}>{t('No log entries yet')}</div>}
        {data && entries.length > 0 && (
          <div style={{ maxHeight:'55vh', overflowY:'auto', borderTop:'1px solid var(--border)' }}>
            {entries.map((e, i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'10px 4px', borderBottom:'1px solid #f1f5f9', alignItems:'flex-start' }}>
                <span style={{ width:28, height:28, borderRadius:8, background:'#eef2ff', color:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><MI name={e.icon} size={16}/></span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:'0.8rem', color:'var(--text)', wordBreak:'break-word' }}>{e.text}</div>
                  {e.changes && <div style={{ fontSize:'0.7rem', color:'var(--text-dim)', marginTop:3 }}>{Object.entries(e.changes).map(([f, c]) => <div key={f}><strong>{t(FIELD_NAMES[f] || f)}:</strong> <span style={{ textDecoration:'line-through', opacity:0.6 }}>{String(c.from || '—')}</span> → {String(c.to || '—')}</div>)}</div>}
                  {e.comment && <div style={{ fontSize:'0.76rem', color:'#92400e', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:6, padding:'4px 8px', marginTop:4, whiteSpace:'pre-wrap' }}>💬 {e.comment}{e.edited && <span title={`${e.edited.by || ''} · ${fmt(e.edited.at)}`} style={{ marginLeft:6, fontSize:'0.66rem', color:'#b45309', fontStyle:'italic' }}>({t('edited')})</span>}</div>}
                  <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:3 }}><strong>{e.who || t('System')}</strong> · {fmt(e.at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Human names for lead fields (used in the log)
export const FIELD_NAMES = { company_name:'Company', domain:'Domain', sector:'Industry', city:'City', region:'Region', country:'Country', company_size:'Size', pain_point:'Requirement needed', decision_maker_title:'Decision maker name', phone:'Telephone', mobile_personal:'Mobile number (personal)', email:'Email', whatsapp:'WhatsApp', telegram:'Telegram', max_messenger:'Max Messenger', contact_method:'Contact', source_url:'Source URL', find_instructions:'Source of lead', notes:'Comment' };

