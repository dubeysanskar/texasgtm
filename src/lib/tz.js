/** Today's date (YYYY-MM-DD) as seen in a given IANA timezone — used so "today" in the daily work
 *  log lines up with the team's actual day rather than the server's UTC clock. */
function todayInTz(tz) {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: tz || 'UTC' }); }
  catch { return new Date().toISOString().slice(0, 10); }
}

/** Validate/normalize a YYYY-MM-DD string; falls back to today (in tz) if missing or malformed. */
function normalizeDate(value, tz) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayInTz(tz);
}

/** The IANA timezone configured for a project (defaults to UTC; Russian-language projects default to
 *  Europe/Moscow — see initSchema in db.js). */
async function getProjectTimezone(projectId) {
  if (!projectId) return 'UTC';
  const { queryOne } = require('./db');
  const p = await queryOne('SELECT timezone FROM gtm_projects WHERE id = $1', [projectId]);
  return p?.timezone || 'UTC';
}

module.exports = { todayInTz, normalizeDate, getProjectTimezone };
