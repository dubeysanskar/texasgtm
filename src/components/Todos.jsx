'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => toDateStr(new Date());
const addDays = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };

/** 'overdue' | 'today' | 'upcoming' */
export function bucketOf(dateStr, today) {
  if (dateStr < today) return 'overdue';
  if (dateStr === today) return 'today';
  return 'upcoming';
}
export const TONE = {
  overdue: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', dot: '#ef4444' },
  today: { bg: '#fffbeb', border: '#fde68a', text: '#b45309', dot: '#f59e0b' },
  upcoming: { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', dot: '#3b82f6' },
};

function dateLabel(dateStr, today, t, lang) {
  if (dateStr === today) return t('Today');
  const diff = Math.round((new Date(dateStr) - new Date(today)) / 86400000);
  if (diff === 1) return t('Tomorrow');
  if (diff === -1) return t('Yesterday');
  if (diff < 0) return t('{n}d overdue', { n: -diff });
  return new Date(dateStr).toLocaleDateString(lang === 'ru' ? 'ru-RU' : undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// userId: view someone else's list (super admin only — the API enforces this; todos are private
// between the owner and a super admin otherwise).
export function useTodos(userId) {
  const { user } = useAuth();
  const [todos, setTodos] = useState([]);
  const [tab, setTab] = useState('open');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const load = useCallback(async (which = tab) => {
    setLoading(true); setErr('');
    try {
      const p = new URLSearchParams({ status: which });
      if (userId) p.set('user_id', userId);
      const r = await fetch(`/api/todos?${p}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setTodos(d.todos || []);
    } catch (e) { setTodos([]); setErr(e.message); }
    setLoading(false);
  }, [tab, userId]);
  useEffect(() => { if (user) load(tab); }, [user, tab, userId, load]);
  return { todos, tab, setTab, loading, err, reload: () => load(tab) };
}

async function apiAdd(text, todo_date) {
  const r = await fetch('/api/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, todo_date }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed');
}
async function apiToggle(id, status) {
  await fetch(`/api/todos/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
}
async function apiDelete(id) {
  await fetch(`/api/todos/${id}`, { method: 'DELETE' });
}

export function TodoQuickAdd({ onAdded, compact }) {
  const { t } = useProject();
  const [text, setText] = useState('');
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const chip = (active) => ({ padding: '4px 10px', borderRadius: 20, border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`, background: active ? 'var(--primary)' : '#fff', color: active ? '#fff' : 'var(--text)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' });
  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true); setErr('');
    try { await apiAdd(text.trim(), date); setText(''); onAdded?.(); }
    catch (e2) { setErr(t(e2.message)); }
    finally { setSaving(false); }
  }
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <input value={text} onChange={e => setText(e.target.value)} placeholder={t('Write a to-do…')} maxLength={500}
        style={{ flex: '1 1 220px', minWidth: 0, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.84rem', fontFamily: 'inherit' }} />
      {!compact && <>
        <button type="button" style={chip(date === todayStr())} onClick={() => setDate(todayStr())}>{t('Today')}</button>
        <button type="button" style={chip(date === toDateStr(addDays(new Date(), 1)))} onClick={() => setDate(toDateStr(addDays(new Date(), 1)))}>{t('Tomorrow')}</button>
      </>}
      <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem', fontFamily: 'inherit' }} />
      <button type="submit" disabled={saving || !text.trim()} className="btn btn-sm btn-primary"><MI name="add" size={15} /> {t('Add')}</button>
      {err && <div style={{ color: '#dc2626', fontSize: '0.72rem', width: '100%' }}>{err}</div>}
    </form>
  );
}

export function TodoRow({ todo, today, onToggled, onDeleted, readOnly }) {
  const { t, lang } = useProject();
  const done = todo.status === 'done';
  const tone = done ? { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', dot: '#22c55e' } : TONE[bucketOf(todo.todo_date, today)];
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try { await apiToggle(todo.id, done ? 'open' : 'done'); onToggled?.(); } finally { setBusy(false); }
  }
  async function del() {
    if (!window.confirm(t('Delete this to-do?'))) return;
    await apiDelete(todo.id); onDeleted?.();
  }
  return (
    <div style={{ display: 'flex', gap: 10, padding: '9px 12px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', borderLeft: `3px solid ${tone.dot}` }}>
      <button type="button" disabled={busy || readOnly} onClick={toggle} title={readOnly ? '' : done ? t('Reopen') : t('Mark as done')}
        style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 7, border: `2px solid ${done ? '#22c55e' : '#cbd5e1'}`, background: done ? '#22c55e' : '#fff', color: done ? '#fff' : 'transparent', cursor: readOnly ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, opacity: readOnly && !done ? 0.6 : 1 }}>
        <MI name="check" size={15} />
      </button>
      <div style={{ flex: 1, minWidth: 0, fontSize: '0.84rem', color: done ? 'var(--text-muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none', wordBreak: 'break-word' }}>{todo.text}</div>
      <span style={{ padding: '2px 9px', borderRadius: 20, background: tone.bg, color: tone.text, border: `1px solid ${tone.border}`, fontSize: '0.66rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{dateLabel(todo.todo_date, today, t, lang)}</span>
      {!readOnly && <button type="button" onClick={del} title={t('Delete')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', display: 'flex' }}><MI name="close" size={16} /></button>}
    </div>
  );
}
