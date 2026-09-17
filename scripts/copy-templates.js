// GTM CRM — copy outreach templates from one project into another, switching the primary language.
//
//   node scripts/copy-templates.js --from=russia-gtm --to=taha-airwaves-russia --lang=ru
//   node scripts/copy-templates.js --from=null --to=russia-gtm            # adopt templates that have no project
//
// --from   source project slug or id, or "null" for templates without a project
// --to     target project slug or id
// --lang   primary language for the copies (default: the target project's language). The source's
//          translation for that language becomes subject/body; every other language stays as a translation.
// Idempotent: a template whose (translated) name already exists in the target project is skipped.
const db = require('./_db');

const flags = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || 'true']; }));

// Russian names for the seeded template groups
const NAME_RU = {
  'Speed / Deadline Angle': 'Скорость / сроки',
  'Compliance / Risk Angle': 'Соответствие / риски',
  'Cost / Efficiency Angle': 'Стоимость / эффективность',
  'Capacity / Scale Angle': 'Мощности / масштаб',
  'Construction (Industry)': 'Строительство (отрасль)',
  'Manufacturing (Industry)': 'Производство (отрасль)',
  'Logistics & Warehousing (Industry)': 'Логистика и склад (отрасль)',
};
const TOUCH = { ru: 'Касание', en: 'Touch' };

function translateName(name, lang) {
  if (lang !== 'ru') return name;
  const m = name.match(/^(.*?)(?: — Touch (\d))?$/);
  const base = NAME_RU[m[1]] || m[1];
  return m[2] ? `${base} — ${TOUCH.ru} ${m[2]}` : base;
}

async function findProject(ref) {
  if (ref === 'null' || ref === undefined) return null;
  const byId = /^\d+$/.test(ref);
  const p = await db.queryOne(`SELECT id, name, language FROM gtm_projects WHERE ${byId ? 'id = $1' : 'slug = $1'}`, [byId ? Number(ref) : ref]);
  if (!p) { console.error(`✗ Project "${ref}" not found`); process.exit(1); }
  return p;
}

async function run() {
  if (!flags.to) { console.error('Usage: node scripts/copy-templates.js --from=<slug|id|null> --to=<slug|id> [--lang=ru]'); process.exit(1); }
  const from = await findProject(flags.from);
  const to = await findProject(flags.to);
  const lang = flags.lang || to.language || 'en';

  const src = from
    ? await db.queryAll('SELECT * FROM gtm_templates WHERE project_id = $1 ORDER BY id', [from.id])
    : await db.queryAll('SELECT * FROM gtm_templates WHERE project_id IS NULL ORDER BY id');
  if (!src.length) { console.log('No templates in source'); process.exit(0); }
  console.log(`▶ ${src.length} templates: ${from ? from.name : '(no project)'} → ${to.name} as ${lang}`);

  let added = 0, skipped = 0;
  for (const t of src) {
    const tr = typeof t.translations === 'string' ? JSON.parse(t.translations || '{}') : (t.translations || {});
    const name = translateName(t.name, lang);
    const exists = await db.queryOne('SELECT id FROM gtm_templates WHERE project_id = $1 AND name = $2', [to.id, name]);
    if (exists) { skipped++; continue; }

    // Primary text = the requested language; everything else becomes a translation
    const all = { [t.language || 'en']: { subject: t.subject || '', body: t.body || '' }, ...tr };
    const primary = all[lang] || all[t.language || 'en'];
    const rest = Object.fromEntries(Object.entries(all).filter(([k]) => k !== lang));

    await db.query(
      'INSERT INTO gtm_templates (name, platform, status, subject, body, language, translations, created_by, project_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [name, t.platform || 'email', t.status || 'active', primary.subject, primary.body, lang, JSON.stringify(rest), t.created_by || null, to.id]
    );
    added++;
  }
  console.log(`✓ added ${added}, skipped ${skipped} (already present)`);
  await db.close();
}
run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
