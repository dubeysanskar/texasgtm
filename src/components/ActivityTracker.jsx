'use client';
// Sends a heartbeat about once a minute while someone is signed in, so the Team Performance report can
// show login/logout times and real active hours. "Active" means the tab is visible AND there was mouse,
// keyboard, scroll or touch input in the last 2 minutes — an idle tab left open doesn't count.
import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';

const BEAT_MS = 60 * 1000;
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

export default function ActivityTracker() {
  const { user, impersonating } = useAuth();
  const lastInput = useRef(Date.now());

  useEffect(() => {
    if (!user || impersonating) return;
    const mark = () => { lastInput.current = Date.now(); };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];
    events.forEach(e => window.addEventListener(e, mark, { passive: true }));

    const beat = () => {
      if (document.visibilityState !== 'visible') return;
      const active = Date.now() - lastInput.current < ACTIVE_WINDOW_MS;
      fetch('/api/activity/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }), keepalive: true }).catch(() => {});
    };
    const onVisible = () => { if (document.visibilityState === 'visible') { mark(); beat(); } };
    beat();
    const timer = setInterval(beat, BEAT_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      events.forEach(e => window.removeEventListener(e, mark));
    };
  }, [user?.id, impersonating]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
