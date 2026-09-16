const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = require('./_db');

async function run() {
  const name = process.argv[2];
  const email = process.argv[3];
  const role = process.argv[4] || 'super_admin';
  if (!name || !email) { console.error('Usage: node add-user.js "Name" "email" [role]'); process.exit(1); }

  const existing = await db.query('SELECT id,role FROM gtm_users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length) {
    console.log(`User exists (id=${existing.rows[0].id}, role=${existing.rows[0].role}). Updating role to ${role}...`);
    await db.query('UPDATE gtm_users SET role = $1, is_active = 1 WHERE email = $2', [role, email.toLowerCase()]);
    console.log('✅ Role updated');
  } else {
    const hash = await bcrypt.hash('temp_' + Date.now(), 10);
    await db.query('INSERT INTO gtm_users (name, email, password_hash, role, is_active) VALUES ($1,$2,$3,$4,1)', [name, email.toLowerCase(), hash, role]);
    console.log(`✅ User "${name}" added as ${role}`);
  }
  await db.close();
}
run().catch(e => { console.error(e); process.exit(1); });
