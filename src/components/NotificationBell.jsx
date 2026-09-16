'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';

export default function NotificationBell() {
  const { user } = useAuth();
  const { t } = useProject();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const fetchCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/notifications?count_only=1');
      const data = await res.json();
      setCount(data.unread || 0);
    } catch {}
  }, [user]);

  useEffect(() => { fetchCount(); const iv = setInterval(fetchCount, 15000); return () => clearInterval(iv); }, [fetchCount]);

  const openPanel = async () => {
    setOpen(!open);
    if (!open) {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      setNotifications(data.notifications || []);
    }
  };

  const markRead = async (id) => {
    await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setCount(c => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setCount(0);
  };

  const ICONS = { task: 'task_alt', message: 'chat', lead: 'leaderboard', system: 'info', general: 'notifications' };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={openPanel} className="notif-bell-btn" title={t('Notifications')}>
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>notifications</span>
        {count > 0 && <span className="notif-badge">{count > 9 ? '9+' : count}</span>}
      </button>

      {open && (
        <>
          <div className="notif-overlay" onClick={() => setOpen(false)} />
          <div className="notif-panel">
            <div className="notif-header">
              <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{t('Notifications')}</span>
              {count > 0 && <button onClick={markAllRead} className="notif-mark-all">{t('Mark all read')}</button>}
            </div>
            <div className="notif-list">
              {notifications.length === 0 && <p className="notif-empty">{t('No notifications')}</p>}
              {notifications.map(n => (
                <div key={n.id} className={`notif-item ${n.is_read ? '' : 'unread'}`} onClick={() => !n.is_read && markRead(n.id)}>
                  <span className="material-symbols-outlined notif-icon">{ICONS[n.type] || 'notifications'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="notif-title">{n.title}</div>
                    <div className="notif-msg">{n.message}</div>
                    <div className="notif-time">{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                  {!n.is_read && <span className="notif-dot" />}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
