'use client';
import { useProject } from '@/context/ProjectContext';
const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

export default function SharedDocsPage() {
  const { t } = useProject();
  return (
    <div className="page-content">
      <div className="page-header"><h1><MI name="folder_shared" size={26} /> {t('Shared Documents')}</h1></div>
      <div className="card" style={{ textAlign: 'center', padding: 60 }}>
        <MI name="cloud_upload" size={48} />
        <h3 style={{ marginTop: 12, color: 'var(--text-dim)' }}>{t('Document Library')}</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>{t('Upload and share team documents. Coming soon.')}</p>
      </div>
    </div>
  );
}
