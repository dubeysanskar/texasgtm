import { NextResponse } from 'next/server';
const { queryOne, queryAll, query, nextProjectSeq } = require('@/lib/db');
const { getUserFromRequest, isAdmin } = require('@/lib/auth');
const {
  search2GIS, parse2GISItem, scrapeWebsiteContacts, searchWebForCompanies,
  extractLeadFromWebsite, googleDorkSearch, INDUSTRY_KEYWORDS, RUSSIAN_CITIES,
  INDUSTRY_OPTIONS, DORK_PRESET_OPTIONS,
  GCC_CITIES, GCC_INDUSTRY_OPTIONS, GCC_INDUSTRY_KEYWORDS, GCC_DORK_PRESET_OPTIONS,
  searchGoogleMaps,
} = require('@/lib/scraper');

function makeDedupKey(companyName, domain) {
  const name = (companyName || '').toLowerCase().replace(/[^a-zA-Zа-яА-Я0-9]/g, '');
  const dom = (domain || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return name + dom;
}

function inferSector(jobTitle = '', industry = '') {
  const t = (jobTitle + ' ' + JSON.stringify(industry)).toLowerCase();
  if (/строитель|монолит|каменщик|прораб|отделочник/.test(t)) return 'construction';
  if (/сварщик|металл|сталь|плавильщик|литейщик/.test(t)) return 'metallurgy';
  if (/склад|комплектовщик|грузчик|логистик/.test(t)) return 'warehouse_logistics';
  if (/пищев|мясо|рыба|молоко|хлеб|кондитер/.test(t)) return 'food_processing';
  if (/шахт|горнодобыв|добыча/.test(t)) return 'mining';
  if (/химическ|нефтехим|нефтеперераб/.test(t)) return 'chemicals';
  if (/автомобил|машиностроен/.test(t)) return 'automotive';
  if (/ресторан|кофе|бариста|гостиниц|отель/.test(t)) return 'hospitality';
  if (/магазин|розниц|торговл/.test(t)) return 'retail';
  return 'manufacturing';
}

// ─── POST: Run a scrape job ──────────────────────────────────
export async function POST(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await request.json();
  const { source, query: searchQuery, industry, cities, maxLeads = 100, dorkType, dorkVars, customDork, project_id } = body;
  if (!source) return NextResponse.json({ error: 'source is required' }, { status: 400 });

  // Create job record
  const jobLabel = source === '2gis'
    ? `${industry || 'all'} in ${(cities || []).join(', ') || 'all cities'} (max ${maxLeads})`
    : source === 'google_dork'
    ? `Dork: ${dorkType || 'custom'} (max ${maxLeads})`
    : source === 'web_search'
    ? `Web: ${searchQuery} (max ${maxLeads})`
    : `${searchQuery} (max ${maxLeads})`;

  const job = await query(
    "INSERT INTO gtm_scrape_jobs (source, query, status, started_at, created_by, project_id) VALUES ($1, $2, 'running', NOW(), $3, $4) RETURNING id",
    [source, jobLabel || null, user.id, project_id || null]
  );
  const jobId = job.rows[0].id;

  try {
    let leads = [];

    if (source === 'hh.ru') {
      leads = await scrapeHHRu(searchQuery || 'рабочий на производство', maxLeads);

    } else if (source === 'superjob') {
      const apiKey = process.env.SUPERJOB_API_KEY;
      if (!apiKey) {
        await query("UPDATE gtm_scrape_jobs SET status = 'failed', error_message = 'SUPERJOB_API_KEY not set', completed_at = NOW() WHERE id = $1", [jobId]);
        return NextResponse.json({ error: 'SUPERJOB_API_KEY not configured' }, { status: 400 });
      }
      leads = await scrapeSuperjob(searchQuery || 'рабочий завод', apiKey, maxLeads);

    } else if (source === '2gis') {
      const apiKey = process.env.TWOGIS_API_KEY;
      if (!apiKey) {
        await query("UPDATE gtm_scrape_jobs SET status = 'failed', error_message = 'TWOGIS_API_KEY not set', completed_at = NOW() WHERE id = $1", [jobId]);
        return NextResponse.json({ error: 'TWOGIS_API_KEY not configured' }, { status: 400 });
      }
      leads = await scrape2GIS(industry || 'all', cities || [], apiKey, maxLeads);

    } else if (source === 'web_search') {
      leads = await scrapeWebSearch(searchQuery || 'производственное предприятие москва контакты', maxLeads);

    } else if (source === 'google_dork') {
      leads = await googleDorkSearch(dorkType || 'companies_with_email', dorkVars || {}, customDork || '', maxLeads);

    } else if (source === 'google_maps') {
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        await query("UPDATE gtm_scrape_jobs SET status = 'failed', error_message = 'GOOGLE_MAPS_API_KEY not set', completed_at = NOW() WHERE id = $1", [jobId]);
        return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 400 });
      }
      // Build search query from industry keywords
      const industryLabel = (GCC_INDUSTRY_KEYWORDS[industry] || [industry || 'company'])[0];
      const cityNames = (cities || []).length > 0 
        ? cities.map(k => { const c = GCC_CITIES.find(c => c.key === k); return c ? c.name : k; })
        : ['Dubai'];
      for (const cityName of cityNames) {
        if (leads.length >= maxLeads) break;
        const results = await searchGoogleMaps(industryLabel, cityName, apiKey, Math.min(maxLeads - leads.length, 25));
        leads.push(...results);
      }

    } else {
      await query("UPDATE gtm_scrape_jobs SET status = 'failed', error_message = 'Unknown source', completed_at = NOW() WHERE id = $1", [jobId]);
      return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
    }

    // Insert leads with dedup
    let added = 0, skipped = 0;
    let seq = await nextProjectSeq(project_id || null);
    const GARBAGE_NAME = /^(captcha|работа\b|вакансии?\b|свежие|поиск|найти|резюме|error|404|403|access denied|page not found|verify|hh\.ru|superjob|indeed|avito|duckduckgo|google|yandex|untitled|home|index|главная)/i;
    for (const lead of leads) {
      if (!lead.company_name?.trim()) { skipped++; continue; }
      if (GARBAGE_NAME.test(lead.company_name.trim()) || lead.company_name.length > 120 || lead.company_name.length < 2) { skipped++; continue; }
      const dedupKey = makeDedupKey(lead.company_name, lead.domain);
      const existing = await queryOne('SELECT id FROM gtm_leads WHERE dedup_key = $1', [dedupKey]);
      if (existing) { skipped++; continue; }
      try {
        await query(
          `INSERT INTO gtm_leads (company_name, domain, sector, priority, status, city, company_size, pain_point, decision_maker_title, phone, email, source_url, find_instructions, notes, scraped_from, dedup_key, created_by, project_id, project_seq) VALUES ($1,$2,$3,$4,'not_contacted',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [lead.company_name, lead.domain || '', lead.sector || 'manufacturing', lead.priority || 'MEDIUM', lead.city || '', lead.company_size || '', lead.pain_point || '', lead.decision_maker_title || '', lead.phone || '', lead.email || '', lead.source_url || '', lead.find_instructions || '', lead.notes || '', lead.scraped_from || source, dedupKey, user.id, project_id || null, seq]
        );
        seq++;
        added++;
      } catch (e) {
        if (e.message?.includes('duplicate') || e.message?.includes('unique')) skipped++;
        else console.error('[scrape] insert error:', e.message);
      }
    }

    await query("UPDATE gtm_scrape_jobs SET status = 'completed', leads_found = $1, leads_added = $2, leads_skipped = $3, completed_at = NOW() WHERE id = $4",
      [leads.length, added, skipped, jobId]);

    const warnings = [];
    if (source === 'hh.ru' && leads.length === 0) warnings.push('hh.ru returned 0 results — server IP may be blocked (403). Try 2GIS instead.');
    if (source === 'web_search' && leads.length === 0) warnings.push('DuckDuckGo returned 0 results — server IP may be blocked. Try 2GIS instead.');
    if (source === 'google_dork' && leads.length === 0) warnings.push('Google Dorking uses DuckDuckGo which may be blocked from this server. Try 2GIS.');
    if (source === 'superjob' && leads.length === 0) warnings.push('SuperJob returned 0 results — check SUPERJOB_API_KEY.');

    return NextResponse.json({ jobId, leads_found: leads.length, added, skipped, found: leads.length, warnings });

  } catch (err) {
    console.error('[scrape] job failed:', err);
    await query("UPDATE gtm_scrape_jobs SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2", [err.message, jobId]);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── 2GIS SCRAPER (multi-keyword, multi-city) ────────────────
async function scrape2GIS(industry, selectedCities, apiKey, maxLeads = 100) {
  let keywords = [];
  if (industry === 'all') {
    keywords = Object.values(INDUSTRY_KEYWORDS).flat();
  } else if (INDUSTRY_KEYWORDS[industry]) {
    keywords = INDUSTRY_KEYWORDS[industry];
  } else {
    keywords = [industry];
  }

  let citiesToSearch = RUSSIAN_CITIES;
  if (selectedCities && selectedCities.length > 0 && !selectedCities.includes('all')) {
    citiesToSearch = RUSSIAN_CITIES.filter(c => selectedCities.includes(c.key));
  }

  const seenCompanies = new Set();
  const leads = [];
  let apiCalls = 0;
  let firstError = null;
  const PAGE_SIZE = 10;          // 2GIS hard cap
  const MAX_PAGES = 5;           // up to 50 results per keyword+city
  const MAX_API_CALLS = 300;

  for (const city of citiesToSearch) {
    if (leads.length >= maxLeads || apiCalls >= MAX_API_CALLS) break;

    for (const keyword of keywords) {
      if (leads.length >= maxLeads || apiCalls >= MAX_API_CALLS) break;

      const queryStr = `${keyword} ${city.name}`;

      // Paginate: 2GIS returns max 10 per page, so loop pages to gather more.
      for (let page = 1; page <= MAX_PAGES; page++) {
        if (leads.length >= maxLeads || apiCalls >= MAX_API_CALLS) break;

        let items = [];
        try {
          const result = await search2GIS(queryStr, apiKey, page);
          items = result.items;
          apiCalls++;
        } catch (e) {
          if (!firstError) firstError = e.message;
          console.error(`[2gis] "${keyword}" in ${city.name} p${page} error:`, e.message);
          break; // stop paginating this query on error
        }

        if (!items.length) break; // no more results for this query

        for (const item of items) {
          if (leads.length >= maxLeads) break;
          const companyName = item.org?.name || item.name || '';
          if (!companyName || seenCompanies.has(companyName.toLowerCase())) continue;
          seenCompanies.add(companyName.toLowerCase());

          const lead = parse2GISItem(item, city.name);
          if (lead.company_name) leads.push(lead);
        }

        if (items.length < PAGE_SIZE) break; // last page reached
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  console.log(`[2gis] Used ${apiCalls} API calls, found ${leads.length} unique companies`);
  // If we got nothing and hit an API error, bubble it up so the job shows why.
  if (leads.length === 0 && firstError) throw new Error(firstError);
  return leads;
}

// ─── WEB SEARCH SCRAPER ──────────────────────────────────────
async function scrapeWebSearch(searchQuery, maxLeads = 30) {
  const urls = await searchWebForCompanies(searchQuery, maxLeads);
  const leads = [];

  for (const url of urls) {
    if (leads.length >= maxLeads) break;
    try {
      const lead = await extractLeadFromWebsite(url);
      if (lead && lead.company_name) {
        lead.scraped_from = 'web_search';
        leads.push(lead);
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[web-search] Found ${leads.length} leads`);
  return leads;
}

// ─── HH.RU SCRAPER ──────────────────────────────────────────
async function scrapeHHRu(searchQuery, maxLeads = 100) {
  const areas = ['1', '2', '3', '66'];
  const seenEmployers = new Set();
  const leads = [];

  for (const area of areas) {
    if (leads.length >= maxLeads) break;
    try {
      const params = new URLSearchParams({ text: searchQuery, area, per_page: '50', only_with_salary: 'false', employment: 'full' });
      const res = await fetch(`https://api.hh.ru/vacancies?${params}`, {
        headers: { 'User-Agent': 'TahaAirwavesCRM/1.0 (info@tahaairwaves.com)' },
      });
      if (!res.ok) {
        if (res.status === 403) {
          console.error(`[scrape] hh.ru BLOCKED (403) — server IP is rate-limited/banned by hh.ru`);
          continue;
        }
        console.error(`[scrape] hh.ru area ${area} HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (!data.items) continue;

      for (const vacancy of data.items) {
        if (leads.length >= maxLeads) break;
        const employer = vacancy.employer;
        if (!employer || seenEmployers.has(employer.id)) continue;
        seenEmployers.add(employer.id);

        let empDetails = {};
        try {
          const empRes = await fetch(`https://api.hh.ru/employers/${employer.id}`, {
            headers: { 'User-Agent': 'TahaAirwavesCRM/1.0 (info@tahaairwaves.com)' },
          });
          if (empRes.ok) empDetails = await empRes.json();
        } catch {}

        leads.push({
          company_name: employer.name,
          domain: empDetails.site_url?.replace(/^https?:\/\//, '').split('/')[0] || null,
          sector: inferSector(vacancy.name, empDetails.industry),
          priority: 'MEDIUM',
          city: vacancy.area?.name || null,
          company_size: empDetails.size || null,
          pain_point: `Hiring "${vacancy.name}" on hh.ru. ${vacancy.open_vacancies || ''} open vacancies.`,
          decision_maker_title: 'HR Manager / HR Director',
          source_url: `https://hh.ru/employer/${employer.id}`,
          find_instructions: `hh.ru employer: https://hh.ru/employer/${employer.id}`,
          notes: `Found via hh.ru search: "${searchQuery}" in ${vacancy.area?.name || area}`,
          scraped_from: 'hh.ru',
        });
      }
    } catch (e) { console.error(`[scrape] hh.ru area ${area} error:`, e.message); }
  }
  return leads;
}

// ─── SUPERJOB SCRAPER ────────────────────────────────────────
async function scrapeSuperjob(searchQuery, apiKey, maxLeads = 100) {
  const params = new URLSearchParams({ keyword: searchQuery, count: String(Math.min(maxLeads, 50)), no_agreement: '1' });
  const res = await fetch(`https://api.superjob.ru/2.0/vacancies/?${params}`, {
    headers: { 'X-Api-App-Id': apiKey },
  });
  const data = await res.json();
  if (!data.objects) return [];

  const seenEmployers = new Set();
  const leads = [];

  for (const vacancy of data.objects) {
    if (leads.length >= maxLeads) break;
    const client = vacancy.client;
    if (!client || seenEmployers.has(String(client.id))) continue;
    seenEmployers.add(String(client.id));

    leads.push({
      company_name: client.title,
      domain: client.url?.replace(/^https?:\/\//, '').split('/')[0] || null,
      sector: inferSector(vacancy.profession, client.industry),
      priority: 'MEDIUM',
      city: vacancy.town?.title || null,
      phone: client.phones?.[0]?.number || null,
      company_size: client.staff_count ? `~${client.staff_count}` : null,
      pain_point: `Hiring "${vacancy.profession}" on SuperJob.ru.`,
      decision_maker_title: 'HR Manager / HR Director',
      source_url: `https://www.superjob.ru/clients/${client.id}/`,
      find_instructions: `SuperJob employer: https://www.superjob.ru/clients/${client.id}/`,
      notes: `Found via SuperJob search: "${searchQuery}"`,
      scraped_from: 'superjob',
    });
  }
  return leads;
}

// ─── GET: Fetch scrape config / history ──────────────────────
export async function GET(request) {
  const user = getUserFromRequest(request);
  if (!user || !isAdmin(user.role)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  if (searchParams.get('config') === '1') {
    const pid = searchParams.get('project_id');
    let region = 'russia';
    if (pid) {
      const proj = await queryOne('SELECT name FROM gtm_projects WHERE id = $1', [pid]);
      if (proj && /arabic|arab|gcc|uae|saudi|gulf|dubai/i.test(proj.name)) region = 'gcc';
    }
    if (region === 'gcc') {
      return NextResponse.json({
        region: 'gcc',
        cities: GCC_CITIES,
        industries: GCC_INDUSTRY_OPTIONS,
        dorkPresets: GCC_DORK_PRESET_OPTIONS,
        hasGoogleMapsKey: !!process.env.GOOGLE_MAPS_API_KEY,
        has2gisKey: false,
        hasSuperjobKey: false,
      });
    }
    return NextResponse.json({
      region: 'russia',
      cities: RUSSIAN_CITIES,
      industries: INDUSTRY_OPTIONS,
      dorkPresets: DORK_PRESET_OPTIONS,
      has2gisKey: !!process.env.TWOGIS_API_KEY,
      hasSuperjobKey: !!process.env.SUPERJOB_API_KEY,
    });
  }

  const pid = searchParams.get('project_id');
  const pf = pid ? ` WHERE project_id = ${parseInt(pid)}` : '';
  const jobs = await queryAll(`SELECT * FROM gtm_scrape_jobs${pf} ORDER BY created_at DESC LIMIT 20`);
  return NextResponse.json(jobs);
}
