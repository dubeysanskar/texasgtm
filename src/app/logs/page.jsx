'use client';
import { useState, useEffect } from 'react';
import { useProject } from '@/context/ProjectContext';
const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size, verticalAlign: 'middle' }}>{name}</span>;

export default function LogsPage() {
  const { projectId, t } = useProject();
  const [logs, setLogs] = useState([]);
  useEffect(() => { fetch(`/api/logs${projectId ? '?project_id=' + projectId : ''}`).then(r => r.json()).then(d => setLogs(d.logs || [])); }, [projectId]);

  return (
    <div className="page-content">
      <div className="page-header"><h1><MI name="history" size={26} /> {t('Activity Logs')}</h1></div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container" style={{ border: 'none' }}>
          <table>
            <thead><tr><th>{t('User')}</th><th>{t('Action')}</th><th>{t('Category')}</th><th>{t('Time')}</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td>{l.user_name || '—'}</td>
                  <td>{l.action}</td>
                  <td><span className="badge">{t(l.category)}</span></td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(l.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan="4" className="no-data">{t('No activity logs yet')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
