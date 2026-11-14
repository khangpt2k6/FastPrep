import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { SPRING } from '../lib/motion';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { matchInfo, scoreColor, type TagColor } from '../lib/format';
import { Wolf, type WolfMood } from './mascot/Wolf';
import { Friend } from './mascot/Friend';
import { Shimmer } from './motion/Shimmer';
import { TrailDivider } from './motif';

/** A Notion-style tag: a pastel fill with matching text. */
export function Tag({ color = 'gray', children, title, className = '' }: { color?: TagColor; children: ReactNode; title?: string; className?: string }) {
  return (
    <span className={`tag tag--${color} ${className}`} title={title}>
      {children}
    </span>
  );
}

/** The 1 to 5 match score as a tag: 4.5 and up green, 4.0 to 4.4 blue, below 4 gray. */
export function ScoreTag({ score }: { score: number | null }) {
  if (score === null || !Number.isFinite(score)) {
    return (
      <Tag color="gray" title="Not scored" className="scoretag">
        None
      </Tag>
    );
  }
  const tip = `${matchInfo(score).label}, ${score.toFixed(1)} of 5`;
  return (
    <span className={`tag tag--${scoreColor(score)} scoretag`} title={tip} role="img" aria-label={tip}>
      {score.toFixed(1)}
    </span>
  );
}

/** A small "New" tag with a soft pulsing dot, for jobs found in the last day. */
export function NewTag() {
  return (
    <span className="newtag" title="Found in the last 24 hours">
      <span className="newtag__dot" aria-hidden="true" />
      New
    </span>
  );
}

/** A Notion-style callout: a tinted block with an icon, for the few notices that must stay. */
export function Callout({ tone = 'gray', icon, children, action }: { tone?: 'gray' | 'yellow' | 'red' | 'blue'; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`callout callout--${tone}`}>
      <span className="callout__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="callout__body">{children}</div>
      {action ? <div className="callout__action">{action}</div> : null}
    </div>
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

/** An empty screen: the wolf (or an icon), a short title, one gray line at most, the trail, and one button. */
export function EmptyState({ icon, wolf, friend, title, children, text, action, compact = false }: {
  icon?: ReactNode;
  wolf?: WolfMood;
  /** One of the wolf's friends (a file in public/mascot/friends), shown instead of the wolf or the icon. */
  friend?: string;
  title: string;
  children?: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  const line = text ?? children;
  return (
    <div className={`emptystate ${compact ? 'emptystate--compact' : ''}`}>
      <span className="emptystate__art" aria-hidden="true">
        {friend ? (
          <Friend name={friend} size={compact ? 64 : 88} motion="idle" />
        ) : wolf ? (
          <Wolf mood={wolf} size={compact ? 72 : 96} motion="idle" />
        ) : (
          <span className="emptystate__icon">{icon}</span>
        )}
      </span>
      <p className="emptystate__title">{title}</p>
      {line ? <p className="emptystate__text">{line}</p> : null}
      <TrailDivider className="emptystate__trail" />
      {action ? <div className="emptystate__action">{action}</div> : null}
    </div>
  );
}

/** Placeholder rows in the shape of a list row while data loads, with a light sweep. */
export function SkeletonCards({ count = 4, ring = false, check = true, zebra = false }: { count?: number; ring?: boolean; check?: boolean; zebra?: boolean }) {
  return (
    <ul className={`skellist ${zebra ? 'skellist--zebra' : ''}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li className="skelrow" key={i}>
          {check ? <span className="skeleton skeleton--box" /> : null}
          <span className="skeleton skeleton--tile" />
          <span className="skelrow__lines">
            <span className="skeleton skeleton--line" style={{ width: `${62 - ((i * 7) % 28)}%` }} />
            <span className="skeleton skeleton--line skeleton--thin" style={{ width: `${34 - ((i * 3) % 14)}%` }} />
          </span>
          {ring ? <span className="skeleton skeleton--ring" /> : <span className="skeleton skeleton--tag" />}
        </li>
      ))}
    </ul>
  );
}

/** A white card of skeleton rows, for lists that live in a card. */
export function SkeletonPanel({ count = 4, ring = false, check = false }: { count?: number; ring?: boolean; check?: boolean }) {
  return (
    <div className="panel" aria-busy="true" aria-label="Loading">
      <SkeletonCards count={count} ring={ring} check={check} />
    </div>
  );
}

/** A page while its code or rows load: a friend at work over placeholder rows. */
export function PageLoading({ friend = 'raccoon-laptop', count = 5 }: { friend?: string; count?: number }) {
  return (
    <div className="pageload">
      <p className="pageload__who" role="status">
        <Friend name={friend} size={40} motion="bob" />
        <Shimmer>Loading</Shimmer>
      </p>
      <SkeletonPanel count={count} />
    </div>
  );
}

/** Settings rows while they load: a title and a gray line, a control on the right. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="panel" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div className="srow srow--skel" key={i} aria-hidden="true">
          <span className="srow__text">
            <span className="skeleton skeleton--line" style={{ width: `${38 - i * 6}%` }} />
            <span className="skeleton skeleton--line skeleton--thin" style={{ width: `${64 - i * 9}%` }} />
          </span>
          <span className={`skeleton ${i % 2 ? 'skeleton--pill' : 'skeleton--switch'}`} />
        </div>
      ))}
    </div>
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

/**
 * A segmented pill: exactly one option is on and a white pill slides under it. Counts count up.
 * Scrolls sideways when narrow, fading at the hidden end.
 */
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
      className={`segmented ${edges.start ? 'fade-start' : ''} ${edges.end ? 'fade-end' : ''}`}
      role="group"
      aria-label={label}
    >
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            type="button"
            key={String(o.value)}
            className={`segmented__btn ${on ? 'is-on' : ''}`}
            aria-pressed={on}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {on ? <motion.span className="segmented__pill" layoutId={`seg-${group}`} transition={SPRING} aria-hidden="true" /> : null}
            <span className="segmented__label">{o.label}</span>
            {o.count !== undefined ? <AnimatedNumber className="segmented__count num" id={`seg-${label}-${String(o.value)}`} value={o.count} /> : null}
          </button>
        );
      })}
    </motion.div>
  );
}
