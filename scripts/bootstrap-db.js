// GTM CRM — Bootstrap a brand-new database from scratch.
// Use this on a fresh database: SQLite (no DATABASE_URL needed) or PostgreSQL (DATABASE_URL in .env).
//
//   node scripts/bootstrap-db.js              # schema + projects + super admins + Russian project/admins + seeds (if files present)
//   node scripts/bootstrap-db.js --no-seed    # skip templates / leads seeding
//   node scripts/bootstrap-db.js --send-email # also email the Russian admins their invitations (off by default)
//
// Idempotent — safe to re-run.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const db = require('./_db');
const bcrypt = require('bcryptjs');

const args = process.argv.slice(2);
const NO_SEED = args.includes('--no-seed');
const SEND_EMAIL = args.includes('--send-email');

// Projects that existed on the old database
const PROJECTS = [
  { name: 'Russia GTM', slug: 'russia-gtm', country: 'Russia', color: '#DC2626', language: 'en', description: 'Russian market — B2B leads (English UI)' },
  { name: 'Arabic GTM', slug: 'arabic-gtm', country: 'GCC', color: '#16A34A', language: 'en', description: 'GCC Region - UAE, Saudi, Qatar, Kuwait, Oman, Bahrain' },
];

// Super admins (OTP login, no password needed). Edit this list as needed.
const SUPER_ADMINS = [
  { name: 'Developer Admin', email: 'sanskarbat@gmail.com', language: 'en' },
  { name: 'Super Admin', email: 'tahaofin@gmail.com', language: 'en' },
];

async function ensureProject(p) {
  let row = await db.queryOne('SELECT id, name FROM gtm_projects WHERE slug = $1', [p.slug]);
  if (row) { console.log(`  ✓ project exists: #${row.id} ${row.name}`); return row; }
  row = await db.queryOne(
    'INSERT INTO gtm_projects (name, slug, country, description, color, icon, language) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name',
    [p.name, p.slug, p.country, p.description || '', p.color, 'language', p.language]
  );
  console.log(`  ✓ created project #${row.id} ${row.name}`);
  return row;
}

async function ensureSuperAdmin(a) {
  const email = a.email.toLowerCase();
  const existing = await db.queryOne('SELECT id FROM gtm_users WHERE email = $1', [email]);
  if (existing) {
    await db.query("UPDATE gtm_users SET role = 'super_admin', is_active = 1 WHERE id = $1", [existing.id]);
    console.log(`  ✓ super admin exists: ${email}`); return existing.id;
  }
  const hash = await bcrypt.hash('temp_' + Date.now() + Math.random(), 10);
  const row = await db.queryOne(
    "INSERT INTO gtm_users (name, email, password_hash, role, language, is_active) VALUES ($1,$2,$3,'super_admin',$4,1) RETURNING id",
    [a.name, email, hash, a.language || 'en']
  );
  console.log(`  ✓ created super admin #${row.id} ${email}`);
  return row.id;
}

function runScript(rel, extra = []) {
  const file = path.join(__dirname, rel);
  console.log(`\n▶ ${rel} ${extra.join(' ')}`);
  execFileSync(process.execPath, [file, ...extra], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

async function run() {
  console.log('▶ Creating schema…');
  await db.initSchema();

  console.log('\n▶ Projects');
  const projects = {};
  for (const p of PROJECTS) projects[p.slug] = await ensureProject(p);

  console.log('\n▶ Super admins');
  for (const a of SUPER_ADMINS) await ensureSuperAdmin(a);

  // Russian project + its two admins (separate script, reused as-is)
  runScript('setup-russian-project.js', SEND_EMAIL ? ['--send-email'] : []);

  if (!NO_SEED) {
    const root = path.join(__dirname, '..');
    const tplMd = ['Taha_Airwaves_Cold_Email_Templates_EN_RU_DE_AR.md'].map(f => path.join(root, f)).concat([path.join(root, '..', 'Taha_Airwaves_Cold_Email_Templates_EN_RU_DE_AR.md')]).find(f => fs.existsSync(f));
    const leadsXlsx = [path.join(root, 'Taha_Airwaves_Russia_FULL_605_Leads.xlsx'), path.join(root, '..', 'Taha_Airwaves_Russia_FULL_605_Leads.xlsx')].find(f => fs.existsSync(f));

    if (tplMd) {
      runScript('seed-templates.js', [tplMd]);
      const r = await db.query('UPDATE gtm_templates SET project_id = $1 WHERE project_id IS NULL', [projects['russia-gtm'].id]);
      console.log(`  ✓ assigned ${r.rowCount} seeded templates to Russia GTM (#${projects['russia-gtm'].id})`);
      runScript('copy-templates.js', ['--from=russia-gtm', '--to=taha-airwaves-russia', '--lang=ru']);
    } else console.log('\n(skip templates: MD file not found)');
    if (leadsXlsx) {
      runScript('seed-excel.js', [leadsXlsx]);
      const r = await db.query('UPDATE gtm_leads SET project_id = $1 WHERE project_id IS NULL', [projects['russia-gtm'].id]);
      console.log(`  ✓ assigned ${r.rowCount} seeded leads to Russia GTM (#${projects['russia-gtm'].id})`);
      await db.query('UPDATE gtm_leads SET project_seq = NULL WHERE project_id = $1', [projects['russia-gtm'].id]);
      await db.backfillProjectSeq();
    } else console.log('\n(skip leads: XLSX file not found)');
  }

  const counts = await db.queryOne(`SELECT
      (SELECT COUNT(*) FROM gtm_projects) AS projects, (SELECT COUNT(*) FROM gtm_users) AS users,
      (SELECT COUNT(*) FROM gtm_leads) AS leads, (SELECT COUNT(*) FROM gtm_templates) AS templates`);
  console.log('\n✅ Bootstrap complete:', JSON.stringify(counts));
  console.log('   Next: restart the app (pm2 restart texasgtm) and add SMTP accounts in Admin → Email / SMTP if the .env SMTP is not set.');
  process.exit(0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
