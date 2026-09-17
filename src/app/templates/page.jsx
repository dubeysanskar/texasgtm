'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>;
const PLATFORMS = [
  { key: 'email', label: 'Email', icon: 'mail', color: '#3b82f6' },
  { key: 'linkedin', label: 'LinkedIn', icon: 'work', color: '#0077b5' },
  { key: 'instagram', label: 'Instagram', icon: 'photo_camera', color: '#e1306c' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'chat', color: '#25d366' },
  { key: 'telegram', label: 'Telegram', icon: 'send', color: '#0088cc' },
  { key: 'cold_calling', label: 'Cold Calling', icon: 'call', color: '#8b5cf6' },
];
const LANGS = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ru', label: 'Russian', flag: '🇷🇺' },
  { code: 'de', label: 'German', flag: '🇩🇪' },
  { code: 'ar', label: 'Arabic', flag: '🇦🇪' },
];
const SS = {
  active: { bg: '#dcfce7', text: '#166534', label: 'Active' },
  draft: { bg: '#fef3c7', text: '#92400e', label: 'Draft' },
  archived: { bg: '#f3f4f6', text: '#6b7280', label: 'Archived' },
};

export default function TemplatesPage() {
  const { user, loading: authLoading, isManager } = useAuth();
  const { projectId, t } = useProject();
  const router = useRouter();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [viewLang, setViewLang] = useState('en');
  const [copied, setCopied] = useState('');

  useEffect(() => { if (!authLoading && !user) router.push('/'); }, [user, authLoading, router]);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    let u = platform === 'all' ? '/api/templates' : `/api/templates?platform=${platform}`;
    if (projectId) u += (u.includes('?') ? '&' : '?') + `project_id=${projectId}`;
    try { const r = await fetch(u); setTemplates(await r.json()); } catch { setTemplates([]); }
    setLoading(false);
  }, [platform, projectId]);

  useEffect(() => { if (user && isManager) fetch_(); }, [user, isManager, fetch_]);

  async function del(id) { if (!confirm(t('Delete this template?'))) return; await fetch(`/api/templates/${id}`, { method: 'DELETE' }); fetch_(); }

  function getTrans(t, lang) {
    if (lang === (t.language || 'en')) return { subject: t.subject, body: t.body };
    const tr = typeof t.translations === 'string' ? JSON.parse(t.translations || '{}') : (t.translations || {});
    return tr[lang] || null;
  }

  function hasLang(t, lang) {
    if (lang === (t.language || 'en')) return true;
    const tr = typeof t.translations === 'string' ? JSON.parse(t.translations || '{}') : (t.translations || {});
    return !!tr[lang]?.body;
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  }

  // Group templates by base name (remove " — Touch N")
  const grouped = {};
  templates.forEach(t => {
    const base = t.name.replace(/ — (?:Touch|Касание) \d$/, '');
    if (!grouped[base]) grouped[base] = { name: base, touches: [] };
    const touchMatch = t.name.match(/(?:Touch|Касание) (\d)$/);
    grouped[base].touches.push({ ...t, touchNum: touchMatch ? parseInt(touchMatch[1]) : 0 });
  });
  Object.values(grouped).forEach(g => g.touches.sort((a, b) => a.touchNum - b.touchNum));
  const groups = Object.values(grouped);
  // Ungrouped (no touch pattern)
  const ungrouped = templates.filter(t => !/ — (?:Touch|Касание) \d$/.test(t.name));

  if (authLoading || !user) return <div className="page-loading">{t('Loading...')}</div>;
  if (!isManager) return <div className="page-content"><p>{t('Access denied')}</p></div>;

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2, fontSize: '1.3rem' }}>{t('Outreach Templates')}</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('{n} templates • Multi-language • Copy-paste ready', { n: templates.length })}</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn btn-primary" style={{ fontSize: '0.75rem' }}>
          <MI name="add" size={14} /> {t('New Template')}
        </button>
      </div>

      {/* Platform Tabs */}
      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 10, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
        <PTab active={platform === 'all'} onClick={() => setPlatform('all')} color="#374151" label={t('All')} />
        {PLATFORMS.map(p => <PTab key={p.key} active={platform === p.key} onClick={() => setPlatform(p.key)} color={p.color} icon={p.icon} label={t(p.label)} />)}
      </div>

      {/* Language Selector (global) */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280', marginRight: 6 }}>{t('Language')}:</span>
        {LANGS.map(l => (
          <button key={l.code} onClick={() => setViewLang(l.code)}
            style={{ padding: '5px 12px', borderRadius: 8, border: viewLang === l.code ? '2px solid var(--primary)' : '1px solid var(--border)', background: viewLang === l.code ? '#eff6ff' : '#fff', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600, color: viewLang === l.code ? 'var(--primary)' : '#6b7280', transition: 'all .15s' }}>
            {l.flag} {t(l.label)}
          </button>
        ))}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{t('Loading…')}</div> : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><MI name="description" size={40} /><p style={{ marginTop: 8 }}>{t('No templates yet')}</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map(g => {
            const isOpen = openId === g.name;
            const plat = PLATFORMS.find(p => p.key === g.touches[0]?.platform) || PLATFORMS[0];
            const st = SS[g.touches[0]?.status] || SS.active;
            return (
              <div key={g.name} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                {/* Card Header */}
                <div onClick={() => setOpenId(isOpen ? null : g.name)} style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isOpen ? '#f8fafc' : '#fff', transition: 'background .15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 8, background: plat.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MI name={plat.icon} size={16} /></span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>{g.name}</div>
                      <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>{t('{n} touches', { n: g.touches.length })} • {t(plat.label)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.66rem', fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: st.bg, color: st.text }}>{t(st.label)}</span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {LANGS.filter(l => g.touches.some(t => hasLang(t, l.code))).map(l => <span key={l.code} style={{ fontSize: '0.75rem' }} title={l.label}>{l.flag}</span>)}
                    </div>
                    <MI name={isOpen ? 'expand_less' : 'expand_more'} size={20} />
                  </div>
                </div>

                {/* Expanded: Touch tabs with content */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {g.touches.map(tpl => {
                      const content = getTrans(tpl, viewLang);
                      const available = content !== null;
                      const copyId = `${tpl.id}-${viewLang}`;
                      const fullText = available ? (tpl.platform === 'email' && content.subject ? content.subject + '\n\n' + content.body : content.body) : '';
                      return (
                        <div key={tpl.id} style={{ borderTop: '1px solid #f1f5f9', padding: '14px 18px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: tpl.touchNum === 1 ? '#3b82f6' : tpl.touchNum === 2 ? '#f59e0b' : '#10b981', background: tpl.touchNum === 1 ? '#eff6ff' : tpl.touchNum === 2 ? '#fef3c7' : '#d1fae5', padding: '3px 10px', borderRadius: 20 }}>
                                {t('Touch')} {tpl.touchNum || ''}
                              </span>
                              {!available && <span style={{ fontSize: '0.68rem', color: '#dc2626' }}>{t('No {lang} translation', { lang: t(LANGS.find(l => l.code === viewLang)?.label || '') })}</span>}
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => copyText(fullText, copyId)} disabled={!available} title={t('Copy')}
                                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: copied === copyId ? '#dcfce7' : '#fff', cursor: available ? 'pointer' : 'default', fontSize: '0.7rem', fontWeight: 600, color: copied === copyId ? '#166534' : '#374151', transition: 'all .15s' }}>
                                {copied === copyId ? '✓ ' + t('Copied') : '📋 ' + t('Copy')}
                              </button>
                              <button onClick={() => { setEditing(tpl); setShowModal(true); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '0.7rem', color: '#6b7280' }}>
                                <MI name="edit" size={13} />
                              </button>
                              <button onClick={() => del(tpl.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', fontSize: '0.7rem', color: '#dc2626' }}>
                                <MI name="delete" size={13} />
                              </button>
                            </div>
                          </div>
                          {available ? (
                            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', fontFamily: 'inherit', fontSize: '0.8rem', lineHeight: 1.7, color: '#1f2937', whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid #e5e7eb', direction: viewLang === 'ar' ? 'rtl' : 'ltr' }}>
                              {fullText}
                            </div>
                          ) : (
                            <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: '0.78rem' }}>
                              {t('Click edit to add a {lang} translation', { lang: t(LANGS.find(l => l.code === viewLang)?.label || '') })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showModal && <Modal template={editing} t={t} projectId={projectId} onClose={() => setShowModal(false)} onSave={() => { fetch_(); setShowModal(false); }} />}
    </div>
  );
}

function PTab({ active, onClick, color, icon, label }) {
  return (
    <button onClick={onClick} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, background: active ? color : '#f3f4f6', color: active ? '#fff' : '#6b7280', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', transition: 'all .15s' }}>
      {icon && <MI name={icon} size={14} />} {label}
    </button>
  );
}

function Modal({ template, t, projectId, onClose, onSave }) {
  const isEdit = !!template;
  const [form, setForm] = useState({
    name: template?.name || '', platform: template?.platform || 'email',
    status: template?.status || 'active', subject: template?.subject || '',
    body: template?.body || '', language: template?.language || 'en',
  });
  const [translations, setTranslations] = useState(() => {
    if (!template) return {};
    return typeof template.translations === 'string' ? JSON.parse(template.translations || '{}') : (template.translations || {});
  });
  const [lang, setLang] = useState(template?.language || 'en');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const cur = lang === form.language ? { subject: form.subject, body: form.body } : (translations[lang] || { subject: '', body: '' });

  function upd(field, val) {
    if (lang === form.language) setForm(f => ({ ...f, [field]: val }));
    else setTranslations(t => ({ ...t, [lang]: { ...t[lang], [field]: val } }));
  }

  async function save() {
    if (!form.name || !(lang === form.language ? form.body : translations[lang]?.body || form.body)) { setErr(t('Name and body required')); return; }
    setSaving(true); setErr('');
    const url = isEdit ? `/api/templates/${template.id}` : '/api/templates';
    const method = isEdit ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, translations, project_id: projectId }) });
    if (r.ok) onSave(); else { const d = await r.json(); setErr(t(d.error || 'Failed')); }
    setSaving(false);
  }

  return (
    <div className="leads-modal-overlay" onClick={onClose}>
      <div className="leads-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 660, width: '95vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{isEdit ? t('Edit Template') : t('New Template')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>
        {err && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '6px 12px', borderRadius: 8, fontSize: '0.75rem', marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          <div className="leads-form-field"><label>{t('Name')} *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="leads-form-field"><label>{t('Platform')}</label>
            <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}>{PLATFORMS.map(p => <option key={p.key} value={p.key}>{t(p.label)}</option>)}</select>
          </div>
          <div className="leads-form-field"><label>{t('Status')}</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option value="active">{t('Active')}</option><option value="draft">{t('Draft')}</option><option value="archived">{t('Archived')}</option></select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {LANGS.map(l => {
            const has = l.code === form.language || translations[l.code]?.body;
            return <button key={l.code} onClick={() => setLang(l.code)} style={{ padding: '5px 12px', borderRadius: 8, border: lang === l.code ? '2px solid var(--primary)' : '1px solid var(--border)', background: lang === l.code ? '#eff6ff' : '#fff', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600, color: lang === l.code ? 'var(--primary)' : '#6b7280', position: 'relative' }}>
              {l.flag} {t(l.label)} {has && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', position: 'absolute', top: 2, right: 2 }} />}
            </button>;
          })}
        </div>
        {form.platform === 'email' && <div className="leads-form-field" style={{ marginBottom: 10 }}><label>{t('Subject')}</label><input value={cur.subject || ''} onChange={e => upd('subject', e.target.value)} /></div>}
        <div className="leads-form-field" style={{ marginBottom: 14 }}><label>{t('Body')} *</label>
          <textarea rows={10} value={cur.body || ''} onChange={e => upd('body', e.target.value)} style={{ fontFamily: 'inherit', lineHeight: 1.6, fontSize: '0.82rem', direction: lang === 'ar' ? 'rtl' : 'ltr' }} />
        </div>
        <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginBottom: 14, padding: '6px 10px', background: '#f8fafc', borderRadius: 6 }}>
          💡 {t('Use')} <code>{'{{company}}'}</code>, <code>{'{{decision_maker}}'}</code>, <code>{'{{city}}'}</code> {t('as placeholders')}
        </div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-ghost">{t('Cancel')}</button>
          <button onClick={save} disabled={saving} className="btn btn-primary">{saving ? t('Saving…') : isEdit ? t('Update') : t('Create')}</button>
        </div>
      </div>
    </div>
  );
}
