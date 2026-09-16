// Fix admins — run on server: node scripts/fix-admins.js
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

async function run() {
  const hash = await bcrypt.hash('GTMCRM2026!', 10);

  // Remove wrong admins
  await pool.query("DELETE FROM gtm_users WHERE email IN ('sdoci17@gmail.com','shubhitamishra@gmail.com')");
  console.log('Removed sdoci17 and shubhitamishra');

  // Add correct CRM admins
  const admins = [
    { name: 'Developer Admin', email: 'sanskarbat@gmail.com' },
    { name: 'Super Admin', email: 'tahaofin@gmail.com' },
  ];
  for (const a of admins) {
    const exists = await pool.query('SELECT id FROM gtm_users WHERE email=$1', [a.email]);
    if (exists.rows.length) { console.log('Already exists:', a.email); continue; }
    const r = await pool.query(
      'INSERT INTO gtm_users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id',
      [a.name, a.email, hash, 'super_admin']
    );
    console.log('Created:', a.email, 'ID:', r.rows[0].id);
  }

  // Verify sachin
  const sachin = await pool.query("SELECT id FROM gtm_users WHERE email='sachin.dmcoi.marketing@gmail.com'");
  console.log('Sachin exists:', sachin.rows.length > 0);

  // Show final admins
  const all = await pool.query("SELECT id,name,email,role FROM gtm_users WHERE role='super_admin' ORDER BY id");
  console.log('\nFinal admins:');
  all.rows.forEach(u => console.log(' ', u.id, u.name, u.email));

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
