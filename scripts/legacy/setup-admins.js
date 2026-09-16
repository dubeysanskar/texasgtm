// GTM CRM — Setup Real Admins
// Adds CRM admins + new admin, removes test admin
// Run: node scripts/setup-admins.js

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^(\w+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  });
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') || process.env.DATABASE_SSL === 'false') ? false : { rejectUnauthorized: false },
});

const ADMINS = [
  { name: 'Sanskar Dubey', email: 'sdoci17@gmail.com', role: 'super_admin' },
  { name: 'Shubhi Tamishra', email: 'shubhitamishra@gmail.com', role: 'super_admin' },
  { name: 'Sachin', email: 'sachin.dmcoi.marketing@gmail.com', role: 'super_admin' },
];

async function run() {
  console.log('Setting up GTM CRM admins...\n');

  // Default password (they'll use OTP login, but bcrypt hash needed for the column)
  const hash = await bcrypt.hash('GTMCRM2026!', 10);

  for (const admin of ADMINS) {
    const existing = await pool.query('SELECT id FROM gtm_users WHERE email = $1', [admin.email]);
    if (existing.rows.length > 0) {
      console.log(`  ✓ ${admin.email} already exists (ID: ${existing.rows[0].id})`);
    } else {
      const res = await pool.query(
        'INSERT INTO gtm_users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [admin.name, admin.email, hash, admin.role]
      );
      console.log(`  ✅ Created ${admin.name} <${admin.email}> (ID: ${res.rows[0].id})`);
    }
  }

  // Remove test admin
  const testAdmin = await pool.query("SELECT id FROM gtm_users WHERE email = 'admin@gtmcrm.local'");
  if (testAdmin.rows.length > 0) {
    await pool.query("DELETE FROM gtm_users WHERE email = 'admin@gtmcrm.local'");
    console.log('\n  🗑️  Removed test admin (admin@gtmcrm.local)');
  }

  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║    GTM CRM Admins Ready               ║');
  console.log('╠═══════════════════════════════════════╣');
  ADMINS.forEach(a => console.log(`║  ${a.email.padEnd(38)}║`));
  console.log('║                                       ║');
  console.log('║  Login: OTP sent to email (no pwd)    ║');
  console.log('╚═══════════════════════════════════════╝');

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
