// TexasGTM — Supabase Keep-Alive
// Prevents free-tier pause (7-day inactivity limit)
// Set up as cron: 0 0 */3 * * node /var/www/texasgtm/scripts/keep-alive.js

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Load .env
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

async function keepAlive() {
  try {
    const result = await pool.query('SELECT 1 as alive');
    console.log(`[${new Date().toISOString()}] DB keep-alive OK`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] DB keep-alive FAILED:`, err.message);
  } finally {
    await pool.end();
  }
}

keepAlive();
