import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { SPRING } from '../lib/motion';
import { AnimatedNumber } from './motion/AnimatedNumber';
import { avatarColors, initialOf, matchInfo } from '../lib/format';

/** A colored circle with the company's first letter. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const colors = avatarColors(name || '?');
  return (
    <span className="avatar" style={{ ...colors, width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}

const RING_R = 19;
const RING_C = 2 * Math.PI * RING_R;

/** The match score as a ring with the number inside, a label, and the 1 to 5 scale as five bars. */
export function MatchBadge({ score }: { score: number | null }) {
  if (score === null || !Number.isFinite(score)) {
    return <span className="match match--none">Not scored</span>;
  }
  const { label, tone } = matchInfo(score);
  const share = Math.max(0, Math.min(1, score / 5));
  return (
    <span className={`match match--${tone}`} role="img" aria-label={`${label}, ${score.toFixed(1)} out of 5`}>
      <span className="match__ring">
        <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false">
          <circle className="match__track" cx="24" cy="24" r={RING_R} />
          <circle
            className="match__arc"
            cx="24"
            cy="24"
            r={RING_R}
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - share)}
            transform="rotate(-90 24 24)"
          />
        </svg>
        <AnimatedNumber className="match__num mono" value={score} decimals={1} from={score * 0.6} duration={0.5} />
      </span>
      <span className="match__text" aria-hidden="true">
        <span className="match__label">{label}</span>
        <span className="match__bars">
          {[0, 1, 2, 3, 4].map((i) => (
            <span className="match__seg" key={i}>
              <span style={{ width: `${Math.max(0, Math.min(1, score - i)) * 100}%` }} />
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card emptystate">
      <span className="emptystate__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="emptystate__title">{title}</p>
      <p className="emptystate__text">{children}</p>
      {action ? <div className="emptystate__action">{action}</div> : null}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <ul className="cardlist" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li className="card skelcard" key={i}>
          <span className="skeleton skeleton--circle" />
          <span className="skelcard__lines">
            <span className="skeleton skeleton--line" style={{ width: `${62 - i * 7}%` }} />
            <span className="skeleton skeleton--line" style={{ width: `${38 - i * 4}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A row of pill toggles; exactly one is on. */
export function PillGroup<T extends string | number>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const group = useId();
  return (
    <div className="pills" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          className={`pilltoggle ${value === o.value ? 'is-on' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {value === o.value ? <motion.span className="pilltoggle__pill" layoutId={`pill-${group}`} transition={SPRING} aria-hidden="true" /> : null}
          <span className="pilltoggle__label">{o.label}</span>
          {o.count !== undefined ? <AnimatedNumber className="pilltoggle__count mono" id={`pill-${label}-${String(o.value)}`} value={o.count} /> : null}
        </button>
      ))}
    </div>
  );
}
