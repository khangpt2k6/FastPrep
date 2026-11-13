import { useId } from 'react';

/** A share as an aurora ring (cyan to violet to purple) that draws in from nothing. Decorative: say the numbers beside it. */
export function ProgressRing({ value, size = 22, stroke = 3, className = '' }: { value: number; size?: number; stroke?: number; className?: string }) {
  const id = `ar${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const share = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = size / 2;
  return (
    <svg className={`pring ${className}`} viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--aurora-1)" />
          <stop offset="0.6" stopColor="var(--aurora-2)" />
          <stop offset="1" stopColor="var(--aurora-3)" />
        </linearGradient>
      </defs>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      {share > 0 ? (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - share * 100}
          transform={`rotate(-90 ${c} ${c})`}
          className="ring-draw"
        />
      ) : null}
    </svg>
  );
}
