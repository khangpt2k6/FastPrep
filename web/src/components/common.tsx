import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { SPRING } from '../lib/motion';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { matchInfo, scoreColor, type TagColor } from '../lib/format';

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

/** A Notion-style callout: a tinted block with an icon, for the few notices that must stay. */
export function Callout({ tone = 'gray', icon, children, action }: { tone?: 'gray' | 'yellow' | 'red'; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
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

/** One short line, an icon and at most one button. */
export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="emptystate">
      <span className="emptystate__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="emptystate__title">{title}</p>
      {children ? <p className="emptystate__text">{children}</p> : null}
      {action ? <div className="emptystate__action">{action}</div> : null}
    </div>
  );
}

/** Placeholder rows in the shape of a list row while data loads. */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <ul className="skellist" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li className="skelrow" key={i}>
          <span className="skeleton skeleton--box" />
          <span className="skeleton skeleton--tile" />
          <span className="skelrow__lines">
            <span className="skeleton skeleton--line" style={{ width: `${62 - i * 7}%` }} />
            <span className="skeleton skeleton--line skeleton--thin" style={{ width: `${34 - i * 3}%` }} />
          </span>
          <span className="skeleton skeleton--tag" />
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

/** View tabs, like a Notion database: exactly one is on and it carries a sliding underline. Scrolls sideways when narrow. */
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
      className={`viewtabs ${edges.start ? 'fade-start' : ''} ${edges.end ? 'fade-end' : ''}`}
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          className={`viewtab ${value === o.value ? 'is-on' : ''}`}
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          <span>{o.label}</span>
          {o.count !== undefined ? <AnimatedNumber className="viewtab__count num" id={`tab-${label}-${String(o.value)}`} value={o.count} /> : null}
          {value === o.value ? <motion.span className="viewtab__bar" layoutId={`tab-${group}`} transition={SPRING} aria-hidden="true" /> : null}
        </button>
      ))}
    </motion.div>
  );
}
