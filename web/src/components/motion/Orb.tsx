import type { CSSProperties } from 'react';
import type { AgentTone } from '../agent/live';

export type OrbState = 'idle' | 'busy' | 'paused' | 'off' | 'bad';

const FROM_TONE: Record<AgentTone, OrbState> = { calm: 'idle', busy: 'busy', paused: 'paused', off: 'off', bad: 'bad' };

export const orbState = (tone: AgentTone): OrbState => FROM_TONE[tone];

/**
 * The agent's orb, after ChatGPT's voice mode: a soft blue and white sphere with clouds drifting inside.
 * It breathes when idle, swirls faster while working, goes pale when paused and flat gray when offline.
 * Pure CSS (styles.css, .orb), so a 16px one in the status pill costs nothing.
 */
export function Orb({ state, size = 96, className = '' }: { state: OrbState; size?: number; className?: string }) {
  const style = { '--orb': `${size}px` } as CSSProperties;
  return (
    <span className={`orb orb--${state} ${size < 32 ? 'orb--tiny' : ''} ${className}`} style={style} aria-hidden="true">
      <span className="orb__cloud orb__cloud--a" />
      <span className="orb__cloud orb__cloud--b" />
      <span className="orb__cloud orb__cloud--c" />
      <span className="orb__shine" />
    </span>
  );
}
