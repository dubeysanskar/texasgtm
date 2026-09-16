'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';
import NotificationBell from './NotificationBell';
import { useState } from 'react';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, isAdmin, logout, roleLabel, roleColor, canSee } = useAuth();
  const { projects, activeProject, setActiveProject, createProject, lang, setLang, t } = useProject();
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', country: '', color: '#3B82F6', language: 'en' });
  const [creating, setCreating] = useState(false);

  const PROJECT_COLORS = ['#DC2626','#EA580C','#D97706','#16A34A','#0D9488','#2563EB','#7C3AED','#DB2777','#4B5563'];

  // Visibility is managed per-role in Admin → Features (super admins always see everything).
  // Admin Panel and My Profile are not feature-gated.
  const navItems = [
    { href: '/dashboard', label: t('Dashboard'), icon: 'dashboard', show: canSee('dashboard') },
    { href: '/messages', label: t('Messages'), icon: 'chat', show: canSee('messages') },
    { href: '/tasks', label: t('Tasks'), icon: 'task_alt', show: canSee('tasks') },
    { href: '/leads', label: t('Lead Management'), icon: 'leaderboard', show: canSee('leads') },
    { href: '/lead-scraper', label: t('Lead Scraper'), icon: 'travel_explore', show: canSee('lead_scraper') },
    { href: '/templates', label: t('Templates'), icon: 'description', show: canSee('templates') },
    { href: '/auto-email', label: t('Auto Email'), icon: 'forward_to_inbox', show: canSee('auto_email') },
    { href: '/team', label: t('Team'), icon: 'group', show: canSee('team') },
    { href: '/marketing', label: t('Marketing'), icon: 'campaign', show: canSee('marketing') },
    { href: '/shared-docs', label: t('Documents'), icon: 'folder_shared', show: canSee('documents') },
    { href: '/logs', label: t('Activity Logs'), icon: 'history', show: canSee('logs') },
    { href: '/admin', label: t('Admin Panel'), icon: 'settings', show: isAdmin },
    { href: '/profile', label: t('My Profile'), icon: 'person', show: true },
  ];

  if (!user) return null;

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProject.name.trim()) return;
    setCreating(true);
    try {
      await createProject(newProject);
      setNewProject({ name: '', country: '', color: '#3B82F6', language: 'en' });
      setShowNewProject(false);
      setShowProjectDropdown(false);
    } catch (err) {
      alert(err.message);
    }
    setCreating(false);
  };

  const inputStyle = { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.74rem', marginBottom: 6, outline: 'none', background: '#fff', color: '#1f2937' };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="GTM CRM" style={{ width: 30, height: 30, borderRadius: 6, objectFit: 'cover' }} />
        </div>
        <span className="sidebar-title">GTM CRM</span>
      </div>

      {/* ═══ PROJECT SWITCHER ═══ */}
      {projects.length > 0 && (
        <div style={{ padding: '4px 12px 8px', position: 'relative' }}>
          {/* Single project for non-admin: just show the name */}
          {!isAdmin && projects.length <= 1 ? (
            <div style={{
              width: '100%', padding: '8px 10px', borderRadius: 8,
              border: `2px solid ${activeProject?.color || '#3B82F6'}20`,
              background: `${activeProject?.color || '#3B82F6'}10`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: activeProject?.color || '#3B82F6', flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left', fontSize: '0.78rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeProject?.name || t('My Project')}
              </span>
            </div>
          ) : (
            /* Multi-project or admin: show dropdown */
            <button
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                border: `2px solid ${activeProject?.color || '#3B82F6'}20`,
                background: `${activeProject?.color || '#3B82F6'}10`,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                transition: 'all .15s',
              }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: activeProject?.color || '#3B82F6',
                flexShrink: 0,
              }} />
              <span style={{
                flex: 1, textAlign: 'left', fontSize: '0.78rem', fontWeight: 700,
                color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {activeProject?.name || t('Select Project')}
              </span>
              <span style={{ fontSize: '0.6rem', color: '#9ca3af' }}>
                {activeProject?.lead_count || 0}
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#9ca3af' }}>
                {showProjectDropdown ? 'expand_less' : 'expand_more'}
              </span>
            </button>
          )}

          {/* Dropdown */}
          {showProjectDropdown && (
            <div style={{
              position: 'absolute', top: '100%', left: 12, right: 12, zIndex: 100,
              background: '#fff', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              border: '1px solid #e5e7eb', overflow: 'hidden', marginTop: 4,
            }}>
              <div style={{ padding: '8px 6px', maxHeight: 240, overflowY: 'auto' }}>
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setActiveProject(p); setShowProjectDropdown(false); }}
                    style={{
                      width: '100%', padding: '8px 10px', borderRadius: 6,
                      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                      background: p.id === activeProject?.id ? `${p.color}15` : 'transparent',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = `${p.color}10`}
                    onMouseLeave={e => e.currentTarget.style.background = p.id === activeProject?.id ? `${p.color}15` : 'transparent'}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', background: p.color,
                      flexShrink: 0, border: p.id === activeProject?.id ? `2px solid ${p.color}` : 'none',
                      boxSizing: 'content-box',
                    }} />
                    <span style={{ flex: 1, textAlign: 'left', fontSize: '0.76rem', fontWeight: p.id === activeProject?.id ? 700 : 500, color: 'var(--text)' }}>
                      {p.name}
                    </span>
                    {p.language === 'ru' && <span title={t('Russian')} style={{ fontSize: '0.7rem' }}>🇷🇺</span>}
                    <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500 }}>
                      {p.lead_count} {t('leads')}
                    </span>
                    {p.country && (
                      <span style={{ fontSize: '0.62rem', color: '#d1d5db' }}>{p.country}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* New Project — admin only */}
              {isAdmin && (
              <div style={{ borderTop: '1px solid #f3f4f6', padding: 6 }}>
                {!showNewProject ? (
                  <button
                    onClick={() => setShowNewProject(true)}
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px dashed #d1d5db',
                      background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: '0.74rem', color: '#6b7280', fontWeight: 600,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                    {t('New Project')}
                  </button>
                ) : (
                  <form onSubmit={handleCreateProject} style={{ padding: '4px 4px' }}>
                    <input
                      autoFocus
                      placeholder={t('Project name (e.g. Arabic GTM)')}
                      value={newProject.name}
                      onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                      style={inputStyle}
                    />
                    <input
                      placeholder={t('Country (e.g. Saudi Arabia)')}
                      value={newProject.country}
                      onChange={e => setNewProject({ ...newProject, country: e.target.value })}
                      style={inputStyle}
                    />
                    <select
                      value={newProject.language}
                      onChange={e => setNewProject({ ...newProject, language: e.target.value })}
                      title={t('Project language')}
                      style={inputStyle}
                    >
                      <option value="en">🇬🇧 {t('English')}</option>
                      <option value="ru">🇷🇺 {t('Russian')}</option>
                    </select>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                      {PROJECT_COLORS.map(c => (
                        <button
                          key={c} type="button"
                          onClick={() => setNewProject({ ...newProject, color: c })}
                          style={{
                            width: 20, height: 20, borderRadius: '50%', background: c, border: newProject.color === c ? '2px solid #1f2937' : '2px solid transparent',
                            cursor: 'pointer', padding: 0,
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="submit" disabled={creating}
                        style={{
                          flex: 1, padding: '6px', borderRadius: 6, border: 'none',
                          background: newProject.color, color: '#fff', fontSize: '0.72rem', fontWeight: 700,
                          cursor: 'pointer', opacity: creating ? 0.6 : 1,
                        }}
                      >
                        {creating ? t('Creating…') : t('Create')}
                      </button>
                      <button
                        type="button" onClick={() => setShowNewProject(false)}
                        style={{
                          padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db',
                          background: '#fff', fontSize: '0.72rem', cursor: 'pointer', color: '#6b7280',
                        }}
                      >
                        {t('Cancel')}
                      </button>
                    </div>
                  </form>
                )}
              </div>
              )}
            </div>
          )}
        </div>
      )}

      <nav className="sidebar-nav">
        {navItems.filter(i => i.show).map(item => (
          <Link key={item.href} href={item.href}
            className={`sidebar-link ${pathname === item.href || pathname.startsWith(item.href + '/') ? 'active' : ''}`}>
            <span className="material-symbols-outlined">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        {/* Language switch */}
        <div className="sidebar-lang" role="group" aria-label={t('Language')}>
          <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
          <button type="button" className={lang === 'ru' ? 'active' : ''} onClick={() => setLang('ru')}>RU</button>
        </div>
        <div className="sidebar-user">
          <div className="sidebar-avatar" style={{ background: roleColor }}>
            {user.name?.charAt(0)?.toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{user.name}</span>
            <span className="sidebar-user-role" style={{ color: roleColor }}>{t(roleLabel)}</span>
          </div>
          <NotificationBell />
        </div>
        <button onClick={logout} className="sidebar-logout">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
          <span>{t('Sign Out')}</span>
        </button>
      </div>
    </aside>
  );
}
