'use client';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useProject } from '@/context/ProjectContext';
export default function Layout({ children }) {
  const { user, loading } = useAuth();
  const { t } = useProject();
  const router = useRouter();
  useEffect(() => { if (!loading && !user) router.push('/'); }, [user, loading, router]);
  if (loading || !user) return <div className="page-loading">{t('Loading...')}</div>;
  return (<div className="app-layout"><Sidebar /><main className="main-content">{children}</main></div>);
}
