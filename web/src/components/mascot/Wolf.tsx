// The agent's persona: the person's gray wolf. Six stickers in public/mascot, 256px webp with their own white edge,
// so the same file sits on the light paper and on a charcoal card. Pick the mood for what the agent is doing.
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
  /** A small red badge, for an error. */
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

/** The agent's wolf for its tone and state. */
export function AgentWolf({ tone, state, size = 72, motion, className = '', eager = false }: {
  tone: AgentTone;
  state: string;
  size?: number;
  motion?: WolfMotion;
  className?: string;
  eager?: boolean;
}) {
  const quiet = tone === 'off' || tone === 'paused';
  const mood = quiet ? 'music' : wolfForState(state);
  return (
    <Wolf
      mood={mood}
      size={size}
      dim={quiet}
      alert={tone === 'bad'}
      motion={motion ?? (tone === 'busy' ? 'bob' : 'idle')}
      eager={eager}
      className={className}
    />
  );
}

/** A wolf on a lavender rounded square, like a sticker picker tile; a violet ring when `on`. */
export function WolfTile({ mood, size = 32, on = false, dim = false, className = '' }: {
  mood: WolfMood;
  size?: number;
  on?: boolean;
  dim?: boolean;
  className?: string;
}) {
  return (
    <span className={`wolftile ${on ? 'is-on' : ''} ${dim ? 'is-dim' : ''} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <img src={`/mascot/wolf-${mood}.webp`} alt="" width={size} height={size} draggable={false} decoding="async" />
    </span>
  );
}
