'use client';
// Priority is now a toggle on Lead Management (on by default). Old links and bookmarks land there.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PriorityLeadsRedirect() {
  const router = useRouter();
  useEffect(() => {
    try { localStorage.setItem('gtm-leads-priority', '1'); } catch {}
    router.replace('/leads');
  }, [router]);
  return null;
}
