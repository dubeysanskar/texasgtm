/**
 * Database layer — PostgreSQL or SQLite, chosen by environment.
 *
 *   DATABASE_URL=postgresql://user:pass@host:5432/dbname   → PostgreSQL (self-hosted, RDS, Neon, …)
 *   DATABASE_URL=sqlite:./data/gtm.db  (or unset)          → SQLite file (zero-config; default ./data/gtm.db)
 *   DB_DRIVER=postgres|sqlite                               → optional explicit override
 *   DATABASE_SSL=false                                      → disable TLS for a Postgres server without SSL
 *
 * All application code writes Postgres-flavoured SQL ($1 placeholders, NOW(), ILIKE, RETURNING …).
 * The SQLite adapter translates those on the fly, so routes never need to know which engine is behind them.
 *
 * Every query returns { rows, rowCount } like node-postgres does.
 */
const path = require('path');
const fs = require('fs');

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
const DRIVER = (() => {
  const forced = (process.env.DB_DRIVER || '').toLowerCase();
  if (forced === 'postgres' || forced === 'pg' || forced === 'postgresql') return 'postgres';
  if (forced === 'sqlite') return 'sqlite';
  if (/^postgres(ql)?:\/\//i.test(DATABASE_URL)) return 'postgres';
  return 'sqlite';
})();

// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────
let pool;
function getPool() {
  if (!pool) {
    const { Pool } = require('pg');
    // SSL is needed for most hosted Postgres but not for local/self-hosted servers.
    const noSsl = process.env.DATABASE_SSL === 'false' || /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: noSsl ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
    pool.on('error', (err) => console.error('[db] pool error:', err.message));
  }
  return pool;
}

// ─────────────────────────────────────────────────────────────────────────────
// SQLite
// ─────────────────────────────────────────────────────────────────────────────
let sqlite;
function sqlitePath() {
  const m = DATABASE_URL.match(/^(?:sqlite|file):(?:\/\/)?(.+)$/i);
  const p = m ? m[1] : (process.env.SQLITE_PATH || './data/gtm.db');
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}
function getSqlite() {
  if (!sqlite) {
    const Database = require('better-sqlite3');
    const file = sqlitePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    sqlite = new Database(file);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('busy_timeout = 5000');
    sqlite.pragma('foreign_keys = ON');
    // SQLite's built-in LIKE is case-insensitive for ASCII only. Postgres ILIKE (which the app uses for
    // search) folds Cyrillic and other scripts too, so override like() with a Unicode-aware implementation.
    const likeCache = new Map();
    const likeToRegex = (pattern) => {
      let re = likeCache.get(pattern);
      if (!re) {
        const src = String(pattern)
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')   // escape regex metacharacters
          .replace(/%/g, '[\\s\\S]*')                // SQL % → any run of characters
          .replace(/_/g, '[\\s\\S]');                // SQL _ → any single character
        re = new RegExp('^' + src + '$', 'iu');
        if (likeCache.size > 500) likeCache.clear();
        likeCache.set(pattern, re);
      }
      return re;
    };
    sqlite.function('like', { deterministic: true }, (pattern, value) => {
      if (pattern === null || value === null) return null;
      return likeToRegex(pattern).test(String(value).toLowerCase()) ? 1 : 0;
    });
    console.log(`[db] SQLite → ${file}`);
  }
  return sqlite;
}

// ISO-8601 UTC timestamp, so `new Date(value)` on the client parses it exactly like a Postgres timestamp.
const SQLITE_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Translate Postgres-flavoured SQL + $n params into SQLite SQL + positional params. */
function toSqlite(text, params) {
  let sql = text;
  // DDL
  sql = sql.replace(/\bSERIAL PRIMARY KEY\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  sql = sql.replace(/\bTIMESTAMP DEFAULT NOW\(\)/gi, `TEXT DEFAULT (${SQLITE_NOW})`);
  sql = sql.replace(/\bTIMESTAMP\b/gi, 'TEXT');
  sql = sql.replace(/\bJSONB\b/gi, 'TEXT');
  sql = sql.replace(/\bBOOLEAN\b/gi, 'INTEGER');
  // Functions / operators
  sql = sql.replace(/\bNOW\(\)/gi, SQLITE_NOW);
  sql = sql.replace(/\bCURRENT_DATE\b/gi, "date('now')");
  sql = sql.replace(/\bILIKE\b/gi, 'LIKE');
  sql = sql.replace(/::\s*(int|integer|text|numeric|float|boolean)\b/gi, '');
  // $n placeholders → ? (a $n may be reused, so expand params in order of appearance)
  const out = [];
  sql = sql.replace(/\$(\d+)/g, (_, n) => { out.push(params[Number(n) - 1]); return '?'; });
  // SQLite cannot bind booleans/objects/Dates
  const bound = out.map(v => {
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return v.toISOString();
    if (v !== null && typeof v === 'object' && !Buffer.isBuffer(v)) return JSON.stringify(v);
    return v === undefined ? null : v;
  });
  return { sql, params: bound };
}

// Columns declared as JSONB come back as strings from SQLite; parse them so callers see objects like with Postgres.
const JSON_COLUMNS = new Set(['filters', 'translations', 'scraper_config']);
function reviveRow(row) {
  for (const k of JSON_COLUMNS) {
    if (typeof row[k] === 'string') { try { row[k] = JSON.parse(row[k]); } catch {} }
  }
  return row;
}

function sqliteQuery(text, params = []) {
  const db = getSqlite();
  const { sql, params: bound } = toSqlite(text, params);
  const trimmed = sql.trim();
  // Multi-statement scripts (schema) go through exec()
  if (bound.length === 0 && /;\s*[^\s;]/.test(trimmed.replace(/--[^\n]*/g, ''))) {
    db.exec(sql);
    return { rows: [], rowCount: 0 };
  }
  const stmt = db.prepare(sql);
  if (stmt.reader) {
    const rows = stmt.all(...bound).map(reviveRow);
    return { rows, rowCount: rows.length };
  }
  const info = stmt.run(...bound);
  return { rows: [], rowCount: info.changes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API (same shape for both drivers)
// ─────────────────────────────────────────────────────────────────────────────

/** Run a single query */
async function query(text, params = []) {
  if (DRIVER === 'postgres') return getPool().query(text, params);
  return sqliteQuery(text, params);
}

/** Get a single row */
async function queryOne(text, params = []) {
  const res = await query(text, params);
  return res.rows[0] || null;
}

/** Get all rows */
async function queryAll(text, params = []) {
  const res = await query(text, params);
  return res.rows;
}

/** Add a column if it is missing (both engines). */
async function ensureColumn(table, column, definition) {
  if (DRIVER === 'postgres') {
    await query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
    return;
  }
  const cols = getSqlite().prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    const { sql } = toSqlite(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, []);
    getSqlite().exec(sql);
  }
}

/** Initialize all tables */
async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS gtm_users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'staff',
      company TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      setup_otp TEXT,
      setup_otp_expires TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gtm_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gtm_tasks (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      assigned_by INTEGER NOT NULL,
      assigner_name TEXT NOT NULL,
      assigned_to INTEGER,
      status TEXT DEFAULT 'pending',
      priority TEXT DEFAULT 'normal',
      completion_days INTEGER DEFAULT 2,
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gtm_task_comments (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES gtm_tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      message TEXT NOT NULL,
      edited_at TIMESTAMP,
      deleted_at TIMESTAMP,
      image_filename TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gtm_task_status_history (
      id SERIAL PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES gtm_tasks(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT,
      changed_by INTEGER,
      changed_by_name TEXT,
      changed_by_role TEXT,
      changed_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gtm_messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gtm_leads (
      id SERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      domain TEXT,
      sector TEXT NOT NULL DEFAULT 'other',
      priority TEXT NOT NULL DEFAULT 'MEDIUM',
      status TEXT NOT NULL DEFAULT 'not_contacted',
      city TEXT,
      region TEXT,
      country TEXT DEFAULT '',
      company_size TEXT,
      pain_point TEXT,
      decision_maker_title TEXT,
      phone TEXT,
      email TEXT,
      contact_method TEXT,
      source_url TEXT,
      find_instructions TEXT,
      notes TEXT,
      last_contacted_at TEXT,
      next_followup_at TEXT,
      contacted_by TEXT,
      scraped_from TEXT,
      dedup_key TEXT,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_gtm_leads_dedup ON gtm_leads(dedup_key);
    CREATE INDEX IF NOT EXISTS idx_gtm_leads_priority ON gtm_leads(priority);
    CREATE INDEX IF NOT EXISTS idx_gtm_leads_status ON gtm_leads(status);

    CREATE TABLE IF NOT EXISTS gtm_lead_status_history (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL REFERENCES gtm_leads(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_by INTEGER,
      changed_by_name TEXT,
      note TEXT,
      changed_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gtm_scrape_jobs (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      query TEXT,
      status TEXT DEFAULT 'pending',
      leads_found INTEGER DEFAULT 0,
      leads_added INTEGER DEFAULT 0,
      leads_skipped INTEGER DEFAULT 0,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gtm_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT DEFAULT 'general',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      entity_type TEXT DEFAULT '',
      entity_id INTEGER,
      is_read INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_gtm_notif_user ON gtm_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_gtm_notif_read ON gtm_notifications(is_read);

    CREATE TABLE IF NOT EXISTS gtm_activity_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      user_name TEXT DEFAULT '',
      user_role TEXT DEFAULT '',
      action TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      entity_type TEXT DEFAULT '',
      entity_id INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_gtm_logs_user ON gtm_activity_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_gtm_logs_cat ON gtm_activity_logs(category);

    CREATE TABLE IF NOT EXISTS gtm_shared_docs (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      category TEXT DEFAULT 'general',
      uploaded_by INTEGER NOT NULL,
      uploader_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gtm_team_remarks (
      id SERIAL PRIMARY KEY,
      team_member_id INTEGER NOT NULL,
      author_id INTEGER NOT NULL,
      author_name TEXT DEFAULT '',
      remark TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

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

    CREATE TABLE IF NOT EXISTS gtm_email_campaigns (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      template_id INTEGER REFERENCES gtm_templates(id) ON DELETE SET NULL,
      language TEXT DEFAULT 'en',
      filters JSONB DEFAULT '{}',
      llm_personalize BOOLEAN DEFAULT true,
      daily_limit INTEGER DEFAULT 50,
      send_window_start TEXT DEFAULT '09:00',
      send_window_end TEXT DEFAULT '18:00',
      total_leads INTEGER DEFAULT 0,
      total_sent INTEGER DEFAULT 0,
      total_opened INTEGER DEFAULT 0,
      total_replied INTEGER DEFAULT 0,
      total_bounced INTEGER DEFAULT 0,
      total_unsubscribed INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gtm_email_sends (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER REFERENCES gtm_email_campaigns(id) ON DELETE SET NULL,
      lead_id INTEGER REFERENCES gtm_leads(id) ON DELETE SET NULL,
      template_id INTEGER REFERENCES gtm_templates(id) ON DELETE SET NULL,
      touch_number INTEGER DEFAULT 1,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      personalized_opener TEXT DEFAULT '',
      personalized_value_prop TEXT DEFAULT '',
      status TEXT DEFAULT 'queued',
      error_message TEXT,
      message_id TEXT,
      opened_at TIMESTAMP,
      replied_at TIMESTAMP,
      bounced_at TIMESTAMP,
      sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_gtm_email_sends_campaign ON gtm_email_sends(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_gtm_email_sends_lead ON gtm_email_sends(lead_id);
    CREATE INDEX IF NOT EXISTS idx_gtm_email_sends_status ON gtm_email_sends(status);

    CREATE TABLE IF NOT EXISTS gtm_email_unsubscribes (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      lead_id INTEGER,
      reason TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_gtm_email_unsub ON gtm_email_unsubscribes(email);

    CREATE INDEX IF NOT EXISTS idx_gtm_msgs_sender ON gtm_messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_gtm_msgs_receiver ON gtm_messages(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_gtm_task_comments ON gtm_task_comments(task_id);

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

    CREATE TABLE IF NOT EXISTS gtm_projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      country TEXT DEFAULT '',
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#3B82F6',
      icon TEXT DEFAULT 'language',
      language TEXT DEFAULT 'en',
      scraper_config JSONB DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_by INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Self-healing columns (idempotent) for databases created before these fields existed
  const columns = [
    ['gtm_leads', 'contact_person', "TEXT DEFAULT ''"],
    ['gtm_leads', 'last_template_id', 'INTEGER'],
    ['gtm_projects', 'language', "TEXT DEFAULT 'en'"],
    ['gtm_projects', 'scraper_config', "JSONB DEFAULT '{}'"],
    ['gtm_users', 'language', "TEXT DEFAULT 'en'"],
    ['gtm_users', 'name_en', "TEXT DEFAULT ''"],
    ['gtm_users', 'job_title', "TEXT DEFAULT ''"],
    ['gtm_users', 'job_title_en', "TEXT DEFAULT ''"],
    ...['gtm_leads', 'gtm_tasks', 'gtm_messages', 'gtm_shared_docs', 'gtm_activity_logs', 'gtm_team_remarks',
        'gtm_email_sends', 'gtm_email_campaigns', 'gtm_notifications', 'gtm_templates', 'gtm_scrape_jobs']
      .map(t => [t, 'project_id', 'INTEGER']),
  ];
  for (const [table, column, def] of columns) await ensureColumn(table, column, def);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_gtm_leads_project ON gtm_leads(project_id);
    CREATE INDEX IF NOT EXISTS idx_gtm_tasks_project ON gtm_tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_gtm_templates_project ON gtm_templates(project_id);
    CREATE INDEX IF NOT EXISTS idx_gtm_campaigns_project ON gtm_email_campaigns(project_id);
  `);

  // Seed default settings
  const defaults = [
    ['app_name', 'GTM CRM'],
    ['role_label_super_admin', 'Super Admin'],
    ['role_label_manager', 'Manager'],
    ['role_label_staff', 'Staff'],
    ['role_label_marketing', 'Marketing'],
    ['role_label_viewer', 'Viewer'],
  ];
  for (const [key, value] of defaults) {
    await query(`INSERT INTO gtm_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, [key, value]);
  }

  console.log(`[db] GTM CRM schema initialized (${DRIVER})`);
}

/** Close connections (used by scripts). */
async function close() {
  if (pool) { await pool.end(); pool = null; }
  if (sqlite) { sqlite.close(); sqlite = null; }
}

module.exports = { query, queryOne, queryAll, getPool, initSchema, ensureColumn, close, DRIVER };
