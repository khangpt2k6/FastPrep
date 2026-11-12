import type { AgentTone } from './live';

/** loading: still connecting, so the orb breathes like idle without claiming anything. */
export type OrbTone = AgentTone | 'loading';

interface OrbProps {
  tone: OrbTone;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Words for screen readers; without them the orb is decoration next to text that says the state. */
  label?: string;
}

/**
 * The agent's face: a glassy sphere with a slow conic swirl, a thin rotating ring and three orbiting dots.
 * calm breathes mint, busy spins faster with the dots out, off is grey and still, bad turns coral.
 */
export function Orb({ tone, size = 'md', label }: OrbProps) {
  return (
    <span
      className={`orb orb--${size} orb--${tone}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="orb__glow" />
      <span className="orb__ring" />
      <span className="orb__core">
        <span className="orb__swirl" />
      </span>
      <span className="orb__dots">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
