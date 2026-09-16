// GTM CRM — Create Super Admin User
// Usage: node scripts/create-admin.js
// Run this AFTER setting DATABASE_URL in .env

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Load .env manually


const db = require('./_db');

async function run() {
  // Create tables first
  console.log('Initializing schema...');
  await db.initSchema();
  console.log('Schema ready.');

  // Create super admin
  const name = 'Admin';
  const email = 'admin@gtmcrm.local';
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);

  const existing = await db.query('SELECT id FROM gtm_users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    console.log(`\nAdmin user already exists (ID: ${existing.rows[0].id})`);
  } else {
    const res = await db.query(
      'INSERT INTO gtm_users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, email, hash, 'super_admin']
    );
    console.log(`\n✅ Super Admin created (ID: ${res.rows[0].id})`);
  }

  console.log('\n╔════════════════════════════════════╗');
  console.log('║   GTM CRM Super Admin Credentials  ║');
  console.log('╠════════════════════════════════════╣');
  console.log(`║  Email:    ${email}     ║`);
  console.log(`║  Password: ${password}                  ║`);
  console.log('╚════════════════════════════════════╝');
  console.log('\n⚠️  Change the password after first login!\n');

  await db.close();
}

run().catch(e => { console.error(e); process.exit(1); });
