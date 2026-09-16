// GTM CRM — Set up the Russian-language project and its admin team.
// Idempotent: safe to run more than once.
//
// Usage:
//   node scripts/setup-russian-project.js            # create project + admins (no emails are sent)
//   node scripts/setup-russian-project.js --send-email # also email each admin a Russian invitation
//   node scripts/setup-russian-project.js --project-id=1
//        # instead of creating a new project, mark an existing one (e.g. Russia GTM) as Russian-language
//
// What it does:
//   1. Ensures the schema (gtm_projects, language / job_title columns) exists.
//   2. Creates the project "Taha Airwaves — Россия" with language = 'ru' (or updates --project-id).
//   3. Creates the two admins below as super_admin with language = 'ru', and maps them to the project.
//   4. Optionally (--send-email) emails each of them a Russian invitation. By default nothing is sent —
//      the admins are told about their access manually.

const fs = require('fs');
const path = require('path');
const db = require('./_db');
const bcrypt = require('bcryptjs');

const args = process.argv.slice(2);
const SEND_EMAIL = args.includes('--send-email');
const EXISTING_PROJECT_ID = (args.find(a => a.startsWith('--project-id=')) || '').split('=')[1] || null;

const PROJECT = {
  name: 'Taha Airwaves — Россия',
  slug: 'taha-airwaves-russia',
  country: 'Россия',
  description: 'Русскоязычный проект: лиды, шаблоны и рассылки для рынка России',
  color: '#DC2626',
  icon: 'language',
  language: 'ru',
};

const ADMINS = [
  {
    name: 'Данил Дегтярев', name_en: 'Danil Degtiarev',
    job_title: 'Менеджер по продажам', job_title_en: 'Sales Manager',
    email: 'danil.degtiarev@tahaairwaves.ru',
  },
  {
    name: 'Мария Ситникова', name_en: 'Maria Sitnikova',
    job_title: 'Советник по операционной деятельности и развитию бизнеса', job_title_en: 'Business Operations & Development Advisor',
    email: 'maria.sitnikova@tahaairwaves.ru',
  },
];
const ROLE = 'super_admin';

async function run() {
  console.log('▶ Ensuring schema…');
  await db.initSchema();

  // ── Project ──────────────────────────────────────────────────────────────
  let project;
  if (EXISTING_PROJECT_ID) {
    project = await db.queryOne(
      "UPDATE gtm_projects SET language = 'ru' WHERE id = $1 RETURNING id, name, language",
      [EXISTING_PROJECT_ID]
    );
    if (!project) { console.error(`Project #${EXISTING_PROJECT_ID} not found`); process.exit(1); }
    console.log(`✓ Project #${project.id} "${project.name}" marked as Russian-language`);
  } else {
    project = await db.queryOne('SELECT id, name, language FROM gtm_projects WHERE slug = $1', [PROJECT.slug]);
    if (project) {
      await db.query("UPDATE gtm_projects SET language = 'ru', is_active = true WHERE id = $1", [project.id]);
      console.log(`✓ Project already exists: #${project.id} "${project.name}"`);
    } else {
      project = await db.queryOne(
        `INSERT INTO gtm_projects (name, slug, country, description, color, icon, language)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, language`,
        [PROJECT.name, PROJECT.slug, PROJECT.country, PROJECT.description, PROJECT.color, PROJECT.icon, PROJECT.language]
      );
      console.log(`✓ Created project #${project.id} "${project.name}" (language: ru)`);
    }
  }

  // ── Admin users ──────────────────────────────────────────────────────────
  let sendInvite = null;
  if (SEND_EMAIL) {
    try { ({ sendInvite } = require('../src/lib/mailer')); } catch (e) { console.warn('  (mailer unavailable, skipping emails:', e.message + ')'); }
  }

  for (const a of ADMINS) {
    const email = a.email.toLowerCase();
    let user = await db.queryOne('SELECT id, role FROM gtm_users WHERE email = $1', [email]);
    if (user) {
      await db.query(
        `UPDATE gtm_users SET name = $1, name_en = $2, job_title = $3, job_title_en = $4, role = $5, language = 'ru', is_active = 1 WHERE id = $6`,
        [a.name, a.name_en, a.job_title, a.job_title_en, ROLE, user.id]
      );
      console.log(`✓ Updated existing user #${user.id} ${a.name} <${email}> → ${ROLE}`);
    } else {
      // Placeholder password: admins log in with email + OTP, and can set their own via "Forgot password".
      const hash = await bcrypt.hash('temp_' + Date.now() + Math.random(), 10);
      user = await db.queryOne(
        `INSERT INTO gtm_users (name, name_en, email, password_hash, role, job_title, job_title_en, language, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'ru',1) RETURNING id, role`,
        [a.name, a.name_en, email, hash, ROLE, a.job_title, a.job_title_en]
      );
      console.log(`✓ Created ${ROLE} #${user.id} ${a.name} (${a.name_en}) <${email}>`);
    }

    // Super admins see every project anyway, but map them explicitly so the project shows as "theirs".
    await db.query(
      `INSERT INTO gtm_project_members (user_id, project_id, role, added_by)
       VALUES ($1, $2, 'owner', $1) ON CONFLICT (user_id, project_id) DO NOTHING`,
      [user.id, project.id]
    );

    if (sendInvite) {
      try {
        await sendInvite({ email, name: a.name, roleName: 'Супер-администратор', projectNames: [project.name], lang: 'ru' });
        console.log(`  ✉ Invite sent to ${email}`);
      } catch (e) {
        console.warn(`  ⚠ Invite email failed for ${email}: ${e.message}`);
      }
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Russian project ready                                    ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Project: #${String(project.id).padEnd(4)} ${project.name.padEnd(40)}║`);
  ADMINS.forEach(a => console.log(`║  ${a.email.padEnd(56)}║`));
  console.log('║  Login: email → OTP code (no password required)          ║');
  if (!SEND_EMAIL) console.log('║  No invitation emails were sent (use --send-email)       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  process.exit(0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
