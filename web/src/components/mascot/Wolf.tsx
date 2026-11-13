// The agent's persona: the person's gray wolf. Six stickers in public/mascot, 256px webp with their own white edge.
// Pick the mood for what the agent is doing.
import type { CSSProperties } from 'react';
import type { AgentTone } from '../agent/live';

export type WolfMood = 'laptop' | 'reading' | 'thinking' | 'cheer' | 'checklist' | 'music';

/** idle: a slow float. bob: a nod while something runs. hop: lands once for good news. pop: scales in once.
 * wiggle: tilts when its link or button is hovered. */
export type WolfMotion = 'none' | 'idle' | 'bob' | 'hop' | 'pop' | 'wiggle';

export const WOLF_LABEL: Record<WolfMood, string> = {
  laptop: 'The wolf at a laptop',
  reading: 'The wolf reading',
  thinking: 'The wolf, thinking',
  cheer: 'The wolf cheering',
  checklist: 'The wolf with a checklist',
  music: 'The wolf with headphones on',
};

/** The mood for an agent state: thinking while it searches or scores, the laptop while it applies, reading for a
 * resume or letters, music when idle. Offline and paused are music too, drawn gray. */
export function wolfForState(state: string): WolfMood {
  switch (state) {
    case 'searching':
    case 'scoring':
    case 'error':
      return 'thinking';
    case 'applying':
    case 'starting':
      return 'laptop';
    case 'reading':
    case 'writing':
      return 'reading';
    case 'applied':
      return 'cheer';
    default:
      return 'music';
  }
}

export function Wolf({
  mood,
  size = 72,
  motion = 'idle',
  dim = false,
  alert = false,
  alt = '',
  eager = false,
  className = '',
}: {
  mood: WolfMood;
  size?: number;
  motion?: WolfMotion;
  /** Offline or paused: gray and quiet. */
  dim?: boolean;
  /** A small rose badge, for an error. */
  alert?: boolean;
  /** Empty when the words beside it already say it. */
  alt?: string;
  eager?: boolean;
  className?: string;
}) {
  const img = (
    <img
      src={`/mascot/wolf-${mood}.webp`}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      aria-hidden={alt === '' ? true : undefined}
      className={`wolf ${motion === 'none' || dim ? '' : `wolf--${motion}`} ${dim ? 'wolf--dim' : ''} ${alert ? '' : className}`}
      style={{ width: size, height: size }}
    />
  );
  if (!alert) return img;
  return (
    <span className={`wolfwrap ${className}`} style={{ width: size, height: size }}>
      {img}
      <span className="wolfwrap__alert" aria-hidden="true">
        !
      </span>
    </span>
  );
}

/**
 * The wolf's face in a circle with an ember status ring: an arc that turns while the agent works, a soft glow that
 * breathes when it is idle, gray when paused or offline, rose with a badge on an error.
 */
export function WolfRing({ tone, state, size = 56, className = '' }: { tone: AgentTone; state: string; size?: number; className?: string }) {
  const quiet = tone === 'off' || tone === 'paused';
  const mood = quiet ? 'music' : wolfForState(state);
  return (
    <span className={`wring wring--${tone} ${className}`} style={{ '--wr': `${size}px` } as CSSProperties} aria-hidden="true">
      <svg className="wring__ring" viewBox="0 0 100 100" focusable="false">
        <circle className="wring__track" cx="50" cy="50" r="46" pathLength={100} />
        <circle className="wring__arc" cx="50" cy="50" r="46" pathLength={100} />
      </svg>
      <span className="wring__face">
        <img src={`/mascot/wolf-${mood}.webp`} alt="" draggable={false} decoding="async" />
      </span>
      {tone === 'bad' ? <span className="wring__alert">!</span> : null}
    </span>
  );
}
