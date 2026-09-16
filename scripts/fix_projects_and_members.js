// One-time migration:
// 1. Deactivate the misspelled duplicate "arebic gtm" project (id 2, 0 leads, no references)
// 2. Set country on the real "Arabic GTM" project
// 3. Create gtm_project_members table (missing in production)
// 4. Remove any stray super_admin membership rows (super admins bypass membership — they always see all projects)
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: (/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '') || process.env.DATABASE_SSL === 'false') ? false : { rejectUnauthorized: false } });

async function run() {
  const r1 = await pool.query(
    "UPDATE gtm_projects SET is_active = false WHERE id = 2 AND slug = 'arebic-gtm' RETURNING id, name"
  );
  console.log('deactivated duplicate:', JSON.stringify(r1.rows));

  const r2 = await pool.query(
    "UPDATE gtm_projects SET country = 'GCC' WHERE id = 4 AND (country IS NULL OR country = '') RETURNING id, name, country"
  );
  console.log('updated Arabic GTM:', JSON.stringify(r2.rows));

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gtm_project_members (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      role TEXT DEFAULT 'member',
      added_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, project_id)
    );
    CREATE INDEX IF NOT EXISTS idx_gtm_pm_user ON gtm_project_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_gtm_pm_project ON gtm_project_members(project_id);
  `);
  console.log('gtm_project_members table ready');

  const cleaned = await pool.query(
    "DELETE FROM gtm_project_members WHERE user_id IN (SELECT id FROM gtm_users WHERE role = 'super_admin')"
  );
  console.log('removed super_admin membership rows:', cleaned.rowCount);

  const final = await pool.query('SELECT id, name, country, is_active FROM gtm_projects ORDER BY id');
  console.log('final projects:', JSON.stringify(final.rows, null, 1));
  const mem = await pool.query('SELECT COUNT(*) FROM gtm_project_members');
  console.log('total memberships:', mem.rows[0].count);
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
