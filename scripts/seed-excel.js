// GTM CRM — Seed leads from Excel file
// Run: node scripts/seed-excel.js <path-to-xlsx>
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const XLSX = require('xlsx');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^(\w+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  });
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: (/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') || process.env.DATABASE_SSL === 'false') ? false : { rejectUnauthorized: false } });

function dedupKey(name, domain) {
  return (name || '').toLowerCase().replace(/[^a-zA-Zа-яА-Я0-9]/g, '') + ((domain || '').toLowerCase().replace(/[^a-z0-9.]/g, ''));
}

function inferSector(industry) {
  const t = (industry || '').toLowerCase();
  if (/construct|строитель|cement|бетон|real estate/.test(t)) return 'construction';
  if (/manufactur|завод|production|industrial|timber|glass|paper|textile|plastic|rubber|ceramic|insulation|building mat/.test(t)) return 'manufacturing';
  if (/warehouse|logistic|склад|port|shipping|freight|transport|rail/.test(t)) return 'warehouse_logistics';
  if (/food|meat|dairy|fish|bread|confection|brew|agri|farm|grain|poultry|sugar|пищев/.test(t)) return 'food_processing';
  if (/metallurg|steel|metal|iron|alumin|titanium|zinc|copper|nickel|tin|smelting|foundry/.test(t)) return 'metallurgy';
  if (/mining|mine|gold|diamond|coal|ore|quarry/.test(t)) return 'mining';
  if (/chemical|petrochem|oil|gas|refiner|pipeline|pharma|fertiliz/.test(t)) return 'chemicals';
  if (/auto|car|truck|vehicle|engine/.test(t)) return 'automotive';
  if (/hotel|restaurant|cafe|coffee|hospitality|catering|tourism|resort/.test(t)) return 'hospitality';
  if (/retail|shop|store|supermarket|hypermarket|e-commerce|marketplace/.test(t)) return 'retail';
  if (/staffing|agency|recruiting|hr service|recruitment|outsourc/.test(t)) return 'agency_partner';
  if (/association|chamber|union|federation|government|ministry/.test(t)) return 'industry_association';
  return 'other';
}

function inferPriority(p) {
  const t = (p || '').toUpperCase().trim();
  if (t === 'HOT' || t.includes('HOT')) return 'HOT';
  if (t === 'HIGH' || t.includes('HIGH')) return 'HIGH';
  if (t === 'PARTNER' || t.includes('PARTNER')) return 'PARTNER';
  return 'MEDIUM';
}

async function run() {
  const filePath = process.argv[2] || path.join(__dirname, '..', '..', 'Taha_Airwaves_Russia_FULL_605_Leads.xlsx');

  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['605 Leads Database'];
  if (!ws) { console.error('Sheet "605 Leads Database" not found'); process.exit(1); }

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  // Find header row (row with "#" in first column)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i] && rows[i][0] === '#') { headerIdx = i; break; }
  }
  if (headerIdx === -1) { console.error('Header row not found'); process.exit(1); }

  const headers = rows[headerIdx]; // #, Company, Industry, City/Region, Size, Why..., Decision Maker, Where to Find, Contact Method, Phone, Email Format, Priority, Status, Notes
  const data = rows.slice(headerIdx + 1).filter(r => r && r[1]); // Skip empty rows

  console.log(`Found ${data.length} leads in Excel`);

  let added = 0, skipped = 0, errors = 0;

  for (const row of data) {
    const companyName = (row[1] || '').toString().trim();
    if (!companyName) continue;

    const industry = (row[2] || '').toString().trim();
    const cityRegion = (row[3] || '').toString().trim();
    const [city, region] = cityRegion.includes(',') ? cityRegion.split(',').map(s => s.trim()) : [cityRegion, ''];
    const companySize = (row[4] || '').toString().trim();
    const painPoint = (row[5] || '').toString().trim();
    const decisionMaker = (row[6] || '').toString().trim();
    const findInstructions = (row[7] || '').toString().trim();
    const contactMethod = (row[8] || '').toString().trim();
    const phone = (row[9] || '').toString().trim();
    const email = (row[10] || '').toString().trim();
    const priority = inferPriority((row[11] || '').toString());
    const notes = (row[13] || '').toString().trim();

    // Extract domain from email
    let domain = '';
    if (email && email.includes('@')) {
      domain = email.split('@')[1] || '';
    }

    const sector = inferSector(industry);
    const dk = dedupKey(companyName, domain);

    try {
      const existing = await pool.query('SELECT id FROM gtm_leads WHERE dedup_key = $1', [dk]);
      if (existing.rows.length) { skipped++; continue; }

      await pool.query(
        `INSERT INTO gtm_leads (company_name, domain, sector, priority, status, city, region, company_size, pain_point, decision_maker_title, phone, email, contact_method, find_instructions, notes, scraped_from, dedup_key, country) VALUES ($1,$2,$3,$4,'not_contacted',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'excel_import',$15,'Russia')`,
        [companyName, domain, sector, priority, city, region, companySize, painPoint, decisionMaker, phone, email, contactMethod, findInstructions, notes, dk]
      );
      added++;
    } catch (e) {
      if (e.message?.includes('duplicate') || e.message?.includes('unique')) skipped++;
      else { errors++; console.error(`Error for "${companyName}":`, e.message); }
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   Added: ${added}`);
  console.log(`   Skipped (duplicates): ${skipped}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total processed: ${data.length}`);

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
