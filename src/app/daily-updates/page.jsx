'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a, b) => toDateStr(a) === toDateStr(b);
const fmtSize = (n) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const isImage = (mime) => (mime || '').startsWith('image/');

function Attachment({ f }) {
  const url = `/api/daily-updates/files/${f.id}`;
  if (isImage(f.mime)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title={f.original_name} style={{ display: 'block', width: 72, height: 72, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <img src={url} alt={f.original_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.72rem', color: 'var(--text)', textDecoration: 'none', background: '#f8fafc' }}>
      <MI name="description" size={15} /> <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.original_name}</span>
      <span style={{ color: 'var(--text-muted)' }}>· {fmtSize(f.size)}</span>
    </a>
  );
}

function EntryCard({ entry, canManage, onChanged }) {
  const { t, lang } = useProject();
  const [translated, setTranslated] = useState(entry.translated_lang === lang ? entry.translated_text : '');
  const [translating, setTranslating] = useState(false);
  const [tErr, setTErr] = useState('');
  const [showTranslation, setShowTranslation] = useState(false);

  async function translate() {
    if (translated) { setShowTranslation(s => !s); return; }
    setTranslating(true); setTErr('');
    try {
      const r = await fetch(`/api/daily-updates/${entry.id}/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setTranslated(d.translated_text);
      setShowTranslation(true);
    } catch (e) { setTErr(t(e.message)); }
    finally { setTranslating(false); }
  }
  async function del() {
    if (!window.confirm(t('Delete this update?'))) return;
    await fetch(`/api/daily-updates/${entry.id}`, { method: 'DELETE' });
    onChanged?.();
  }

  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.7rem', flexShrink: 0 }}>
          {(entry.author_name || entry.user_name || '?').charAt(0).toUpperCase()}
        </span>
        <strong style={{ fontSize: '0.82rem' }}>{entry.author_name || entry.user_name}</strong>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{new Date(entry.created_at).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : undefined, { hour: '2-digit', minute: '2-digit' })}</span>
        {canManage && <button onClick={del} title={t('Delete')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', display: 'flex' }}><MI name="close" size={16} /></button>}
      </div>
      {entry.text && <div style={{ fontSize: '0.84rem', color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{entry.text}</div>}
      {entry.text && (
        <button onClick={translate} disabled={translating} style={{ marginTop: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)', fontSize: '0.72rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          <MI name="translate" size={14} /> {translating ? t('Translating…') : showTranslation ? t('Hide translation') : t('Translate')}
        </button>
      )}
      {tErr && <div style={{ color: '#dc2626', fontSize: '0.7rem', marginTop: 4 }}>{tErr}</div>}
      {showTranslation && translated && (
        <div style={{ marginTop: 6, padding: '7px 10px', background: '#eef2ff', borderRadius: 8, fontSize: '0.8rem', color: '#3730a3', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{translated}</div>
      )}
      {entry.files?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {entry.files.map(f => <Attachment key={f.id} f={f} />)}
        </div>
      )}
    </div>
  );
}

export default function DailyUpdatesPage() {
  const { user } = useAuth();
  const { projectId, activeProject, t, lang } = useProject();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [entries, setEntries] = useState([]);
  const [today, setToday] = useState(toDateStr(new Date()));
  const [tz, setTz] = useState('UTC');
  const [selectedDay, setSelectedDay] = useState(null); // Date | null (null = today, set once loaded)
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const y = month.getFullYear(), m = month.getMonth();
    const from = `${y}-${pad(m + 1)}-01`;
    const to = toDateStr(new Date(y, m + 1, 0));
    const p = new URLSearchParams({ from, to });
    if (projectId) p.set('project_id', projectId);
    try {
      const d = await (await fetch(`/api/daily-updates?${p}`)).json();
      setEntries(d.updates || []);
      setToday(d.today || toDateStr(new Date()));
      setTz(d.timezone || 'UTC');
      setSelectedDay(sel => sel || new Date(`${d.today}T00:00:00`));
    } catch { setEntries([]); }
    setLoading(false);
  }, [month, projectId]);
  useEffect(() => { if (user) load(); }, [user, load]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const e of entries) map.set(e.work_date, [...(map.get(e.work_date) || []), e]);
    return map;
  }, [entries]);
  const dayKey = selectedDay ? toDateStr(selectedDay) : today;
  const dayEntries = byDay.get(dayKey) || [];

  const cells = useMemo(() => {
    const first = new Date(month); const offset = (first.getDay() + 6) % 7;
    const start = new Date(first); start.setDate(1 - offset);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);
  const loc = lang === 'ru' ? 'ru-RU' : 'en-GB';
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: 'short' }));
  const todayDate = new Date(`${today}T00:00:00`);

  async function post(e) {
    e.preventDefault(); setErr('');
    if (!text.trim() && files.length === 0) { setErr(t('Write something or attach a file')); return; }
    setPosting(true);
    const fd = new FormData();
    fd.append('text', text.trim());
    fd.append('work_date', dayKey);
    if (projectId) fd.append('project_id', projectId);
    for (const f of files) fd.append('files', f);
    try {
      const r = await fetch('/api/daily-updates', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Failed');
      setText(''); setFiles([]); if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e2) { setErr(t(e2.message)); }
    finally { setPosting(false); }
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1><MI name="event_note" size={26} /> {t('Daily Updates')}</h1>
          <p>{t('What everyone worked on today — one shared log per day, per project.')}{activeProject ? ` · ${activeProject.name}` : ''}{tz !== 'UTC' && <span style={{ marginLeft: 6 }}>· <MI name="schedule" size={13} /> {tz}</span>}</p>
        </div>
      </div>

      <div className="followups-grid">
        <div className="card" style={{ padding: 14, alignSelf: 'start' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><MI name="chevron_left" /></button>
            <div style={{ fontWeight: 700, fontSize: '0.92rem', textTransform: 'capitalize' }}>{month.toLocaleDateString(loc, { month: 'long', year: 'numeric' })}</div>
            <button className="btn btn-sm btn-ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><MI name="chevron_right" /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {weekdays.map(w => <div key={w} style={{ textAlign: 'center', fontSize: '0.64rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 0' }}>{w}</div>)}
            {cells.map(d => {
              const list = byDay.get(toDateStr(d)) || [];
              const inMonth = d.getMonth() === month.getMonth();
              const isToday = sameDay(d, todayDate);
              const isSel = selectedDay && sameDay(d, selectedDay);
              return (
                <button key={d.toISOString()} onClick={() => setSelectedDay(d)}
                  style={{ aspectRatio: '1 / 0.9', border: isSel ? '2px solid var(--primary)' : '1px solid ' + (isToday ? 'var(--primary)' : '#eef2f7'), borderRadius: 8, background: isSel ? '#eef2ff' : list.length ? '#f0fdf4' : '#fff', opacity: inMonth ? 1 : 0.4, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 2, fontFamily: 'inherit' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--primary)' : 'var(--text)' }}>{d.getDate()}</span>
                  {list.length > 0 && <span style={{ minWidth: 18, padding: '0 5px', height: 16, borderRadius: 8, background: '#16a34a', color: '#fff', fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{list.length}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 8 }}>
              {sameDay(selectedDay || todayDate, todayDate) ? t("Today's work") : (selectedDay || todayDate).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <form onSubmit={post}>
              <textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={t('What did you work on? Write it here — everyone on this project will see it.')} style={{ width: '100%', fontFamily: 'inherit', fontSize: '0.86rem', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', resize: 'vertical' }} />
              {err && <div style={{ color: '#dc2626', fontSize: '0.74rem', marginTop: 4 }}>{err}</div>}
              {files.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {files.map((f, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: '#f1f5f9', fontSize: '0.7rem' }}>
                      <MI name="attach_file" size={13} /> {f.name} <button type="button" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}><MI name="close" size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <input ref={fileRef} type="file" multiple hidden id="daily-upload-input" onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])].slice(0, 6))} />
                <label htmlFor="daily-upload-input" className="btn btn-sm btn-ghost" style={{ cursor: 'pointer' }}><MI name="attach_file" size={15} /> {t('Attach files')}</label>
                <button type="submit" disabled={posting} className="btn btn-sm btn-primary" style={{ marginLeft: 'auto' }}><MI name="send" size={14} /> {posting ? t('Posting…') : t('Post update')}</button>
              </div>
            </form>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{t('Loading…')}</div>
              : dayEntries.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <MI name="edit_note" size={36} />
                  <div style={{ marginTop: 8, fontSize: '0.84rem' }}>{t('Nothing logged for this day yet.')}</div>
                </div>
              ) : dayEntries.map(e => <EntryCard key={e.id} entry={e} canManage={e.user_id === user?.id || user?.role === 'super_admin'} onChanged={load} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
