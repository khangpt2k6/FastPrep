import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Page } from '../../hooks/useRoute';
import { Shimmer } from '../motion';
import { Wolf, type WolfMood } from '../mascot/Wolf';

/*
 * Promo cards after Arena's BannerRow. The gradients and art are pictures, fixed colours on purpose: charcoal and
 * graphite for the gray wolf, a faint violet aurora in the sky, one pale gray-lilac card. The wolf sits in the corner
 * and wiggles when the card is hovered.
 */

const drift = (seconds: number, delay = 0) =>
  ({ '--drift-dur': `${seconds}s`, '--drift-delay': `${delay}s`, transformBox: 'fill-box', transformOrigin: 'center' }) as CSSProperties;

const twinkle = (seconds: number, delay = 0) => ({ '--twinkle-dur': `${seconds}s`, '--twinkle-delay': `${delay}s` }) as CSSProperties;

/** A four point star of radius r, centred on 0,0. */
export function sparklePath(r: number): string {
  const k = r * 0.22;
  return `M0 ${-r}C${k} ${-k} ${k} ${-k} ${r} 0C${k} ${k} ${k} ${k} 0 ${r}C${-k} ${k} ${-k} ${k} ${-r} 0C${-k} ${-k} ${-k} ${-k} 0 ${-r}Z`;
}

function Aurora({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stopColor="#22d3ee" />
      <stop offset="0.5" stopColor="#7c5cff" />
      <stop offset="1" stopColor="#a855f7" />
    </linearGradient>
  );
}

const STARS: [number, number, number][] = [
  [128, 16, 0.9], [160, 9, 0.7], [196, 20, 1.1], [246, 11, 0.8], [292, 36, 0.9],
  [150, 56, 0.6], [118, 100, 0.7], [104, 30, 0.6], [272, 64, 0.7],
];

function findArt(still: boolean) {
  return (
    <>
      <defs>
        <linearGradient id="bn-find" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#141418" />
          <stop offset="0.55" stopColor="#24242b" />
          <stop offset="1" stopColor="#3b3b46" />
        </linearGradient>
        <Aurora id="bn-find-aurora" />
        <filter id="bn-veil" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>
      <rect width="300" height="150" fill="url(#bn-find)" />
      <g filter="url(#bn-veil)" opacity="0.34">
        <path d="M60 46 C120 12 180 72 240 28 S320 32 340 20" fill="none" stroke="url(#bn-find-aurora)" strokeWidth="20" strokeLinecap="round" className="anim-drift" style={drift(16)} />
        <path d="M40 120 C110 90 170 128 230 98 S310 106 330 94" fill="none" stroke="url(#bn-find-aurora)" strokeWidth="12" strokeLinecap="round" opacity="0.6" className="anim-drift" style={drift(19, -7)} />
      </g>
      <g fill="#f4f4f8">
        {STARS.map(([x, y, r], i) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} opacity={0.7} className={i % 3 === 0 && !still ? 'anim-twinkle' : undefined} style={i % 3 === 0 ? twinkle(2.6 + i * 0.2, -i * 0.4) : undefined} />
        ))}
      </g>
      <g stroke="rgb(255 255 255 / 0.1)" fill="none">
        <circle cx="232" cy="66" r="26" />
        <circle cx="232" cy="66" r="44" />
        <circle cx="232" cy="66" r="62" />
      </g>
      <g className="anim-drift" style={drift(15)}>
        <g transform="rotate(-6 224 62)">
          <rect x="168" y="22" width="112" height="34" rx="8" fill="rgb(255 255 255 / 0.1)" stroke="rgb(255 255 255 / 0.16)" />
          <rect x="178" y="31" width="16" height="16" rx="4" fill="rgb(255 255 255 / 0.22)" />
          <rect x="200" y="32" width="50" height="5" rx="2.5" fill="rgb(255 255 255 / 0.5)" />
          <rect x="200" y="42" width="32" height="4" rx="2" fill="rgb(255 255 255 / 0.22)" />
          <rect x="256" y="40" width="5" height="5" rx="1" fill="#2dd4bf" />
          <rect x="263" y="40" width="5" height="5" rx="1" fill="#2dd4bf" />
          <rect x="270" y="40" width="5" height="5" rx="1" fill="rgb(255 255 255 / 0.25)" />
          <rect x="176" y="62" width="104" height="30" rx="8" fill="rgb(255 255 255 / 0.06)" stroke="rgb(255 255 255 / 0.1)" />
          <rect x="186" y="70" width="14" height="14" rx="4" fill="#7c5cff" opacity="0.75" />
          <rect x="206" y="71" width="44" height="5" rx="2.5" fill="rgb(255 255 255 / 0.32)" />
          <rect x="206" y="80" width="26" height="4" rx="2" fill="rgb(255 255 255 / 0.16)" />
        </g>
      </g>
      <g transform="translate(286 18)">
        <path d={sparklePath(7)} fill="#c7b5fb" className={still ? undefined : 'anim-twinkle'} style={twinkle(3.2)} />
      </g>
    </>
  );
}

function resumeArt(still: boolean) {
  return (
    <>
      <defs>
        <linearGradient id="bn-resume" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d1d22" />
          <stop offset="0.55" stopColor="#2e2e36" />
          <stop offset="1" stopColor="#4a4a57" />
        </linearGradient>
        <radialGradient id="bn-resume-glow" cx="0.78" cy="0.32" r="0.55">
          <stop offset="0" stopColor="#7c5cff" stopOpacity="0.32" />
          <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="300" height="150" fill="url(#bn-resume)" />
      <rect width="300" height="150" fill="url(#bn-resume-glow)" />
      <g className="anim-drift" style={drift(17, -4)}>
        <g transform="rotate(-7 210 64)">
          <rect x="160" y="10" width="92" height="112" rx="9" fill="#f4f4f8" opacity="0.94" />
          <circle cx="178" cy="30" r="8" fill="#c7b5fb" />
          <rect x="192" y="24" width="44" height="6" rx="3" fill="#2e2e36" />
          <rect x="192" y="34" width="30" height="4" rx="2" fill="#9a9aa6" />
          <rect x="170" y="50" width="22" height="4" rx="2" fill="#6d3cf5" />
          <rect x="170" y="58" width="70" height="4" rx="2" fill="#c9c9d2" />
          <rect x="170" y="65" width="56" height="4" rx="2" fill="#c9c9d2" />
          <rect x="170" y="78" width="26" height="4" rx="2" fill="#6d3cf5" />
          <rect x="170" y="86" width="66" height="4" rx="2" fill="#c9c9d2" />
          <rect x="170" y="93" width="48" height="4" rx="2" fill="#c9c9d2" />
          <rect x="170" y="106" width="16" height="7" rx="3.5" fill="#e5e0f7" />
          <rect x="189" y="106" width="20" height="7" rx="3.5" fill="#e5e0f7" />
          <rect x="212" y="106" width="14" height="7" rx="3.5" fill="#e5e0f7" />
        </g>
      </g>
      <circle cx="262" cy="26" r="11" fill="#6d3cf5" stroke="#f4f4f8" strokeWidth="2" />
      <path d="m257 26 3.4 3.4 6.4-6.8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(140 30)">
        <path d={sparklePath(6)} fill="#f59e0b" className={still ? undefined : 'anim-twinkle'} style={twinkle(2.9, -0.8)} />
      </g>
    </>
  );
}

function lettersArt(still: boolean) {
  return (
    <>
      <defs>
        <linearGradient id="bn-letters" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a1a1f" />
          <stop offset="0.55" stopColor="#2a2a31" />
          <stop offset="1" stopColor="#43414e" />
        </linearGradient>
        <radialGradient id="bn-letters-glow" cx="0.85" cy="0.15" r="0.6">
          <stop offset="0" stopColor="#a855f7" stopOpacity="0.28" />
          <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="300" height="150" fill="url(#bn-letters)" />
      <rect width="300" height="150" fill="url(#bn-letters-glow)" />
      <circle cx="262" cy="18" r="54" fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="18" className="anim-drift" style={drift(19, -6)} />
      <g className="anim-drift" style={drift(14, -2)}>
        <rect x="176" y="18" width="78" height="70" rx="6" fill="#f4f4f8" opacity="0.95" transform="rotate(5 215 53)" />
        <g transform="rotate(5 215 53)">
          <rect x="186" y="30" width="40" height="5" rx="2.5" fill="#2e2e36" />
          <rect x="186" y="41" width="58" height="4" rx="2" fill="#c9c9d2" />
          <rect x="186" y="48" width="52" height="4" rx="2" fill="#c9c9d2" />
          <rect x="186" y="55" width="56" height="4" rx="2" fill="#c9c9d2" />
          <rect x="186" y="66" width="24" height="4" rx="2" fill="#6d3cf5" />
        </g>
        <path d="M160 70h104v52a6 6 0 0 1-6 6h-92a6 6 0 0 1-6-6z" fill="#3f3d4a" stroke="rgb(255 255 255 / 0.16)" />
        <path d="M160 70l52 34 52-34" fill="none" stroke="rgb(255 255 255 / 0.28)" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="212" cy="104" r="7" fill="#f59e0b" />
      </g>
      <g transform="translate(150 22)">
        <path d={sparklePath(6)} fill="#c7b5fb" className={still ? undefined : 'anim-twinkle'} style={twinkle(3.4, -1.2)} />
      </g>
    </>
  );
}

function appliedArt(still: boolean) {
  return (
    <>
      <defs>
        <linearGradient id="bn-applied" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8f7fc" />
          <stop offset="0.55" stopColor="#efecf7" />
          <stop offset="1" stopColor="#e2deef" />
        </linearGradient>
        <radialGradient id="bn-applied-glow" cx="0.8" cy="0.4" r="0.5">
          <stop offset="0" stopColor="#7c5cff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
        <pattern id="bn-applied-dots" width="11" height="11" patternUnits="userSpaceOnUse">
          <circle cx="5.5" cy="5.5" r="0.9" fill="rgb(18 24 32 / 0.09)" />
        </pattern>
        <linearGradient id="bn-applied-ring" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.55" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="300" height="150" fill="url(#bn-applied)" />
      <rect width="300" height="150" fill="url(#bn-applied-glow)" />
      <rect width="300" height="150" fill="url(#bn-applied-dots)" />
      <g className="anim-drift" style={drift(16, -3)}>
        <circle cx="222" cy="58" r="36" fill="#ffffff" fillOpacity="0.65" />
        <circle cx="222" cy="58" r="36" fill="none" stroke="rgb(18 24 32 / 0.1)" strokeWidth="10" />
        <circle cx="222" cy="58" r="36" fill="none" stroke="url(#bn-applied-ring)" strokeWidth="10" strokeLinecap="round" strokeDasharray="170 227" transform="rotate(-90 222 58)" />
        <path d="m209 59 9 9 18-19" fill="none" stroke="#0b0b12" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(276 24)">
        <path d={sparklePath(7)} fill="#0b0b12" className={still ? undefined : 'anim-twinkle'} style={twinkle(3.4, -1.5)} />
      </g>
    </>
  );
}

function Face({ title, sub, art, wolf, light = false }: { title: ReactNode; sub: ReactNode; art: ReactNode; wolf: WolfMood; light?: boolean }) {
  return (
    <>
      <svg viewBox="0 0 300 150" preserveAspectRatio="xMaxYMid slice" className="banner__art" aria-hidden="true">
        {art}
      </svg>
      <Wolf mood={wolf} size={92} motion="wiggle" eager className="banner__wolf" />
      <span className={`banner__text ${light ? 'is-light' : ''}`}>
        <span className="banner__title">{title}</span>
        <span className="banner__sub">{sub}</span>
      </span>
      <span className={`banner__edge ${light ? 'is-light' : ''}`} aria-hidden="true" />
    </>
  );
}

function Nudge({ back, onClick }: { back?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={back ? 'Scroll back' : 'Scroll on'} className={`btn-icon press banner__nudge ${back ? 'is-back' : ''}`}>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
        <path d={back ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function useStill(): boolean {
  const [still, setStill] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setStill(query.matches);
    query.addEventListener?.('change', on);
    return () => query.removeEventListener?.('change', on);
  }, []);
  return still;
}

export interface BannerRowProps {
  found: number;
  searching: boolean;
  onSearch: () => void;
  /** Set up: done, or which step is next. */
  setup: { done: boolean; label: string };
  letters: number;
  sent: number;
  onNavigate: (page: Page) => void;
}

/** Four gradient cards across the top of the Jobs page, each a way into a page or an action. */
export function BannerRow({ found, searching, onSearch, setup, letters, sent, onNavigate }: BannerRowProps) {
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const still = useStill();

  const measure = useCallback(() => {
    const row = strip.current;
    if (!row) return;
    setEdges({ left: row.scrollLeft > 2, right: row.scrollLeft + row.clientWidth < row.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const row = strip.current;
    if (!row) return;
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measure]);

  const nudge = (direction: 1 | -1) => strip.current?.scrollBy({ left: direction * 316, behavior: still ? 'auto' : 'smooth' });

  return (
    <div className="banners">
      <div ref={strip} onScroll={measure} className="banners__strip">
        <button type="button" className="banner press" onClick={onSearch} disabled={searching} aria-label={searching ? 'Finding jobs' : `Find new jobs, ${found} found so far`}>
          <Face
            title={
              <>
                Find new
                <br />
                jobs
              </>
            }
            sub={searching ? <Shimmer tone="inverse">Finding jobs</Shimmer> : `${found.toLocaleString()} found`}
            wolf="thinking"
            art={findArt(still)}
          />
        </button>
        <a className="banner press" href="#/setup" onClick={(e) => { e.preventDefault(); onNavigate('setup'); }}>
          <Face
            title={
              <>
                {setup.done ? 'Your' : 'Set up your'}
                <br />
                resume
              </>
            }
            sub={setup.label}
            wolf="checklist"
            art={resumeArt(still)}
          />
        </a>
        <a className="banner press" href="#/letters" onClick={(e) => { e.preventDefault(); onNavigate('letters'); }}>
          <Face
            title={
              <>
                Cover
                <br />
                letters
              </>
            }
            sub={`${letters} written`}
            wolf="reading"
            art={lettersArt(still)}
          />
        </a>
        <a className="banner press" href="#/applications" onClick={(e) => { e.preventDefault(); onNavigate('applications'); }}>
          <Face light title="Applications" sub={`${sent} sent`} wolf="cheer" art={appliedArt(still)} />
        </a>
      </div>
      {edges.left ? <Nudge back onClick={() => nudge(-1)} /> : null}
      {edges.right ? <Nudge onClick={() => nudge(1)} /> : null}
    </div>
  );
}
