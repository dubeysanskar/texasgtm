// GTM CRM — create or update a user from the command line (no emails are sent).
//
//   node scripts/add-user.js "Name" email [role] [--lang=ru|en] [--project=<slug|id>] [--title="Job title"] [--password=...]
//
// Examples:
//   node scripts/add-user.js "Sanskar Dubey" sanskardubeyxo@gmail.com super_admin --lang=ru --project=taha-airwaves-russia
//   node scripts/add-user.js "Иван Петров" ivan@example.ru staff --lang=ru --project=taha-airwaves-russia --title="Менеджер" --password=Secret123
//
// Roles: super_admin (OTP-only login), manager (OTP-only), staff, marketing, viewer (password + OTP).
// Existing users are updated in place (role / language / title / project mapping).
const bcrypt = require('bcryptjs');
const db = require('./_db');

const positional = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || 'true']; }));

async function run() {
  const [name, emailRaw, roleRaw] = positional;
  if (!name || !emailRaw) {
    console.error('Usage: node scripts/add-user.js "Name" email [role] [--lang=ru|en] [--project=<slug|id>] [--title="Job title"] [--password=...]');
    process.exit(1);
  }
  const email = emailRaw.toLowerCase().trim();
  const role = roleRaw || 'super_admin';
  const lang = flags.lang === 'ru' ? 'ru' : 'en';
  const title = flags.title || '';

  let user = await db.queryOne('SELECT id, role FROM gtm_users WHERE email = $1', [email]);
  if (user) {
    await db.query(
      `UPDATE gtm_users SET name = $1, role = $2, language = $3, job_title = COALESCE(NULLIF($4, ''), job_title), is_active = 1 WHERE id = $5`,
      [name, role, lang, title, user.id]
    );
    console.log(`✓ Updated user #${user.id} ${email} → role ${role}, language ${lang}`);
  } else {
    const hash = await bcrypt.hash(flags.password || ('temp_' + Date.now() + Math.random()), 10);
    user = await db.queryOne(
      `INSERT INTO gtm_users (name, email, password_hash, role, language, job_title, is_active) VALUES ($1,$2,$3,$4,$5,$6,1) RETURNING id, role`,
      [name, email, hash, role, lang, title]
    );
    console.log(`✓ Created user #${user.id} ${name} <${email}> as ${role} (language ${lang})`);
  }
  if (flags.password && user) {
    const hash = await bcrypt.hash(flags.password, 10);
    await db.query('UPDATE gtm_users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
    console.log('  password set');
  }

  if (flags.project) {
    const byId = /^\d+$/.test(flags.project);
    const project = await db.queryOne(`SELECT id, name FROM gtm_projects WHERE ${byId ? 'id = $1' : 'slug = $1'}`, [byId ? Number(flags.project) : flags.project]);
    if (!project) { console.error(`✗ Project "${flags.project}" not found. Available:`); (await db.queryAll('SELECT id, slug, name FROM gtm_projects')).forEach(p => console.error(`   #${p.id} ${p.slug} — ${p.name}`)); process.exit(1); }
    await db.query(
      `INSERT INTO gtm_project_members (user_id, project_id, role, added_by) VALUES ($1, $2, $3, $1) ON CONFLICT (user_id, project_id) DO NOTHING`,
      [user.id, project.id, role === 'super_admin' ? 'owner' : 'member']
    );
    console.log(`✓ Mapped to project #${project.id} "${project.name}"`);
  }

  const otpOnly = ['super_admin', 'manager'].includes(role);
  console.log(`\nLogin: ${email} → ${otpOnly ? 'email only, then the 6-digit code from the inbox (no password)' : 'password + 6-digit code'}`);
  await db.close();
}
run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
