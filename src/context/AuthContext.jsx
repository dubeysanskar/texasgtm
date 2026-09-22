'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

// Default side-nav feature visibility per role (mirrors the original hardcoded rules).
// Super admins always see everything — they are not part of this map.
export const DEFAULT_NAV_FEATURES = {
  manager: ['dashboard', 'messages', 'tasks', 'todos', 'daily_updates', 'leads', 'team', 'documents'],
  staff: ['dashboard', 'messages', 'tasks', 'todos', 'daily_updates', 'documents'],
  marketing: ['dashboard', 'messages', 'tasks', 'todos', 'daily_updates', 'auto_email', 'marketing', 'documents'],
  viewer: ['dashboard', 'messages'],
};

function hasImpersonationCookie() {
  return typeof document !== 'undefined' && document.cookie.split('; ').includes('gtm-imp=1');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [impersonating, setImpersonating] = useState(null); // { adminId, adminName } | null

  const fetchMe = useCallback(async () => {
    const res = await fetch('/api/auth/me');
    if (res.ok) return res.json();
    // The impersonation token's 1-hour cap was hit (or it was cleared) — if we were mid-"view as",
    // silently fall back to the admin's own session instead of just logging them out.
    if (res.status === 401 && hasImpersonationCookie()) {
      await fetch('/api/admin/impersonate/exit', { method: 'POST' });
      const retry = await fetch('/api/auth/me');
      if (retry.ok) return retry.json();
    }
    return null;
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('gtm-user');
    if (stored) { try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem('gtm-user'); } }

    fetchMe()
      .then(data => {
        if (data?.user) { setUser(data.user); localStorage.setItem('gtm-user', JSON.stringify(data.user)); setImpersonating(data.impersonating || null); }
        else { localStorage.removeItem('gtm-user'); setUser(null); setImpersonating(null); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fetchMe]);

  const startImpersonation = useCallback(async (userId) => {
    const res = await fetch('/api/admin/impersonate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    window.location.href = '/dashboard'; // full reload — every context re-derives from the new session
  }, []);

  const exitImpersonation = useCallback(async () => {
    await fetch('/api/admin/impersonate/exit', { method: 'POST' });
    window.location.href = '/admin';
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setUser(data.user); localStorage.setItem('gtm-user', JSON.stringify(data.user));
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null); localStorage.removeItem('gtm-user');
  }, []);

  const isAdmin = user?.role === 'super_admin';
  const isManager = user && ['super_admin', 'manager'].includes(user.role);
  const isStaff = user && ['super_admin', 'manager', 'staff', 'marketing'].includes(user.role);
  const isMarketing = user?.role === 'marketing';

  const [roleLabels, setRoleLabels] = useState({
    super_admin: 'Super Admin', manager: 'Manager', staff: 'Staff',
    marketing: 'Marketing', viewer: 'Viewer',
  });
  const [navFeatures, setNavFeatures] = useState(DEFAULT_NAV_FEATURES);

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data.settings) {
        const s = data.settings;
        setRoleLabels({
          super_admin: s.role_label_super_admin || 'Super Admin',
          manager: s.role_label_manager || 'Manager',
          staff: s.role_label_staff || 'Staff',
          marketing: s.role_label_marketing || 'Marketing',
          viewer: s.role_label_viewer || 'Viewer',
        });
        if (s.nav_features) {
          try { setNavFeatures({ ...DEFAULT_NAV_FEATURES, ...JSON.parse(s.nav_features) }); } catch {}
        }
      }
    }).catch(() => {});
  }, []);

  // Can the current user see this side-nav feature? Super admins see everything.
  const canSee = useCallback((featureKey) => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return (navFeatures[user.role] || []).includes(featureKey);
  }, [user, navFeatures]);

  const roleColors = {
    super_admin: '#dc2626', manager: '#8A0029', staff: '#2563eb',
    marketing: '#7c3aed', viewer: '#6b7280',
  };
  const roleLabel = user ? roleLabels[user.role] : '';
  const roleColor = user ? roleColors[user.role] : '';

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout,
      isAdmin, isManager, isStaff, isMarketing,
      roleLabel, roleColor, roleLabels, roleColors,
      navFeatures, canSee,
      impersonating, startImpersonation, exitImpersonation,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
