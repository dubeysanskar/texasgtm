const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  console.log('Creating gtm_project_members table...');
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
  console.log('Table created.');

  // Auto-assign all super_admins to all projects
  const admins = await pool.query("SELECT id FROM gtm_users WHERE role = 'super_admin'");
  const projects = await pool.query("SELECT id FROM gtm_projects WHERE is_active = true");
  
  let count = 0;
  for (const admin of admins.rows) {
    for (const project of projects.rows) {
      try {
        await pool.query(
          'INSERT INTO gtm_project_members (user_id, project_id, role, added_by) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, project_id) DO NOTHING',
          [admin.id, project.id, 'owner', admin.id]
        );
        count++;
      } catch {}
    }
  }
  console.log(`Assigned ${count} admin-project memberships.`);
  process.exit(0);
}

migrate().catch(e => { console.error(e); process.exit(1); });
