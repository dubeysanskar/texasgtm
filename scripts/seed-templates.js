// Seed templates from MD file into gtm_templates
// Run: node scripts/seed-templates.js
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^(\w+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  });
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: (/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') || process.env.DATABASE_SSL === 'false') ? false : { rejectUnauthorized: false } });

const candidates = [
  process.argv[2],
  path.join(__dirname, '..', 'Taha_Airwaves_Cold_Email_Templates_EN_RU_DE_AR.md'),
  path.join(__dirname, '..', '..', 'Taha_Airwaves_Cold_Email_Templates_EN_RU_DE_AR.md'),
].filter(Boolean);
const mdPath = candidates.find(p => fs.existsSync(p));
if (!mdPath) { console.error('MD file not found'); process.exit(1); }
const md = fs.readFileSync(mdPath, 'utf8');

// Parse templates from MD
const TEMPLATE_NAMES = [
  { num: 1, name: 'Speed / Deadline Angle', desc: 'For buyers whose real pain is a stalled timeline' },
  { num: 2, name: 'Compliance / Risk Angle', desc: 'For buyers wary of grey-market labour brokers' },
  { num: 3, name: 'Cost / Efficiency Angle', desc: 'For procurement and finance-driven decision makers' },
  { num: 4, name: 'Capacity / Scale Angle', desc: 'For buyers managing large or recurring projects' },
  { num: 5, name: 'Construction (Industry)', desc: 'Same offer, written for construction sector pain points' },
  { num: 6, name: 'Manufacturing (Industry)', desc: 'Same offer, written for manufacturing/production floor' },
  { num: 7, name: 'Logistics & Warehousing (Industry)', desc: 'Same offer, written for logistics/warehousing' },
];

function extractBody(text) {
  // Remove subject line and get clean body
  let body = text.replace(/^\*\*(Subject|Тема|Betreff|الموضوع):\*\*\s*.+\n+/m, '').trim();
  return body;
}

function extractSubject(text) {
  const m = text.match(/^\*\*(Subject|Тема|Betreff|الموضوع):\*\*\s*(.+)/m);
  return m ? m[2].trim() : '';
}

// Split MD by template sections
const sections = md.split(/^## TEMPLATE \d+:/m).slice(1);

async function run() {
  let added = 0;
  for (let i = 0; i < sections.length && i < TEMPLATE_NAMES.length; i++) {
    const sec = sections[i];
    const info = TEMPLATE_NAMES[i];
    
    // For each touch (1-3), extract all 4 languages
    for (let touch = 1; touch <= 3; touch++) {
      const touchLabel = `Touch ${touch}`;
      // Find all Touch N sections
      const touchPattern = new RegExp(`### ${touchLabel} \\((English|Russian|German|Arabic)\\)\\s*\\n([\\s\\S]*?)(?=### Touch|## TEMPLATE|---\\s*\\n|$)`, 'g');
      
      const langs = {};
      let match;
      while ((match = touchPattern.exec(sec)) !== null) {
        const lang = match[1];
        const content = match[2].trim();
        const langCode = { English: 'en', Russian: 'ru', German: 'de', Arabic: 'ar' }[lang];
        if (langCode) {
          langs[langCode] = { subject: extractSubject(content), body: extractBody(content) };
        }
      }
      
      if (!langs.en) continue;
      
      const translations = {};
      if (langs.ru) translations.ru = langs.ru;
      if (langs.de) translations.de = langs.de;
      if (langs.ar) translations.ar = langs.ar;
      
      const name = `${info.name} — ${touchLabel}`;
      const existing = await pool.query('SELECT id FROM gtm_templates WHERE name = $1', [name]);
      if (existing.rows.length) continue;
      
      await pool.query(
        'INSERT INTO gtm_templates (name, platform, status, subject, body, language, translations) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [name, 'email', 'active', langs.en.subject, langs.en.body, 'en', JSON.stringify(translations)]
      );
      added++;
    }
  }
  console.log(`✅ Seeded ${added} templates`);
  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
