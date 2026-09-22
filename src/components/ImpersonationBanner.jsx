'use client';
import { useAuth } from '@/context/AuthContext';
import { useProject } from '@/context/ProjectContext';

const MI = ({ name, size = 16 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

// Shown only to the super admin while they're "viewing as" someone else — the target user's own
// account and session are completely unaffected and never see this.
export default function ImpersonationBanner() {
  const { user, impersonating, exitImpersonation } = useAuth();
  const { t } = useProject();
  if (!impersonating || !user) return null;

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '8px 14px', background: '#7c2d12', color: '#fff', fontSize: '0.8rem', fontWeight: 600, flexWrap: 'wrap' }}>
      <MI name="visibility" size={17} />
      <span>{t('Viewing as {name} — every action here happens as them.', { name: user.name })}</span>
      <button onClick={exitImpersonation} style={{ background: '#fff', color: '#7c2d12', border: 'none', borderRadius: 6, padding: '3px 12px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
        <MI name="logout" size={14} /> {t('Exit')}
      </button>
    </div>
  );
}
