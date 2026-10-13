'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';
import { DueChip, FollowUpRow, useFollowUpActions } from '@/components/FollowUps';
import { LeadWatchersPanel } from '@/components/Watchers';
import CommentPrompt, { FollowUpDateFields, followupFields } from '@/components/CommentPrompt';
import ContactBadges from '@/components/LeadContactBadges';
import { SC, PC, SL } from '@/lib/lead-status';
import { useIsMobile } from '@/lib/useMediaQuery';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>;

export default function LeadsPage() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { projectId, t, lang } = useProject();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [showFilters, setShowFilters] = useState(false); // phone: filters fold away behind a button
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ sector: '', priority: '', status: '', search: '', lookup: '' });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [showBulkLookup, setShowBulkLookup] = useState(false);
  const [bulkLookupText, setBulkLookupText] = useState('');
  const [perPage, setPerPage] = useState(50);
  const [sortOrder, setSortOrder] = useState('desc');
  const [templates, setTemplates] = useState([]);
  const [tplSearch, setTplSearch] = useState({});
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [bulkTplId, setBulkTplId] = useState('');
  const [bulkTplSearch, setBulkTplSearch] = useState('');
  const [showBulkTpl, setShowBulkTpl] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [logLead, setLogLead] = useState(null);
  const [editLead, setEditLead] = useState(null);
  const [pending, setPending] = useState(null);
  const [viewDeleted, setViewDeleted] = useState(false); // recycle bin view // { title, detail, run(comment) } — comment prompt for a change

  useEffect(() => { if (!authLoading && !user) router.push('/'); }, [user, authLoading, router]);
  // /leads?log=<id> (links from Dashboard / Follow-ups) opens that lead's log
  useEffect(() => {
    if (!user) return;
    const id = new URLSearchParams(window.location.search).get('log');
    if (!id) return;
    fetch(`/api/leads/${id}`).then(r => r.json()).then(d => { if (d.lead) setLogLead(d.lead); }).catch(() => {});
    window.history.replaceState(null, '', '/leads');
  }, [user]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filters.sector) p.set('sector', filters.sector);
    if (filters.priority) p.set('priority', filters.priority);
    if (filters.status) p.set('status', filters.status);
    if (filters.search) p.set('search', filters.search);
    if (filters.lookup) p.set('lookup', filters.lookup);
    p.set('page', page); p.set('limit', perPage); p.set('order', sortOrder);
    if (projectId) p.set('project_id', projectId);
    if (viewDeleted) p.set('deleted', '1');
    try {
      const res = await fetch(`/api/leads?${p}`);
      const d = await res.json();
      setLeads(d.leads || []); setTotal(d.total || 0); setTotalPages(d.totalPages || 1);
    } catch { setLeads([]); }
    setLoading(false);
  }, [filters, page, perPage, sortOrder, projectId, viewDeleted]);

  const fetchStats = useCallback(async () => {
    try { const r = await fetch(`/api/leads/stats${projectId ? '?project_id=' + projectId : ''}`); setStats(await r.json()); } catch {}
  }, [projectId]);
  const fetchTemplates = useCallback(async () => {
    try { const r = await fetch(`/api/templates${projectId ? '?project_id=' + projectId : ''}`); setTemplates(await r.json()); } catch {}
  }, [projectId]);

  useEffect(() => { if (user) { fetchLeads(); fetchStats(); fetchTemplates(); } }, [user, fetchLeads, fetchStats, fetchTemplates]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [filters, perPage, viewDeleted]);

  // Every change goes through a comment prompt; the comment is saved in the lead's log.
  const put = async (id, body) => {
    const r = await fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(t(d.error || (r.status >= 500 ? 'Server error — the database may be unavailable. Please try again shortly.' : 'Failed'))); }
    return r;
  };
  const leadFu = useFollowUpActions(() => fetchLeads());
  const leadName = (id) => leads.find(l => l.id === id)?.company_name || '';

  function handleTemplateChange(leadId, tplId) {
    const tpl = templates.find(x => x.id === tplId);
    setPending({ title: t('Template'), detail: `${leadName(leadId)}: ${tpl ? tpl.name : t('Clear template')}`,
      run: async (comment) => { await put(leadId, { last_template_id: tplId || null, comment }); fetchLeads(); } });
  }
  function handleStatusChange(id, s) {
    const lead = leads.find(l => l.id === id);
    setPending({ title: t('Status'), detail: `${lead?.company_name}: ${t(SC[lead?.status]?.label || '')} → ${t(SC[s]?.label || s)}`,
      askDate: s === 'follow_up_later',
      run: async (comment, extra = {}) => { await put(id, { status: s, comment, ...extra }); fetchLeads(); fetchStats(); } });
  }
  function handlePriorityChange(id, p) {
    const lead = leads.find(l => l.id === id);
    setPending({ title: t('Priority'), detail: `${lead?.company_name}: ${t(PC[lead?.priority]?.label || '')} → ${t(PC[p]?.label || p)}`,
      run: async (comment) => { await put(id, { priority: p, comment }); fetchLeads(); fetchStats(); } });
  }
  function handleDelete(id) {
    setPending({ title: t('Delete lead'), detail: leadName(id), danger: true,
      run: async (comment) => {
        const r = await fetch(`/api/leads/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) });
        if (!r.ok) { const d = await r.json().catch(() => ({})); alert(t(d.error || 'Failed')); }
        fetchLeads(); fetchStats();
      } });
  }
  function handlePurge(id) {
    setPending({ title: t('Delete permanently'), detail: `${leadName(id)} — ${t('This cannot be undone.')}`, danger: true,
      run: async (comment) => {
        const r = await fetch(`/api/leads/${id}?permanent=1`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) });
        if (!r.ok) { const d = await r.json().catch(() => ({})); alert(t(d.error || 'Failed')); }
        fetchLeads(); fetchStats();
      } });
  }
  function handleRestore(id) {
    setPending({ title: t('Restore lead'), detail: leadName(id),
      run: async (comment) => {
        const r = await fetch(`/api/leads/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) alert(t(d.error || 'Failed')); else if (d.duplicate_of_live_lead) alert(t('Restored. Note: a live lead with the same company already exists.'));
        fetchLeads(); fetchStats();
      } });
  }
  function handleBulkStatus() {
    if (!selected.size || !bulkStatus) return;
    setPending({ title: t('Status'), detail: `${t('{n} selected', { n: selected.size })} → ${t(SC[bulkStatus]?.label || bulkStatus)}`,
      askDate: bulkStatus === 'follow_up_later',
      run: async (comment, extra = {}) => {
        await fetch('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected], status: bulkStatus, comment, ...extra }) });
        setSelected(new Set()); setBulkStatus(''); fetchLeads(); fetchStats();
      } });
  }
  function handleBulkTemplate(tplId) {
    if (!selected.size || !tplId) return;
    const tpl = templates.find(x => x.id === parseInt(tplId));
    setShowBulkTpl(false); setBulkTplSearch('');
    setPending({ title: t('Template'), detail: `${t('{n} selected', { n: selected.size })} → ${tpl?.name || tplId}`,
      run: async (comment) => {
        await fetch('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected], template_id: parseInt(tplId), comment }) });
        fetchLeads();
      } });
  }
  function handleRangeSelect() {
    const from = parseInt(rangeFrom), to = parseInt(rangeTo);
    if (isNaN(from) || isNaN(to) || from > to) return;
    const ids = leads.filter(l => (l.project_seq ?? l.id) >= from && (l.project_seq ?? l.id) <= to).map(l => l.id);
    setSelected(new Set(ids));
    setRangeFrom(''); setRangeTo('');
  }
  async function handleExport() {
    setExporting(true);
    try {
      const r = await fetch('/api/leads/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, lang }) });
      const b = await r.blob(); const u = URL.createObjectURL(b);
      const a = document.createElement('a'); a.href = u; a.download = `${lang === 'ru' ? 'GTM_CRM_Lidy' : 'GTM_CRM_Leads'}_${new Date().toISOString().split('T')[0]}.xlsx`; a.click(); URL.revokeObjectURL(u);
    } catch (e) { alert(t('Export failed')); }
    setExporting(false);
  }
  // Bulk Lookup sends the pasted list as-is; the API splits it per line / comma and returns a lead if it
  // matches ANY value (ID, company, contact name, email, phone, Telegram…)
  function handleBulkLookup() {
    const text = bulkLookupText.trim();
    if (text) { setFilters(f => ({ ...f, lookup: text })); setShowBulkLookup(false); }
  }
  function clearBulkLookup() { setBulkLookupText(''); setFilters(f => ({ ...f, lookup: '' })); }
  function toggleSelect(id) { setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleSelectAll() { if (selected.size === leads.length) setSelected(new Set()); else setSelected(new Set(leads.map(l => l.id))); }

  // Excel-like cell styles
  const TH = { padding:'8px 10px', textAlign:'left', fontSize:'0.7rem', fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'0.3px', borderRight:'1px solid #d1d5db', borderBottom:'2px solid #9ca3af', whiteSpace:'normal', lineHeight:1.25, userSelect:'none', background:'#f3f4f6', verticalAlign:'middle' };
  const TD = { padding:'5px 8px', borderRight:'1px solid #e5e7eb', borderBottom:'1px solid #e5e7eb', fontSize:'0.74rem', color:'#1f2937', userSelect:'text', cursor:'cell', verticalAlign:'top', lineHeight:1.5, wordBreak:'break-word', overflowWrap:'break-word', whiteSpace:'normal' };
  const PB = { padding:'5px 10px', border:'1px solid var(--border)', borderRadius:6, background:'#fff', cursor:'pointer', fontSize:'0.72rem', color:'#374151' };
  const BB = { fontSize:'0.72rem', padding:'5px 12px', borderRadius:6, border:'1px solid #93c5fd', background:'#fff', cursor:'pointer', color:'#1e40af', fontWeight:600, display:'flex', alignItems:'center', gap:4 };

  if (authLoading || !user) return <div className="page-loading">Loading...</div>;

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 className={`page-title${viewDeleted ? ' m-keep' : ''}`} style={{ marginBottom:2, fontSize:'1.3rem' }}>{viewDeleted ? <><MI name="delete_sweep" size={22}/> {t('Deleted leads')}</> : t('Lead Management')}</h1>
          <p style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>{viewDeleted ? t('{n} deleted leads', { n: total }) : t('{n} total leads', { n: total })} • {t('Page')} {page}/{totalPages}</p>
        </div>
        <div className="m-scroll-x m-full" style={{ display:'flex', gap:6, flexWrap:'wrap', whiteSpace:'nowrap' }}>
          {viewDeleted ? (
            <button onClick={() => setViewDeleted(false)} className="btn btn-primary" style={{ fontSize:'0.75rem' }}><MI name="arrow_back" size={14}/> {t('Back to leads')}</button>
          ) : (
            isAdmin && <button onClick={() => setViewDeleted(true)} className="btn btn-ghost" style={{ fontSize:'0.75rem', border:'1px solid #dc2626', color:'#dc2626' }}><MI name="delete_sweep" size={14}/> {t('Deleted leads')}</button>
          )}
          {!viewDeleted && <button onClick={() => setShowBulkLookup(!showBulkLookup)} className="btn btn-ghost" style={{ fontSize:'0.75rem' }}><MI name="search" size={14}/> {t('Bulk Lookup')}</button>}
          {!viewDeleted && <button onClick={() => setShowUploadModal(true)} className="btn btn-ghost" style={{ fontSize:'0.75rem', border:'1px solid #10b981', color:'#10b981' }}><MI name="upload_file" size={14}/> {t('Bulk Upload')}</button>}
          {!viewDeleted && !isMobile && <button onClick={() => setShowAddModal(true)} className="btn btn-primary" style={{ fontSize:'0.75rem' }}><MI name="add" size={14}/> {t('Add Lead')}</button>}
          {!viewDeleted && <button onClick={handleExport} disabled={exporting} className="btn btn-success" style={{ fontSize:'0.75rem' }}><MI name="download" size={14}/> {t('Export')}</button>}
        </div>
      </div>

      {/* Stats Row */}
      {stats && !viewDeleted && (
        <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(3,minmax(0,1fr))' : 'repeat(auto-fit,minmax(120px,1fr))', gap: isMobile ? 6 : 8, marginBottom: isMobile ? 12 : 16 }}>
          {[
            { l:t('Total'), v:stats.total, c:'#3b82f6', i:'groups' },
            { l:t('HOT'), v:stats.hot, c:'#ef4444', i:'local_fire_department' },
            { l:t('HIGH'), v:stats.high, c:'#22c55e', i:'bolt' },
            { l:t('Active'), v:stats.active, c:'#8b5cf6', i:'trending_up' },
            { l:t('Signed'), v:stats.signed, c:'#10b981', i:'verified' },
            { l:t('Partners'), v:stats.partner, c:'#f59e0b', i:'handshake' },
          ].map(s => (
            <div key={s.l} style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding: isMobile ? '8px 6px' : '10px 14px', textAlign:'center' }}>
              {!isMobile && <MI name={s.i} size={18}/>}<div style={{ fontSize: isMobile ? '1.1rem' : '1.3rem', fontWeight:800, color:s.c, marginTop:2 }}>{s.v}</div>
              <div style={{ fontSize:'0.65rem', color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.5px' }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk Lookup Panel */}
      {showBulkLookup && !viewDeleted && (
        <div style={{ background:'#f8fafc', border:'1px solid var(--border)', borderRadius:10, padding:14, marginBottom:14 }}>
          <div style={{ fontSize:'0.8rem', fontWeight:600, marginBottom:4 }}>{t('Bulk Lookup — paste a list to find many leads at once')}</div>
          <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginBottom:8 }}>{t('One per line (or comma-separated): lead IDs, company names, contact names, emails, phone numbers, Telegram…')}</div>
          <textarea rows={4} value={bulkLookupText} onChange={e => setBulkLookupText(e.target.value)} placeholder={'12\nООО «Ромашка»\nivanov@mail.ru\n+7 916 000-00-00'} style={{ width:'100%', padding:8, borderRadius:8, border:'1px solid var(--border)', fontSize:'0.78rem', resize:'vertical', fontFamily:'inherit' }}/>
          <div style={{ display:'flex', gap:6, marginTop:8 }}>
            <button onClick={handleBulkLookup} className="btn btn-primary" style={{ fontSize:'0.72rem' }}>{t('Search')}</button>
            <button onClick={() => { setShowBulkLookup(false); clearBulkLookup(); }} className="btn btn-ghost" style={{ fontSize:'0.72rem' }}>{t('Clear')}</button>
          </div>
        </div>
      )}
      {filters.lookup && !showBulkLookup && !viewDeleted && (
        <div style={{ display:'flex', alignItems:'center', gap:8, background:'#eef2ff', border:'1px solid #c7d2fe', color:'#3730a3', borderRadius:10, padding:'8px 12px', marginBottom:14, fontSize:'0.76rem' }}>
          <MI name="manage_search" size={16}/> {t('Bulk Lookup active — {n} matching leads', { n: total })}
          <button onClick={() => setShowBulkLookup(true)} className="btn btn-sm btn-ghost" style={{ marginLeft:'auto', fontSize:'0.7rem' }}>{t('Edit list')}</button>
          <button onClick={clearBulkLookup} className="btn btn-sm btn-ghost" style={{ fontSize:'0.7rem' }}><MI name="close" size={14}/> {t('Clear')}</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14, alignItems:'center' }}>
        <input type="search" enterKeyHint="search" placeholder={t('Search anything — company, name, email, phone, Telegram, city, ID…')} value={filters.search}
          onChange={e => setFilters(f => ({...f, search: e.target.value}))} style={{ flex:1, minWidth:180, padding: isMobile ? '10px 12px' : '7px 12px', borderRadius: isMobile ? 12 : 8, border:'1px solid var(--border)', fontSize:'0.78rem' }}/>
        {isMobile && (() => { const n = [filters.priority, filters.sector, filters.status].filter(Boolean).length; return (
          <button type="button" onClick={() => setShowFilters(s => !s)} aria-expanded={showFilters}
            style={{ height:44, padding:'0 12px', borderRadius:12, border:`1px solid ${n || showFilters ? 'var(--primary)' : 'var(--border)'}`, background: n || showFilters ? '#eef2ff' : '#fff', color: n || showFilters ? 'var(--primary)' : '#475569', fontWeight:600, fontSize:'0.8rem', display:'flex', alignItems:'center', gap:4 }}>
            <MI name="tune" size={18}/>{n ? n : ''}
          </button>); })()}
        {(!isMobile || showFilters) && <div style={ isMobile ? { display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, width:'100%' } : { display:'contents' } }>
        <select value={filters.priority} onChange={e => setFilters(f => ({...f, priority: e.target.value}))} style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', fontSize:'0.75rem' }}>
          <option value="">{t('All priorities')}</option>{Object.entries(PC).map(([v,c]) => <option key={v} value={v}>{t(c.label)}</option>)}
        </select>
        <select value={filters.sector} onChange={e => setFilters(f => ({...f, sector: e.target.value}))} style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', fontSize:'0.75rem' }}>
          <option value="">{t('All sectors')}</option>{Object.entries(SL).map(([v,l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({...f, status: e.target.value}))} style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', fontSize:'0.75rem' }}>
          <option value="">{t('All statuses')}</option>{Object.entries(SC).map(([v,c]) => <option key={v} value={v}>{t(c.label)}</option>)}
        </select>
        <select value={perPage} onChange={e => setPerPage(Number(e.target.value))} style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', fontSize:'0.75rem', width:80 }}>
          {[25,50,100,200].map(n => <option key={n} value={n}>{n}/{t('pg')}</option>)}
        </select>
        <button onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')} title={sortOrder === 'desc' ? t('Newest first') : t('Oldest first')}
          style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--border)', fontSize:'0.72rem', cursor:'pointer', background: sortOrder === 'asc' ? '#eff6ff' : '#fff', color: sortOrder === 'asc' ? '#2563eb' : '#6b7280', fontWeight:600, display:'flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }}>
          <MI name={sortOrder === 'desc' ? 'arrow_downward' : 'arrow_upward'} size={14}/> {sortOrder === 'desc' ? t('Newest') : t('Oldest')}
        </button>
        </div>}
        {(filters.search||filters.priority||filters.sector||filters.status||filters.lookup) && (
          <button onClick={() => { setFilters({sector:'',priority:'',status:'',search:'',lookup:''}); setBulkLookupText(''); }} style={{ fontSize:'0.7rem', color:'#9ca3af', border:'1px solid var(--border)', borderRadius:8, padding:'7px 12px', cursor:'pointer', background:'#fff' }}>✕ {t('Clear')}</button>
        )}
      </div>

      {/* Range Selector + Bulk Actions Bar */}
      {viewDeleted && <div style={{ padding:'8px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, marginBottom:12, fontSize:'0.78rem', color:'#991b1b' }}><MI name="info" size={14}/> {t('Deleted leads are kept here with their full history. Restore brings a lead back to the main list; Delete permanently erases it for good.')}</div>}
      {!viewDeleted && !isMobile && <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: selected.size > 0 ? 0 : 12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:'0.72rem', color:'#6b7280' }}>
          <span style={{ fontWeight:600 }}>{t('Select Range')}:</span>
          <input type="number" placeholder={t('From ID')} value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} style={{ width:70, padding:'4px 6px', borderRadius:6, border:'1px solid var(--border)', fontSize:'0.72rem' }}/>
          <span>→</span>
          <input type="number" placeholder={t('To ID')} value={rangeTo} onChange={e => setRangeTo(e.target.value)} style={{ width:70, padding:'4px 6px', borderRadius:6, border:'1px solid var(--border)', fontSize:'0.72rem' }}/>
          <button onClick={handleRangeSelect} style={{ ...BB, padding:'4px 10px', fontSize:'0.68rem' }}><MI name="select_all" size={13}/> {t('Select')}</button>
        </div>
      </div>}

      {selected.size > 0 && !viewDeleted && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', background:'#eff6ff', borderRadius:10, marginBottom:12, border:'1px solid #bfdbfe', flexWrap:'wrap',
          ...(isMobile ? { position:'sticky', bottom:'calc(74px + env(safe-area-inset-bottom))', zIndex:30, boxShadow:'0 8px 28px rgba(30,64,175,0.22)', borderRadius:14, padding:'10px 12px' } : {}) }}>
          <span style={{ fontSize:'0.78rem', fontWeight:700, color:'#1e40af' }}>{t('{n} selected', { n: selected.size })}</span>
          <span style={{ width:1, height:20, background:'#bfdbfe' }}/>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} style={{ padding:'5px 8px', borderRadius:6, border:'1px solid #93c5fd', fontSize:'0.72rem' }}>
            <option value="">{t('Set status…')}</option>{Object.entries(SC).map(([v,c]) => <option key={v} value={v}>{t(c.label)}</option>)}
          </select>
          <button onClick={handleBulkStatus} disabled={!bulkStatus} className="btn btn-primary" style={{ fontSize:'0.72rem', padding:'5px 14px' }}>{t('Apply')}</button>
          <span style={{ width:1, height:20, background:'#bfdbfe' }}/>
          <div style={{ position:'relative' }}>
            <button onClick={() => setShowBulkTpl(!showBulkTpl)} style={BB}>
              <MI name="description" size={13}/> {t('Set Template')}
            </button>
            {showBulkTpl && (
              <div style={{ position:'absolute', ...(isMobile ? { bottom:'100%', marginBottom:4, width:'min(280px, 80vw)' } : { top:'100%', width:280 }), left:0, background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,.15)', marginTop:4, zIndex:100 }}>
                <input autoFocus type="text" placeholder={t('Search template…')} value={bulkTplSearch} onChange={e => setBulkTplSearch(e.target.value)}
                  style={{ width:'100%', padding:'8px 10px', border:'none', borderBottom:'1px solid #e5e7eb', fontSize:'0.72rem', outline:'none' }}/>
                <div style={{ maxHeight:200, overflowY:'auto' }}>
                  {templates.filter(t => !bulkTplSearch || [t.name,t.subject,t.body].join(' ').toLowerCase().includes(bulkTplSearch.toLowerCase())).map(t => (
                    <div key={t.id} onClick={() => handleBulkTemplate(t.id)} style={{ padding:'6px 10px', cursor:'pointer', fontSize:'0.7rem', borderBottom:'1px solid #f8fafc' }}
                      onMouseOver={e => e.currentTarget.style.background='#eff6ff'} onMouseOut={e => e.currentTarget.style.background='#fff'}>
                      <div style={{ fontWeight:600 }}>{t.name}</div>
                      {t.subject && <div style={{ fontSize:'0.62rem', color:'#6b7280', marginTop:1 }}>{t.subject}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <span style={{ width:1, height:20, background:'#bfdbfe' }}/>
          <button onClick={() => { const emails = leads.filter(l => selected.has(l.id) && l.email).map(l => l.email).join(', '); if(emails){navigator.clipboard.writeText(emails);alert(t('{n} emails copied!', { n: emails.split(',').length }))}else{alert(t('No emails found'))} }} style={BB}>
            <MI name="mail" size={13}/> {t('Copy Emails')}
          </button>
          <button onClick={() => { const phones = leads.filter(l => selected.has(l.id) && l.phone).map(l => l.phone).join(', '); if(phones){navigator.clipboard.writeText(phones);alert(t('{n} phones copied!', { n: phones.split(',').length }))}else{alert(t('No phone numbers found'))} }} style={BB}>
            <MI name="call" size={13}/> {t('Copy Phones')}
          </button>
          <span style={{ width:1, height:20, background:'#bfdbfe' }}/>
          <button onClick={() => setSelected(new Set())} style={{ fontSize:'0.72rem', color:'#6b7280', background:'none', border:'none', cursor:'pointer' }}>{t('Deselect all')}</button>
        </div>
      )}

      {/* Table */}
      {/* The placeholder only shows on the first load; a refresh after a save keeps the current rows on
          screen and swaps them in place, so the page stays scrolled where the person was working. */}
      {loading && leads.length === 0 ? <div style={{ textAlign:'center', padding:40, color:'var(--text-muted)' }}>{t('Loading…')}</div> : leads.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}><MI name={viewDeleted ? 'delete_sweep' : 'groups'} size={40}/><p style={{ marginTop:8 }}>{viewDeleted ? t('No deleted leads') : t('No leads found')}</p></div>
      ) : isMobile ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10, opacity: loading ? 0.65 : 1, transition:'opacity .15s' }}>
          {!viewDeleted && (
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.76rem', color:'#64748b', padding:'0 4px' }}>
              <input type="checkbox" checked={selected.size === leads.length && leads.length > 0} onChange={toggleSelectAll}/> {t('Select all on this page')}
            </label>
          )}
          {leads.map(l => (
            <LeadCard key={l.id} l={l} t={t} lang={lang} viewDeleted={viewDeleted} selected={selected.has(l.id)}
              onToggle={() => toggleSelect(l.id)} onStatus={(v) => handleStatusChange(l.id, v)} onPriority={(v) => handlePriorityChange(l.id, v)}
              onLog={() => setLogLead(l)} onFollowUp={() => leadFu.create(l)} onEdit={() => setEditLead(l)} onDelete={() => handleDelete(l.id)}
              onRestore={() => handleRestore(l.id)} onPurge={() => handlePurge(l.id)}
              template={<TemplateSelector t={t} leadId={l.id} currentId={l.last_template_id} templates={templates} onChange={handleTemplateChange} tplSearch={tplSearch} setTplSearch={setTplSearch} />} />
          ))}
        </div>
      ) : (
        <div style={{ overflowX:'auto', borderRadius:10, border:'1px solid var(--border)', opacity: loading ? 0.65 : 1, transition:'opacity .15s' }}>
          <table style={{ width:'100%', minWidth: 1700, borderCollapse:'collapse', fontSize:'0.76rem', tableLayout:'fixed' }}>
            <thead>
              <tr style={{ background:'#f8fafc', borderBottom:'2px solid var(--border)' }}>
                <th style={{ padding:'10px 8px', width:36, textAlign:'center' }}>
                  {!viewDeleted && <input type="checkbox" checked={selected.size === leads.length && leads.length > 0} onChange={toggleSelectAll} style={{ cursor:'pointer' }}/>}
                </th>
                <th style={{...TH, width:40}}>#</th>
                <th style={{...TH, width:'12%'}}>{t('Company')}</th>
                <th style={{...TH, width:'7%'}}>{t('Industry')}</th>
                <th style={{...TH, width:'7%'}}>{t('City/Region')}</th>
                <th style={{...TH, width:'4%'}}>{t('Size')}</th>
                <th style={{...TH, width:'9%'}}>{t('Requirement needed')}</th>
                <th style={{...TH, width:'7%'}}>{t('Decision maker name')}</th>
                <th style={{...TH, width:'8%'}}>{t('Source of lead')}</th>
                <th style={{...TH, width:'7%'}}>{t('Mobile number (personal)')}</th>
                <th style={{...TH, width:'7%'}}>{t('Telephone')}</th>
                <th style={{...TH, width:'9%'}}>{t('Email')}</th>
                <th style={{...TH, width:'8%'}}>{t('Priority')}</th>
                <th style={{...TH, width:'10%'}}>{t('Status')}</th>
                <th style={{...TH, width:'8%'}}>{t('Comment')}</th>
                <th style={{...TH, width:'9%'}}>{viewDeleted ? t('Deleted by') : t('Template Used')}</th>
                <th style={{...TH, width:'6%'}}>{t('Logs')}</th>
                <th style={{width:62}}></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l, i) => {
                const sc = SC[l.status] || SC.not_contacted;
                const pc = PC[l.priority] || PC.MEDIUM;
                const isSel = selected.has(l.id);
                return (
                  <tr key={l.id} style={{ backgroundColor: isSel ? '#eff6ff' : sc.row, borderBottom:'1px solid #f1f5f9', transition:'background .15s' }}>
                    <td style={{ padding:'8px', textAlign:'center' }}>
                      {!viewDeleted && <input type="checkbox" checked={isSel} onChange={() => toggleSelect(l.id)} style={{ cursor:'pointer' }}/>}
                    </td>
                    <td tabIndex={0} style={{...TD, fontFamily:'monospace', fontSize:'0.68rem', color:'#9ca3af', borderRight:'1px solid #e5e7eb'}}>{l.project_seq ?? l.id}</td>
                    <td tabIndex={0} style={{...TD}}>
                      <div style={{ fontWeight:600, fontSize:'0.78rem', color:'var(--text)', wordBreak:'break-word' }}>{l.company_name}</div>
                      {l.domain && <div style={{ fontSize:'0.64rem', color:'#9ca3af', marginTop:1, wordBreak:'break-all' }}>{l.domain}</div>}
                    </td>
                    <td tabIndex={0} style={TD}>{SL[l.sector] ? t(SL[l.sector]) : (l.sector||'—')}</td>
                    <td tabIndex={0} style={TD}>{[l.city,l.region].filter(Boolean).join(', ')||'—'}</td>
                    <td tabIndex={0} style={TD}>{l.company_size||'—'}</td>
                    <td tabIndex={0} style={{...TD, fontSize:'0.7rem', lineHeight:1.4}}>{l.pain_point||'—'}</td>
                    <td tabIndex={0} style={TD}>{l.decision_maker_title||'—'}</td>
                    <td tabIndex={0} style={{...TD, fontSize:'0.68rem', lineHeight:1.4}}>{l.find_instructions||'—'}</td>
                    <td tabIndex={0} style={{...TD, fontFamily:'monospace', fontSize:'0.66rem', wordBreak:'break-all'}}>{l.mobile_personal||'—'}</td>
                    <td tabIndex={0} style={{...TD, fontFamily:'monospace', fontSize:'0.66rem', wordBreak:'break-all'}}>{l.phone||'—'}</td>
                    <td tabIndex={0} style={{...TD, fontSize:'0.68rem', wordBreak:'break-all'}}>
                      {l.email ? <a href={`mailto:${l.email}`} style={{color:'#2563eb'}}>{l.email}</a> : '—'}
                      <div style={{ marginTop:4 }}><ContactBadges l={l} size="small" /></div>
                    </td>
                    <td style={TD}>
                      {viewDeleted ? <span style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.68rem', fontWeight:700, background:pc.bg, color:pc.text, whiteSpace:'nowrap' }}>{t(pc.label)}</span> : (
                      <select value={l.priority} onChange={e => handlePriorityChange(l.id, e.target.value)}
                        style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:'0.72rem', fontWeight:700, background:pc.bg, color:pc.text, cursor:'pointer', width:'100%' }}>
                        {Object.entries(PC).map(([v,c]) => <option key={v} value={v}>{t(c.label)}</option>)}
                      </select>)}
                    </td>
                    <td style={TD}>
                      {viewDeleted ? <span style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.68rem', fontWeight:600, background:sc.bg, color:sc.text, whiteSpace:'nowrap' }}>{t(sc.label)}</span> : (
                      <select value={l.status} onChange={e => handleStatusChange(l.id, e.target.value)}
                        style={{ padding:'4px 8px', borderRadius:8, border:'1px solid #e5e7eb', fontSize:'0.72rem', fontWeight:600, background:sc.bg, color:sc.text, cursor:'pointer', width:'100%' }}>
                        {Object.entries(SC).map(([v,c]) => <option key={v} value={v}>{t(c.label)}</option>)}
                      </select>)}
                    </td>
                    <td tabIndex={0} style={{...TD, fontSize:'0.7rem', maxWidth:180, whiteSpace:'normal', lineHeight:1.4}}>{l.notes||'—'}</td>
                    <td style={{...TD, minWidth:180, position:'relative'}}>
                      {viewDeleted ? (
                        <div style={{ fontSize:'0.7rem' }}>
                          <div style={{ fontWeight:600, color:'#991b1b' }}>{l.deleted_by_name || '—'}</div>
                          <div style={{ color:'#9ca3af' }}>{l.deleted_at ? new Date(l.deleted_at).toLocaleString(lang === 'ru' ? 'ru-RU' : undefined) : ''}</div>
                          {l.delete_comment && <div style={{ marginTop:3, color:'#92400e', background:'#fffbeb', borderRadius:6, padding:'2px 6px', whiteSpace:'pre-wrap' }}>💬 {l.delete_comment}</div>}
                        </div>
                      ) : (
                        <TemplateSelector t={t} leadId={l.id} currentId={l.last_template_id} templates={templates} onChange={handleTemplateChange} tplSearch={tplSearch} setTplSearch={setTplSearch} />
                      )}
                    </td>
                    <td style={{...TD, textAlign:'center'}}>
                      <button onClick={() => setLogLead(l)} style={{ ...BB, padding:'4px 8px', fontSize:'0.66rem', justifyContent:'center', width:'100%' }}>
                        <MI name="history" size={13}/> {t('View log')}
                      </button>
                      {!viewDeleted && (l.next_followup_at
                        ? <div style={{ marginTop:4 }}><DueChip compact iso={l.next_followup_at} t={t} lang={lang} onClick={() => setLogLead(l)} /></div>
                        : <button onClick={() => leadFu.create(l)} title={t('Schedule a follow-up')} style={{ ...BB, marginTop:4, padding:'3px 6px', fontSize:'0.62rem', justifyContent:'center', width:'100%', color:'#64748b' }}><MI name="event" size={12}/> {t('Follow-up')}</button>)}
                    </td>
                    <td style={{padding:'8px 4px', textAlign:'center', whiteSpace:'nowrap'}}>
                      {viewDeleted ? (<>
                        <button onClick={() => handleRestore(l.id)} title={t('Restore')} style={{ background:'none', border:'none', cursor:'pointer', color:'#059669' }}><MI name="restore_from_trash" size={16}/></button>
                        <button onClick={() => handlePurge(l.id)} title={t('Delete permanently')} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626' }}><MI name="delete_forever" size={16}/></button>
                      </>) : (<>
                      <button onClick={() => setEditLead(l)} title={t('Edit')} style={{ background:'none', border:'none', cursor:'pointer', color:'#2563eb' }}><MI name="edit" size={15}/></button>
                      <button onClick={() => handleDelete(l.id)} title={t('Delete')} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626' }}><MI name="delete" size={15}/></button>
                      </>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:6, marginTop:16 }}>
          {(() => { const W = isMobile ? 3 : 7, half = Math.floor(W / 2), pb = isMobile ? { ...PB, minWidth:42, height:42, fontSize:'0.9rem', borderRadius:10 } : PB; return (<>
          <button onClick={() => setPage(1)} disabled={page===1} style={pb}>«</button>
          <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} style={pb}>‹</button>
          {Array.from({length: Math.min(W, totalPages)}, (_, i) => {
            let p;
            if (totalPages <= W) p = i+1;
            else if (page <= half+1) p = i+1;
            else if (page >= totalPages-half) p = totalPages-W+1+i;
            else p = page-half+i;
            return <button key={p} onClick={() => setPage(p)} style={{...pb, background: p===page ? 'var(--primary)' : '#fff', color: p===page ? '#fff' : '#374151', fontWeight: p===page ? 700 : 400}}>{p}</button>;
          })}
          <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} style={pb}>›</button>
          <button onClick={() => setPage(totalPages)} disabled={page===totalPages} style={pb}>»</button>
          </>); })()}
        </div>
      )}

      {isMobile && !viewDeleted && selected.size === 0 && (
        <button type="button" className="m-fab" onClick={() => setShowAddModal(true)} aria-label={t('Add Lead')}><MI name="add" size={26}/></button>
      )}
      {showAddModal && <LeadFormModal t={t} projectId={projectId} onClose={() => setShowAddModal(false)} onDone={() => { fetchLeads(); fetchStats(); setShowAddModal(false); }} />}
      {editLead && <LeadFormModal t={t} projectId={projectId} lead={editLead} onClose={() => setEditLead(null)} onDone={() => { fetchLeads(); fetchStats(); setEditLead(null); }} />}
      {pending && <CommentPrompt t={t} title={pending.title} detail={pending.detail} danger={pending.danger} askDate={pending.askDate} onCancel={() => setPending(null)} onConfirm={async (comment, extra) => { const run = pending.run; setPending(null); await run(comment, extra); }} />}
      {logLead && <LeadLogModal t={t} lang={lang} lead={logLead} projectId={projectId} readOnly={!!logLead.deleted_at} onChanged={() => { fetchLeads(); fetchStats(); }} onClose={() => setLogLead(null)} />}
      {leadFu.modals(projectId)}
      {showUploadModal && <BulkUploadModal t={t} lang={lang} onClose={() => setShowUploadModal(false)} projectId={projectId} onImportDone={() => { fetchLeads(); fetchStats(); }} />}
    </div>
  );
}

const TH = { padding:'10px 8px', textAlign:'left', fontSize:'0.7rem', fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.5px', whiteSpace:'nowrap' };
const TD = { padding:'8px', fontSize:'0.75rem', color:'#4b5563' };
const PB = { width:32, height:32, borderRadius:8, border:'1px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:'0.78rem', display:'flex', alignItems:'center', justifyContent:'center' };

function LeadFormModal({ t, projectId, lead, onClose, onDone }) {
  const isEdit = !!lead;
  const empty = { company_name:'', domain:'', sector:'manufacturing', priority:'MEDIUM', status:'not_contacted', city:'', region:'', company_size:'', pain_point:'', decision_maker_title:'', find_instructions:'', mobile_personal:'', phone:'', email:'', telegram:'', max_messenger:'', notes:'' };
  const [f, setF] = useState(() => isEdit ? Object.fromEntries(Object.keys(empty).map(k => [k, lead[k] ?? ''])) : empty);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // Moving a lead into "Follow Up Later" asks when — the API schedules a follow-up for that date
  const askFu = f.status === 'follow_up_later' && (!isEdit || lead.status !== 'follow_up_later');
  const [fuDate, setFuDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [fuTime, setFuTime] = useState('10:00');
  async function save(e) {
    e.preventDefault(); setErr('');
    if (!comment.trim()) { setErr(t(isEdit ? 'Please enter a comment describing this change' : 'Please enter a comment for this lead')); return; }
    let extra = {};
    if (askFu) {
      const fu = followupFields(fuDate, fuTime);
      if (!fu) { setErr(t('Pick a date and time')); return; }
      extra = { ...fu, followup_title: t('Follow up later') };
    }
    setSaving(true);
    try {
      const r = isEdit
        ? await fetch(`/api/leads/${lead.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...f, comment, ...extra }) })
        : await fetch('/api/leads', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...f, project_id: projectId, comment, ...extra }) });
      if (r.ok) { onDone(); return; }
      const d = await r.json().catch(() => ({}));
      setErr(t(d.error || (r.status >= 500 ? 'Server error — the database may be unavailable. Please try again shortly.' : 'Failed')));
    } catch (e) { setErr(t('Cannot reach the server. Check your connection and try again.')); }
    finally { setSaving(false); }
  }
  return (
    <div className="leads-modal-overlay" onClick={onClose}>
      <div className="leads-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontSize:'1rem', fontWeight:700 }}>{isEdit ? `${t('Edit lead')} · #${lead.project_seq ?? lead.id}` : t('Add New Lead')}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.2rem', cursor:'pointer', color:'#94a3b8' }}>✕</button>
        </div>
        {err && <div style={{ background:'#fef2f2', color:'#dc2626', padding:'8px 12px', borderRadius:8, fontSize:'0.78rem', marginBottom:12 }}>{err}</div>}
        <form onSubmit={save}>
          <div className="leads-form-grid">
            <div className="leads-form-field"><label>{t('Company')} *</label><input required value={f.company_name} onChange={e => setF({...f, company_name:e.target.value})}/></div>
            <div className="leads-form-field"><label>{t('Domain')}</label><input value={f.domain} onChange={e => setF({...f, domain:e.target.value})}/></div>
            <div className="leads-form-field"><label>{t('Sector')}</label><select value={f.sector} onChange={e => setF({...f, sector:e.target.value})}>{Object.entries(SL).map(([v,l]) => <option key={v} value={v}>{t(l)}</option>)}</select></div>
            <div className="leads-form-field"><label>{t('Priority')}</label><select value={f.priority} onChange={e => setF({...f, priority:e.target.value})}><option value="HOT">{t('HOT')}</option><option value="HIGH">{t('HIGH')}</option><option value="MEDIUM">{t('MEDIUM')}</option><option value="PARTNER">{t('PARTNER')}</option></select></div>
            <div className="leads-form-field"><label>{t('Status')}</label><select value={f.status} onChange={e => setF({...f, status:e.target.value})}>{Object.entries(SC).map(([v,c]) => <option key={v} value={v}>{t(c.label)}</option>)}</select></div>
            {askFu && <div style={{ gridColumn:'1/-1' }}><FollowUpDateFields t={t} date={fuDate} time={fuTime} setDate={setFuDate} setTime={setFuTime} /></div>}
            <div className="leads-form-field"><label>{t('City')}</label><input value={f.city} onChange={e => setF({...f, city:e.target.value})}/></div>
            <div className="leads-form-field"><label>{t('Size')}</label><input value={f.company_size} onChange={e => setF({...f, company_size:e.target.value})} placeholder="50-100"/></div>
            <div className="leads-form-field"><label>{t('Decision maker name')}</label><input value={f.decision_maker_title} onChange={e => setF({...f, decision_maker_title:e.target.value})}/></div>
            <div className="leads-form-field"><label>{t('Mobile number (personal)')}</label><input value={f.mobile_personal} onChange={e => setF({...f, mobile_personal:e.target.value})} placeholder="+7 916 000-00-00"/></div>
            <div className="leads-form-field"><label>{t('Telephone')}</label><input value={f.phone} onChange={e => setF({...f, phone:e.target.value})} placeholder="+7 495 123-45-67"/></div>
            <div className="leads-form-field"><label>{t('Email')}</label><input type="email" value={f.email} onChange={e => setF({...f, email:e.target.value})}/></div>
            <div className="leads-form-field"><label><MI name="send" size={13}/> {t('Telegram')}</label><input value={f.telegram} onChange={e => setF({...f, telegram:e.target.value})} placeholder={t('@username or phone')}/></div>
            <div className="leads-form-field"><label><MI name="chat" size={13}/> {t('Max Messenger')}</label><input value={f.max_messenger} onChange={e => setF({...f, max_messenger:e.target.value})} placeholder={t('username or link')}/></div>
            <div className="leads-form-field" style={{gridColumn:'1/-1'}}><label>{t('Source of lead')}</label><input value={f.find_instructions} onChange={e => setF({...f, find_instructions:e.target.value})} placeholder={t('e.g. exhibition, LinkedIn, referral')}/></div>
            <div className="leads-form-field" style={{gridColumn:'1/-1'}}><label>{t('Requirement needed')}</label><textarea rows={2} value={f.pain_point} onChange={e => setF({...f, pain_point:e.target.value})}/></div>
            <div className="leads-form-field" style={{gridColumn:'1/-1'}}><label>{t('Comment')}</label><textarea rows={2} value={f.notes} onChange={e => setF({...f, notes:e.target.value})}/></div>
            <div className="leads-form-field" style={{gridColumn:'1/-1', padding:'10px 12px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8 }}>
              <label style={{ color:'#92400e' }}>{t(isEdit ? 'Comment for this change' : 'Log comment for this lead')} *</label>
              <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder={t(isEdit ? 'Why are you making this change?' : 'e.g. met at exhibition, asked for a quote')} style={{ fontFamily:'inherit' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost">{t('Cancel')}</button>
            <button type="submit" disabled={saving} className="btn btn-primary">{saving ? t('Saving…') : isEdit ? t('Save changes') : t('Add Lead')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Phone layout: one card per lead instead of the wide spreadsheet table. Every action the table row has
// is here too; phone numbers and emails are tap-to-call / tap-to-mail.
function LeadCard({ l, t, lang, viewDeleted, selected, onToggle, onStatus, onPriority, onLog, onFollowUp, onEdit, onDelete, onRestore, onPurge, template }) {
  const [more, setMore] = useState(false);
  const sc = SC[l.status] || SC.not_contacted;
  const pc = PC[l.priority] || PC.MEDIUM;
  const place = [SL[l.sector] ? t(SL[l.sector]) : l.sector, [l.city, l.region].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const tel = (v) => `tel:${String(v).replace(/[^\d+]/g, '')}`;
  const chip = { display:'inline-flex', alignItems:'center', gap:5, padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', background:'#fff', color:'#334155', fontSize:'0.78rem', fontWeight:600, textDecoration:'none', cursor:'pointer', fontFamily:'inherit', minHeight:38 };
  const sel = (bg, color) => ({ width:'100%', padding:'9px 10px', borderRadius:10, border:'1px solid rgba(0,0,0,0.06)', fontWeight:700, background:bg, color, appearance:'auto' });
  const field = (label, value) => value ? <div style={{ minWidth:0 }}><div style={{ fontSize:'0.64rem', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.3px' }}>{label}</div><div style={{ fontSize:'0.8rem', color:'#1f2937', wordBreak:'break-word', whiteSpace:'pre-wrap' }}>{value}</div></div> : null;
  return (
    <div style={{ background: selected ? '#eff6ff' : '#fff', border:`1px solid ${selected ? '#93c5fd' : 'var(--border)'}`, borderLeft:`4px solid ${sc.text}`, borderRadius:14, padding:12, boxShadow:'0 1px 3px rgba(15,23,42,0.05)' }}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
        {!viewDeleted && <input type="checkbox" checked={selected} onChange={onToggle} aria-label={t('Select')} style={{ marginTop:3, flexShrink:0 }}/>}
        <div style={{ flex:1, minWidth:0 }} onClick={onLog} role="button">
          <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
            <span style={{ fontFamily:'monospace', fontSize:'0.72rem', color:'#94a3b8' }}>#{l.project_seq ?? l.id}</span>
            <span style={{ fontWeight:700, fontSize:'0.95rem', color:'var(--text)', wordBreak:'break-word' }}>{l.company_name}</span>
          </div>
          {place && <div style={{ fontSize:'0.74rem', color:'#64748b', marginTop:2 }}>{place}</div>}
          {l.decision_maker_title && <div style={{ fontSize:'0.78rem', color:'#334155', marginTop:4, display:'flex', alignItems:'center', gap:4 }}><MI name="person" size={15}/>{l.decision_maker_title}</div>}
        </div>
        {viewDeleted && <span style={{ padding:'3px 10px', borderRadius:20, fontSize:'0.68rem', fontWeight:700, background:pc.bg, color:pc.text, whiteSpace:'nowrap' }}>{t(pc.label)}</span>}
      </div>

      {(l.mobile_personal || l.phone || l.email) && (
        <div className="m-scroll-x" style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
          {l.mobile_personal && <a href={tel(l.mobile_personal)} style={chip}><MI name="smartphone" size={16}/>{l.mobile_personal}</a>}
          {l.phone && l.phone !== l.mobile_personal && <a href={tel(l.phone)} style={chip}><MI name="call" size={16}/>{l.phone}</a>}
          {l.email && <a href={`mailto:${l.email}`} style={{ ...chip, color:'#2563eb' }}><MI name="mail" size={16}/>{l.email}</a>}
        </div>
      )}
      <div style={{ marginTop:6 }}><ContactBadges l={l} /></div>

      {viewDeleted ? (
        <div style={{ marginTop:10, fontSize:'0.76rem' }}>
          <span style={{ padding:'3px 10px', borderRadius:20, fontWeight:600, background:sc.bg, color:sc.text }}>{t(sc.label)}</span>
          <div style={{ marginTop:8, color:'#991b1b', fontWeight:600 }}>{t('Deleted by')}: {l.deleted_by_name || '—'} <span style={{ color:'#94a3b8', fontWeight:400 }}>{l.deleted_at ? new Date(l.deleted_at).toLocaleString(lang === 'ru' ? 'ru-RU' : undefined) : ''}</span></div>
          {l.delete_comment && <div style={{ marginTop:4, color:'#92400e', background:'#fffbeb', borderRadius:8, padding:'4px 8px', whiteSpace:'pre-wrap' }}>💬 {l.delete_comment}</div>}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'minmax(0,1.3fr) minmax(0,1fr)', gap:6, marginTop:10 }}>
          <select value={l.status} onChange={e => onStatus(e.target.value)} aria-label={t('Status')} style={sel(sc.bg, sc.text)}>
            {Object.entries(SC).map(([v,c]) => <option key={v} value={v}>{t(c.label)}</option>)}
          </select>
          <select value={l.priority} onChange={e => onPriority(e.target.value)} aria-label={t('Priority')} style={sel(pc.bg, pc.text)}>
            {Object.entries(PC).map(([v,c]) => <option key={v} value={v}>{t(c.label)}</option>)}
          </select>
        </div>
      )}

      {l.notes && <div style={{ marginTop:8, fontSize:'0.76rem', color:'#475569', background:'#f8fafc', borderRadius:8, padding:'6px 8px', whiteSpace:'pre-wrap', display:'-webkit-box', WebkitLineClamp: more ? 'unset' : 2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{l.notes}</div>}

      {more && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10, padding:10, background:'#f8fafc', borderRadius:10 }}>
          {field(t('Size'), l.company_size)}
          {field(t('Requirement needed'), l.pain_point)}
          {field(t('Source of lead'), l.find_instructions)}
          {field(t('Website'), l.domain)}
          {!viewDeleted && <div style={{ gridColumn:'1 / -1' }}><div style={{ fontSize:'0.64rem', color:'#94a3b8', textTransform:'uppercase', marginBottom:4 }}>{t('Template Used')}</div>{template}</div>}
        </div>
      )}

      <div style={{ display:'flex', gap:6, marginTop:10, alignItems:'center', flexWrap:'wrap' }}>
        <button type="button" onClick={onLog} style={{ ...chip, color:'#1e40af', borderColor:'#bfdbfe', background:'#eff6ff' }}><MI name="history" size={16}/>{t('View log')}</button>
        {!viewDeleted && (l.next_followup_at
          ? <DueChip iso={l.next_followup_at} t={t} lang={lang} onClick={onLog} />
          : <button type="button" onClick={onFollowUp} style={chip}><MI name="event" size={16}/>{t('Follow-up')}</button>)}
        <div style={{ marginLeft:'auto', display:'flex', gap:2 }}>
          <button type="button" onClick={() => setMore(m => !m)} aria-label={t('More')} style={{ ...chip, padding:8, border:'none', background:'transparent' }}><MI name={more ? 'expand_less' : 'expand_more'} size={20}/></button>
          {viewDeleted ? (<>
            <button type="button" onClick={onRestore} aria-label={t('Restore')} style={{ ...chip, padding:8, border:'none', background:'transparent', color:'#059669' }}><MI name="restore_from_trash" size={20}/></button>
            <button type="button" onClick={onPurge} aria-label={t('Delete permanently')} style={{ ...chip, padding:8, border:'none', background:'transparent', color:'#dc2626' }}><MI name="delete_forever" size={20}/></button>
          </>) : (<>
            <button type="button" onClick={onEdit} aria-label={t('Edit')} style={{ ...chip, padding:8, border:'none', background:'transparent', color:'#2563eb' }}><MI name="edit" size={20}/></button>
            <button type="button" onClick={onDelete} aria-label={t('Delete')} style={{ ...chip, padding:8, border:'none', background:'transparent', color:'#dc2626' }}><MI name="delete" size={20}/></button>
          </>)}
        </div>
      </div>
    </div>
  );
}

function TemplateSelector({ t, leadId, currentId, templates, onChange, tplSearch, setTplSearch }) {
  const [open, setOpen] = useState(false);
  const search = (tplSearch[leadId] || '').toLowerCase();
  const current = templates.find(t => t.id === currentId);
  const filtered = templates.filter(t => {
    if (!search) return true;
    const tr = typeof t.translations === 'string' ? JSON.parse(t.translations || '{}') : (t.translations || {});
    const allText = [t.name, t.subject, t.body, ...Object.values(tr).map(v => `${v.subject||''} ${v.body||''}`)].join(' ').toLowerCase();
    return allText.includes(search);
  });

  if (!open) {
    return (
      <div onClick={() => setOpen(true)} style={{ cursor:'pointer', fontSize:'0.7rem', padding:'4px 8px', borderRadius:6, border:'1px solid #e5e7eb', background: current ? '#eff6ff' : '#fff', color: current ? '#1e40af' : '#9ca3af', minHeight:28, display:'flex', alignItems:'center', gap:4 }}>
        {current ? <><MI name="description" size={12}/> {current.name}</> : <><MI name="add" size={12}/> {t('Set template')}</>}
      </div>
    );
  }

  return (
    <div style={{ position:'relative', zIndex:50 }}>
      <input autoFocus type="text" placeholder={t('Search template, subject, message…')} value={tplSearch[leadId] || ''}
        onChange={e => setTplSearch(s => ({...s, [leadId]: e.target.value}))}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        style={{ width:'100%', padding:'5px 8px', borderRadius:6, border:'1px solid #93c5fd', fontSize:'0.72rem', background:'#eff6ff' }} />
      <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, maxHeight:200, overflowY:'auto', boxShadow:'0 8px 24px rgba(0,0,0,.12)', marginTop:2, zIndex:99 }}>
        <div onClick={() => { onChange(leadId, null); setOpen(false); setTplSearch(s => ({...s, [leadId]: ''})); }}
          style={{ padding:'6px 10px', fontSize:'0.7rem', color:'#9ca3af', cursor:'pointer', borderBottom:'1px solid #f1f5f9' }}>
          ✕ {t('Clear template')}
        </div>
        {filtered.map(t => (
          <div key={t.id} onClick={() => { onChange(leadId, t.id); setOpen(false); setTplSearch(s => ({...s, [leadId]: ''})); }}
            style={{ padding:'6px 10px', cursor:'pointer', fontSize:'0.7rem', borderBottom:'1px solid #f8fafc', background: t.id === currentId ? '#eff6ff' : '#fff', transition:'background .1s' }}
            onMouseOver={e => e.currentTarget.style.background='#f0f9ff'}
            onMouseOut={e => e.currentTarget.style.background= t.id === currentId ? '#eff6ff' : '#fff'}>
            <div style={{ fontWeight:600, color:'#1f2937' }}>{t.name}</div>
            {t.subject && <div style={{ fontSize:'0.64rem', color:'#6b7280', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.subject}</div>}
          </div>
        ))}
        {filtered.length === 0 && <div style={{ padding:'10px', textAlign:'center', fontSize:'0.7rem', color:'#9ca3af' }}>{t('No templates found')}</div>}
      </div>
    </div>
  );
}

function BulkUploadModal({ t, lang, onClose, projectId, onImportDone }) {
  const [tab, setTab] = useState('upload'); // upload | mapping | status
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [headers, setHeaders] = useState([]);
  const [editRows, setEditRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [uploadHistory, setUploadHistory] = useState([]);

  const LEAD_FIELDS = ['company_name','email','phone','mobile_personal','city','domain','sector','company_size','decision_maker_title','pain_point','find_instructions','notes','source_url','priority','status'];
  const FIELD_LABELS = { company_name:'Company Name', email:'Email', telegram:'Telegram', max_messenger:'Max Messenger', phone:'Telephone', mobile_personal:'Mobile number (personal)', city:'City', domain:'Domain', sector:'Industry', company_size:'Company Size', decision_maker_title:'Decision maker name', pain_point:'Requirement needed', find_instructions:'Source of lead', notes:'Comment', source_url:'Source URL', priority:'Priority', status:'Status', contact_person:'Contact Person' };

  async function handleFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx','xls','csv'].includes(ext)) { alert(t('Please upload .xlsx, .xls, or .csv file')); return; }
    setUploading(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (projectId) fd.append('project_id', projectId);
      fd.append('lang', lang || 'en');
      if (Object.keys(mapping).length) fd.append('mapping', JSON.stringify(mapping));
      const r = await fetch('/api/leads/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) { alert(t(d.error || 'Upload failed')); setUploading(false); return; }
      setPreview(d);
      setHeaders(d.headers || []);
      setMapping(d.mapping || {});
      setEditRows(d.preview || []);
    } catch (e) { alert(t('Upload error') + ': ' + e.message); }
    setUploading(false);
  }

  function handleDrop(e) { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }
  function handleFileInput(e) { handleFile(e.target.files[0]); }

  function updateCell(rowIdx, field, value) {
    setEditRows(rows => {
      const updated = [...rows];
      updated[rowIdx] = { ...updated[rowIdx], [field]: value };
      // Re-validate
      const errors = [];
      const row = updated[rowIdx];
      if (!row.company_name || row.company_name.trim().length < 2) errors.push({ field: 'company_name', msg: t('Required') });
      if (row.email && !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(row.email)) errors.push({ field: 'email', msg: t('Invalid email') });
      if (row.phone && !/^[+\d\s\-()]{6,20}$/.test(row.phone)) errors.push({ field: 'phone', msg: t('Invalid phone') });
      if (row.priority && !['HOT','HIGH','MEDIUM','PARTNER','ГОРЯЧИЙ','ВЫСОКИЙ','СРЕДНИЙ','ПАРТНЁР','ПАРТНЕР'].includes(row.priority.toUpperCase())) errors.push({ field: 'priority', msg: t('Invalid') });
      if (row.status && !['not_contacted','touch_1','touch_2','touch_3','email_sent','call_made','replied','meeting_booked','proposal_sent','negotiating','contract_signed','not_interested','follow_up_later'].includes(row.status.toLowerCase()) && !/[а-яё]/i.test(row.status)) errors.push({ field: 'status', msg: t('Invalid') });
      updated[rowIdx]._errors = errors;
      updated[rowIdx]._hasErrors = errors.length > 0;
      return updated;
    });
  }

  async function handleImport() {
    setImporting(true);
    try {
      const r = await fetch('/api/leads/upload', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: editRows, project_id: projectId, skipDuplicates: true, lang }),
      });
      const d = await r.json();
      setImportResult(d);
      if (d.added > 0) onImportDone();
    } catch (e) { alert(t('Import error') + ': ' + e.message); }
    setImporting(false);
  }

  function handleMappingChange(header, field) {
    setMapping(m => ({ ...m, [header]: field || undefined }));
  }

  async function downloadTemplate() {
    const r = await fetch(`/api/leads/upload/template?lang=${lang || 'en'}`);
    const b = await r.blob();
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = lang === 'ru' ? 'shablon_zagruzki_lidov.xlsx' : 'lead_upload_template.xlsx'; a.click();
    URL.revokeObjectURL(u);
  }

  const errorCount = editRows.filter(r => r._hasErrors && !r._isDuplicate).length;
  const dupCount = editRows.filter(r => r._isDuplicate).length;
  const cleanCount = editRows.filter(r => !r._hasErrors).length;

  const tabStyle = (t) => ({ padding: '8px 16px', border: 'none', borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent', background: 'none', color: tab === t ? '#3b82f6' : '#6b7280', fontWeight: tab === t ? 700 : 500, fontSize: '0.8rem', cursor: 'pointer' });

  return (
    <div className="leads-modal-overlay" onClick={onClose}>
      <div className="leads-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 1100, width: '95vw', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, padding: '0 0 10px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><MI name="upload_file" size={22} /> {t('Bulk Lead Upload')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
          <button onClick={() => setTab('upload')} style={tabStyle('upload')}><MI name="upload_file" size={14} /> {t('Upload')}</button>
          <button onClick={() => setTab('mapping')} style={tabStyle('mapping')}><MI name="swap_horiz" size={14} /> {t('Template Mapping')}</button>
          <button onClick={() => setTab('status')} style={tabStyle('status')}><MI name="history" size={14} /> {t('Status')}</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>

        {/* ═══ UPLOAD TAB ═══ */}
        {tab === 'upload' && (
          <div>
            {/* Download template + Drop zone */}
            {!preview && (
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <button onClick={downloadTemplate} className="btn btn-ghost" style={{ fontSize: '0.78rem', border: '1px solid #3b82f6', color: '#3b82f6' }}>
                    <MI name="download" size={14} /> {t('Download Template')}
                  </button>
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af', alignSelf: 'center' }}>{t('Excel template with all fields + sample data + field guide')}</span>
                </div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('bulk-upload-input').click()}
                  style={{
                    border: `2px dashed ${dragOver ? '#3b82f6' : '#d1d5db'}`,
                    borderRadius: 12, padding: '40px 20px', textAlign: 'center',
                    background: dragOver ? '#eff6ff' : '#fafafa', cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <MI name="cloud_upload" size={48} />
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: 8, color: '#374151' }}>
                    {uploading ? t('Processing...') : t('Drop your Excel/CSV file here')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>{t('or click to browse')} • .xlsx, .xls, .csv • {t('Max 5,000 rows')}</div>
                  <input id="bulk-upload-input" type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInput} style={{ display: 'none' }} />
                </div>
              </div>
            )}

            {/* Preview Table */}
            {preview && !importResult && (
              <div>
                {/* Stats bar */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div style={{ padding: '6px 14px', borderRadius: 8, background: '#eff6ff', color: '#1e40af', fontSize: '0.78rem', fontWeight: 600 }}>📊 {t('Total')}: {editRows.length}</div>
                  <div style={{ padding: '6px 14px', borderRadius: 8, background: '#f0fdf4', color: '#15803d', fontSize: '0.78rem', fontWeight: 600 }}>✅ {t('Clean')}: {cleanCount}</div>
                  {errorCount > 0 && <div style={{ padding: '6px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: '0.78rem', fontWeight: 600 }}>❌ {t('Errors')}: {errorCount}</div>}
                  {dupCount > 0 && <div style={{ padding: '6px 14px', borderRadius: 8, background: '#fffbeb', color: '#d97706', fontSize: '0.78rem', fontWeight: 600 }}>⚠️ {t('Duplicates')}: {dupCount}</div>}
                  <button onClick={() => { setPreview(null); setEditRows([]); setImportResult(null); }} className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: '0.72rem' }}>↺ {t('Re-upload')}</button>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto', maxHeight: 400, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', position: 'sticky', top: 0, zIndex: 2 }}>
                        <th style={{ padding: '6px 8px', textAlign: 'center', borderRight: '1px solid #d1d5db', fontSize: '0.65rem', fontWeight: 700 }}>#</th>
                        {LEAD_FIELDS.map(f => (
                          <th key={f} style={{ padding: '6px 8px', textAlign: 'left', borderRight: '1px solid #d1d5db', fontSize: '0.65rem', fontWeight: 700, whiteSpace: 'nowrap', minWidth: f === 'company_name' ? 160 : 100 }}>
                            {t(FIELD_LABELS[f])}{f === 'company_name' && ' *'}
                          </th>
                        ))}
                        <th style={{ padding: '6px 8px', fontSize: '0.65rem', fontWeight: 700, minWidth: 120 }}>{t('Status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editRows.map((row, idx) => {
                        const errorFields = new Set((row._errors || []).map(e => e.field));
                        const rowBg = row._isDuplicate ? '#fffbeb' : row._hasErrors ? '#fef2f2' : '#fff';
                        return (
                          <tr key={idx} style={{ background: rowBg }}>
                            <td style={{ padding: '4px 8px', textAlign: 'center', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', color: '#9ca3af', fontSize: '0.65rem' }}>{row._row}</td>
                            {LEAD_FIELDS.map(f => (
                              <td key={f} style={{ padding: '2px 4px', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb' }}>
                                <input
                                  value={row[f] || ''}
                                  onChange={e => updateCell(idx, f, e.target.value)}
                                  style={{
                                    width: '100%', border: errorFields.has(f) ? '2px solid #ef4444' : '1px solid transparent',
                                    borderRadius: 4, padding: '3px 6px', fontSize: '0.72rem',
                                    background: errorFields.has(f) ? '#fef2f2' : 'transparent',
                                    outline: 'none',
                                  }}
                                  onFocus={e => e.target.style.borderColor = '#3b82f6'}
                                  onBlur={e => e.target.style.borderColor = errorFields.has(f) ? '#ef4444' : 'transparent'}
                                />
                              </td>
                            ))}
                            <td style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb', fontSize: '0.68rem' }}>
                              {row._isDuplicate && <span style={{ color: '#d97706' }}>⚠️ {t('Duplicate')}</span>}
                              {row._hasErrors && !row._isDuplicate && (
                                <span style={{ color: '#dc2626' }} title={(row._errors || []).map(e => `${e.field}: ${e.msg}`).join('\n')}>
                                  ❌ {(row._errors || []).map(e => e.msg).join(', ')}
                                </span>
                              )}
                              {!row._hasErrors && !row._isDuplicate && <span style={{ color: '#15803d' }}>✅</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Import button */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button onClick={onClose} className="btn btn-ghost">{t('Cancel')}</button>
                  <button
                    onClick={handleImport}
                    disabled={importing || cleanCount === 0}
                    className="btn btn-primary"
                    style={{ fontSize: '0.82rem', padding: '10px 24px' }}
                  >
                    {importing ? '⏳ ' + t('Importing...') : '✅ ' + t('Import {n} leads', { n: cleanCount })}
                    {dupCount > 0 && ' ' + t('(skip {n} dupes)', { n: dupCount })}
                  </button>
                </div>
              </div>
            )}

            {/* Import Result */}
            {importResult && (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <MI name="check_circle" size={56} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 12, color: '#15803d' }}>{t('Import Complete!')}</h3>
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 16 }}>
                  <div style={{ padding: '10px 20px', borderRadius: 8, background: '#f0fdf4', color: '#15803d', fontWeight: 600 }}>✅ {t('Added')}: {importResult.added}</div>
                  <div style={{ padding: '10px 20px', borderRadius: 8, background: '#fffbeb', color: '#d97706', fontWeight: 600 }}>⏭️ {t('Skipped')}: {importResult.skipped}</div>
                  {importResult.errors > 0 && <div style={{ padding: '10px 20px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontWeight: 600 }}>❌ {t('Errors')}: {importResult.errors}</div>}
                </div>
                <button onClick={onClose} className="btn btn-primary" style={{ marginTop: 20 }}>{t('Done')}</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ TEMPLATE MAPPING TAB ═══ */}
        {tab === 'mapping' && (
          <div>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 16 }}>
              {t("Map your file's column names to lead fields. This helps if your file uses different column headers than our template.")}
            </p>
            {headers.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px 12px', alignItems: 'center', maxWidth: 600 }}>
                <div style={{ fontWeight: 700, fontSize: '0.72rem', color: '#6b7280' }}>{t('YOUR COLUMN')}</div>
                <div></div>
                <div style={{ fontWeight: 700, fontSize: '0.72rem', color: '#6b7280' }}>{t('MAPS TO FIELD')}</div>
                {headers.map(h => (
                  <>
                    <div key={h + '-label'} style={{ padding: '6px 10px', background: '#f3f4f6', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600 }}>{h}</div>
                    <MI key={h + '-arrow'} name="arrow_forward" size={16} />
                    <select
                      key={h + '-select'}
                      value={mapping[h] || ''}
                      onChange={e => handleMappingChange(h, e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.78rem', background: mapping[h] ? '#eff6ff' : '#fff' }}
                    >
                      <option value="">{t('(skip this column)')}</option>
                      {LEAD_FIELDS.map(f => <option key={f} value={f}>{t(FIELD_LABELS[f])}</option>)}
                    </select>
                  </>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '0.82rem' }}>
                <MI name="info" size={32} />
                <div style={{ marginTop: 8 }}>{t('Upload a file first to see column mappings')}</div>
              </div>
            )}
            {headers.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button onClick={() => { setTab('upload'); setPreview(null); }} className="btn btn-primary" style={{ fontSize: '0.78rem' }}>{t('Re-upload with this mapping')}</button>
              </div>
            )}
          </div>
        )}

        {/* ═══ STATUS TAB ═══ */}
        {tab === 'status' && (
          <div>
            {importResult ? (
              <div style={{ padding: '20px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#15803d', marginBottom: 8 }}>{t('Last Upload')}</h4>
                <div className="m-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#3b82f6' }}>{importResult.total}</div><div style={{ fontSize: '0.68rem', color: '#6b7280' }}>{t('Total')}</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d' }}>{importResult.added}</div><div style={{ fontSize: '0.68rem', color: '#6b7280' }}>{t('Added')}</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#d97706' }}>{importResult.skipped}</div><div style={{ fontSize: '0.68rem', color: '#6b7280' }}>{t('Skipped')}</div></div>
                  <div style={{ textAlign: 'center' }}><div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#dc2626' }}>{importResult.errors}</div><div style={{ fontSize: '0.68rem', color: '#6b7280' }}>{t('Errors')}</div></div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '0.82rem' }}>
                <MI name="history" size={32} />
                <div style={{ marginTop: 8 }}>{t('No uploads yet in this session')}</div>
              </div>
            )}
          </div>
        )}

        </div>
      </div>
    </div>
  );
}

function LeadLogModal({ t, lang, lead: initialLead, projectId, readOnly, onChanged, onClose }) {
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
  const created = data && !data.logs.some(l => l.kind === 'create' || /^Added lead/.test(l.action)) ? [{ at: lead.created_at, who: createdBy, icon: 'add', text: `${t('Lead created')} ${how(lead.scraped_from)}` }] : [];
  const ICONS = { create: 'add', note: 'chat', followup: 'event', watch: 'visibility', status: 'swap_horiz', priority: 'flag', template: 'description', edit: 'edit_note', delete: 'delete', restore: 'restore_from_trash', purge: 'delete_forever' };
  const describe = (l) => {
    if (l.kind === 'status') return `${t('Status')}: ${t(SC[l.from]?.label || l.from || '—')} → ${t(SC[l.to]?.label || l.to)}${l.bulk ? ` (${t('bulk')})` : ''}`;
    if (l.kind === 'priority') return `${t('Priority')}: ${t(PC[l.from]?.label || l.from || '—')} → ${t(PC[l.to]?.label || l.to)}`;
    if (l.kind === 'template') return `${t('Template')}: ${l.template || t('Clear template')}${l.bulk ? ` (${t('bulk')})` : ''}`;
    if (l.kind === 'edit') return `${t('Edited')}: ${(l.fields || []).map(f => t(FIELD_NAMES[f] || f)).join(', ')}`;
    if (l.kind === 'note') return t('Comment');
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
    if (l.kind === 'purge') return t('Permanently deleted');
    if (l.kind === 'create' || /^Added lead/.test(l.action)) return `${t('Lead created')} ${how(l.source || lead.scraped_from)}`;
    return l.action;
  };
  const entries = data ? [
    ...created,
    // status history rows only for legacy entries that have no matching activity log (new changes are logged with a comment)
    ...data.history.filter(h => !data.logs.some(l => l.kind === 'status' && Math.abs(new Date(l.created_at) - new Date(h.changed_at)) < 5000)).map(h => ({ at: h.changed_at, who: h.changed_by_name, icon: 'swap_horiz', text: `${t('Status')}: ${t(SC[h.old_status]?.label || h.old_status || '—')} → ${t(SC[h.new_status]?.label || h.new_status)}`, comment: h.note && h.note !== 'bulk' ? h.note : '' })),
    ...data.logs.filter(l => !/^Changed ".*" status:/.test(l.action) || l.kind).map(l => ({ at: l.created_at, who: l.user_name, icon: ICONS[l.kind] || (/^Added lead/.test(l.action) ? 'add' : 'edit_note'), text: describe(l), comment: l.comment || '', changes: l.changes })),
    ...data.sends.map(sd => ({ at: sd.sent_at || sd.created_at, who: t('Auto Email'), icon: 'mail', text: `${t('Email')}: "${sd.subject}" — ${t(sd.status)}${sd.opened_at ? ` · ${t('Opened')} ${fmt(sd.opened_at)}` : ''}` })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)) : [];
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
          <div style={{ padding:'8px 10px', background:'#f8fafc', borderRadius:8 }}><div style={{ color:'#9ca3af', fontSize:'0.64rem', textTransform:'uppercase' }}>{t('Last Contacted')}</div><strong>{fmt(lead.last_contacted_at)}</strong></div>
        </div>
        <LeadWatchersPanel leadId={lead.id} />
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
                  {e.comment && <div style={{ fontSize:'0.76rem', color:'#92400e', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:6, padding:'4px 8px', marginTop:4, whiteSpace:'pre-wrap' }}>💬 {e.comment}</div>}
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
const FIELD_NAMES = { company_name:'Company', domain:'Domain', sector:'Industry', city:'City', region:'Region', country:'Country', company_size:'Size', pain_point:'Requirement needed', decision_maker_title:'Decision maker name', phone:'Telephone', mobile_personal:'Mobile number (personal)', email:'Email', telegram:'Telegram', max_messenger:'Max Messenger', contact_method:'Contact', source_url:'Source URL', find_instructions:'Source of lead', notes:'Comment' };

