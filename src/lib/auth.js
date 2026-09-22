const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET not set');
}
const _SECRET = JWT_SECRET || 'gtm-crm-dev-fallback-change-me';
const JWT_EXPIRES = '7d';

function signToken(payload) {
  return jwt.sign(payload, _SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try { return jwt.verify(token, _SECRET); }
  catch { return null; }
}

// Hard cap on an impersonation session, enforced server-side regardless of the token's own JWT
// expiry (which mirrors a normal login) — belt-and-suspenders so "log in as" can never quietly
// outlive IMPERSONATION_MAX_SECONDS just because the cookie is still technically valid.
const IMPERSONATION_MAX_SECONDS = 60 * 60; // 1 hour

function getUserFromRequest(request) {
  const cookie = request.cookies.get('gtm-token');
  if (!cookie) return null;
  const payload = verifyToken(cookie.value);
  if (!payload) return null;
  if (payload.impersonating && payload.iat && (Date.now() / 1000 - payload.iat) > IMPERSONATION_MAX_SECONDS) return null;
  return payload;
}

function isAdmin(role) { return role === 'super_admin'; }
function isManager(role) { return ['super_admin', 'manager'].includes(role); }
function isStaff(role) { return ['super_admin', 'manager', 'staff', 'marketing'].includes(role); }

/**
 * Get all project IDs a user has access to. Super admins get all projects.
 */
async function getUserProjectIds(userId, role) {
  const { queryAll } = require('@/lib/db');
  if (role === 'super_admin') {
    const all = await queryAll('SELECT id FROM gtm_projects WHERE is_active = true');
    return all.map(p => p.id);
  }
  const memberships = await queryAll('SELECT project_id FROM gtm_project_members WHERE user_id = $1', [userId]);
  return memberships.map(m => m.project_id);
}

/**
 * Check if user has access to a specific project. Super admins always have access.
 */
async function requireProjectAccess(user, projectId) {
  if (!projectId) return true; // No project scoping
  if (user.role === 'super_admin') return true;
  const ids = await getUserProjectIds(user.id, user.role);
  return ids.includes(Number(projectId));
}

module.exports = { signToken, verifyToken, getUserFromRequest, isAdmin, isManager, isStaff, getUserProjectIds, requireProjectAccess, IMPERSONATION_MAX_SECONDS };
