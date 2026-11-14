import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Page } from '../../hooks/useRoute';
import { menuVariants } from '../../lib/motion';
import { isTampaNight, tampaFormat, tampaParts } from '../../lib/time';
import { SignOutButton } from '../auth/SignOutButton';
import { IconMoon, IconPause, IconPlay, IconRadar, IconSun } from '../Icons';
import { WolfRing } from '../mascot/Wolf';
import { Shimmer } from '../motion';
import { agentTone, START_SHORTCUT } from '../agent/live';
import { linkClick } from './nav';
import type { AgentCardProps } from './Sidebar';
import { statusWords } from './StatusControls';

const pad = (n: number) => String(n).padStart(2, '0');

/** The state's line without the state word it repeats: "Applying, 1 of 2" under "Applying" reads "1 of 2". */
function shortLine(word: string, line: string) {
  const lead = `${word.toLowerCase()}, `;
  if (!line.toLowerCase().startsWith(lead)) return line;
  const rest = line.slice(lead.length);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
const DATE = tampaFormat({ weekday: 'short', month: 'short', day: 'numeric' });

/** The live clock in Tampa time: a sun or a moon by the hour, the time with ticking seconds, the date. */
export function TampaClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Line the ticks up with the second, so the seconds never skip.
    let timer = 0;
    const tick = () => {
      setNow(Date.now());
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    return () => window.clearTimeout(timer);
  }, []);
  const p = tampaParts(now);
  const h12 = p.hour % 12 || 12;
  const night = isTampaNight(now);
  return (
    <div className="clock" title="Tampa time">
      <span className={`clock__icon ${night ? 'is-night' : ''}`} aria-hidden="true">
        {night ? <IconMoon size={16} /> : <IconSun size={16} />}
      </span>
      <span className="clock__text">
        <time className="clock__time" dateTime={new Date(now).toISOString()} aria-label={`${h12}:${pad(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'} in Tampa`}>
          <span aria-hidden="true">
            {h12}:{pad(p.minute)}
            <span className="clock__sec">:{pad(p.second)}</span>
            <span className="clock__ampm">{p.hour < 12 ? 'AM' : 'PM'}</span>
          </span>
        </time>
        <span className="clock__date" aria-hidden="true">
          {DATE.format(now)}
          <span className="clock__place">Tampa</span>
        </span>
      </span>
    </div>
  );
}

/** The person's initial; it opens a small menu with the email and Sign out. */
function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const initial = (email.trim()[0] ?? '?').toUpperCase();
  return (
    <div className="acct" ref={box}>
      <button ref={button} type="button" className="acct__btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Account, ${email || 'signed in'}`} title={email} onClick={() => setOpen((v) => !v)}>
        {initial}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div className="menu acct__menu" role="menu" aria-label="Account" variants={menuVariants} initial="hidden" animate="shown" exit="gone">
            <p className="acct__who">
              <span className="acct__label">Signed in</span>
              <span className="acct__email">{email || 'This account'}</span>
            </p>
            <SignOutButton email={email} className="signout acct__signout" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * The glass bar over every page: the Tampa clock, then the agent (the wolf in its ring, its state, Pause or Resume and
 * Find more), then dry run, alerts and the account. On a phone it keeps the clock, the wolf and the bell.
 */
export function TopBar({ onNavigate, agent, dryRun, alerts, email }: {
  onNavigate: (page: Page) => void;
  agent: AgentCardProps;
  dryRun: ReactNode;
  alerts: ReactNode;
  email: string;
}) {
  const { agent: row, online, loading, now, settings, settingsOff, onSettings, searching, onSearch } = agent;
  const state = online ? row?.state ?? 'idle' : 'offline';
  const tone = loading ? 'off' : agentTone(online, state);
  const { word, line } = statusWords(row, online, loading, now, tone);
  const offline = tone === 'off' && !loading;
  const paused = settings.paused;
  const say = offline ? `Double-click ${START_SHORTCUT} on your desktop` : line;
  const short = shortLine(word, say);
  return (
    <header className="topbar">
      <TampaClock />
      <span className="topbar__rule" aria-hidden="true" />
      <div className={`tagent tagent--${tone}`}>
        <a className="tagent__who" href="#/agent" onClick={linkClick(onNavigate, 'agent')} aria-label={`Your agent: ${word}. ${say}. Open the agent page`} title={say}>
          <WolfRing tone={tone} state={state} size={36} />
          <span className="tagent__text" aria-hidden="true">
            <span className="tagent__word">
              <span className="tagent__dot" />
              {word}
            </span>
            <span className="tagent__line">{tone === 'busy' ? <Shimmer>{short}</Shimmer> : short}</span>
          </span>
        </a>
        <button
          type="button"
          className="icon-btn tagent__btn"
          onClick={() => onSettings({ paused: !paused })}
          disabled={settingsOff}
          aria-label={paused ? 'Resume the agent' : 'Pause the agent'}
          title={settingsOff ? 'Needs the latest supabase/schema.sql' : paused ? 'Resume' : 'Pause'}
        >
          {paused ? <IconPlay size={13} /> : <IconPause size={15} />}
        </button>
        <button
          type="button"
          className={`icon-btn tagent__btn tagent__find ${offline ? '' : 'is-live'}`}
          onClick={onSearch}
          disabled={searching}
          aria-label="Find more jobs"
          title={searching ? 'Finding jobs' : offline ? 'Find more (runs when the agent is back)' : 'Find more'}
        >
          <IconRadar size={15} className={searching ? 'spin-slow' : ''} />
        </button>
      </div>
      <span className="topbar__space" />
      <div className="topbar__dry">{dryRun}</div>
      {alerts}
      <div className="topbar__acct">
        <AccountMenu email={email} />
      </div>
    </header>
  );
}
