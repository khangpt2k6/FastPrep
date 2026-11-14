// The Overview's livelier graphs: the pipeline as connected nodes with flowing dots, rate gauges, the company bubble
// cluster and the inbox donut. Hand-made SVG and HTML; every chart keeps its numbers readable without color.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import type { TrailStage } from '../../lib/overview';
import { CompanyLogo } from '../CompanyLogo';
import { AnimatedNumber } from '../motion';
import { useTip } from './charts';
import type { Tone } from '../shell/pages';

/** Where each node sits on a 1000 by 250 canvas: a gentle wave left to right. */
const NODE_X = [70, 242, 414, 586, 758, 930];
const NODE_Y = [130, 92, 150, 96, 146, 108];

function link(i: number): string {
  const x1 = NODE_X[i];
  const y1 = NODE_Y[i];
  const x2 = NODE_X[i + 1];
  const y2 = NODE_Y[i + 1];
  const mid = (x2 - x1) / 2;
  return `M${x1},${y1} C${x1 + mid},${y1} ${x2 - mid},${y2} ${x2},${y2}`;
}

/**
 * The pipeline as a graph: six nodes joined by curved links whose width follows the counts, with the share that went
 * on printed on each link and small ember dots flowing along it (faster while the agent works).
 */
export function PipelineGraph({ stages, active, icons }: { stages: TrailStage[]; active: boolean; icons: ReactNode[] }) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...stages.map((s) => s.count));
  const width = (n: number) => 3 + 15 * (Math.log1p(Math.max(0, n)) / Math.log1p(max));
  return (
    <div className={`pgraph ${active ? 'is-active' : ''}`}>
      <svg className="pgraph__svg" viewBox="0 0 1000 250" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="pg-link" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#fdb27a" />
            <stop offset="1" stopColor="#f07b1f" />
          </linearGradient>
        </defs>
        {stages.slice(0, -1).map((s, i) => {
          const next = stages[i + 1];
          const d = link(i);
          return (
            <g key={s.key}>
              <path d={d} className="pgraph__track" strokeWidth={width(s.count) + 6} />
              <path d={d} className="pgraph__link" stroke="url(#pg-link)" strokeWidth={width(Math.min(next.count, s.count))} style={{ '--i': i } as CSSProperties} />
              {!reduce
                ? [0, 1, 2].map((k) => (
                    <circle key={k} r={next.count > 0 ? 3.6 : 2.4} className="pgraph__dot">
                      <animateMotion dur={`${active ? 1.8 : 3.6}s`} begin={`${k * (active ? 0.6 : 1.2) + i * 0.25}s`} repeatCount="indefinite" path={d} />
                    </circle>
                  ))
                : null}
            </g>
          );
        })}
      </svg>
      {stages.map((s, i) => (
        <div key={s.key} className="pgraph__node" style={{ left: `${NODE_X[i] / 10}%`, top: `${(NODE_Y[i] / 250) * 100}%`, '--i': i } as CSSProperties}>
          <span className={`pgraph__ring ${i === stages.length - 1 ? 'is-goal' : ''}`}>{icons[i]}</span>
          <span className="pgraph__count">
            <AnimatedNumber value={s.count} id={`pg-${s.key}`} />
          </span>
          <span className="pgraph__label">{s.label}</span>
        </div>
      ))}
      {stages.slice(0, -1).map((s, i) => {
        const next = stages[i + 1];
        const rate = s.count > 0 ? (next.count / s.count) * 100 : null;
        const x = (NODE_X[i] + NODE_X[i + 1]) / 2;
        const y = (NODE_Y[i] + NODE_Y[i + 1]) / 2;
        return (
          <span
            key={`r-${s.key}`}
            className="pgraph__rate"
            style={{ left: `${x / 10}%`, top: `${((y - 36) / 250) * 100}%` }}
            title={rate !== null && rate >= 100 ? `${next.count} at ${next.label}, ${s.count} at ${s.label}: not every one went through ${s.label} first` : `${s.label} to ${next.label}`}
          >
            {rate === null ? 'none' : rate >= 100 ? 'all' : rate >= 10 ? `${Math.round(rate)}%` : `${rate.toFixed(1)}%`}
          </span>
        );
      })}
      <ol className="sr-only">
        {stages.map((s) => (
          <li key={s.key}>
            {s.label}: {s.count}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A rate as a ring that fills to it, the percent in the middle, the parts under it. */
export function Gauge({ label, part, whole, tone, icon, hint }: { label: string; part: number; whole: number; tone: Tone; icon: ReactNode; hint: string }) {
  const pct = whole > 0 ? Math.min(100, (part / whole) * 100) : 0;
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className={`gauge gauge--${tone}`} title={hint}>
      <div className="gauge__ring">
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle cx="50" cy="50" r={r} className="gauge__track" />
          <circle cx="50" cy="50" r={r} className="gauge__value" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 50 50)" />
        </svg>
        <span className="gauge__pct">
          {whole > 0 ? (
            <span className="gauge__num">
              <AnimatedNumber value={Math.round(pct)} id={`gauge-${label}`} />
              <small>%</small>
            </span>
          ) : (
            <small>none</small>
          )}
        </span>
      </div>
      <div className="gauge__text">
        <span className={`ibadge ibadge--sm ibadge--${tone}`} aria-hidden="true">
          {icon}
        </span>
        <span className="gauge__label">{label}</span>
        <span className="gauge__parts num">
          {part} of {whole}
        </span>
      </div>
    </div>
  );
}

interface Bubble {
  key: string;
  name: string;
  domain: string;
  count: number;
  best: number;
}

/** Circles packed around the middle, biggest first: a simple greedy packing, the same picture every time. */
function pack(items: Bubble[], width: number, height: number) {
  const max = Math.max(1, ...items.map((i) => i.count));
  const placed: { x: number; y: number; r: number; item: Bubble }[] = [];
  for (const item of items) {
    // Area follows the count (radius by square root); a floor keeps the smallest logo readable.
    const r = Math.max(24, 62 * Math.sqrt(item.count / max));
    if (placed.length === 0) {
      placed.push({ x: width / 2, y: height / 2, r, item });
      continue;
    }
    let best: { x: number; y: number } | null = null;
    for (let dist = 0; dist < 400 && !best; dist += 4) {
      for (let a = 0; a < 360; a += 12) {
        const x = width / 2 + Math.cos((a * Math.PI) / 180) * dist * 1.25;
        const y = height / 2 + Math.sin((a * Math.PI) / 180) * dist * 0.8;
        if (x - r < 4 || x + r > width - 4 || y - r < 4 || y + r > height - 4) continue;
        if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + 6)) {
          best = { x, y };
          break;
        }
      }
    }
    if (best) placed.push({ ...best, r, item });
  }
  // Center the cluster in the box.
  if (placed.length) {
    const left = Math.min(...placed.map((p) => p.x - p.r));
    const right = Math.max(...placed.map((p) => p.x + p.r));
    const top = Math.min(...placed.map((p) => p.y - p.r));
    const bottom = Math.max(...placed.map((p) => p.y + p.r));
    const dx = (width - (left + right)) / 2;
    const dy = (height - (top + bottom)) / 2;
    for (const p of placed) {
      p.x += dx;
      p.y += dy;
    }
  }
  return placed;
}

/** Companies as bubbles: size is how many scored jobs there are, the logo inside, a gentle float. */
export function BubbleCluster({ items }: { items: Bubble[] }) {
  const tip = useTip();
  const W = 560;
  const H = 280;
  const [scale, setScale] = useState(1);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = box.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(([entry]) => setScale(Math.max(0.5, entry.contentRect.width / W)));
    watch.observe(node);
    return () => watch.disconnect();
  }, []);
  const placed = useMemo(() => pack(items.slice(0, 10), W, H), [items]);
  const setBox = (node: HTMLDivElement | null) => {
    box.current = node;
    (tip.box as MutableRefObject<HTMLDivElement | null>).current = node;
  };
  return (
    <div className="bubbles" ref={setBox} style={{ aspectRatio: `${W} / ${H}` }}>
      {placed.map((p, i) => (
        <button
          type="button"
          key={p.item.key}
          className="bubble"
          style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, width: `${((p.r * 2) / W) * 100}%`, '--i': i } as CSSProperties}
          onPointerEnter={(e) => tip.showAt(e.currentTarget, [`${p.item.name}: ${p.item.count} jobs`, `Best score ${p.item.best.toFixed(1)}`])}
          onPointerLeave={tip.hide}
          onFocus={(e) => tip.showAt(e.currentTarget, [`${p.item.name}: ${p.item.count} jobs`, `Best score ${p.item.best.toFixed(1)}`])}
          onBlur={tip.hide}
          aria-label={`${p.item.name}, ${p.item.count} jobs, best score ${p.item.best.toFixed(1)}`}
        >
          <CompanyLogo name={p.item.name} domain={p.item.domain} size={Math.round(Math.max(18, p.r * scale * 0.82))} />
          {p.r * scale > 30 ? <span className="bubble__count num">{p.item.count}</span> : null}
        </button>
      ))}
      {tip.node}
    </div>
  );
}

/** One whole as a ring cut in parts with a small gap between them, the total in the middle, a legend with counts. */
export function Donut({ parts, label }: { parts: { key: string; label: string; count: number; tone: string }[]; label: string }) {
  const tip = useTip();
  const total = parts.reduce((a, p) => a + p.count, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  const gap = parts.filter((p) => p.count > 0).length > 1 ? 1.6 : 0;
  let offset = 0;
  return (
    <div className="donut" ref={tip.box}>
      <div className="donut__ring">
        <svg viewBox="0 0 100 100" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.count}`).join(', ')}`}>
          <circle cx="50" cy="50" r={r} className="donut__track" />
          {parts.map((p, i) => {
            if (!p.count) return null;
            const len = (p.count / total) * c;
            const seg = (
              <circle
                key={p.key}
                cx="50"
                cy="50"
                r={r}
                className={`donut__seg stroke--${p.tone}`}
                strokeDasharray={`${Math.max(0.5, len - gap)} ${c}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
                style={{ '--i': i } as CSSProperties}
                onPointerEnter={(e) => tip.show(e, [`${p.count} ${p.label.toLowerCase()}`, `${Math.round((p.count / total) * 100)}% of ${total}`])}
                onPointerLeave={tip.hide}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <span className="donut__total">
          <AnimatedNumber value={total} id="donut-total" />
          <small>tracked</small>
        </span>
      </div>
      <ul className="donut__legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className={`legend__key tone--${p.tone}`} aria-hidden="true" />
            <span>{p.label}</span>
            <span className="num">{p.count}</span>
          </li>
        ))}
      </ul>
      {tip.node}
    </div>
  );
}
