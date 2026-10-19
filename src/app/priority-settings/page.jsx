'use client';
// Priority settings (super admin). Decides the order in which leads are shown in Lead Management (Priority
// view) and on the Dashboard — for every project by default, or differently for one project. A second tab
// shows each team member's priority list. Every change is previewed on the right before saving.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { SC, PC } from '@/lib/lead-status';
import { RankBadge, PriorityReason } from '@/components/LeadPriority';
import LeadLogModal from '@/components/LeadLogModal';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

// Plain-language name + explanation of each group of leads
const GROUPS = {
  overdue:   { icon: 'alarm',                 color: '#b91c1c', title: 'Follow-ups that are overdue',     text: 'The follow-up date someone agreed has already passed. The longest overdue comes first.' },
  due_today: { icon: 'today',                 color: '#c2410c', title: 'Follow-ups due today',            text: 'A follow-up is planned for later today. The earliest time comes first.' },
  hot_deal:  { icon: 'local_fire_department', color: '#6d28d9', title: 'Hot deals',                       text: 'Important leads that are already in talks (you choose which priorities and stages below).' },
  due_soon:  { icon: 'event',                 color: '#1d4ed8', title: 'Follow-ups coming up soon',       text: 'A follow-up is planned in the next few days (you choose how many below).' },
  rest:      { icon: 'list',                  color: '#334155', title: 'All other open leads',            text: 'Every lead that is not in another group: HOT first, then HIGH, MEDIUM, PARTNER — and within each, the one waiting longest for contact first.' },
  parked:    { icon: 'snooze',                color: '#7D6608', title: 'On hold (bottom of the list)',    text: 'Leads you chose to park (e.g. “Follow Up Later”) wait at the bottom until their follow-up date gets close.' },
};

export default function PrioritySettingsPage() {
  const { isAdmin } = useAuth();
  const { projects, projectId: activeProjectId, t, lang } = useProject();
  const [scope, setScope] = useState(null);          // null = all projects (default), or a project id
  const [tab, setTab] = useState('rules');           // rules | team
  const [info, setInfo] = useState(null);            // { config, custom, defaults, factory }
  const [cfg, setCfg] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setInfo(null); setCfg(null); setPreview(null); setMsg('');
    fetch(`/api/settings/priority${scope ? `?project_id=${scope}` : ''}`).then(r => r.json()).then(d => { setInfo(d); setCfg(d.config); }).catch(() => setMsg(t('Could not load the settings.')));
  }, [scope, t]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // live preview (debounced) of the unsaved settings, on this project's leads (or the active project's for the default)
  const previewProject = scope || activeProjectId;
  const timer = useRef(null);
  useEffect(() => {
    if (!cfg || !isAdmin) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch('/api/settings/priority', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: cfg, project_id: previewProject }) })
        .then(r => r.json()).then(setPreview).catch(() => {});
    }, 350);
  }, [cfg, isAdmin, previewProject]);

  if (!isAdmin) return <div className="page-content"><div className="card" style={{ padding: 40, textAlign: 'center' }}>{t('Super admin only')}</div></div>;

  const scopeName = scope ? (projects.find(p => p.id === scope)?.name || `#${scope}`) : null;
  const inherited = !!scope && info && !info.custom;          // project uses the default → read-only until customised
  const dirty = info && cfg && JSON.stringify(cfg) !== JSON.stringify(info.config);
  const set = (k, v) => { if (inherited) return; setCfg(c => ({ ...c, [k]: v })); setMsg(''); };
  const toggleIn = (k, v) => set(k, cfg[k].includes(v) ? cfg[k].filter(x => x !== v) : [...cfg[k], v]);
  const move = (k, i, d) => { const a = [...cfg[k]]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set(k, a); };
  async function put(body, okMsg) {
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/settings/priority', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: scope, ...body }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setInfo(d); setCfg(d.config); setMsg(t(okMsg));
    } catch (e) { setMsg(t(e.message)); }
    setSaving(false);
  }
  const customise = () => { setInfo(i => ({ ...i, custom: true, config: i.config })); setMsg(t('Now change what you need and press Save — only this project will use these settings.')); };

  const card = { background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14 };
  const h2 = { fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 };
  const hint = { fontSize: '0.78rem', color: '#64748b', marginBottom: 12, lineHeight: 1.5 };
  const chip = (on, color = '#4f46e5') => ({ padding: '7px 12px', borderRadius: 999, border: on ? `2px solid ${color}` : '1px solid var(--border)', background: on ? `${color}14` : '#fff', color: on ? color : '#475569', fontWeight: on ? 700 : 500, fontSize: '0.78rem', cursor: inherited ? 'default' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 });
  const OnOff = ({ on, onClick, disabled, label }) => (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled || inherited} onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px 4px 4px', borderRadius: 999, border: `1px solid ${on ? '#c7d2fe' : 'var(--border)'}`, background: on ? '#eef2ff' : '#f8fafc', cursor: disabled || inherited ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, color: on ? '#3730a3' : '#64748b', opacity: disabled ? 0.6 : 1 }}>
      <span style={{ width: 34, height: 20, borderRadius: 999, background: on ? '#4f46e5' : '#cbd5e1', position: 'relative', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.3)' }} />
      </span>
      {on ? t('On') : t('Off')}
    </button>
  );
  const Question = ({ q, help, children }) => (
    <div style={{ padding: '12px 0', borderTop: '1px solid #f1f5f9' }}>
      <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text)' }}>{q}</div>
      {help && <div style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 8px', lineHeight: 1.5 }}>{help}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
  const arrowBtn = { height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: inherited ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 2, color: '#334155', fontSize: '0.7rem', fontFamily: 'inherit' };
  const activeGroups = cfg ? cfg.rules.filter(r => r.enabled || r.id === 'rest') : [];
  const lead = (l) => `#${l.project_seq ?? l.id} ${l.company_name}`;

  return (
    <div className="page-content" style={{ paddingBottom: 90 }}>
      <div className="page-header">
        <div>
          <h1><MI name="tune" size={26} /> {t('Priority settings')}</h1>
          <p>{t('Decide which leads your team should work on first. This order is used by Lead Management (Priority view) and the Dashboard.')}</p>
        </div>
      </div>

      {/* Which project + tabs */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.84rem' }}><MI name="folder" size={18} /> {t('Settings for')}:</span>
        <select value={scope ?? ''} onChange={e => setScope(e.target.value ? Number(e.target.value) : null)}
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.84rem', fontFamily: 'inherit', minWidth: 240, background: '#fff' }}>
          <option value="">{t('All projects (default)')}</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {scope && info && (
          <span style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: 999, background: info.custom ? '#eef2ff' : '#f1f5f9', color: info.custom ? '#3730a3' : '#475569', fontWeight: 700 }}>
            {info.custom ? t('Uses its own settings') : t('Uses the default settings')}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'inline-flex', background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
          {[['rules', 'Ranking rules', 'format_list_numbered'], ['team', 'Team overview', 'groups']].map(([k, l, ic]) => (
            <button key={k} type="button" onClick={() => setTab(k)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: tab === k ? '#fff' : 'transparent', boxShadow: tab === k ? '0 1px 3px rgba(0,0,0,.1)' : 'none', fontWeight: tab === k ? 700 : 500, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}><MI name={ic} size={16} /> {t(l)}</button>
          ))}
        </div>
      </div>

      {tab === 'team' ? <TeamOverview t={t} lang={lang} projectId={scope || activeProjectId} projectName={scopeName || projects.find(p => p.id === activeProjectId)?.name} /> : !cfg ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{msg || t('Loading…')}</div>
      ) : (<>
        {/* How it works */}
        <div style={{ ...card, background: '#f8fafc' }}>
          <div style={h2}><MI name="help" /> {t('How Priority works')}</div>
          <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.65 }}>
            {t('Every open lead is put into one group below — the first group (from the top) that fits it. Groups higher up come first in the list; inside a group, the most urgent lead comes first. The result is one numbered list: #1 is the lead to work on first.')}
            <br />{t('Example: a lead whose follow-up was due 2 days ago lands in “Follow-ups that are overdue” and is near the top; a lead marked “Follow Up Later” for next month waits in “On hold” at the bottom.')}
          </div>
          {inherited && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#fff', border: '1px dashed #a5b4fc', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: '0.8rem' }}>
              <MI name="info" /> <span style={{ flex: 1 }}>{t('“{project}” uses the default settings (shown below, read-only). Want it to work differently?', { project: scopeName })}</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={customise}><MI name="edit" size={15} /> {t('Customise for this project')}</button>
            </div>
          )}
        </div>

        <div className="perf-grid m-stack" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div style={{ opacity: inherited ? 0.75 : 1 }}>
            {/* 1. Order of the groups */}
            <div style={card}>
              <div style={h2}><MI name="format_list_numbered" /> {t('1. What should come first?')}</div>
              <div style={hint}>{t('The list is built in this order. Use ↑ ↓ to change the order. Switch a group Off and its leads simply join “All other open leads”. The number on the right is how many leads are in each group right now.')}</div>
              {cfg.rules.map((r, i) => {
                const g = GROUPS[r.id]; const on = r.enabled || r.id === 'rest'; const pos = activeGroups.findIndex(x => x.id === r.id);
                const count = preview?.byRule?.[r.id] ?? '…'; const ex = preview?.examples?.[r.id] || [];
                return (
                  <div key={r.id} style={{ display: 'flex', gap: 12, padding: '12px', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 8, background: on ? '#fff' : '#f8fafc', alignItems: 'flex-start' }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: on ? `${g.color}14` : '#e2e8f0', color: on ? g.color : '#94a3b8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.84rem', flexShrink: 0 }}>{on ? pos + 1 : '–'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <MI name={g.icon} size={18} /><span style={{ fontWeight: 700, fontSize: '0.88rem', color: on ? g.color : '#64748b' }}>{t(g.title)}</span>
                        <span style={{ padding: '1px 8px', borderRadius: 999, background: '#f1f5f9', color: '#334155', fontSize: '0.72rem', fontWeight: 700 }}>{count} {t('leads')}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>{t(g.text)}</div>
                      {on && ex.length > 0 && <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 4 }}>{t('e.g.')} {ex.map(lead).join(' · ')}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                      {r.id === 'rest' ? <span style={{ fontSize: '0.7rem', color: '#64748b', maxWidth: 120, textAlign: 'right' }}>{t('Always on (catches every other lead)')}</span>
                        : <OnOff on={on} label={t(g.title)} onClick={() => set('rules', cfg.rules.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x))} />}
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" style={arrowBtn} disabled={i === 0 || inherited} onClick={() => move('rules', i, -1)}><MI name="arrow_upward" size={14} /> {t('Up')}</button>
                        <button type="button" style={arrowBtn} disabled={i === cfg.rules.length - 1 || inherited} onClick={() => move('rules', i, 1)}><MI name="arrow_downward" size={14} /> {t('Down')}</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. Details as plain questions */}
            <div style={card}>
              <div style={h2}><MI name="settings_suggest" /> {t('2. Fine-tune the groups')}</div>
              <Question q={t('How many days ahead counts as a follow-up “coming up soon”?')} help={t('Leads with a follow-up within this time join “Follow-ups coming up soon” — and parked leads wake up when their follow-up is this close.')}>
                {[1, 2, 3, 5, 7, 14].map(n => <button key={n} type="button" style={chip(cfg.due_soon_days === n)} onClick={() => set('due_soon_days', n)}>{n} {t(n === 1 ? 'day' : 'days')}</button>)}
              </Question>
              <Question q={t('Which leads count as a “hot deal”?')} help={t('A lead is a hot deal when its priority is one of the first list AND its status is one of the second list.')}>
                <span style={{ fontSize: '0.74rem', color: '#64748b', width: '100%' }}>{t('Priority is one of:')}</span>
                {Object.keys(PC).map(p => <button key={p} type="button" style={chip(cfg.hot_deal_priorities.includes(p), PC[p].text)} onClick={() => toggleIn('hot_deal_priorities', p)}>{cfg.hot_deal_priorities.includes(p) && <MI name="check" size={14} />}{t(PC[p].label)}</button>)}
                <span style={{ fontSize: '0.74rem', color: '#64748b', width: '100%', marginTop: 6 }}>{t('…and the status is one of:')}</span>
                {Object.keys(SC).filter(s => !cfg.hidden_statuses.includes(s)).map(s => <button key={s} type="button" style={chip(cfg.hot_deal_statuses.includes(s), SC[s].text)} onClick={() => toggleIn('hot_deal_statuses', s)}>{cfg.hot_deal_statuses.includes(s) && <MI name="check" size={14} />}{t(SC[s].label)}</button>)}
              </Question>
              <Question q={t('In which order should priority levels come?')} help={t('Used inside “All other open leads”, and to break ties in every group. Use ‹ › to move a level.')}>
                {cfg.priority_order.map((p, i) => (
                  <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '3px 4px 3px 10px', borderRadius: 999, background: PC[p].bg, color: PC[p].text, fontWeight: 700, fontSize: '0.78rem' }}>
                    {i + 1}. {t(PC[p].label)}
                    <button type="button" onClick={() => move('priority_order', i, -1)} disabled={i === 0 || inherited} style={{ ...arrowBtn, height: 24, border: 'none', background: 'transparent', padding: '0 2px' }} aria-label={t('Move up')}><MI name="chevron_left" size={16} /></button>
                    <button type="button" onClick={() => move('priority_order', i, 1)} disabled={i === cfg.priority_order.length - 1 || inherited} style={{ ...arrowBtn, height: 24, border: 'none', background: 'transparent', padding: '0 2px' }} aria-label={t('Move down')}><MI name="chevron_right" size={16} /></button>
                  </span>
                ))}
              </Question>
              <Question q={t('Inside “All other open leads”, which lead of the same level comes first?')}>
                {[['longest_silence', 'The one waiting longest for contact'], ['oldest', 'The one added earliest'], ['newest', 'The one added most recently']].map(([v, l]) => <button key={v} type="button" style={chip(cfg.rest_sort === v)} onClick={() => set('rest_sort', v)}>{t(l)}</button>)}
              </Question>
              <Question q={t('Should leads nobody has contacted yet come before the others?')} help={t('Within the same priority level, brand-new leads that were never called or emailed go first.')}>
                <OnOff on={cfg.never_contacted_first} label={t('Never-contacted leads first')} onClick={() => set('never_contacted_first', !cfg.never_contacted_first)} />
              </Question>
              <Question q={t('Which statuses go “on hold” at the bottom?')} help={t('Leads in these statuses wait at the bottom of the list — until their follow-up date comes close, then they move up again.')}>
                {Object.keys(SC).filter(s => !cfg.hidden_statuses.includes(s)).map(s => <button key={s} type="button" style={chip(cfg.parked_statuses.includes(s), SC[s].text)} onClick={() => toggleIn('parked_statuses', s)}>{cfg.parked_statuses.includes(s) && <MI name="check" size={14} />}{t(SC[s].label)}</button>)}
              </Question>
            </div>

            {/* 3. Hidden statuses */}
            <div style={card}>
              <div style={h2}><MI name="visibility_off" /> {t('3. Which leads should disappear from the working list?')}</div>
              <div style={hint}>{t('Leads in the ticked statuses are finished — they leave the lead list, search, the Priority view and the Dashboard, so nobody works on them by mistake. They are not deleted: open them any time with the status filter or their count card. The number shows how many leads have that status now.')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.keys(SC).map(s => <button key={s} type="button" style={chip(cfg.hidden_statuses.includes(s), '#b91c1c')} onClick={() => toggleIn('hidden_statuses', s)}>{cfg.hidden_statuses.includes(s) ? <MI name="visibility_off" size={14} /> : null}{t(SC[s].label)}{cfg.hidden_statuses.includes(s) ? ` · ${preview?.hidden?.[s] || 0}` : ''}</button>)}
              </div>
            </div>

            {/* 4. Display */}
            <div style={card}>
              <div style={h2}><MI name="visibility" /> {t('4. What people see')}</div>
              <Question q={t('Is the Priority view switched on when someone opens Lead Management?')} help={t('Everyone can still switch it on or off for themselves; this is the starting setting for people who never did.')}>
                <OnOff on={cfg.default_on} label={t('Priority view on by default')} onClick={() => set('default_on', !cfg.default_on)} />
              </Question>
              <Question q={t('Show the rank number (1, 2, 3 …) next to each lead?')}>
                <OnOff on={cfg.show_rank} label={t('Show rank numbers')} onClick={() => set('show_rank', !cfg.show_rank)} />
              </Question>
              <Question q={t('Show why a lead is ranked there?')} help={t('A small label under the company, e.g. “Follow-up overdue by 2d” or “Hot deal: Negotiating”.')}>
                <OnOff on={cfg.show_reason} label={t('Show “why” labels')} onClick={() => set('show_reason', !cfg.show_reason)} />
              </Question>
              <Question q={t('How many leads should the Dashboard’s priority panel list?')}>
                {[5, 8, 10, 15, 20].map(n => <button key={n} type="button" style={chip(cfg.dashboard_count === n)} onClick={() => set('dashboard_count', n)}>{n}</button>)}
              </Question>
              <Question q={t('On the Dashboard, what should team members (not super admins) see?')} help={t('Super admins always see the whole team’s list.')}>
                {[['own', 'Only their own leads'], ['all', 'All leads']].map(([v, l]) => <button key={v} type="button" style={chip(cfg.dashboard_scope === v)} onClick={() => set('dashboard_scope', v)}>{t(l)}</button>)}
              </Question>
            </div>
          </div>

          {/* Live preview */}
          <div style={{ position: 'sticky', top: 16 }}>
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={h2}><MI name="preview" /> {t('Live preview')}</div>
                <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                  {preview ? t('The first 15 of {n} open leads in “{project}”, in the order your team will see them.', { n: preview.total, project: projects.find(p => p.id === previewProject)?.name || '' }) : t('Loading…')}
                  {dirty && <strong style={{ color: '#b45309' }}> {t('(not saved yet)')}</strong>}
                </div>
              </div>
              <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {(preview?.top || []).map(l => (
                  <div key={l.id} style={{ display: 'flex', gap: 10, padding: '9px 16px', borderBottom: '1px solid #f1f5f9', alignItems: 'flex-start' }}>
                    {cfg.show_rank ? <RankBadge n={l.priority_rank} t={t} /> : <span style={{ width: 24 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', wordBreak: 'break-word' }}><span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}>#{l.project_seq ?? l.id}</span> {l.company_name}</div>
                      {cfg.show_reason && <PriorityReason r={l.priority_reason} t={t} lang={lang} />}
                    </div>
                    <span style={{ padding: '2px 8px', borderRadius: 999, background: PC[l.priority]?.bg || '#f1f5f9', color: PC[l.priority]?.text || '#64748b', fontSize: '0.64rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{PC[l.priority] ? t(PC[l.priority].label) : '—'}</span>
                  </div>
                ))}
                {preview && !preview.top.length && <p className="no-data" style={{ padding: 24 }}>{t('No open leads in this project.')}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Save bar */}
        <div className="ps-savebar" style={{ position: 'sticky', bottom: 12, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 14px', boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
          <span style={{ fontSize: '0.8rem', color: msg ? '#047857' : dirty ? '#b45309' : '#64748b', flex: 1, minWidth: 200 }}>
            {msg || (inherited ? t('This project follows the default settings.') : dirty ? t('You have unsaved changes.') : t('All changes saved.'))}
          </span>
          {scope && info?.custom && <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => { if (window.confirm(t('Stop using custom settings for this project and follow the default again?'))) put({ use_default: true }, 'This project follows the default settings again.'); }}><MI name="link" size={16} /> {t('Use the default instead')}</button>}
          {!scope && <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => { if (window.confirm(t('Restore the built-in Priority settings?'))) put({ reset: true }, 'Defaults restored.'); }}><MI name="restart_alt" size={16} /> {t('Reset to defaults')}</button>}
          <button type="button" className="btn btn-ghost" disabled={!dirty || saving} onClick={() => setCfg(info.config)}>{t('Discard changes')}</button>
          <button type="button" className="btn btn-primary" disabled={(!dirty && !(scope && info?.custom && !info?.saved)) || saving || inherited} onClick={() => put({ config: cfg }, scope ? 'Saved for this project.' : 'Saved. Every project without its own settings now uses these.')}><MI name="save" size={16} /> {saving ? t('Saving…') : scope ? t('Save for this project') : t('Save settings')}</button>
        </div>
      </>)}
    </div>
  );
}

const ROLE_NAMES = { super_admin: 'Super Admin', manager: 'Manager', staff: 'Staff', marketing: 'Marketing', viewer: 'Viewer' };

// Team overview: each person's open leads split over the priority groups; click to see their list.
function TeamOverview({ t, lang, projectId, projectName }) {
  const [team, setTeam] = useState(null);
  const [open, setOpen] = useState(null);     // { id, name }
  const [list, setList] = useState(null);
  const [logLead, setLogLead] = useState(null);
  useEffect(() => {
    setTeam(null);
    fetch(`/api/settings/priority/team${projectId ? `?project_id=${projectId}` : ''}`).then(r => r.json()).then(d => setTeam(d.team || [])).catch(() => setTeam([]));
  }, [projectId]);
  useEffect(() => {
    if (!open) return;
    setList(null);
    fetch(`/api/settings/priority/team?owner=${open.id}${projectId ? `&project_id=${projectId}` : ''}`).then(r => r.json()).then(setList).catch(() => setList({ leads: [] }));
  }, [open, projectId]);
  const cell = (n, color) => <td style={{ textAlign: 'center', fontWeight: n ? 700 : 400, color: n ? color : '#cbd5e1' }}>{n || '0'}</td>;
  return (
    <div className="perf-grid m-stack" style={{ gridTemplateColumns: open ? 'minmax(0, 1.4fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', alignItems: 'start' }}>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.98rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><MI name="groups" /> {t('Team overview')}{projectName ? ` · ${projectName}` : ''}</div>
          <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 2 }}>{t('Open leads of each person (the person who added the lead), split by priority group. Click a person to see their list in priority order.')}</div>
        </div>
        {!team ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>{t('Loading…')}</div> : (
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead><tr>
                <th>{t('Person')}</th><th style={{ textAlign: 'center' }}>{t('Open leads')}</th>
                <th style={{ textAlign: 'center', color: '#b91c1c' }}>{t('Overdue')}</th><th style={{ textAlign: 'center', color: '#c2410c' }}>{t('Today')}</th>
                <th style={{ textAlign: 'center', color: '#6d28d9' }}>{t('Hot deals')}</th><th style={{ textAlign: 'center', color: '#1d4ed8' }}>{t('Coming up')}</th>
                <th style={{ textAlign: 'center' }}>{t('Never contacted')}</th><th style={{ textAlign: 'center' }}>{t('Longest wait')}</th>{!open && <th>{t('Their #1 lead')}</th>}
              </tr></thead>
              <tbody>
                {team.map(m => (
                  <tr key={m.id} onClick={() => setOpen({ id: m.id, name: m.name || t('No owner') })} style={{ cursor: 'pointer', background: open?.id === m.id ? '#eef2ff' : undefined }}>
                    <td><div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{m.name || <span style={{ color: '#b45309' }}>{t('No owner')}</span>}</div><div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{m.id === 'none' ? t('Leads whose owner is unknown or no longer active') : (m.job_title || t(ROLE_NAMES[m.role] || m.role || ''))}</div></td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{m.open}</td>
                    {cell(m.overdue, '#b91c1c')}{cell(m.due_today, '#c2410c')}{cell(m.hot_deal, '#6d28d9')}{cell(m.due_soon, '#1d4ed8')}{cell(m.never_contacted, '#334155')}
                    <td style={{ textAlign: 'center', color: m.longest_wait_days > 14 ? '#b91c1c' : '#334155' }}>{m.open ? `${m.longest_wait_days} ${t(m.longest_wait_days === 1 ? 'day' : 'days')}` : '—'}</td>
                    {!open && <td style={{ fontSize: '0.74rem', maxWidth: 240 }}>{m.top ? <>#{m.top.project_seq} {m.top.company_name}<PriorityReason r={m.top.priority_reason} t={t} lang={lang} /></> : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', position: 'sticky', top: 16 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{open.name}</div>
              <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{list ? t('{n} open leads, in the order to work on them', { n: list.total }) : t('Loading…')}</div>
            </div>
            <button type="button" onClick={() => setOpen(null)} className="panel-close"><MI name="close" size={16} /></button>
          </div>
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {(list?.leads || []).map(l => (
              <div key={l.id} onClick={() => setLogLead(l)} role="button" style={{ display: 'flex', gap: 10, padding: '9px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', alignItems: 'flex-start' }}>
                <RankBadge n={l.priority_rank} t={t} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8rem', wordBreak: 'break-word' }}><span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8' }}>#{l.project_seq ?? l.id}</span> {l.company_name}</div>
                  <PriorityReason r={l.priority_reason} t={t} lang={lang} />
                  {l.last_comment && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>💬 {l.last_comment}</div>}
                </div>
              </div>
            ))}
            {list && !list.leads.length && <p className="no-data" style={{ padding: 24 }}>{t('No open leads.')}</p>}
          </div>
        </div>
      )}
      {logLead && <LeadLogModal lead={logLead} projectId={projectId} onClose={() => setLogLead(null)} />}
    </div>
  );
}
