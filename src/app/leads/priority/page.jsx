'use client';
// Priority Leads — a focused, triage-first view of the pipeline: HOT leads float to the top, closed
// ("Not Interested") leads never appear here at all (they stay visible in the full Leads list, just
// out of the way of active prioritization). Click a priority tier to narrow to just that tier.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { DueChip } from '@/components/FollowUps';
import CommentPrompt from '@/components/CommentPrompt';
import ContactBadges from '@/components/LeadContactBadges';
import { SC, PC } from '@/lib/lead-status';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>;
const TIERS = ['HOT', 'HIGH', 'MEDIUM', 'PARTNER'];

export default function PriorityLeadsPage() {
  const { user, loading: authLoading } = useAuth();
  const { projectId, t, lang } = useProject();
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState('all'); // all | HOT | HIGH | MEDIUM | PARTNER
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(null); // comment-prompt payload

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ sort: 'priority', exclude_closed: '1', limit: '500' });
    if (projectId) p.set('project_id', projectId);
    try { const d = await (await fetch(`/api/leads?${p}`)).json(); setLeads(d.leads || []); } catch { setLeads([]); }
    setLoading(false);
  }, [projectId]);
  useEffect(() => { if (user) load(); }, [user, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(l => {
      if (tier !== 'all' && l.priority !== tier) return false;
      if (q) {
        // every word must appear somewhere on the lead; phone numbers also match on digits alone
        const hay = [l.company_name, l.domain, l.city, l.region, l.email, l.phone, l.mobile_personal, l.telegram, l.max_messenger,
          l.decision_maker_title, l.contact_person, l.pain_point, l.find_instructions, l.notes, l.project_seq].join(' ').toLowerCase();
        const digits = q.replace(/\D/g, '');
        const phoneHit = digits.length >= 5 && [l.phone, l.mobile_personal].some(v => String(v || '').replace(/\D/g, '').includes(digits.length > 10 ? digits.slice(-10) : digits));
        if (!phoneHit && !q.split(/\s+/).every(w => hay.includes(w))) return false;
      }
      return true;
    });
  }, [leads, tier, search]);

  const counts = useMemo(() => {
    const c = { HOT: 0, HIGH: 0, MEDIUM: 0, PARTNER: 0 };
    for (const l of leads) if (c[l.priority] !== undefined) c[l.priority]++;
    return c;
  }, [leads]);

  const grouped = tier === 'all'
    ? TIERS.map(tr => ({ tier: tr, items: filtered.filter(l => l.priority === tr) })).filter(g => g.items.length)
    : [{ tier, items: filtered }];

  function askPriority(lead, newPriority) {
    if (newPriority === lead.priority) return;
    setPending({
      title: lead.company_name, detail: `${t('Priority')}: ${t(PC[lead.priority]?.label)} → ${t(PC[newPriority]?.label)}`,
      run: async (comment) => { await save(lead.id, { priority: newPriority, comment }); },
    });
  }
  function askStatus(lead, newStatus) {
    if (newStatus === lead.status) return;
    setPending({
      title: lead.company_name, detail: `${t('Status')}: ${t(SC[lead.status]?.label)} → ${t(SC[newStatus]?.label)}`,
      askDate: newStatus === 'follow_up_later',
      run: async (comment, extra = {}) => { await save(lead.id, { status: newStatus, comment, ...extra }); },
    });
  }
  async function save(id, body) {
    const r = await fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(t(d.error || 'Failed')); }
    load();
  }

  useEffect(() => { if (!authLoading && !user) router.push('/'); }, [user, authLoading, router]);
  if (authLoading || !user) return null;

  const tierBtn = (active, color) => ({ padding: '8px 16px', borderRadius: 10, border: active ? `2px solid ${color}` : '1px solid var(--border)', background: active ? `${color}12` : '#fff', color: active ? color : 'var(--text)', fontWeight: active ? 800 : 600, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' });

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1><MI name="local_fire_department" size={26} /> {t('Priority Leads')}</h1>
          <p>{t('The leads that matter most, sorted by priority — HOT first. Closed leads never show up here.')}</p>
        </div>
        <button className="btn btn-ghost" onClick={() => router.push('/leads')}><MI name="list" size={16} /> {t('Full lead list')}</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <button style={tierBtn(tier === 'all', '#111827')} onClick={() => setTier('all')}><MI name="apps" size={15} /> {t('All')} <span style={{ opacity: 0.6 }}>{leads.length}</span></button>
        {TIERS.map(tr => (
          <button key={tr} style={tierBtn(tier === tr, PC[tr].text)} onClick={() => setTier(tr)}>
            {t(PC[tr].label)} <span style={{ opacity: 0.6 }}>{counts[tr]}</span>
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Search anything — company, name, email, phone, Telegram, city, ID…')}
          style={{ marginLeft: 'auto', minWidth: 220, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: '0.82rem', fontFamily: 'inherit' }} />
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{t('Loading…')}</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <MI name="task_alt" size={40} />
          <div style={{ marginTop: 8, fontSize: '0.86rem' }}>{t('Nothing here — every lead in this tier is closed or handled.')}</div>
        </div>
      ) : grouped.map(g => (
        <div key={g.tier} style={{ marginBottom: 18 }}>
          {tier === 'all' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '4px 2px' }}>
              <span style={{ fontWeight: 800, fontSize: '0.84rem', color: PC[g.tier].text }}>{t(PC[g.tier].label)}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>· {g.items.length} {t('leads')}</span>
            </div>
          )}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {g.items.map(l => {
              const sc = SC[l.status] || SC.not_contacted;
              return (
                <div key={l.id} onClick={() => router.push(`/leads?log=${l.id}`)}
                  style={{ display: 'flex', gap: 14, padding: '12px 16px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', cursor: 'pointer', borderLeft: `4px solid ${PC[l.priority]?.text || '#cbd5e1'}` }}>
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text)', wordBreak: 'break-word' }}>#{l.project_seq ?? l.id} · {l.company_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{[l.city, l.decision_maker_title].filter(Boolean).join(' · ') || '—'}</div>
                    {l.pain_point && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 3, maxWidth: 420 }}>{l.pain_point}</div>}
                    <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}><ContactBadges l={l} size="small" /></div>
                  </div>

                  <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, width: 150 }}>
                    <select value={l.priority} onChange={e => askPriority(l, e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.74rem', fontWeight: 700, background: `${PC[l.priority]?.bg}`, color: PC[l.priority]?.text, cursor: 'pointer' }}>
                      {Object.entries(PC).map(([v, c]) => <option key={v} value={v}>{t(c.label)}</option>)}
                    </select>
                  </div>
                  <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, width: 170 }}>
                    <select value={l.status} onChange={e => askStatus(l, e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.74rem', fontWeight: 600, background: sc.bg, color: sc.text, cursor: 'pointer' }}>
                      {Object.entries(SC).map(([v, c]) => <option key={v} value={v}>{t(c.label)}</option>)}
                    </select>
                  </div>
                  <div style={{ flexShrink: 0, width: 150, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    {l.next_followup_at ? <DueChip compact iso={l.next_followup_at} t={t} lang={lang} /> : <span style={{ fontSize: '0.68rem', color: '#cbd5e1' }}>{t('No follow-up set')}</span>}
                  </div>
                  <MI name="chevron_right" size={18} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {pending && (
        <CommentPrompt t={t} title={pending.title} detail={pending.detail} askDate={pending.askDate}
          onCancel={() => setPending(null)}
          onConfirm={async (comment, extra) => { const run = pending.run; setPending(null); await run(comment, extra); }} />
      )}
    </div>
  );
}
