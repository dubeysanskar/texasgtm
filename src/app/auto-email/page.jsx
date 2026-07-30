'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>;

const SECTORS = { construction:'Construction', manufacturing:'Manufacturing', warehouse_logistics:'Warehouse/Logistics', food_processing:'Food Processing', metallurgy:'Metallurgy', mining:'Mining', chemicals:'Chemicals', automotive:'Automotive', hospitality:'Hospitality', retail:'Retail', agency_partner:'Agency Partner', industry_association:'Industry Association', other:'Other' };
const PRIORITIES = { HOT:'🔥 HOT', HIGH:'⚡ HIGH', MEDIUM:'● MEDIUM', PARTNER:'🤝 PARTNER' };
const LEAD_STATUSES = { not_contacted:'Not Contacted', touch_1:'Touch 1', touch_2:'Touch 2', touch_3:'Touch 3', email_sent:'Email Sent', call_made:'Call Made', replied:'Replied', meeting_booked:'Meeting Booked', proposal_sent:'Proposal Sent', negotiating:'Negotiating', contract_signed:'Contract Signed', not_interested:'Not Interested', follow_up_later:'Follow Up Later' };
const LANGS = [{ code:'en', label:'English', flag:'🇬🇧' }, { code:'ru', label:'Russian', flag:'🇷🇺' }, { code:'de', label:'German', flag:'🇩🇪' }, { code:'ar', label:'Arabic', flag:'🇦🇪' }];

const CAMP_STATUS = {
  draft: { bg:'rgba(107,114,128,0.1)', text:'#6b7280', label:'Draft', icon:'edit_note' },
  active: { bg:'rgba(59,130,246,0.1)', text:'#2563eb', label:'Active', icon:'play_circle' },
  paused: { bg:'rgba(245,158,11,0.1)', text:'#d97706', label:'Paused', icon:'pause_circle' },
  completed: { bg:'rgba(16,185,129,0.1)', text:'#059669', label:'Completed', icon:'check_circle' },
  scheduled: { bg:'rgba(139,92,246,0.1)', text:'#7c3aed', label:'Scheduled', icon:'schedule_send' },
};

const SEND_STATUS = {
  queued: { bg:'#f1f5f9', text:'#64748b', label:'Queued', icon:'hourglass_empty' },
  sending: { bg:'#dbeafe', text:'#2563eb', label:'Sending', icon:'sync' },
  sent: { bg:'#e0e7ff', text:'#4338ca', label:'Sent', icon:'check' },
  delivered: { bg:'#d1fae5', text:'#059669', label:'Delivered', icon:'mark_email_read' },
  opened: { bg:'#dcfce7', text:'#16a34a', label:'Opened', icon:'visibility' },
  replied: { bg:'#a7f3d0', text:'#047857', label:'Replied', icon:'reply' },
  bounced: { bg:'#fee2e2', text:'#dc2626', label:'Bounced', icon:'error' },
  failed: { bg:'#fecaca', text:'#b91c1c', label:'Failed', icon:'cancel' },
  unsubscribed: { bg:'#fef3c7', text:'#b45309', label:'Unsub', icon:'unsubscribe' },
};

export default function AutoEmailPage() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { projectId } = useProject();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editCampaign, setEditCampaign] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [sends, setSends] = useState([]);
  const [sendsLoading, setSendsLoading] = useState(false);
  const [sendFilter, setSendFilter] = useState('');
  const [sendsPage, setSendsPage] = useState(1);
  const [sendsTotal, setSendsTotal] = useState(0);
  const [showPreview, setShowPreview] = useState(null);
  const [sendingCampaign, setSendingCampaign] = useState(null);
  const [sendResult, setSendResult] = useState(null);
  const [sendProgress, setSendProgress] = useState(null);
  const [tab, setTab] = useState('campaigns');
  const [globalSends, setGlobalSends] = useState([]);
  const [globalSendsLoading, setGlobalSendsLoading] = useState(false);
  const [globalSendsPage, setGlobalSendsPage] = useState(1);
  const [globalSendsTotal, setGlobalSendsTotal] = useState(0);
  const [globalSendFilter, setGlobalSendFilter] = useState('');
  const [stats, setStats] = useState({ total_sent:0, total_opened:0, total_replied:0, total_bounced:0, total_campaigns:0, total_unsubscribed:0 });

  useEffect(() => { if (!authLoading && !user) router.push('/'); }, [user, authLoading, router]);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/auto-email/campaigns${projectId ? '?project_id=' + projectId : ''}`);
      if (r.ok) setCampaigns(await r.json());
    } catch {}
    setLoading(false);
  }, [projectId]);

  const fetchTemplates = useCallback(async () => {
    try {
      const r = await fetch(`/api/templates${projectId ? '?project_id=' + projectId : ''}`);
      if (r.ok) setTemplates(await r.json());
    } catch {}
  }, [projectId]);

  useEffect(() => {
    if (user) { fetchCampaigns(); fetchTemplates(); }
  }, [user, fetchCampaigns, fetchTemplates]);

  useEffect(() => {
    const s = { total_sent:0, total_opened:0, total_replied:0, total_bounced:0, total_campaigns: campaigns.length, total_unsubscribed:0 };
    campaigns.forEach(c => {
      s.total_sent += c.total_sent || 0;
      s.total_opened += c.total_opened || 0;
      s.total_replied += c.total_replied || 0;
      s.total_bounced += c.total_bounced || 0;
      s.total_unsubscribed += c.total_unsubscribed || 0;
    });
    setStats(s);
  }, [campaigns]);

  async function fetchSends(campaignId, page = 1) {
    setSendsLoading(true);
    try {
      const url = `/api/auto-email/sends?campaign_id=${campaignId}&limit=50&page=${page}${sendFilter ? `&status=${sendFilter}` : ''}`;
      const r = await fetch(url);
      if (r.ok) { const d = await r.json(); setSends(d.sends || []); setSendsTotal(d.total || 0); }
    } catch {}
    setSendsLoading(false);
  }

  async function fetchGlobalSends(page = 1) {
    setGlobalSendsLoading(true);
    try {
      const url = `/api/auto-email/sends?limit=50&page=${page}${globalSendFilter ? `&status=${globalSendFilter}` : ''}`;
      const r = await fetch(url);
      if (r.ok) { const d = await r.json(); setGlobalSends(d.sends || []); setGlobalSendsTotal(d.total || 0); }
    } catch {}
    setGlobalSendsLoading(false);
  }

  useEffect(() => {
    if (expandedId) { setSendsPage(1); fetchSends(expandedId, 1); }
  }, [expandedId, sendFilter]);

  useEffect(() => {
    if (tab === 'sends') fetchGlobalSends(globalSendsPage);
  }, [tab, globalSendsPage, globalSendFilter]);

  async function handleSend(campaignId) {
    if (!confirm('Start sending emails for this campaign? This will send real emails to leads.')) return;
    setSendingCampaign(campaignId);
    setSendResult(null);
    setSendProgress({ campaignId, status: 'Starting…', sent: 0, failed: 0 });
    try {
      const r = await fetch(`/api/auto-email/campaigns/${campaignId}/send`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) { setSendResult({ error: d.error }); setSendProgress(null); setSendingCampaign(null); return; }

      // Sending runs in the background now — poll campaign status for live progress.
      let done = false, ticks = 0;
      while (!done && ticks < 300) {
        ticks++;
        await new Promise(res => setTimeout(res, 4000));
        const cr = await fetch(`/api/auto-email/campaigns/${campaignId}`);
        if (!cr.ok) continue;
        const c = await cr.json();
        const bd = {}; (c.send_breakdown || []).forEach(b => { bd[b.status] = parseInt(b.count); });
        const sent = (bd.sent || 0) + (bd.opened || 0) + (bd.delivered || 0) + (bd.replied || 0);
        const failed = bd.failed || 0;
        setSendProgress({ campaignId, status: c.status, sent, failed });
        fetchCampaigns();
        if (expandedId === campaignId) fetchSends(campaignId);
        if (c.status === 'completed' || c.status === 'paused') {
          done = true;
          setSendResult({ sent, failed, skipped: 0 });
          setSendProgress(null);
        }
      }
      if (!done) setSendProgress(null); // still running after timeout — it continues server-side
    } catch (err) {
      setSendResult({ error: err.message });
      setSendProgress(null);
    }
    setSendingCampaign(null);
  }

  async function handlePause(campaignId) {
    await fetch(`/api/auto-email/campaigns/${campaignId}`, {
      method: 'PUT', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ status: 'paused' })
    });
    fetchCampaigns();
  }

  async function handleResume(campaignId) {
    handleSend(campaignId);
  }

  async function handleDelete(campaignId) {
    if (!confirm('Delete this campaign and all its send history? This cannot be undone.')) return;
    await fetch(`/api/auto-email/campaigns/${campaignId}`, { method: 'DELETE' });
    if (expandedId === campaignId) { setExpandedId(null); setSends([]); }
    fetchCampaigns();
  }

  async function handleDuplicate(campaign) {
    try {
      const r = await fetch('/api/auto-email/campaigns', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          name: `${campaign.name} (Copy)`,
          template_id: campaign.template_id,
          language: campaign.language,
          daily_limit: campaign.daily_limit,
          llm_personalize: campaign.llm_personalize,
          send_window_start: campaign.send_window_start,
          send_window_end: campaign.send_window_end,
          filters: typeof campaign.filters === 'string' ? JSON.parse(campaign.filters) : campaign.filters,
        })
      });
      if (r.ok) fetchCampaigns();
    } catch {}
  }

  const openRate = stats.total_sent > 0 ? ((stats.total_opened / stats.total_sent) * 100).toFixed(1) : '0.0';
  const replyRate = stats.total_sent > 0 ? ((stats.total_replied / stats.total_sent) * 100).toFixed(1) : '0.0';
  const bounceRate = stats.total_sent > 0 ? ((stats.total_bounced / stats.total_sent) * 100).toFixed(1) : '0.0';

  if (authLoading || !user) return <div className="page-loading">Loading...</div>;

  return (
    <div className="page-content">
      {/* Header */}
      <div className="ae-page-header">
        <div>
          <h1 className="ae-page-title">
            <div className="ae-page-title-icon"><MI name="rocket_launch" size={22} /></div>
            Bulk Email Engine
          </h1>
          <p className="ae-page-subtitle">
            Automated outreach pipeline • {stats.total_campaigns} campaigns • {stats.total_sent.toLocaleString()} emails delivered
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setShowCreate(true)} className="ae-btn ae-btn-primary">
            <MI name="add" size={16} /> New Campaign
          </button>
        </div>
      </div>

      {/* Analytics Dashboard */}
      <div className="ae-analytics-grid">
        {[
          { label:'Total Sent', value:stats.total_sent.toLocaleString(), icon:'send', color:'#3b82f6', bg:'rgba(59,130,246,0.08)' },
          { label:'Opened', value:stats.total_opened.toLocaleString(), icon:'visibility', color:'#10b981', bg:'rgba(16,185,129,0.08)' },
          { label:'Replied', value:stats.total_replied.toLocaleString(), icon:'reply', color:'#8b5cf6', bg:'rgba(139,92,246,0.08)' },
          { label:'Bounced', value:stats.total_bounced.toLocaleString(), icon:'error_outline', color:'#ef4444', bg:'rgba(239,68,68,0.08)' },
          { label:'Open Rate', value:`${openRate}%`, icon:'trending_up', color:'#f59e0b', bg:'rgba(245,158,11,0.08)' },
          { label:'Reply Rate', value:`${replyRate}%`, icon:'thumb_up', color:'#06b6d4', bg:'rgba(6,182,212,0.08)' },
          { label:'Bounce Rate', value:`${bounceRate}%`, icon:'trending_down', color:'#f43f5e', bg:'rgba(244,63,94,0.08)' },
          { label:'Unsubscribed', value:stats.total_unsubscribed?.toLocaleString() || '0', icon:'unsubscribe', color:'#a855f7', bg:'rgba(168,85,247,0.08)' },
        ].map(s => (
          <div key={s.label} className="ae-analytics-card">
            <div className="ae-analytics-icon" style={{ background:s.bg, color:s.color }}>
              <MI name={s.icon} size={20} />
            </div>
            <div>
              <div className="ae-analytics-value" style={{ color:s.color }}>{s.value}</div>
              <div className="ae-analytics-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="ae-tabs">
        <button className={`ae-tab ${tab === 'campaigns' ? 'active' : ''}`} onClick={() => setTab('campaigns')}>
          <MI name="campaign" size={16} /> Campaigns
        </button>
        <button className={`ae-tab ${tab === 'sends' ? 'active' : ''}`} onClick={() => setTab('sends')}>
          <MI name="mark_email_read" size={16} /> Send Log
        </button>
      </div>

      {/* Progress Toast */}
      {sendProgress && (
        <div className="ae-progress-toast">
          <div className="ae-progress-toast-inner">
            <span className="ae-spinner" />
            <span>Sending campaign emails… {sendProgress.sent} sent, {sendProgress.failed} failed</span>
          </div>
          <div className="ae-progress-bar-track">
            <div className="ae-progress-bar-fill ae-progress-bar-animated" />
          </div>
        </div>
      )}

      {/* Result Toast */}
      {sendResult && (
        <div className={`ae-result-toast ${sendResult.error ? 'error' : 'success'}`}>
          <span>
            {sendResult.error
              ? <><MI name="error" size={16} /> Error: {sendResult.error}</>
              : <><MI name="check_circle" size={16} /> Campaign complete — {sendResult.sent} sent, {sendResult.failed} failed, {sendResult.skipped} skipped</>
            }
          </span>
          <button onClick={() => setSendResult(null)} className="ae-toast-close">✕</button>
        </div>
      )}

      {/* Tab: Campaigns */}
      {tab === 'campaigns' && (
        <>
          {loading ? (
            <div className="ae-empty-state"><span className="ae-spinner" /> Loading campaigns…</div>
          ) : campaigns.length === 0 ? (
            <div className="ae-empty-state">
              <div className="ae-empty-icon"><MI name="rocket_launch" size={48} /></div>
              <h3>No Campaigns Yet</h3>
              <p>Create your first automated email campaign to start reaching leads at scale.</p>
              <button onClick={() => setShowCreate(true)} className="ae-btn ae-btn-primary" style={{ marginTop:16 }}>
                <MI name="add" size={16} /> Create Campaign
              </button>
            </div>
          ) : (
            <div className="ae-campaign-list">
              {campaigns.map(c => {
                const st = CAMP_STATUS[c.status] || CAMP_STATUS.draft;
                const isExpanded = expandedId === c.id;
                const campOpenRate = c.total_sent > 0 ? ((c.total_opened / c.total_sent) * 100).toFixed(1) : '0';
                const campReplyRate = c.total_sent > 0 ? ((c.total_replied / c.total_sent) * 100).toFixed(1) : '0';
                const progress = c.total_leads > 0 ? Math.round((c.total_sent / c.total_leads) * 100) : 0;
                const filters = typeof c.filters === 'string' ? JSON.parse(c.filters || '{}') : (c.filters || {});

                return (
                  <div key={c.id} className={`ae-card ${isExpanded ? 'expanded' : ''}`} style={{ '--status-color': st.text }}>
                    {/* Campaign Header */}
                    <div className="ae-card-header" onClick={() => { setExpandedId(isExpanded ? null : c.id); setSendFilter(''); }}>
                      <div className="ae-card-left">
                        <div className="ae-card-icon" style={{ background:st.bg, color:st.text }}>
                          <MI name={st.icon} size={20} />
                        </div>
                        <div className="ae-card-info">
                          <div className="ae-card-name">{c.name}</div>
                          <div className="ae-card-meta">
                            {c.template_name && <span><MI name="description" size={12} /> {c.template_name}</span>}
                            <span><MI name="group" size={12} /> {c.total_leads} leads</span>
                            <span><MI name="send" size={12} /> {c.total_sent} sent</span>
                            {c.daily_limit && <span><MI name="speed" size={12} /> {c.daily_limit}/day</span>}
                            {Object.values(filters).some(v => v) && <span className="ae-card-filtered"><MI name="filter_alt" size={12} /> Filtered</span>}
                          </div>
                        </div>
                      </div>

                      <div className="ae-card-right">
                        <div className="ae-card-rates">
                          <span className="ae-rate open"><MI name="visibility" size={13} /> {campOpenRate}%</span>
                          <span className="ae-rate reply"><MI name="reply" size={13} /> {campReplyRate}%</span>
                        </div>

                        <div className="ae-card-progress">
                          <div className="ae-progress-mini-track">
                            <div className="ae-progress-mini-fill" style={{ width:`${Math.min(progress, 100)}%`, background: progress >= 100 ? '#10b981' : st.text }} />
                          </div>
                          <span className="ae-progress-label">{progress}%</span>
                        </div>

                        <span className="ae-badge" style={{ background:st.bg, color:st.text }}>
                          <MI name={st.icon} size={12} /> {st.label}
                        </span>

                        <MI name={isExpanded ? 'expand_less' : 'expand_more'} size={20} />
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="ae-card-body">
                        {/* Quick Actions */}
                        <div className="ae-actions">
                          <div className="ae-actions-left">
                            {c.status !== 'active' && (
                              <button onClick={() => handleSend(c.id)} disabled={sendingCampaign === c.id} className="ae-btn ae-btn-primary ae-btn-sm">
                                {sendingCampaign === c.id ? <><span className="ae-spinner" /> Sending…</> : <><MI name="send" size={14} /> Send Now</>}
                              </button>
                            )}
                            {c.status === 'active' && (
                              <button onClick={() => handlePause(c.id)} className="ae-btn ae-btn-warning ae-btn-sm">
                                <MI name="pause" size={14} /> Pause
                              </button>
                            )}
                            {c.status === 'paused' && (
                              <button onClick={() => handleResume(c.id)} className="ae-btn ae-btn-success ae-btn-sm">
                                <MI name="play_arrow" size={14} /> Resume
                              </button>
                            )}
                            <button onClick={() => setShowPreview(c.id)} className="ae-btn ae-btn-ghost ae-btn-sm">
                              <MI name="preview" size={14} /> Preview
                            </button>
                            <button onClick={() => setEditCampaign(c)} className="ae-btn ae-btn-ghost ae-btn-sm">
                              <MI name="edit" size={14} /> Edit
                            </button>
                            <button onClick={() => handleDuplicate(c)} className="ae-btn ae-btn-ghost ae-btn-sm">
                              <MI name="content_copy" size={14} /> Duplicate
                            </button>
                            <button onClick={() => handleDelete(c.id)} className="ae-btn ae-btn-danger ae-btn-sm">
                              <MI name="delete" size={14} /> Delete
                            </button>
                          </div>
                          <div className="ae-actions-right">
                            <select value={sendFilter} onChange={e => setSendFilter(e.target.value)} className="ae-select-sm">
                              <option value="">All statuses</option>
                              {Object.entries(SEND_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                        </div>

                        {/* Campaign Stats Row */}
                        <div className="ae-inline-stats">
                          {[
                            { l:'Sent', v:c.total_sent, c:'#3b82f6', icon:'send' },
                            { l:'Opened', v:c.total_opened, c:'#10b981', icon:'visibility' },
                            { l:'Replied', v:c.total_replied, c:'#8b5cf6', icon:'reply' },
                            { l:'Bounced', v:c.total_bounced, c:'#ef4444', icon:'error' },
                            { l:'Unsubs', v:c.total_unsubscribed || 0, c:'#f59e0b', icon:'unsubscribe' },
                          ].map(s => (
                            <div key={s.l} className="ae-inline-stat">
                              <MI name={s.icon} size={14} />
                              <span className="ae-inline-stat-value" style={{ color:s.c }}>{s.v}</span>
                              <span className="ae-inline-stat-label">{s.l}</span>
                            </div>
                          ))}
                        </div>

                        {/* Campaign Config Details */}
                        <div className="ae-config-row">
                          <div className="ae-config-item">
                            <MI name="language" size={14} />
                            <span>{LANGS.find(l => l.code === c.language)?.label || c.language}</span>
                          </div>
                          <div className="ae-config-item">
                            <MI name="schedule" size={14} />
                            <span>{c.send_window_start || '09:00'} – {c.send_window_end || '18:00'}</span>
                          </div>
                          <div className="ae-config-item">
                            <MI name="speed" size={14} />
                            <span>{c.daily_limit || 50}/day limit</span>
                          </div>
                          <div className="ae-config-item">
                            <MI name={c.llm_personalize ? 'auto_awesome' : 'block'} size={14} />
                            <span>{c.llm_personalize ? 'AI Personalized' : 'Template Only'}</span>
                          </div>
                          {Object.entries(filters).filter(([,v]) => v).map(([k, v]) => (
                            <div key={k} className="ae-config-item ae-config-filter">
                              <MI name="filter_alt" size={14} />
                              <span>{k}: {v}</span>
                            </div>
                          ))}
                        </div>

                        {/* Send Log Table */}
                        <SendLogTable
                          sends={sends}
                          loading={sendsLoading}
                          total={sendsTotal}
                          page={sendsPage}
                          onPageChange={(p) => { setSendsPage(p); fetchSends(expandedId, p); }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Tab: Global Send Log */}
      {tab === 'sends' && (
        <div className="ae-sends-tab">
          <div className="ae-sends-header">
            <h3 className="ae-sends-title"><MI name="mark_email_read" size={20} /> All Sent Emails</h3>
            <select value={globalSendFilter} onChange={e => { setGlobalSendFilter(e.target.value); setGlobalSendsPage(1); }} className="ae-select-sm">
              <option value="">All statuses</option>
              {Object.entries(SEND_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <SendLogTable
            sends={globalSends}
            loading={globalSendsLoading}
            total={globalSendsTotal}
            page={globalSendsPage}
            onPageChange={setGlobalSendsPage}
            showCampaign
          />
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreate && <CampaignModal templates={templates} onClose={() => setShowCreate(false)} onDone={() => { fetchCampaigns(); setShowCreate(false); }} />}

      {/* Edit Campaign Modal */}
      {editCampaign && <CampaignModal campaign={editCampaign} templates={templates} onClose={() => setEditCampaign(null)} onDone={() => { fetchCampaigns(); setEditCampaign(null); }} />}

      {/* Preview Modal */}
      {showPreview && <PreviewModal campaignId={showPreview} onClose={() => setShowPreview(null)} />}
    </div>
  );
}

// ─── Send Log Table Component ──────────────────────────────────────────────
function SendLogTable({ sends, loading, total, page, onPageChange, showCampaign }) {
  const totalPages = Math.ceil(total / 50);

  if (loading) return <div className="ae-table-empty"><span className="ae-spinner" /> Loading send log…</div>;
  if (sends.length === 0) return (
    <div className="ae-table-empty">
      <MI name="inbox" size={32} />
      <p>No emails sent yet</p>
    </div>
  );

  return (
    <div className="ae-table-wrap">
      <table className="ae-table">
        <thead>
          <tr>
            <th>#</th>
            {showCampaign && <th>Campaign</th>}
            <th>Company</th>
            <th>Email</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Sent At</th>
            <th>Opened</th>
          </tr>
        </thead>
        <tbody>
          {sends.map(s => {
            const ss = SEND_STATUS[s.status] || SEND_STATUS.queued;
            return (
              <tr key={s.id}>
                <td className="ae-td-id">{s.id}</td>
                {showCampaign && <td className="ae-td-campaign">{s.campaign_id}</td>}
                <td className="ae-td-company">
                  <div className="ae-td-company-name">{s.company_name || '—'}</div>
                  {s.sector && <div className="ae-td-sector">{s.sector}</div>}
                </td>
                <td className="ae-td-email">{s.to_email}</td>
                <td className="ae-td-subject">{s.subject}</td>
                <td>
                  <span className="ae-send-badge" style={{ background:ss.bg, color:ss.text }}>
                    <MI name={ss.icon} size={12} /> {ss.label}
                  </span>
                </td>
                <td className="ae-td-date">{s.sent_at ? new Date(s.sent_at).toLocaleString() : '—'}</td>
                <td className="ae-td-date" style={{ color: s.opened_at ? '#10b981' : '#cbd5e1' }}>
                  {s.opened_at ? new Date(s.opened_at).toLocaleString() : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="ae-pagination">
          <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="ae-btn ae-btn-ghost ae-btn-sm"><MI name="chevron_left" size={16} /></button>
          <span className="ae-page-info">Page {page} of {totalPages} ({total} total)</span>
          <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="ae-btn ae-btn-ghost ae-btn-sm"><MI name="chevron_right" size={16} /></button>
        </div>
      )}
    </div>
  );
}

// ─── Campaign Create/Edit Modal ────────────────────────────────────────────
function CampaignModal({ campaign, templates, onClose, onDone }) {
  const isEdit = !!campaign;
  const existingFilters = campaign?.filters ? (typeof campaign.filters === 'string' ? JSON.parse(campaign.filters) : campaign.filters) : {};

  const [form, setForm] = useState({
    name: campaign?.name || '',
    template_id: campaign?.template_id?.toString() || '',
    language: campaign?.language || 'en',
    daily_limit: campaign?.daily_limit || 50,
    llm_personalize: campaign?.llm_personalize !== false,
    send_window_start: campaign?.send_window_start || '09:00',
    send_window_end: campaign?.send_window_end || '18:00',
    filters: {
      sector: existingFilters.sector || '',
      priority: existingFilters.priority || '',
      status: existingFilters.status || '',
      region: existingFilters.region || '',
      country: existingFilters.country || '',
    }
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [leadCount, setLeadCount] = useState(campaign?.total_leads ?? null);
  const [counting, setCounting] = useState(false);
  const [step, setStep] = useState(1);

  const emailTemplates = templates.filter(t => t.platform === 'email' && t.status === 'active');

  async function countLeads() {
    setCounting(true);
    try {
      const r = await fetch('/api/auto-email/campaigns', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ ...form, name: '__count_check__' })
      });
      if (r.ok) {
        const d = await r.json();
        setLeadCount(d.total_leads || 0);
        await fetch(`/api/auto-email/campaigns/${d.id}`, { method: 'DELETE' });
      }
    } catch {}
    setCounting(false);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Campaign name required'); return; }
    if (!form.template_id) { setErr('Select a template'); return; }
    setSaving(true); setErr('');
    try {
      const url = isEdit ? `/api/auto-email/campaigns/${campaign.id}` : '/api/auto-email/campaigns';
      const method = isEdit ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method, headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ ...form, template_id: parseInt(form.template_id) })
      });
      if (r.ok) onDone();
      else { const d = await r.json(); setErr(d.error || 'Failed'); }
    } catch (e) { setErr(e.message); }
    setSaving(false);
  }

  const updateFilter = (key, val) => setForm(f => ({ ...f, filters: { ...f.filters, [key]: val } }));

  return (
    <div className="ae-modal-overlay" onClick={onClose}>
      <div className="ae-modal" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="ae-modal-header">
          <h3><MI name={isEdit ? 'edit' : 'campaign'} size={20} /> {isEdit ? 'Edit Campaign' : 'New Campaign'}</h3>
          <button onClick={onClose} className="ae-modal-close">✕</button>
        </div>

        {err && <div className="ae-modal-error"><MI name="error" size={14} /> {err}</div>}

        {/* Step Indicator */}
        <div className="ae-steps">
          <div className={`ae-step ${step >= 1 ? 'active' : ''}`} onClick={() => setStep(1)}>
            <span className="ae-step-num">1</span> Basics
          </div>
          <div className="ae-step-line" />
          <div className={`ae-step ${step >= 2 ? 'active' : ''}`} onClick={() => setStep(2)}>
            <span className="ae-step-num">2</span> Targeting
          </div>
          <div className="ae-step-line" />
          <div className={`ae-step ${step >= 3 ? 'active' : ''}`} onClick={() => setStep(3)}>
            <span className="ae-step-num">3</span> Settings
          </div>
        </div>

        <form onSubmit={save}>
          {/* Step 1: Basics */}
          {step === 1 && (
            <div className="ae-modal-body">
              <div className="ae-form-grid">
                <div className="ae-form-field">
                  <label><MI name="label" size={14} /> Campaign Name *</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Russia Q3 Outreach" />
                </div>
                <div className="ae-form-field">
                  <label><MI name="description" size={14} /> Email Template *</label>
                  <select value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}>
                    <option value="">Select template…</option>
                    {emailTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="ae-form-grid ae-form-grid-3">
                <div className="ae-form-field">
                  <label><MI name="translate" size={14} /> Language</label>
                  <select value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
                    {LANGS.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                  </select>
                </div>
                <div className="ae-form-field">
                  <label><MI name="speed" size={14} /> Daily Limit</label>
                  <input type="number" min={1} max={500} value={form.daily_limit} onChange={e => setForm(f => ({ ...f, daily_limit: parseInt(e.target.value) || 50 }))} />
                </div>
                <div className="ae-form-field">
                  <label><MI name="auto_awesome" size={14} /> AI Personalization</label>
                  <select value={form.llm_personalize ? 'yes' : 'no'} onChange={e => setForm(f => ({ ...f, llm_personalize: e.target.value === 'yes' }))}>
                    <option value="yes">✨ Enabled</option>
                    <option value="no">Off (template only)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Targeting */}
          {step === 2 && (
            <div className="ae-modal-body">
              <div className="ae-target-panel">
                <div className="ae-target-title">
                  <MI name="filter_alt" size={18} /> Lead Filters
                  <span className="ae-target-hint">Narrow which leads receive this campaign</span>
                </div>
                <div className="ae-form-grid ae-form-grid-3">
                  <div className="ae-form-field">
                    <label>Sector</label>
                    <select value={form.filters.sector} onChange={e => updateFilter('sector', e.target.value)}>
                      <option value="">All sectors</option>
                      {Object.entries(SECTORS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="ae-form-field">
                    <label>Priority</label>
                    <select value={form.filters.priority} onChange={e => updateFilter('priority', e.target.value)}>
                      <option value="">All priorities</option>
                      {Object.entries(PRIORITIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="ae-form-field">
                    <label>Lead Status</label>
                    <select value={form.filters.status} onChange={e => updateFilter('status', e.target.value)}>
                      <option value="">All statuses</option>
                      {Object.entries(LEAD_STATUSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="ae-form-field">
                    <label>Region</label>
                    <input value={form.filters.region} onChange={e => updateFilter('region', e.target.value)} placeholder="e.g. Moscow" />
                  </div>
                  <div className="ae-form-field">
                    <label>Country</label>
                    <input value={form.filters.country} onChange={e => updateFilter('country', e.target.value)} placeholder="e.g. Russia" />
                  </div>
                  <div className="ae-form-field" style={{ display:'flex', alignItems:'flex-end' }}>
                    <button type="button" onClick={countLeads} disabled={counting} className="ae-btn ae-btn-ghost" style={{ width:'100%' }}>
                      {counting ? <><span className="ae-spinner" /> Counting…</> : <><MI name="calculate" size={14} /> Count Leads</>}
                    </button>
                  </div>
                </div>
                {leadCount !== null && (
                  <div className="ae-lead-count">
                    <MI name="groups" size={16} /> <strong>{leadCount}</strong> leads match these filters
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Settings */}
          {step === 3 && (
            <div className="ae-modal-body">
              <div className="ae-form-grid">
                <div className="ae-form-field">
                  <label><MI name="schedule" size={14} /> Send Window Start</label>
                  <input type="time" value={form.send_window_start} onChange={e => setForm(f => ({ ...f, send_window_start: e.target.value }))} />
                </div>
                <div className="ae-form-field">
                  <label><MI name="schedule" size={14} /> Send Window End</label>
                  <input type="time" value={form.send_window_end} onChange={e => setForm(f => ({ ...f, send_window_end: e.target.value }))} />
                </div>
              </div>
              <div className="ae-settings-summary">
                <h4><MI name="summarize" size={16} /> Campaign Summary</h4>
                <div className="ae-summary-grid">
                  <div><strong>Name:</strong> {form.name || '—'}</div>
                  <div><strong>Template:</strong> {emailTemplates.find(t => t.id?.toString() === form.template_id)?.name || '—'}</div>
                  <div><strong>Language:</strong> {LANGS.find(l => l.code === form.language)?.label || form.language}</div>
                  <div><strong>Daily Limit:</strong> {form.daily_limit}</div>
                  <div><strong>AI Personalization:</strong> {form.llm_personalize ? 'On' : 'Off'}</div>
                  <div><strong>Send Window:</strong> {form.send_window_start} – {form.send_window_end}</div>
                  {Object.entries(form.filters).filter(([,v]) => v).map(([k,v]) => (
                    <div key={k}><strong>Filter ({k}):</strong> {v}</div>
                  ))}
                  {leadCount !== null && <div><strong>Matching Leads:</strong> {leadCount}</div>}
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="ae-modal-footer">
            <div className="ae-modal-footer-left">
              {step > 1 && (
                <button type="button" onClick={() => setStep(step - 1)} className="ae-btn ae-btn-ghost">
                  <MI name="arrow_back" size={14} /> Back
                </button>
              )}
            </div>
            <div className="ae-modal-footer-right">
              <button type="button" onClick={onClose} className="ae-btn ae-btn-ghost">Cancel</button>
              {step < 3 ? (
                <button type="button" onClick={() => setStep(step + 1)} className="ae-btn ae-btn-primary">
                  Next <MI name="arrow_forward" size={14} />
                </button>
              ) : (
                <button type="submit" disabled={saving} className="ae-btn ae-btn-primary">
                  {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Campaign'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Preview Modal ──────────────────────────────────────────────────────────
function PreviewModal({ campaignId, onClose }) {
  const [leadId, setLeadId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [viewMode, setViewMode] = useState('text');

  async function loadPreview() {
    if (!leadId) { setErr('Enter a lead ID'); return; }
    setLoading(true); setErr(''); setData(null);
    try {
      const r = await fetch(`/api/auto-email/campaigns/${campaignId}/preview`, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ lead_id: parseInt(leadId) })
      });
      if (r.ok) setData(await r.json());
      else { const d = await r.json(); setErr(d.error || 'Failed'); }
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }

  return (
    <div className="ae-modal-overlay" onClick={onClose}>
      <div className="ae-modal ae-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="ae-modal-header">
          <h3><MI name="preview" size={20} /> Email Preview</h3>
          <button onClick={onClose} className="ae-modal-close">✕</button>
        </div>

        <div className="ae-modal-body">
          <div className="ae-preview-input">
            <input type="number" placeholder="Enter Lead ID to preview…" value={leadId} onChange={e => setLeadId(e.target.value)} className="ae-preview-field" />
            <button onClick={loadPreview} disabled={loading} className="ae-btn ae-btn-primary ae-btn-sm">
              {loading ? 'Loading…' : 'Generate Preview'}
            </button>
          </div>

          {err && <div className="ae-modal-error"><MI name="error" size={14} /> {err}</div>}

          {data && (
            <div className="ae-preview-content">
              {/* Lead info */}
              <div className="ae-preview-lead">
                <span><strong>To:</strong> {data.lead?.company_name} ({data.to})</span>
                <span><strong>Sector:</strong> {data.lead?.sector}</span>
                <span><strong>City:</strong> {data.lead?.city}</span>
              </div>

              {/* AI Personalization */}
              {(data.opener || data.valueProp) && (
                <div className="ae-preview-ai">
                  {data.opener && (
                    <div className="ae-ai-slot opener">
                      <strong><MI name="auto_awesome" size={14} /> AI Opener:</strong> {data.opener}
                    </div>
                  )}
                  {data.valueProp && (
                    <div className="ae-ai-slot value">
                      <strong><MI name="lightbulb" size={14} /> AI Value Prop:</strong> {data.valueProp}
                    </div>
                  )}
                </div>
              )}

              {/* Subject */}
              <div className="ae-preview-subject">
                <strong>Subject:</strong> {data.subject}
              </div>

              {/* View mode toggle */}
              <div className="ae-preview-toggle">
                <button className={`ae-toggle-btn ${viewMode === 'text' ? 'active' : ''}`} onClick={() => setViewMode('text')}>
                  <MI name="article" size={14} /> Text
                </button>
                <button className={`ae-toggle-btn ${viewMode === 'html' ? 'active' : ''}`} onClick={() => setViewMode('html')}>
                  <MI name="code" size={14} /> HTML
                </button>
              </div>

              {viewMode === 'text' ? (
                <div className="ae-preview-body">{data.body}</div>
              ) : (
                <iframe srcDoc={data.html} className="ae-preview-iframe" title="Email Preview" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
