'use client';
// Small, dependency-free charts for the Team Performance report.
// Specs: bars <= 24px thick with a 4px rounded data-end (square at the baseline), hairline solid grid,
// one axis per chart, a hover tooltip on every mark, values labeled selectively (only the peak), and
// text always in ink colors — never the series color.
import { useState, useRef, useEffect } from 'react';

export const VIZ = {
  surface: '#fcfcfb', grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781', ink: '#0b0b0b', ink2: '#52514e',
  blue: '#2a78d6', violet: '#4a3aa7', gray: '#c3c2b7',
};

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Round an axis maximum up to a clean number and return [max, ticks]. */
function niceScale(maxVal, count = 4) {
  if (!maxVal || maxVal <= 0) return [count, Array.from({ length: count + 1 }, (_, i) => i)];
  const raw = maxVal / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag;
  const max = Math.ceil(maxVal / step) * step;
  const ticks = []; for (let v = 0; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return [max, ticks];
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div style={{ position: 'absolute', left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 10px))', pointerEvents: 'none', background: '#fff', border: '1px solid rgba(11,11,11,0.10)', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', borderRadius: 8, padding: '7px 10px', fontSize: '0.72rem', color: VIZ.ink, whiteSpace: 'nowrap', zIndex: 5 }}>
      {tip.content}
    </div>
  );
}

const colPath = (x, y, w, h, r = 4) => {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
};

/**
 * Column chart, one series. data: [{ key, label, value, tip }] (tip = ReactNode for the tooltip).
 * format(v) formats axis ticks and the peak label.
 */
export function ColumnChart({ data, color = VIZ.blue, height = 210, format = (v) => String(v), labelEvery, emptyText = '—', ariaLabel }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const m = { l: 40, r: 8, t: 22, b: 26 };
  const iw = Math.max(10, width - m.l - m.r), ih = height - m.t - m.b;
  const maxVal = Math.max(0, ...data.map(d => d.value));
  const [max, ticks] = niceScale(maxVal);
  const n = data.length || 1;
  const band = iw / n;
  const bw = Math.max(2, Math.min(24, band * 0.68));
  const every = labelEvery || Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 54))));
  const peakIdx = maxVal > 0 ? data.findIndex(d => d.value === maxVal) : -1;
  const yOf = (v) => m.t + ih - (v / max) * ih;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }} onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ display: 'block', fontFamily: 'inherit' }}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={yOf(t)} y2={yOf(t)} stroke={t === 0 ? VIZ.axis : VIZ.grid} strokeWidth="1" />
            <text x={m.l - 6} y={yOf(t) + 3.5} textAnchor="end" fontSize="10" fill={VIZ.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>{format(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = m.l + band * i + (band - bw) / 2;
          const h = max ? (d.value / max) * ih : 0;
          return (
            <g key={d.key ?? i}>
              <path d={colPath(x, m.t + ih - h, bw, h)} fill={color} opacity={tip && tip.i !== i ? 0.55 : 1} />
              {i === peakIdx && <text x={x + bw / 2} y={m.t + ih - h - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill={VIZ.ink2}>{format(d.value)}</text>}
              {(i % every === 0) && <text x={m.l + band * i + band / 2} y={height - 8} textAnchor="middle" fontSize="10" fill={VIZ.muted}>{d.label}</text>}
              <rect x={m.l + band * i} y={m.t} width={band} height={ih} fill="transparent"
                onMouseEnter={() => setTip({ i, x: m.l + band * i + band / 2, y: Math.min(m.t + ih - h, m.t + ih - 8), content: d.tip || <span><b>{d.label}</b> · {format(d.value)}</span> })} />
            </g>
          );
        })}
        {maxVal === 0 && <text x={m.l + iw / 2} y={m.t + ih / 2} textAnchor="middle" fontSize="11" fill={VIZ.muted}>{emptyText}</text>}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/**
 * Horizontal bars, one series. rows: [{ key, label, value, sub, emphasis }]. When any row has
 * emphasis, the others recede to gray (the "highlight one, gray the rest" form).
 */
export function HBarChart({ rows, color = VIZ.blue, format = (v) => String(v), labelWidth = 150, onRowClick }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(0, ...rows.map(r => r.value));
  const anyEmphasis = rows.some(r => r.emphasis);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(r => {
        const pct = max ? (r.value / max) * 100 : 0;
        const fill = anyEmphasis && !r.emphasis ? VIZ.gray : color;
        return (
          <div key={r.key} onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)} onClick={onRowClick ? () => onRowClick(r) : undefined}
            title={`${r.label}: ${format(r.value)}${r.sub ? ' · ' + r.sub : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: onRowClick ? 'pointer' : 'default', background: hover === r.key ? 'rgba(11,11,11,0.035)' : 'transparent', borderRadius: 6, padding: '2px 4px' }}>
            <div style={{ width: labelWidth, flexShrink: 0, fontSize: '0.76rem', color: VIZ.ink, fontWeight: r.emphasis ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ height: 14, width: `${Math.max(pct, r.value > 0 ? 1.5 : 0)}%`, background: fill, borderRadius: '0 4px 4px 0', transition: 'width .3s' }} />
              <span style={{ fontSize: '0.74rem', color: VIZ.ink2, fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{format(r.value)}</span>
              {r.sub && <span style={{ fontSize: '0.68rem', color: VIZ.muted, whiteSpace: 'nowrap' }}>{r.sub}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** "3h 25m" / "45m" / "0m" */
export function fmtMinutes(min) {
  const m = Math.round(min || 0);
  const h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`;
}
