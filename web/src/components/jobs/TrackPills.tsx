import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Track } from '../../lib/jobs';
import { SPRING } from '../../lib/motion';

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const TRACKS: { value: Track; label: string; hue: string; icon: ReactNode }[] = [
  {
    value: 'all',
    label: 'All jobs',
    hue: 'hue-muted',
    icon: (
      <>
        <rect x="2" y="2" width="5" height="5" rx="1.2" />
        <rect x="9" y="2" width="5" height="5" rx="1.2" />
        <rect x="2" y="9" width="5" height="5" rx="1.2" />
        <rect x="9" y="9" width="5" height="5" rx="1.2" />
      </>
    ),
  },
  {
    value: 'new',
    label: 'New',
    hue: 'hue-violet',
    icon: (
      <>
        <path d="M8 1.8 9.4 6.6 14.2 8 9.4 9.4 8 14.2 6.6 9.4 1.8 8l4.8-1.4L8 1.8Z" fill="currentColor" fillOpacity="0.18" />
        <path d="M12.6 1.8v2.6M11.3 3.1h2.6" />
      </>
    ),
  },
  {
    value: 'remote',
    label: 'Remote',
    hue: 'hue-cyan',
    icon: (
      <>
        <circle cx="8" cy="8" r="6" fill="currentColor" fillOpacity="0.14" />
        <path d="M2 8h12M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14M8 2C6.2 3.7 5.4 5.7 5.4 8S6.2 12.3 8 14" />
      </>
    ),
  },
  {
    value: 'top',
    label: 'Score 4+',
    hue: 'hue-teal',
    icon: (
      <>
        <path d="M2.2 12.8 5.6 8.6l3 2.2 5.2-6.6" />
        <circle cx="13.8" cy="4.2" r="1.3" fill="currentColor" fillOpacity="0.25" />
      </>
    ),
  },
  {
    value: 'saved',
    label: 'Saved',
    hue: 'hue-amber',
    icon: <path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8Z" fill="currentColor" fillOpacity="0.2" />,
  },
];

/** One track at a time, with an ink thumb that slides to it, after Arena's track pills. Each icon keeps its hue until picked. */
export function TrackPills({ active, counts, onPick }: { active: Track; counts: Record<Track, number>; onPick: (track: Track) => void }) {
  return (
    <div className="tracks">
      <div className="tracks__strip">
        <div className="tracks__track" role="group" aria-label="Show">
          {TRACKS.map((t) => {
            const on = active === t.value;
            return (
              <button
                key={t.value}
                type="button"
                className={`trackpill press ${on ? 'is-on' : ''}`}
                aria-pressed={on}
                onClick={() => onPick(on && t.value !== 'all' ? 'all' : t.value)}
              >
                {on ? <motion.span className="trackpill__thumb" layoutId="track-thumb" transition={SPRING} aria-hidden="true" /> : null}
                <span className={`trackpill__icon ${on ? '' : t.hue}`}>
                  <Glyph>{t.icon}</Glyph>
                </span>
                {t.label}
                <span className="trackpill__count num">{counts[t.value]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
