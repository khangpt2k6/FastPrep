import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASE_OUT, SPRING } from '../lib/motion';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { matchInfo } from '../lib/format';

const RING_R = 20;

/**
 * The 1 to 5 match score as a ring with the number inside. The colour says the strength, the tooltip says it in
 * words, the arc draws in when the ring scrolls into view, and 4.5 and up glows.
 */
export function ScoreRing({ score }: { score: number | null }) {
  const gradient = `ring${useId().replace(/:/g, '')}`;
  const reduce = useReducedMotion();
  if (score === null || !Number.isFinite(score)) {
    return (
      <span className="ring ring--none" title="Not scored yet" role="img" aria-label="Not scored yet">
        <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
          <circle className="ring__track" cx="24" cy="24" r={RING_R} />
        </svg>
        <span className="ring__num mono">?</span>
      </span>
    );
  }
  const { label, tone } = matchInfo(score);
  const share = Math.max(0.02, Math.min(1, score / 5));
  const tip = `${label}, ${score.toFixed(1)} of 5`;
  return (
    <span className={`ring ring--${tone} ${score >= 4.5 ? 'is-hot' : ''}`} role="img" aria-label={tip} title={tip}>
      <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop className="ring__from" offset="0" />
            <stop className="ring__to" offset="1" />
          </linearGradient>
        </defs>
        <circle className="ring__track" cx="24" cy="24" r={RING_R} />
        <motion.circle
          className="ring__arc"
          cx="24"
          cy="24"
          r={RING_R}
          stroke={`url(#${gradient})`}
          initial={reduce ? { pathLength: share, opacity: 1 } : { pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: share, opacity: 1 }}
          viewport={{ once: true, margin: '0px 0px -40px 0px' }}
          transition={{ duration: 1, ease: EASE_OUT, delay: 0.08 }}
        />
      </svg>
      <AnimatedNumber className="ring__num mono" value={score} decimals={1} from={score * 0.6} duration={0.7} />
    </span>
  );
}

/** The drawn box of a .check: the tick draws itself in when the input before it is checked. */
export function CheckBox() {
  return (
    <span className="check__box" aria-hidden="true">
      <svg viewBox="0 0 16 16" focusable="false">
        <path d="M3.5 8.4l3 3 6-6.4" />
      </svg>
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card emptystate">
      <span className="emptystate__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="emptystate__title">{title}</p>
      {children ? <p className="emptystate__text">{children}</p> : null}
      {action ? <div className="emptystate__action">{action}</div> : null}
    </div>
  );
}

/** Placeholder cards in the shape of a job card while data loads. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <ul className="cardlist" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li className="card skelcard" key={i}>
          <span className="skeleton skeleton--tile" />
          <span className="skelcard__lines">
            <span className="skeleton skeleton--line" style={{ width: `${68 - i * 7}%` }} />
            <span className="skeleton skeleton--line skeleton--thin" style={{ width: `${40 - i * 4}%` }} />
          </span>
          <span className="skeleton skeleton--circle" />
        </li>
      ))}
    </ul>
  );
}

/** Which ends of a sideways-scrolling row hide more, so the row can fade there. */
function useScrollEdges<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const start = el.scrollLeft > 4;
      const end = el.scrollWidth - el.clientWidth - el.scrollLeft > 4;
      setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', check);
      observer?.disconnect();
    };
  }, []);
  return [ref, edges] as const;
}

/** A row of pill toggles; exactly one is on. On a narrow screen the row scrolls sideways and fades at the hidden end. */
export function PillGroup<T extends string | number>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string; count?: number; title?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const group = useId();
  const [ref, edges] = useScrollEdges<HTMLDivElement>();
  return (
    <motion.div
      ref={ref}
      layoutScroll
      className={`pills ${edges.start ? 'fade-start' : ''} ${edges.end ? 'fade-end' : ''}`}
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          className={`pilltoggle ${value === o.value ? 'is-on' : ''}`}
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {value === o.value ? <motion.span className="pilltoggle__pill" layoutId={`pill-${group}`} transition={SPRING} aria-hidden="true" /> : null}
          <span className="pilltoggle__label">{o.label}</span>
          {o.count !== undefined ? <AnimatedNumber className="pilltoggle__count mono" id={`pill-${label}-${String(o.value)}`} value={o.count} /> : null}
        </button>
      ))}
    </motion.div>
  );
}
