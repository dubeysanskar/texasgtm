'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import { useRouter } from 'next/navigation';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>;
const PRESET_HH = ['рабочий на производство', 'сварщик завод', 'грузчик склад', 'разнорабочий строительство'];
const PRESET_WEB_RU = ['производственное предприятие москва контакты email', 'строительная компания россия email телефон', 'завод набор персонала контакты'];
const PRESET_WEB_GCC = ['construction company Dubai contact email', 'logistics company UAE email phone', 'manufacturing factory Saudi Arabia hiring', 'cleaning services company Riyadh email', 'hotel hospitality group Abu Dhabi contact'];
const PRESET_HH_GCC = ['construction worker Dubai', 'warehouse helper UAE', 'driver logistics Riyadh', 'cleaner facility management Qatar'];

export default function LeadScraperPage() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { projectId, t } = useProject();
  const router = useRouter();

  // Scraper
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [scrapeSource, setScrapeSource] = useState('2gis');
  const [scrapeQuery, setScrapeQuery] = useState('рабочий на производство');
  const [selectedIndustry, setSelectedIndustry] = useState('all');
  const [selectedCities, setSelectedCities] = useState(['all']);
  const [maxLeads, setMaxLeads] = useState(100);
  const [dorkType, setDorkType] = useState('companies_with_email');
  const [dorkCity, setDorkCity] = useState('Москва');
  const [dorkIndustry, setDorkIndustry] = useState('производство');
  const [customDork, setCustomDork] = useState('');

  // Enrichment
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState(null);
  const [enrichStats, setEnrichStats] = useState(null);
  const [enrichMode, setEnrichMode] = useState('force_all');
  const [enrichMaxLeads, setEnrichMaxLeads] = useState(100);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Verification
  const [verifying, setVerifying] = useState(false);
  const [verifyStats, setVerifyStats] = useState(null);
  const [deepVerifying, setDeepVerifying] = useState(false);
  const [deepVerifyResult, setDeepVerifyResult] = useState(null);

  // Activity log (live progress)
  const [activityLog, setActivityLog] = useState([]);
  const logRef = useRef(null);

  // Config & history
  const [config, setConfig] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  function addLog(msg, type = 'info') {
    const entry = { time: new Date().toLocaleTimeString(), msg, type, id: Date.now() + Math.random() };
    setActivityLog(prev => [...prev.slice(-50), entry]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
  }

  useEffect(() => { if (!authLoading && !user) router.push('/'); if (!authLoading && user && !isAdmin) router.push('/dashboard'); }, [user, authLoading, router, isAdmin]);
  useEffect(() => { if (user && isAdmin) fetch(`/api/leads/scrape?config=1${projectId ? '&project_id=' + projectId : ''}`).then(r => r.json()).then(setConfig).catch(() => {}); }, [user, isAdmin, projectId]);

  const fetchJobs = useCallback(async () => { try { const r = await fetch(`/api/leads/scrape${projectId ? '?project_id=' + projectId : ''}`); if (r.ok) setJobs(await r.json()); } catch {} setLoadingJobs(false); }, [projectId]);
  const fetchEnrichStats = useCallback(async () => { try { const r = await fetch(`/api/leads/enrich${projectId ? '?project_id=' + projectId : ''}`); if (r.ok) { const d = await r.json(); setEnrichStats(d); if (!rangeFrom) setRangeFrom(String(d.min_id || 1)); if (!rangeTo) setRangeTo(String(d.max_id || 100)); } } catch {} }, [projectId]);
  const fetchVerifyStats = useCallback(async () => { setVerifying(true); try { const r = await fetch(`/api/leads/verify${projectId ? '?project_id=' + projectId : ''}`); if (r.ok) setVerifyStats(await r.json()); } catch {} setVerifying(false); }, [projectId]);

  useEffect(() => { if (user && isAdmin) { fetchJobs(); fetchEnrichStats(); fetchVerifyStats(); } }, [user, isAdmin, fetchJobs, fetchEnrichStats, fetchVerifyStats]);

  // ─── Scrape Handler ────────────────────────────────────
  async function handleScrape() {
    setScraping(true); setScrapeResult(null);
    addLog('🚀 ' + t('Starting scrape from {src}...', { src: scrapeSource }), 'start');
    addLog('📋 ' + t('Max leads') + `: ${maxLeads}`, 'info');

    try {
      const body = { source: scrapeSource, maxLeads, project_id: projectId };
      if (scrapeSource === '2gis' || scrapeSource === 'google_maps') {
        body.industry = selectedIndustry; body.cities = selectedCities.includes('all') ? [] : selectedCities;
        addLog(`🗺️ ${scrapeSource === 'google_maps' ? 'Google Maps' : '2GIS'}: Industry="${selectedIndustry}", Cities=${selectedCities.join(', ')}`, 'info');
      } else if (scrapeSource === 'google_dork') {
        body.dorkType = dorkType; body.dorkVars = { city: dorkCity, industry: dorkIndustry }; body.customDork = customDork;
        addLog(`🔍 Dorking: type="${dorkType}", city="${dorkCity}"`, 'info');
      } else {
        body.query = scrapeQuery;
        addLog(`🔎 Query: "${scrapeQuery}"`, 'info');
      }

      addLog('⏳ ' + t('Sending request to server... (this may take 1-5 minutes)'), 'wait');

      body.project_id = projectId;
      const res = await fetch('/api/leads/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();

      if (res.ok) {
        setScrapeResult({ ok: true, added: data.added, skipped: data.skipped, found: data.leads_found });
        addLog('✅ ' + t('Scrape complete! Found {f}, added {a}, skipped {s} duplicates', { f: data.leads_found, a: data.added, s: data.skipped }), 'success');
        fetchJobs(); fetchEnrichStats(); fetchVerifyStats();
      } else {
        setScrapeResult({ ok: false, error: t(data.error || 'Request failed') });
        addLog('❌ ' + t('Scrape failed') + `: ${data.error}`, 'error');
      }
    } catch (e) {
      setScrapeResult({ ok: false, error: e.message });
      addLog('❌ ' + t('Error') + `: ${e.message}`, 'error');
    }
    setScraping(false);
  }

  // ─── Enrich Handler — BATCHED (100 leads per request to avoid 504 timeout) ───
  async function handleEnrich(overrideMode, overrideMax) {
    const mode = overrideMode || enrichMode;
    const totalToProcess = overrideMax || enrichMaxLeads;
    const BATCH_SIZE = 10;

    setEnriching(true); setEnrichResult(null);

    // Determine ID range
    const fromId = parseInt(rangeFrom) || enrichStats?.min_id || 1;
    const toId = parseInt(rangeTo) || enrichStats?.max_id || 9999;
    const totalRange = toId - fromId + 1;
    const totalBatches = Math.ceil(Math.min(totalToProcess, totalRange) / BATCH_SIZE);

    addLog('🔄 ' + t('Starting enrichment (mode: {mode})', { mode }), 'start');
    addLog('📊 ' + t('Processing {n} leads in {b} batches of {s}', { n: Math.min(totalToProcess, totalRange), b: totalBatches, s: BATCH_SIZE }), 'info');
    addLog('📡 ' + t('Fallback: Website → 2GIS → hh.ru → Email guessing'), 'info');

    // Accumulate results across batches
    let totalProcessed = 0, totalEnriched = 0, totalEmailsFound = 0, totalPhonesFound = 0, totalFailed = 0;
    const allChanges = [];
    let batchErrors = 0;

    for (let batch = 0; batch < totalBatches; batch++) {
      const batchFrom = fromId + (batch * BATCH_SIZE);
      const batchTo = Math.min(batchFrom + BATCH_SIZE - 1, toId);
      const batchNum = batch + 1;

      addLog('📦 ' + t('Batch {b}/{n}: IDs {from}-{to}...', { b: batchNum, n: totalBatches, from: batchFrom, to: batchTo }), 'wait');

      try {
        const body = { mode, maxLeads: BATCH_SIZE, rangeFrom: batchFrom, rangeTo: batchTo };
        const res = await fetch('/api/leads/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

        if (!res.ok) {
          const text = await res.text();
          let errMsg;
          try { errMsg = JSON.parse(text).error; } catch { errMsg = `Server error (${res.status})`; }
          addLog('⚠️ ' + t('Batch {b} failed', { b: batchNum }) + `: ${errMsg}`, 'error');
          batchErrors++;
          continue; // Skip to next batch, don't stop everything
        }

        const data = await res.json();
        totalProcessed += data.total || 0;
        totalEnriched += data.enriched || 0;
        totalEmailsFound += data.emails_found || 0;
        totalPhonesFound += data.phones_found || 0;
        totalFailed += data.failed || 0;
        if (data.changes) allChanges.push(...data.changes);

        addLog('✅ ' + t('Batch {b}: {e}/{n} updated (📧 {m} emails, 📞 {p} phones)', { b: batchNum, e: data.enriched, n: data.total, m: data.emails_found, p: data.phones_found }), 'success');

        // Show some changes from this batch
        if (data.changes?.length > 0) {
          data.changes.slice(0, 3).forEach(c => addLog(`  ↳ ${c.company}: ${c.old_email} → ${c.new_email}`, 'change'));
        }

        // Update partial result so user sees progress
        setEnrichResult({ ok: true, total: totalProcessed, enriched: totalEnriched, emails_found: totalEmailsFound, phones_found: totalPhonesFound, failed: totalFailed, changes: allChanges.slice(0, 50) });

      } catch (e) {
        addLog('⚠️ ' + t('Batch {b} error', { b: batchNum }) + `: ${e.message}`, 'error');
        batchErrors++;
      }

      // Small delay between batches to not overload server
      if (batch < totalBatches - 1) {
        addLog('⏳ ' + t('Pausing 2s before next batch...'), 'info');
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // Final summary
    addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
    addLog('🏁 ' + t('ALL BATCHES COMPLETE'), 'success');
    addLog('📊 ' + t('Total: {e}/{n} updated | 📧 {m} emails | 📞 {p} phones | ❌ {f} failed | ⚠️ {b} batch errors', { e: totalEnriched, n: totalProcessed, m: totalEmailsFound, p: totalPhonesFound, f: totalFailed, b: batchErrors }), 'success');

    setEnrichResult({ ok: true, total: totalProcessed, enriched: totalEnriched, emails_found: totalEmailsFound, phones_found: totalPhonesFound, failed: totalFailed, changes: allChanges.slice(0, 50) });
    if (totalEnriched > 0) setBannerDismissed(true);
    fetchEnrichStats(); fetchJobs(); fetchVerifyStats();
    setEnriching(false);
  }

  async function handleDeepVerify(smtpCheck = false) {
    setDeepVerifying(true); setDeepVerifyResult(null);
    addLog('🔬 ' + (smtpCheck ? t('Starting SMTP mailbox verification...') : t('Starting MX record verification...')), 'start');
    try {
      const res = await fetch('/api/leads/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxLeads: 200, smtpCheck }) });
      if (res.ok) { const data = await res.json(); setDeepVerifyResult(data); addLog('✅ ' + t('Verified {n} emails. Valid: {v}, Bad: {b}, No MX: {m}', { n: data.total_checked, v: data.personal ?? data.valid ?? 0, b: data.invalid_format, m: data.no_mx }), 'success'); }
      else addLog('❌ ' + t('Verification failed'), 'error');
    } catch (e) { addLog('❌ ' + t('Error') + `: ${e.message}`, 'error'); }
    setDeepVerifying(false);
  }

  async function handleEnrichBadOnly() {
    if (!verifyStats?.bad_lead_ids?.length) return;
    addLog('🔧 ' + t('Fixing {n} leads with bad format emails...', { n: verifyStats.bad_lead_ids.length }), 'start');
    await handleEnrich('selected');
  }

  function toggleCity(key) {
    if (key === 'all') { setSelectedCities(['all']); return; }
    setSelectedCities(prev => { const w = prev.filter(c => c !== 'all' && c !== key); return prev.includes(key) ? (w.length ? w : ['all']) : [...w, key]; });
  }

  if (authLoading || !user || !isAdmin) return <div className="page-loading">{t('Loading...')}</div>;

  const srcIcon = { '2gis': '🗺️', 'hh.ru': '💼', 'superjob': '📋', 'web_search': '🌐', 'google_dork': '🔍', 'enrichment': '🔄' };
  const srcLabel = { '2gis': '2GIS', 'hh.ru': 'hh.ru', 'superjob': 'SuperJob', 'web_search': t('Web Search'), 'google_dork': t('Dorking'), 'enrichment': t('Enrichment'), 'google_maps': 'Google Maps' };
  const showBanner = enrichStats && enrichStats.total > 0 && !bannerDismissed && !enrichResult?.ok;

  return (
    <div className="page-content">
      <div className="page-header">
        <h1><MI name="travel_explore" size={26} /> {t('Lead Scraper')}</h1>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>{t('5 sources · Email verification · Smart enrichment')}</p>
      </div>

      {/* ═══ RED WARNING BANNER ═══ */}
      {showBanner && (
        <div style={{ marginBottom: 20, padding: '16px 20px', borderRadius: 12, background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', color: '#fff', boxShadow: '0 4px 20px rgba(220,38,38,0.3)', position: 'relative' }}>
          <button onClick={() => setBannerDismissed(true)} style={{ position: 'absolute', top: 8, right: 12, background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: '1.6rem' }}>🚨</span>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800 }}>{t('ALL {n} LEADS HAVE WRONG EMAILS', { n: enrichStats.total })}</div>
              <div style={{ fontSize: '0.78rem', opacity: 0.9, marginTop: 2 }}>{t('Emails were scraped from job boards (hh.ru) — they are generic HR/recruitment emails, NOT actual company contacts. Re-enrich to get real emails from company websites & 2GIS.')}</div>
            </div>
          </div>
          <button onClick={() => handleEnrich('force_all', enrichStats.total)} disabled={enriching} style={{ marginTop: 6, padding: '10px 28px', borderRadius: 8, border: '2px solid #fff', background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: enriching ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            {enriching ? <><span className="spinner-sm" /> {t('RE-ENRICHING…')}</> : <>🔄 {t('RE-ENRICH ALL {n} LEADS NOW', { n: enrichStats.total })}</>}
          </button>
        </div>
      )}

      {/* ═══ LIVE ACTIVITY LOG ═══ */}
      {(scraping || enriching || deepVerifying || activityLog.length > 0) && (
        <div className="card" style={{ marginBottom: 20, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(scraping || enriching || deepVerifying) && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'pulse 1.5s infinite' }} />}
              <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{scraping ? '🚀 ' + t('Scraping in progress...') : enriching ? '🔄 ' + t('Enrichment in progress...') : deepVerifying ? '🔬 ' + t('Verifying...') : '📋 ' + t('Activity Log')}</span>
            </div>
            {!scraping && !enriching && !deepVerifying && <button onClick={() => setActivityLog([])} style={{ fontSize: '0.68rem', padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>{t('Clear')}</button>}
          </div>
          {(scraping || enriching) && (
            <div style={{ marginBottom: 8, height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--primary)', borderRadius: 2, animation: 'progress 2.5s ease-in-out infinite', width: '60%' }} />
            </div>
          )}
          <div ref={logRef} style={{ maxHeight: 160, overflow: 'auto', fontSize: '0.72rem', fontFamily: 'monospace', lineHeight: 1.8 }}>
            {activityLog.map(e => (
              <div key={e.id} style={{ color: e.type === 'error' ? '#dc2626' : e.type === 'success' ? '#166534' : e.type === 'start' ? '#1e40af' : e.type === 'wait' ? '#d97706' : e.type === 'change' ? '#7c3aed' : '#6b7280', borderLeft: `2px solid ${e.type === 'error' ? '#dc2626' : e.type === 'success' ? '#10b981' : 'transparent'}`, paddingLeft: 6 }}>
                <span style={{ color: '#9ca3af', marginRight: 6 }}>{e.time}</span>{e.msg}
              </div>
            ))}
            {(scraping || enriching) && <div style={{ color: '#d97706' }}><span style={{ animation: 'pulse 1s infinite' }}>⏳</span> {t('Working... please wait')}</div>}
          </div>
          <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } } @keyframes progress { 0% { width: 10%; margin-left: 0; } 50% { width: 50%; margin-left: 25%; } 100% { width: 10%; margin-left: 90%; } }`}</style>
        </div>
      )}

      {/* ═══ SCRAPE PANEL ═══ */}
      <div className="card" style={{ marginBottom: 20 }}>
        <SectionTitle color="#1D9E75" title={t('Scrape New Leads')} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 14 }}>
          <Field label={t('Source')}>
            <select value={scrapeSource} onChange={e => setScrapeSource(e.target.value)} className="leads-select" style={{ width: '100%', minWidth: 180 }}>
              {config?.region === 'gcc' 
                ? <option value="google_maps">🗺️ Google Maps ({t('Business Search')})</option>
                : <option value="2gis">🗺️ 2GIS ({t('Business Directory')})</option>
              }
              <option value="google_dork">🔍 Google Dorking ({t('Advanced')})</option>
              <option value="web_search">🌐 {t('Web Search')} ({t('Crawl Sites')})</option>
              {config?.region !== 'gcc' && <option value="hh.ru">💼 hh.ru ({t('Job Board')})</option>}
              {config?.region !== 'gcc' && <option value="superjob">📋 SuperJob ({t('Job Board')})</option>}
            </select>
          </Field>
          <Field label={t('Max Leads')}>
            <select value={maxLeads} onChange={e => setMaxLeads(Number(e.target.value))} className="leads-select" style={{ width: 90 }}>
              {[25, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          {(scrapeSource === '2gis' || scrapeSource === 'google_maps') && config && <Field label={t('Industry')}><select value={selectedIndustry} onChange={e => setSelectedIndustry(e.target.value)} className="leads-select" style={{ minWidth: 160 }}>{config.industries.map(i => <option key={i.value} value={i.value}>{t(i.label)}</option>)}</select></Field>}
          {scrapeSource === 'google_dork' && config && <Field label={t('Dork Type')}><select value={dorkType} onChange={e => setDorkType(e.target.value)} className="leads-select" style={{ minWidth: 200 }}>{config.dorkPresets?.map(d => <option key={d.value} value={d.value}>{t(d.label)}</option>)}</select></Field>}
          {['web_search', 'hh.ru', 'superjob'].includes(scrapeSource) && (
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="scraper-label">{t('Search Query')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={scrapeQuery} onChange={e => setScrapeQuery(e.target.value)} className="form-input" style={{ flex: 1 }} placeholder={t('Keywords...')} />
                <select onChange={e => e.target.value && setScrapeQuery(e.target.value)} className="leads-select" style={{ fontSize: '0.7rem', maxWidth: 140 }}><option value="">{t('Presets')}</option>{(config?.region === 'gcc' ? (scrapeSource === 'web_search' ? PRESET_WEB_GCC : PRESET_HH_GCC) : (scrapeSource === 'web_search' ? PRESET_WEB_RU : PRESET_HH)).map(q => <option key={q} value={q}>{q.slice(0, 28)}…</option>)}</select>
              </div>
            </div>
          )}
          <button onClick={handleScrape} disabled={scraping} className="btn btn-primary" style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}>
            {scraping ? <><span className="spinner-sm" /> {t('Scraping…')}</> : <><MI name="play_arrow" size={16} /> {t('Run Scrape')}</>}
          </button>
        </div>
        {scrapeSource === 'google_dork' && (
          <div style={{ marginBottom: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
              <Field label={t('City')}><input value={dorkCity} onChange={e => setDorkCity(e.target.value)} className="form-input" style={{ width: 130 }} /></Field>
              <Field label={t('Industry')}><input value={dorkIndustry} onChange={e => setDorkIndustry(e.target.value)} className="form-input" style={{ width: 130 }} /></Field>
              {dorkType === 'custom' && <div style={{ flex: 1, minWidth: 250 }}><label className="scraper-label">{t('Custom Dork')}</label><input value={customDork} onChange={e => setCustomDork(e.target.value)} className="form-input" style={{ width: '100%' }} placeholder='intitle:контакты "строительная" "@" site:.ru' /></div>}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>💡 {config?.region === 'gcc' ? <><code>site:.ae</code> · <code>site:.sa</code> · <code>site:.qa</code> · <code>intitle:</code> · <code>"@domain"</code></> : <><code>site:.ru</code> · <code>intitle:</code> · <code>"@domain.ru"</code> · <code>"exact"</code></>}</div>
          </div>
        )}
        {(scrapeSource === '2gis' || scrapeSource === 'google_maps') && config && (
          <div>
            <label className="scraper-label">{t('Cities')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
              <Chip label={t('All')} active={selectedCities.includes('all')} onClick={() => toggleCity('all')} />
              {config.cities.map(c => <Chip key={c.key} label={c.country ? `${c.name} (${c.country})` : (c.nameEn || c.name)} active={selectedCities.includes(c.key)} onClick={() => toggleCity(c.key)} />)}
            </div>
          </div>
        )}
        <ResultBanner result={scrapeResult} successMsg={r => '✓ ' + t('{a} added, {s} skipped ({f} found)', { a: r.added, s: r.skipped, f: r.found })} />
      </div>

      {/* ═══ EMAIL VERIFICATION ═══ */}
      <div className="card" style={{ marginBottom: 20 }}>
        <SectionTitle color="#8B5CF6" title={t('Email Quality Verification')} />
        {verifying ? (
          <div style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ display: 'inline-block', width: 28, height: 28, border: '3px solid #e9d5ff', borderTop: '3px solid #8B5CF6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ marginTop: 8, fontWeight: 600, color: '#6b21a8', fontSize: '0.82rem' }}>{t('Scanning {n} leads...', { n: enrichStats?.total || '...' })}</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : verifyStats ? (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <StatCard value={verifyStats.total} label={t('Total Leads')} color="#0369a1" bg="#f0f9ff" border="#bae6fd" />
              <StatCard value={verifyStats.personal || verifyStats.good_total || 0} label={'✅ ' + t('Real Contact')} color="#166534" bg="#f0fdf4" border="#bbf7d0" />
              <StatCard value={verifyStats.generic || 0} label={'⚠️ ' + t('Generic (info@/hr@)')} color="#d97706" bg="#fffbeb" border="#fde68a" />
              <StatCard value={verifyStats.invalid_format} label={'❌ ' + t('Broken Format')} color="#dc2626" bg="#fef2f2" border="#fecaca" />
              <StatCard value={verifyStats.empty} label={'📭 ' + t('Empty')} color="#6b7280" bg="#f9fafb" border="#e5e7eb" />
            </div>

            {verifyStats.generic > 0 && (
              <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#fef3c7', border: '1px solid #f59e0b' }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#92400e', marginBottom: 6 }}>
                  ⚠️ {t('{n} leads have GENERIC emails — campaigns will NEVER get read', { n: verifyStats.generic })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#78350f', marginBottom: 6 }}>
                  {t('These go to company-wide inboxes nobody checks. You need personal emails (name@company.ru) to reach decision makers.')}
                </div>
                {verifyStats.generic_breakdown && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: '0.7rem' }}>
                    {Object.entries(verifyStats.generic_breakdown).sort((a, b) => b[1] - a[1]).map(([prefix, count]) => (
                      <span key={prefix} style={{ padding: '2px 8px', borderRadius: 12, background: '#fde68a', color: '#92400e', fontWeight: 600, fontFamily: 'monospace' }}>
                        {prefix}@: {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {verifyStats.bad_total > 0 && (
              <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}>
                <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#991b1b' }}>
                  🚨 {t('Only {g}/{n} leads ready for outreach ({p}%)', { g: verifyStats.personal || verifyStats.good_total || 0, n: verifyStats.total, p: Math.round(((verifyStats.personal || verifyStats.good_total || 0) / verifyStats.total) * 100) })}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#991b1b', marginTop: 2 }}>
                  {t('{n} leads will bounce or be ignored. Use Google Dorking or 2GIS to find real decision-maker emails.', { n: verifyStats.bad_total })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => handleDeepVerify(false)} disabled={deepVerifying} className="btn" style={{ padding: '7px 14px', fontSize: '0.75rem', background: '#8B5CF6', color: '#fff', border: 'none', borderRadius: 8 }}>
                {deepVerifying ? t('Verifying…') : '🔍 ' + t('Check MX Records')}
              </button>
              <button onClick={() => handleDeepVerify(true)} disabled={deepVerifying} className="btn" style={{ padding: '7px 14px', fontSize: '0.75rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8 }}>
                {deepVerifying ? t('Connecting…') : '📧 ' + t('Verify Mailboxes (SMTP)')}
              </button>
              <button onClick={fetchVerifyStats} className="btn" style={{ padding: '7px 10px', fontSize: '0.75rem', background: 'transparent', color: '#8B5CF6', border: '1px solid #8B5CF6', borderRadius: 8 }}>
                <MI name="refresh" size={14} />
              </button>
            </div>
          </>
        ) : null}
        {deepVerifyResult && !deepVerifying && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#faf5ff', border: '1px solid #e9d5ff', fontSize: '0.75rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>🔬 {t('Deep Results')} ({deepVerifyResult.total_checked} {t('checked')})</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <MiniStat label={'✅ ' + t('Personal')} value={deepVerifyResult.personal} color="#166534" />
              <MiniStat label={'⚠️ ' + t('Generic')} value={deepVerifyResult.generic} color="#d97706" />
              <MiniStat label={'❌ ' + t('Bad')} value={deepVerifyResult.invalid_format} color="#dc2626" />
              <MiniStat label={'🚫 ' + t('No MX')} value={deepVerifyResult.no_mx} color="#991b1b" />
              {deepVerifyResult.smtp_not_exists > 0 && <MiniStat label={'📭 ' + t('Not Exists')} value={deepVerifyResult.smtp_not_exists} color="#dc2626" />}
              {deepVerifyResult.smtp_exists > 0 && <MiniStat label={'📬 ' + t('Exists')} value={deepVerifyResult.smtp_exists} color="#166534" />}
            </div>
            {deepVerifyResult.details?.length > 0 && (
              <details open><summary style={{ cursor: 'pointer', fontWeight: 600, color: '#6b21a8' }}>{t('Show {n} issues', { n: deepVerifyResult.details.length })}</summary>
                <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 4 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
                    <thead><tr style={{ borderBottom: '2px solid #e9d5ff' }}><th style={{ textAlign: 'left', padding: 3 }}>ID</th><th style={{ textAlign: 'left', padding: 3 }}>{t('Company')}</th><th style={{ textAlign: 'left', padding: 3 }}>{t('Email')}</th><th style={{ textAlign: 'left', padding: 3 }}>{t('Problem')}</th></tr></thead>
                    <tbody>{deepVerifyResult.details.map(d => (<tr key={d.id} style={{ borderBottom: '1px solid #f3e8ff', background: d.status === 'generic' ? '#fffbeb' : 'transparent' }}><td style={{ padding: 3, color: '#9ca3af' }}>#{d.id}</td><td style={{ padding: 3 }}>{d.company?.slice(0, 24)}</td><td style={{ padding: 3, color: d.status === 'generic' ? '#d97706' : '#dc2626', fontFamily: 'monospace', fontSize: '0.66rem' }}>{d.email || '—'}</td><td style={{ padding: 3, color: '#7c3aed', fontSize: '0.66rem' }}>{d.reason}</td></tr>))}</tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}
      </div>


      {/* ═══ ENRICHMENT PANEL ═══ */}
      <div className="card" style={{ marginBottom: 20 }}>
        <SectionTitle color="#3B82F6" title={t('Enrich Leads (Fix Emails & Phones)')} />
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>{t('4 fallbacks: Website crawling → 2GIS → hh.ru → Email guessing')}</p>
        {enrichStats && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <StatCard value={enrichStats.total} label={t('Total')} color="#0369a1" bg="#f0f9ff" border="#bae6fd" />
            <StatCard value={enrichStats.has_email} label={t('Have Email')} color="#166534" bg="#f0fdf4" border="#bbf7d0" />
            <StatCard value={enrichStats.missing_email} label={t('No Email')} color="#dc2626" bg="#fef2f2" border="#fecaca" />
            <StatCard value={enrichStats.has_phone} label={t('Have Phone')} color="#166534" bg="#f0fdf4" border="#bbf7d0" />
            <StatCard value={enrichStats.missing_phone} label={t('No Phone')} color="#d97706" bg="#fffbeb" border="#fde68a" />
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
          <Field label={t('Mode')}><select value={enrichMode} onChange={e => setEnrichMode(e.target.value)} className="leads-select" style={{ minWidth: 200 }}><option value="force_all">🔄 {t('Force (overwrite wrong data)')}</option><option value="missing">📭 {t('Only Missing')}</option></select></Field>
          <Field label={t('Max')}><select value={enrichMaxLeads} onChange={e => setEnrichMaxLeads(Number(e.target.value))} className="leads-select" style={{ width: 80 }}>{[25, 50, 100, 200, 500].map(n => <option key={n} value={n}>{n}</option>)}</select></Field>
          <Field label={t('From ID')}><input type="number" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} className="form-input" style={{ width: 80 }} /></Field>
          <Field label={t('To ID')}><input type="number" value={rangeTo} onChange={e => setRangeTo(e.target.value)} className="form-input" style={{ width: 80 }} /></Field>
          <button onClick={() => handleEnrich()} disabled={enriching} className="btn btn-primary" style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}>
            {enriching ? <><span className="spinner-sm" /> {t('Enriching…')}</> : <><MI name="auto_fix_high" size={16} /> {t('Run Enrichment')}</>}
          </button>
        </div>
        <ResultBanner result={enrichResult} successMsg={r => '✓ ' + t('{e}/{n} updated — 📧 {m} emails · 📞 {p} phones', { e: r.enriched, n: r.total, m: r.emails_found, p: r.phones_found })} />
        {enrichResult?.ok && enrichResult.changes?.length > 0 && (
          <details style={{ marginTop: 8, fontSize: '0.7rem' }}><summary style={{ cursor: 'pointer', fontWeight: 600, color: '#1e40af' }}>📋 {t('{n} changes', { n: enrichResult.changes.length })}</summary>
            <div style={{ maxHeight: 200, overflow: 'auto', marginTop: 4 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
                <thead><tr style={{ borderBottom: '1px solid #dbeafe' }}><th style={{ textAlign: 'left', padding: 3 }}>{t('Company')}</th><th style={{ textAlign: 'left', padding: 3 }}>{t('Old')}</th><th style={{ textAlign: 'left', padding: 3 }}>→ {t('New')}</th><th style={{ textAlign: 'left', padding: 3 }}>{t('Via')}</th></tr></thead>
                <tbody>{enrichResult.changes.map(c => (<tr key={c.id} style={{ borderBottom: '1px solid #eff6ff' }}><td style={{ padding: 3 }}>{c.company?.slice(0, 20)}</td><td style={{ padding: 3, color: '#dc2626', fontFamily: 'monospace', textDecoration: 'line-through', fontSize: '0.66rem' }}>{c.old_email}</td><td style={{ padding: 3, color: '#166534', fontFamily: 'monospace', fontWeight: 600, fontSize: '0.66rem' }}>{c.new_email}</td><td style={{ padding: 3, color: '#6b7280' }}>{c.sources?.join(', ')}</td></tr>))}</tbody>
              </table>
            </div>
          </details>
        )}
      </div>

      {/* ═══ HISTORY ═══ */}
      <div className="card">
        <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 12 }}>📊 {t('History & Reports')}</h3>
        {loadingJobs ? <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>{t('Loading...')}</div> : jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: '0.78rem' }}><MI name="history" size={28} /><p>{t('No jobs yet')}</p></div>
        ) : (
          <div className="leads-table-wrap"><table className="leads-table"><thead><tr><th>{t('Source')}</th><th>{t('Details')}</th><th>{t('Status')}</th><th>{t('Found')}</th><th>{t('Added')}</th><th>{t('Skip')}</th><th>{t('Started')}</th><th>{t('Duration')}</th></tr></thead><tbody>
            {jobs.map(j => {
              const duration = j.started_at && j.completed_at ? Math.round((new Date(j.completed_at) - new Date(j.started_at)) / 1000) : null;
              return (
                <tr key={j.id} className="leads-row">
                  <td style={{ fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{srcIcon[j.source] || '📊'} {srcLabel[j.source] || j.source}</td>
                  <td style={{ fontSize: '0.7rem', color: '#6b7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={j.query}>{j.query || '—'}</td>
                  <td><span style={{ padding: '2px 8px', borderRadius: 16, fontSize: '0.66rem', fontWeight: 600, background: j.status === 'completed' ? '#dcfce7' : j.status === 'failed' ? '#fee2e2' : '#dbeafe', color: j.status === 'completed' ? '#166534' : j.status === 'failed' ? '#991b1b' : '#1e40af' }}>{t(j.status)}</span></td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{j.leads_found ?? 0}</td>
                  <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 600 }}>{j.leads_added ?? 0}</td>
                  <td style={{ textAlign: 'center', color: '#f59e0b' }}>{j.leads_skipped ?? 0}</td>
                  <td style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{j.started_at ? new Date(j.started_at).toLocaleString() : '—'}</td>
                  <td style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{duration != null ? `${duration}s` : '—'}</td>
                </tr>
              );
            })}
          </tbody></table></div>
        )}
        {jobs.length > 0 && (
          <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb', fontSize: '0.72rem', color: '#6b7280' }}>
            <strong>{t('Summary')}:</strong> {t('{c} completed, {f} failed, {n} total leads added', { c: jobs.filter(j => j.status === 'completed').length, f: jobs.filter(j => j.status === 'failed').length, n: jobs.reduce((acc, j) => acc + (j.leads_added || 0), 0) })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────
function SectionTitle({ color, title }) { return <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} /><span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{title}</span></div>; }
function Field({ label, children }) { return <div><label className="scraper-label">{label}</label>{children}</div>; }
function Chip({ label, active, onClick }) { return <button onClick={onClick} style={{ padding: '3px 10px', borderRadius: 16, border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--text-muted)' }}>{label}</button>; }
function StatCard({ value, label, color, bg, border }) { return <div style={{ padding: '6px 14px', borderRadius: 8, background: bg, border: `1px solid ${border}`, textAlign: 'center', minWidth: 70 }}><div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{value ?? 0}</div><div style={{ fontSize: '0.64rem', color }}>{label}</div></div>; }
function MiniStat({ label, value, color }) { return <span style={{ fontSize: '0.73rem', fontWeight: 600, color }}>{label}: {value ?? 0}</span>; }
function ResultBanner({ result, successMsg }) { if (!result) return null; return <div style={{ marginTop: 8, fontSize: '0.78rem', padding: '8px 12px', borderRadius: 8, background: result.ok ? '#f0fdf4' : '#fef2f2', color: result.ok ? '#166534' : '#dc2626', border: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}` }}>{result.ok ? successMsg(result) : `✗ ${result.error}`}</div>; }
