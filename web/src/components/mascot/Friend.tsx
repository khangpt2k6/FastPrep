import type { CSSProperties } from 'react';

/**
 * One of the wolf's friends from public/mascot/friends (bear, bunny, fox, panda, penguin, raccoon, robot): a small
 * sticker with personality for page headers, empty and loading states. Decorative, so it has no text of its own.
 */
export function Friend({ name, size = 48, motion = 'idle', className = '', style }: {
  name: string;
  size?: number;
  /** idle floats slowly, bob nods while something loads, none stays still. All wiggle on hover. */
  motion?: 'idle' | 'bob' | 'none';
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      src={`/mascot/friends/${name}.webp`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      loading="lazy"
      decoding="async"
      className={`friend friend--${motion} ${className}`}
      style={{ width: size, height: size, ...style }}
    />
  );
}
