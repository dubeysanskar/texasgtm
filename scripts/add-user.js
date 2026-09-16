const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^(\w+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  });
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: (/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') || process.env.DATABASE_SSL === 'false') ? false : { rejectUnauthorized: false } });

async function run() {
  const name = process.argv[2];
  const email = process.argv[3];
  const role = process.argv[4] || 'super_admin';
  if (!name || !email) { console.error('Usage: node add-user.js "Name" "email" [role]'); process.exit(1); }

  const existing = await pool.query('SELECT id,role FROM gtm_users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length) {
    console.log(`User exists (id=${existing.rows[0].id}, role=${existing.rows[0].role}). Updating role to ${role}...`);
    await pool.query('UPDATE gtm_users SET role = $1, is_active = 1 WHERE email = $2', [role, email.toLowerCase()]);
    console.log('✅ Role updated');
  } else {
    const hash = await bcrypt.hash('temp_' + Date.now(), 10);
    await pool.query('INSERT INTO gtm_users (name, email, password_hash, role, is_active) VALUES ($1,$2,$3,$4,1)', [name, email.toLowerCase(), hash, role]);
    console.log(`✅ User "${name}" added as ${role}`);
  }
  await pool.end();
}
run().catch(e => { console.error(e); process.exit(1); });
