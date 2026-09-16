const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^(\w+)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
  });
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: (/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') || process.env.DATABASE_SSL === 'false') ? false : { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gtm_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'email',
      status TEXT DEFAULT 'active',
      subject TEXT DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      language TEXT DEFAULT 'en',
      translations JSONB DEFAULT '{}',
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_gtm_templates_platform ON gtm_templates(platform);
  `);
  console.log('gtm_templates table created OK');

  // Add last_template_id column to gtm_leads if not exists
  await pool.query(`ALTER TABLE gtm_leads ADD COLUMN IF NOT EXISTS last_template_id INTEGER`);
  console.log('last_template_id column ensured');

  await pool.end();
}

run().catch(e => { console.error(e); process.exit(1); });
