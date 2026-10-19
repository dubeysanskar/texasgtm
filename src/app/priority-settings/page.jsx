'use client';
// Priority settings (super admin): how Lead Management's Priority view and the Dashboard rank leads.
// Every change is previewed live on the right before it is saved.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { SC, PC } from '@/lib/lead-status';
import { RankBadge, PriorityReason } from '@/components/LeadPriority';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

const RULE_INFO = {
  overdue:   { icon: 'alarm',                 color: '#b91c1c', title: 'Follow-up overdue',          text: 'The follow-up date has passed — the longest overdue first.' },
  due_today: { icon: 'today',                 color: '#c2410c', title: 'Follow-up due today',        text: 'A follow-up is due later today — earliest time first.' },
  hot_deal:  { icon: 'local_fire_department', color: '#6d28d9', title: 'Hot deal in progress',       text: 'A lead with the chosen priorities at one of the chosen stages.' },
  due_soon:  { icon: 'event',                 color: '#1d4ed8', title: 'Follow-up coming up',        text: 'A follow-up is due within the next days (set below).' },
  rest:      { icon: 'list',                  color: '#334155', title: 'Everything else',            text: 'All other open leads, by priority level and how long since the last contact.' },
  parked:    { icon: 'snooze',                color: '#7D6608', title: 'Parked',                     text: 'Leads in the chosen statuses (e.g. Follow Up Later) wait here until their follow-up gets close.' },
};

export default function PrioritySettingsPage() {
  const { isAdmin } = useAuth();
  const { projectId, t, lang } = useProject();
  const [cfg, setCfg] = useState(null);
  const [saved, setSaved] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/settings/priority').then(r => r.json()).then(d => { setCfg(d.config); setSaved(d.config); setDefaults(d.defaults); }).catch(() => setMsg(t('Could not load the settings.')));
  }, [t]);

  // live preview (debounced) of the unsaved settings
  const timer = useRef(null);
  const loadPreview = useCallback((c) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch('/api/settings/priority', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: c, project_id: projectId }) })
        .then(r => r.json()).then(setPreview).catch(() => {});
    }, 350);
  }, [projectId]);
  useEffect(() => { if (cfg && isAdmin) loadPreview(cfg); }, [cfg, isAdmin, loadPreview]);

  if (!isAdmin) return <div className="page-content"><div className="card" style={{ padding: 40, textAlign: 'center' }}>{t('Super admin only')}</div></div>;
  if (!cfg) return <div className="page-content"><div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{msg || t('Loading…')}</div></div>;

  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  const set = (k, v) => { setCfg(c => ({ ...c, [k]: v })); setMsg(''); };
  const toggleIn = (k, v) => set(k, cfg[k].includes(v) ? cfg[k].filter(x => x !== v) : [...cfg[k], v]);
  const move = (k, i, d) => { const a = [...cfg[k]]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set(k, a); };
  async function save(reset) {
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/settings/priority', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reset ? { reset: true } : { config: cfg }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setCfg(d.config); setSaved(d.config); setMsg(t(reset ? 'Defaults restored.' : 'Saved. Lead Management and the Dashboard now use these settings.'));
    } catch (e) { setMsg(t(e.message)); }
    setSaving(false);
  }

  const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14 };
  const h2 = { fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 };
  const hint = { fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 12 };
  const chip = (on, color = '#4f46e5') => ({ padding: '6px 12px', borderRadius: 999, border: on ? `2px solid ${color}` : '1px solid var(--border)', background: on ? `${color}14` : '#fff', color: on ? color : '#475569', fontWeight: on ? 700 : 500, fontSize: '0.76rem', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 });
  const Switch = ({ on, onClick, disabled, label }) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
      style={{ width: 40, height: 22, borderRadius: 999, border: 'none', background: on ? '#4f46e5' : '#cbd5e1', position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, flexShrink: 0, padding: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.3)' }} />
    </button>
  );
  const Row = ({ title, sub, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 220px' }}><div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{title}</div>{sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
  const arrowBtn = { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, color: '#334155' };
  const enabledRules = cfg.rules.filter(r => r.enabled || r.id === 'rest');

  return (
    <div className="page-content" style={{ paddingBottom: 90 }}>
      <div className="page-header">
        <div>
          <h1><MI name="tune" size={26} /> {t('Priority settings')}</h1>
          <p>{t('Decide how Lead Management (Priority view) and the Dashboard rank leads. Changes are previewed on the right before you save.')}</p>
        </div>
      </div>

      <div className="perf-grid m-stack" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div>
          {/* 1. Ranking order */}
          <div style={card}>
            <div style={h2}><MI name="format_list_numbered" /> {t('1. Ranking order')}</div>
            <div style={hint}>{t('A lead goes into the first group (from the top) that fits it. Move groups up or down, or switch a group off — its leads then fall into “Everything else”.')}</div>
            {cfg.rules.map((r, i) => {
              const info = RULE_INFO[r.id]; const pos = enabledRules.findIndex(x => x.id === r.id);
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 8, background: r.enabled || r.id === 'rest' ? '#fff' : '#f8fafc', opacity: r.enabled || r.id === 'rest' ? 1 : 0.6 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 8, background: `${info.color}14`, color: info.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.78rem', flexShrink: 0 }}>{pos >= 0 ? pos + 1 : '–'}</span>
                  <MI name={info.icon} size={20} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: info.color }}>{t(info.title)}{preview?.byRule?.[r.id] !== undefined && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {preview.byRule[r.id]} {t('leads')}</span>}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t(info.text)}</div>
                  </div>
                  <button type="button" style={arrowBtn} onClick={() => move('rules', i, -1)} disabled={i === 0} aria-label={t('Move up')}><MI name="arrow_upward" size={16} /></button>
                  <button type="button" style={arrowBtn} onClick={() => move('rules', i, 1)} disabled={i === cfg.rules.length - 1} aria-label={t('Move down')}><MI name="arrow_downward" size={16} /></button>
                  <Switch on={r.enabled || r.id === 'rest'} disabled={r.id === 'rest'} label={t(info.title)} onClick={() => set('rules', cfg.rules.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x))} />
                </div>
              );
            })}
          </div>

          {/* 2. Group details */}
          <div style={card}>
            <div style={h2}><MI name="settings_suggest" /> {t('2. Group details')}</div>
            <Row title={t('“Follow-up coming up” window')} sub={t('Follow-ups due within this many days count as coming up (and wake parked leads).')}>
              {[1, 2, 3, 5, 7, 14].map(n => <button key={n} type="button" style={chip(cfg.due_soon_days === n)} onClick={() => set('due_soon_days', n)}>{n} {t(n === 1 ? 'day' : 'days')}</button>)}
            </Row>
            <Row title={t('Hot deal — priority levels')} sub={t('Which priority levels can be a hot deal.')}>
              {Object.keys(PC).map(p => <button key={p} type="button" style={chip(cfg.hot_deal_priorities.includes(p), PC[p].text)} onClick={() => toggleIn('hot_deal_priorities', p)}>{t(PC[p].label)}</button>)}
            </Row>
            <Row title={t('Hot deal — stages')} sub={t('At which statuses a lead counts as a deal in progress.')}>
              {Object.keys(SC).filter(s => !cfg.hidden_statuses.includes(s)).map(s => <button key={s} type="button" style={chip(cfg.hot_deal_statuses.includes(s), SC[s].text)} onClick={() => toggleIn('hot_deal_statuses', s)}>{t(SC[s].label)}</button>)}
            </Row>
            <Row title={t('Priority level order')} sub={t('Inside “Everything else” (and as a tie-breaker everywhere).')}>
              {cfg.priority_order.map((p, i) => (
                <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '3px 4px 3px 10px', borderRadius: 999, background: PC[p].bg, color: PC[p].text, fontWeight: 700, fontSize: '0.76rem' }}>
                  {i + 1}. {t(PC[p].label)}
                  <button type="button" onClick={() => move('priority_order', i, -1)} disabled={i === 0} style={{ ...arrowBtn, width: 22, height: 22, border: 'none', background: 'transparent' }} aria-label={t('Move up')}><MI name="chevron_left" size={16} /></button>
                  <button type="button" onClick={() => move('priority_order', i, 1)} disabled={i === cfg.priority_order.length - 1} style={{ ...arrowBtn, width: 22, height: 22, border: 'none', background: 'transparent' }} aria-label={t('Move down')}><MI name="chevron_right" size={16} /></button>
                </span>
              ))}
            </Row>
            <Row title={t('“Everything else” — order within a level')}>
              {[['longest_silence', 'Longest without contact first'], ['oldest', 'Oldest added first'], ['newest', 'Newest added first']].map(([v, l]) => <button key={v} type="button" style={chip(cfg.rest_sort === v)} onClick={() => set('rest_sort', v)}>{t(l)}</button>)}
            </Row>
            <Row title={t('Never-contacted leads first')} sub={t('Within each priority level, leads nobody has contacted yet come before the others.')}>
              <Switch on={cfg.never_contacted_first} label={t('Never-contacted leads first')} onClick={() => set('never_contacted_first', !cfg.never_contacted_first)} />
            </Row>
            <Row title={t('Parked statuses')} sub={t('Leads in these statuses wait at the bottom until a follow-up comes close.')}>
              {Object.keys(SC).filter(s => !cfg.hidden_statuses.includes(s)).map(s => <button key={s} type="button" style={chip(cfg.parked_statuses.includes(s), SC[s].text)} onClick={() => toggleIn('parked_statuses', s)}>{t(SC[s].label)}</button>)}
            </Row>
          </div>

          {/* 3. Hidden statuses */}
          <div style={card}>
            <div style={h2}><MI name="visibility_off" /> {t('3. Hidden (closed) statuses')}</div>
            <div style={hint}>{t('Leads in these statuses leave the working list, search, Priority and the Dashboard. They stay reachable through the status filter and their count cards.')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.keys(SC).map(s => <button key={s} type="button" style={chip(cfg.hidden_statuses.includes(s), '#b91c1c')} onClick={() => toggleIn('hidden_statuses', s)}>{cfg.hidden_statuses.includes(s) && <MI name="visibility_off" size={14} />}{t(SC[s].label)}{preview?.hidden?.[s] ? ` · ${preview.hidden[s]}` : ''}</button>)}
            </div>
          </div>

          {/* 4. Display */}
          <div style={card}>
            <div style={h2}><MI name="visibility" /> {t('4. Display')}</div>
            <Row title={t('Priority view on by default')} sub={t('For people who have not switched it themselves.')}><Switch on={cfg.default_on} label={t('Priority view on by default')} onClick={() => set('default_on', !cfg.default_on)} /></Row>
            <Row title={t('Show rank numbers')}><Switch on={cfg.show_rank} label={t('Show rank numbers')} onClick={() => set('show_rank', !cfg.show_rank)} /></Row>
            <Row title={t('Show “why” labels')} sub={t('E.g. “Follow-up overdue by 2d”, “Hot deal: Negotiating”.')}><Switch on={cfg.show_reason} label={t('Show “why” labels')} onClick={() => set('show_reason', !cfg.show_reason)} /></Row>
            <Row title={t('Dashboard: how many priority leads')}>
              {[5, 8, 10, 15, 20].map(n => <button key={n} type="button" style={chip(cfg.dashboard_count === n)} onClick={() => set('dashboard_count', n)}>{n}</button>)}
            </Row>
            <Row title={t('Dashboard: what non-admins see')}>
              {[['own', 'Their own leads'], ['all', 'All leads']].map(([v, l]) => <button key={v} type="button" style={chip(cfg.dashboard_scope === v)} onClick={() => set('dashboard_scope', v)}>{t(l)}</button>)}
            </Row>
          </div>
        </div>

        {/* Live preview */}
        <div style={{ position: 'sticky', top: 16 }}>
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={h2}><MI name="preview" /> {t('Live preview')}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{preview ? t('Top of {n} working leads with these settings', { n: preview.total }) : t('Loading…')}{dirty && <strong style={{ color: '#b45309' }}> · {t('not saved yet')}</strong>}</div>
            </div>
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {(preview?.top || []).map(l => (
                <div key={l.id} style={{ display: 'flex', gap: 10, padding: '9px 16px', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
                  {cfg.show_rank ? <RankBadge n={l.priority_rank} t={t} /> : <span style={{ width: 22 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', wordBreak: 'break-word' }}><span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}>#{l.project_seq ?? l.id}</span> {l.company_name}</div>
                    {cfg.show_reason && <PriorityReason r={l.priority_reason} t={t} lang={lang} />}
                  </div>
                  <span style={{ padding: '2px 8px', borderRadius: 999, background: PC[l.priority]?.bg, color: PC[l.priority]?.text, fontSize: '0.64rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{t(PC[l.priority]?.label || l.priority)}</span>
                </div>
              ))}
              {preview && !preview.top.length && <p className="no-data" style={{ padding: 24 }}>{t('No working leads in this project.')}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="ps-savebar" style={{ position: 'sticky', bottom: 12, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 14px', boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
        <span style={{ fontSize: '0.8rem', color: msg ? '#047857' : dirty ? '#b45309' : 'var(--text-muted)', flex: 1 }}>{msg || (dirty ? t('You have unsaved changes.') : t('All changes saved.'))}</span>
        <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => { if (window.confirm(t('Restore the default Priority settings?'))) save(true); }}><MI name="restart_alt" size={16} /> {t('Reset to defaults')}</button>
        <button type="button" className="btn btn-ghost" disabled={!dirty || saving} onClick={() => setCfg(saved)}>{t('Discard changes')}</button>
        <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={() => save(false)}><MI name="save" size={16} /> {saving ? t('Saving…') : t('Save settings')}</button>
      </div>
    </div>
  );
}
