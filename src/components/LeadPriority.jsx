'use client';
// Priority view badges (Lead Management + Dashboard): the lead's rank and why it ranks there.
import { SC } from '@/lib/lead-status';

const MI = ({ name, size = 18 }) => <span className="material-symbols-outlined" style={{ fontSize: size }}>{name}</span>;

// Priority view: rank (#1 = act first) and the reason the lead sits there
export function RankBadge({ n, t }) {
  const top = n <= 3;
  return <span title={t('Priority rank')} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', minWidth:22, height:18, padding:'0 5px', borderRadius:999, background: top ? '#f59e0b' : '#e2e8f0', color: top ? '#fff' : '#334155', fontSize:'0.62rem', fontWeight:800, fontFamily:'Inter, sans-serif', verticalAlign:'middle', marginRight:4 }}>{n}</span>;
}
export function PriorityReason({ r, t, lang }) {
  const loc = lang === 'ru' ? 'ru-RU' : 'en-GB';
  const time = r.at ? new Date(r.at).toLocaleTimeString(loc, { hour:'2-digit', minute:'2-digit' }) : '';
  const date = r.at ? new Date(r.at).toLocaleDateString(loc, { day:'numeric', month:'short' }) : '';
  const M = {
    overdue: [r.days ? t('Follow-up overdue by {n}d', { n: r.days }) : t('Follow-up overdue (today {time})', { time }), '#b91c1c', '#fef2f2', 'alarm'],
    due_today: [t('Follow-up today {time}', { time }), '#c2410c', '#fff7ed', 'today'],
    hot_deal: [t('Hot deal: {status}', { status: t(SC[r.status]?.label || r.status || '') }), '#6d28d9', '#f5f3ff', 'local_fire_department'],
    due_soon: [r.days === 1 ? t('Follow-up tomorrow {time}', { time }) : t('Follow-up in {n}d ({date})', { n: r.days, date }), '#1d4ed8', '#eff6ff', 'event'],
    never_contacted: [r.days ? t('Not contacted yet · added {n}d ago', { n: r.days }) : t('Not contacted yet · added today'), '#475569', '#f1f5f9', 'person_search'],
    stale: [r.days ? t('No contact for {n}d', { n: r.days }) : t('Contacted today'), '#475569', '#f1f5f9', 'hourglass_bottom'],
    parked: [r.at ? t('Parked until {date}', { date }) : t('Parked: follow up later'), '#7D6608', '#fefce8', 'snooze'],
    signed: [t('Contract signed'), '#065f46', '#ecfdf5', 'verified'],
  }[r.code];
  if (!M) return null;
  return <div style={{ marginTop:3 }}><span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'1px 7px', borderRadius:999, background:M[2], color:M[1], fontSize:'0.62rem', fontWeight:700, lineHeight:1.6 }}><MI name={M[3]} size={11}/> {M[0]}</span></div>;
}

