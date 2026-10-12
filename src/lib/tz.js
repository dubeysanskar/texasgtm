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

// ── Day bucketing in a timezone (Team Performance report) ────────────────────────────────────────
function partsIn(ms, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => Number(p.find(x => x.type === t)?.value || 0);
  return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), mi: g('minute'), s: g('second') };
}
/** Offset (ms) of `tz` from UTC at instant `ms`. */
function tzOffsetMs(ms, tz) {
  const p = partsIn(ms, tz);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}
/** The UTC instant (ms) at which calendar day `dateStr` (YYYY-MM-DD) starts in `tz`. */
function dayStartUtcMs(dateStr, tz) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return t;
}
/** YYYY-MM-DD of an instant as seen in `tz`. */
function dayKeyIn(isoOrMs, tz) {
  try { return new Date(isoOrMs).toLocaleDateString('en-CA', { timeZone: tz || 'UTC' }); } catch { return String(isoOrMs).slice(0, 10); }
}
/** Hour 0-23 of an instant as seen in `tz`. */
function hourIn(isoOrMs, tz) { return partsIn(new Date(isoOrMs).getTime(), tz).h; }
/** YYYY-MM-DD plus n days (calendar arithmetic, no timezone involved). */
function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

module.exports = { todayInTz, normalizeDate, getProjectTimezone, dayStartUtcMs, dayKeyIn, hourIn, addDays };
