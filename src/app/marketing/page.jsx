'use client';
import { useProject } from '@/context/ProjectContext';
const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

export default function MarketingPage() {
  const { t } = useProject();
  return (
    <div className="page-content">
      <div className="page-header"><h1><MI name="campaign" size={26} /> {t('Marketing')}</h1><p>{t('Campaign tracking & content management')}</p></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[{ label: t('Active Campaigns'), value: 0, icon: 'rocket_launch', color: '#6366f1' },
          { label: t('Leads This Month'), value: 0, icon: 'trending_up', color: '#10b981' },
          { label: t('Conversion Rate'), value: '0%', icon: 'percent', color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ borderTopColor: s.color }}>
            <div className="stat-icon"><MI name={s.icon} size={18} /></div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ textAlign: 'center', padding: 60 }}>
        <MI name="campaign" size={48} />
        <h3 style={{ marginTop: 12, color: 'var(--text-dim)' }}>{t('Marketing Module')}</h3>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>{t('Campaign management, content calendar, and analytics coming soon.')}</p>
      </div>
    </div>
  );
}
