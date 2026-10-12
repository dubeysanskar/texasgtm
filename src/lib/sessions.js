/**
 * Login sessions & active time (Team Performance report).
 *
 *   startSession  — at login (OTP verified). Closes any session left open.
 *   heartbeat     — every minute from the open app. Extends the open session; if the user was gone
 *                   longer than IDLE_GAP the old session is closed at its last-seen time and a new one
 *                   starts ("resume"). active_seconds only grows when the client says the person was
 *                   actually interacting (tab visible + mouse/keyboard input in the last 2 minutes).
 *   endSession    — at logout.
 *
 * Times are ISO-8601 UTC strings, so they compare as text on SQLite and PostgreSQL alike.
 * Never call these for an impersonated session — a super admin "viewing as" someone must not
 * count as that person's time.
 */
const { query, queryOne } = require('./db');

const IDLE_GAP_MS = 10 * 60 * 1000;   // away longer than this → the session ended at its last heartbeat
const MAX_STEP_MS = 90 * 1000;        // one heartbeat never credits more than this (heartbeats are ~60s apart)

function clientInfo(request) {
  const ip = (request?.headers?.get('x-forwarded-for') || '').split(',')[0].trim() || request?.headers?.get('x-real-ip') || '';
  const ua = String(request?.headers?.get('user-agent') || '').slice(0, 300);
  return { ip, ua };
}

async function openSession(userId) {
  return queryOne('SELECT * FROM gtm_user_sessions WHERE user_id = $1 AND ended_at IS NULL ORDER BY id DESC LIMIT 1', [userId]);
}

async function closeSession(s, endedAtIso, reason) {
  await query('UPDATE gtm_user_sessions SET ended_at = $1, ended_reason = $2 WHERE id = $3 AND ended_at IS NULL', [endedAtIso, reason, s.id]);
}

async function createSession(userId, method, request) {
  const now = new Date().toISOString();
  const { ip, ua } = clientInfo(request);
  return queryOne(
    'INSERT INTO gtm_user_sessions (user_id, started_at, last_seen_at, active_seconds, login_method, ip, user_agent) VALUES ($1,$2,$3,0,$4,$5,$6) RETURNING id',
    [userId, now, now, method, ip, ua]
  );
}

async function startSession(userId, method, request) {
  const open = await openSession(userId);
  if (open) await closeSession(open, open.last_seen_at, 'timeout');
  return createSession(userId, method, request);
}

async function heartbeat(userId, active, request) {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const open = await openSession(userId);
  if (open && nowMs - new Date(open.last_seen_at).getTime() <= IDLE_GAP_MS) {
    const step = Math.max(0, Math.min(nowMs - new Date(open.last_seen_at).getTime(), MAX_STEP_MS));
    const add = active ? Math.round(step / 1000) : 0;
    await query('UPDATE gtm_user_sessions SET last_seen_at = $1, active_seconds = active_seconds + $2 WHERE id = $3', [now, add, open.id]);
    return open.id;
  }
  if (open) await closeSession(open, open.last_seen_at, 'timeout');
  const row = await createSession(userId, 'resume', request);
  return row.id;
}

async function endSession(userId) {
  const open = await openSession(userId);
  if (!open) return;
  const now = new Date().toISOString();
  await query("UPDATE gtm_user_sessions SET last_seen_at = $1, ended_at = $1, ended_reason = 'logout' WHERE id = $2", [now, open.id]);
}

module.exports = { startSession, heartbeat, endSession, IDLE_GAP_MS };
