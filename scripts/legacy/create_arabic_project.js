const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query("INSERT INTO gtm_projects (name, slug, description) VALUES ('Arabic GTM', 'arabic-gtm', 'GCC Region - UAE, Saudi, Qatar, Kuwait, Oman, Bahrain') RETURNING id, name")
  .then(r => { console.log(JSON.stringify(r.rows)); process.exit(); })
  .catch(e => { console.error(e.message); process.exit(1); });
