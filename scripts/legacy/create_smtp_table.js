// Create gtm_smtp_accounts table (project-wise multi-SMTP for Auto Email)
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: (/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') || process.env.DATABASE_SSL === 'false') ? false : { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gtm_smtp_accounts (
      id SERIAL PRIMARY KEY,
      project_id INTEGER,
      label TEXT NOT NULL DEFAULT '',
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 465,
      secure BOOLEAN DEFAULT true,
      username TEXT NOT NULL,
      password TEXT NOT NULL DEFAULT '',
      from_email TEXT NOT NULL DEFAULT '',
      from_name TEXT DEFAULT '',
      daily_limit INTEGER DEFAULT 30,
      is_active BOOLEAN DEFAULT true,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_gtm_smtp_project ON gtm_smtp_accounts(project_id);
  `);
  const c = await pool.query('SELECT COUNT(*) FROM gtm_smtp_accounts');
  console.log('gtm_smtp_accounts ready. Existing rows:', c.rows[0].count);
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
