'use client';
// Quick-contact links: WhatsApp/Telegram both work from a plain phone number (falls back to the
// personal mobile, then the office phone); Telegram prefers a stored @username/link if one was given.
// Max has no reliable universal deep-link scheme, so it's shown as-is (a link if it looks like one).
// Shared by the Leads page and the Priority Leads page.
import { useProject } from '@/context/ProjectContext';

function phoneDigits(v) { return String(v || '').replace(/[^\d]/g, ''); }
function waLink(mobile, phone) { const d = phoneDigits(mobile) || phoneDigits(phone); return d ? `https://wa.me/${d}` : null; }
function tgLink(telegram, mobile, phone) {
  const v = String(telegram || '').trim();
  if (v) return /^https?:\/\//i.test(v) ? v : `https://t.me/${v.replace(/^@/, '')}`;
  const d = phoneDigits(mobile) || phoneDigits(phone);
  return d ? `https://t.me/+${d}` : null;
}

export default function ContactBadges({ l, size = 'normal' }) {
  const { t } = useProject();
  const wa = waLink(l.mobile_personal, l.phone);
  const tg = tgLink(l.telegram, l.mobile_personal, l.phone);
  const max = String(l.max_messenger || '').trim();
  const maxIsLink = /^https?:\/\//i.test(max);
  const s = size === 'small' ? { w: 20, f: 9 } : { w: 24, f: 10 };
  const style = { width: s.w, height: s.w, borderRadius: '50%', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: s.f, fontWeight: 800, textDecoration: 'none', flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' };
  const badge = (href, label, bg, title) => (
    <a key={label} href={href} target="_blank" rel="noreferrer" title={title} onClick={e => e.stopPropagation()} style={{ ...style, background: bg }}>{label}</a>
  );
  if (!wa && !tg && !max) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {wa && badge(wa, 'W', '#25D366', 'WhatsApp')}
      {tg && badge(tg, 'T', '#229ED9', 'Telegram')}
      {max && (maxIsLink ? badge(max, 'M', '#8b5cf6', `Max: ${max}`) : (
        <button key="max" type="button" title={`Max: ${max} (${t('click to copy')})`} onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(max); }} style={{ ...style, background: '#8b5cf6' }}>M</button>
      ))}
    </div>
  );
}
