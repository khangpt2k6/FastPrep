import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Page } from '../../hooks/useRoute';
import type { AgentRow, AgentSettings } from '../../lib/types';
import { SPRING, backdropVariants } from '../../lib/motion';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { SignOutButton } from '../auth/SignOutButton';
import { IconChevronRight, IconGrid, IconPause, IconPlay, IconRadar, IconX, Logo } from '../Icons';
import { WolfRing } from '../mascot/Wolf';
import { Shimmer, Swap } from '../motion';
import { agentTone, START_SHORTCUT } from '../agent/live';
import { linkClick } from './nav';
import { MAIN_PAGES, MORE_PAGES, PAGE_META, TAB_PAGES, YOU_PAGES } from './pages';
import { ProgressDot } from './ProgressDot';
import { statusWords } from './StatusControls';

/** Setup progress for the nav: how far along, and whether it is done. */
export interface SetupMark {
  done: boolean;
  /** 0 to 1. */
  progress: number;
  label: string;
}

export type Marks = Partial<Record<Page, { node: ReactNode; label: string }>>;

/** What the agent card needs: the agent row, its switches, and Find more. */
export interface AgentCardProps {
  agent: AgentRow | null;
  online: boolean;
  loading: boolean;
  now: number;
  settings: AgentSettings;
  /** The settings table is missing: Pause cannot be saved. */
  settingsOff: boolean;
  onSettings: (patch: Partial<AgentSettings>) => void;
  searching: boolean;
  onSearch: () => void;
}

/** The agent at the top of the sidebar: the wolf in its status ring, its state, what it is doing, Pause and Find more. */
export function AgentCard({ agent, online, loading, now, settings, settingsOff, onSettings, searching, onSearch, onNavigate, page }: AgentCardProps & {
  onNavigate: (page: Page) => void;
  page: Page;
}) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone = loading ? 'off' : agentTone(online, state);
  const { word, line } = statusWords(agent, online, loading, now, tone);
  const paused = settings.paused;
  return (
    <section className={`sagent sagent--${tone} ${page === 'agent' ? 'is-here' : ''}`} aria-label="Your agent">
      <a
        className="sagent__head"
        href="#/agent"
        onClick={linkClick(onNavigate, 'agent')}
        aria-current={page === 'agent' ? 'page' : undefined}
        aria-label={`Your agent: ${word}. ${line}. Open the agent page`}
      >
        <WolfRing tone={tone} state={state} size={44} />
        <span className="sagent__who" aria-hidden="true">
          <span className="sagent__name">Your agent</span>
          <span className="sagent__word">
            <span className="sagent__dot" />
            <Swap id={word}>{word}</Swap>
          </span>
        </span>
        <IconChevronRight size={16} className="sagent__chev" />
      </a>
      <p className="sagent__line" aria-live="polite">
        {tone === 'off' && !loading ? (
          <>
            Double-click <strong className="nowrap">{START_SHORTCUT}</strong> on your desktop.
          </>
        ) : (
          <Shimmer tone="granite" active={tone === 'busy'}>
            {line}
          </Shimmer>
        )}
      </p>
      <div className="sagent__actions">
        <button
          type="button"
          className="sbtn"
          onClick={() => onSettings({ paused: !paused })}
          disabled={settingsOff}
          title={settingsOff ? 'Needs the latest supabase/schema.sql' : paused ? 'Let the agent take jobs again' : 'Finish the current job, then wait'}
        >
          {paused ? <IconPlay size={12} /> : <IconPause size={14} />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" className="sbtn sbtn--ember" onClick={onSearch} disabled={searching} title="Ask the agent for more jobs">
          <IconRadar size={14} className={searching ? 'spin-slow' : ''} />
          {searching ? <Shimmer tone="inverse">Finding</Shimmer> : 'Find more'}
        </button>
      </div>
    </section>
  );
}

/** A nav row's live marker: a count, a dot, or Set up's progress while it is unfinished. */
function markFor(target: Page, marks: Marks, setup?: SetupMark) {
  if (target === 'setup' && setup && !setup.done) {
    return {
      node: (
        <span className="setupmark num">
          <ProgressDot value={setup.progress} size={14} />
          {Math.round(setup.progress * 2)}/2
        </span>
      ),
      label: setup.label,
    };
  }
  return marks[target];
}

interface SidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  marks: Marks;
  setup?: SetupMark;
  agent: AgentCardProps;
  /** The dry run switch, the alerts menu and the account, at the bottom. */
  dryRun: ReactNode;
  alerts: ReactNode;
  email: string;
}

/** The granite sidebar: the wordmark, the agent card, the pages in two groups, then dry run, alerts and the account. */
export function Sidebar({ page, onNavigate, marks, setup, agent, dryRun, alerts, email }: SidebarProps) {
  const item = (target: Page) => {
    const meta = PAGE_META[target];
    const on = page === target;
    const mark = markFor(target, marks, setup);
    return (
      <li key={target}>
        <a
          href={`#/${target}`}
          className={`snav ${on ? 'is-on' : ''}`}
          aria-current={on ? 'page' : undefined}
          aria-label={mark ? `${meta.title}, ${mark.label}` : meta.title}
          onClick={linkClick(onNavigate, target)}
        >
          {on ? <motion.span className="snav__bg" layoutId="snav-bg" transition={SPRING} aria-hidden="true" /> : null}
          <span className="snav__icon" aria-hidden="true">
            <meta.Icon size={17} />
          </span>
          <span className="snav__label" aria-hidden="true">
            {meta.title}
          </span>
          {mark ? (
            <span className="snav__mark" aria-hidden="true">
              {mark.node}
            </span>
          ) : null}
        </a>
      </li>
    );
  };
  const initial = (email.trim()[0] ?? '?').toUpperCase();

  return (
    <div className="side">
      <a className="side__brand" href="#/overview" onClick={linkClick(onNavigate, 'overview')} aria-label="Agent Automation, overview">
        <Logo size={28} light />
        <span className="side__name" aria-hidden="true">
          Agent Automation
        </span>
      </a>
      <AgentCard {...agent} onNavigate={onNavigate} page={page} />
      <nav className="side__nav" aria-label="Pages">
        <ul className="side__list">{MAIN_PAGES.map(item)}</ul>
        <p className="side__label" aria-hidden="true">
          You
        </p>
        <ul className="side__list" aria-label="You">
          {YOU_PAGES.map(item)}
        </ul>
      </nav>
      <div className="side__foot">
        {dryRun}
        {alerts}
        <div className="side__acct">
          <span className="side__avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="side__email" title={email}>
            {email || 'Signed in'}
          </span>
          <SignOutButton email={email} className="signout side__signout" />
        </div>
      </div>
    </div>
  );
}

/** The phone's top bar: the wolf in its ring (opens the agent page), the page title, Live when it is on, alerts. */
export function PhoneBar({ page, onNavigate, agent, live, alerts }: {
  page: Page;
  onNavigate: (page: Page) => void;
  agent: Pick<AgentCardProps, 'agent' | 'online' | 'loading' | 'now'>;
  live: boolean;
  alerts: ReactNode;
}) {
  const state = agent.online ? agent.agent?.state ?? 'idle' : 'offline';
  const tone = agent.loading ? 'off' : agentTone(agent.online, state);
  const { word } = statusWords(agent.agent, agent.online, agent.loading, agent.now, tone);
  return (
    <header className="phonebar">
      <a className="phonebar__agent" href="#/agent" onClick={linkClick(onNavigate, 'agent')} aria-label={`Agent: ${word}. Open the agent page`}>
        <WolfRing tone={tone} state={state} size={34} />
      </a>
      <p className="phonebar__title" aria-hidden="true">
        {PAGE_META[page].title}
      </p>
      {live ? <span className="livetag">Live</span> : null}
      {alerts}
    </header>
  );
}

/** The phone's bottom bar: four pages and a More sheet with the rest, dry run and the account. */
export function TabBar({ page, onNavigate, marks, setup, email, dryRun }: {
  page: Page;
  onNavigate: (page: Page) => void;
  marks: Marks;
  setup?: SetupMark;
  email: string;
  dryRun: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  useFocusTrap(sheet, open, () => setOpen(false));
  const inMore = MORE_PAGES.includes(page);
  const go = (target: Page) => {
    setOpen(false);
    onNavigate(target);
  };
  return (
    <>
      <nav className="tabbar" aria-label="Pages">
        {TAB_PAGES.map((target) => {
          const meta = PAGE_META[target];
          const on = page === target;
          const mark = marks[target];
          return (
            <a
              key={target}
              href={`#/${target}`}
              className={`tab ${on ? 'is-on' : ''}`}
              aria-current={on ? 'page' : undefined}
              aria-label={mark ? `${meta.title}, ${mark.label}` : meta.title}
              onClick={linkClick(onNavigate, target)}
            >
              {on ? <motion.span className="tab__notch" layoutId="tab-notch" transition={SPRING} aria-hidden="true" /> : null}
              <span className="tab__icon" aria-hidden="true">
                <meta.Icon size={20} />
              </span>
              <span className="tab__label" aria-hidden="true">
                {meta.short}
              </span>
            </a>
          );
        })}
        <button type="button" className={`tab ${inMore ? 'is-on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          {inMore ? <motion.span className="tab__notch" layoutId="tab-notch" transition={SPRING} aria-hidden="true" /> : null}
          <span className="tab__icon" aria-hidden="true">
            <IconGrid size={20} />
          </span>
          <span className="tab__label">{inMore ? PAGE_META[page].short : 'More'}</span>
          {setup && !setup.done ? <span className="tab__dot" aria-hidden="true" /> : null}
        </button>
      </nav>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="sheet"
            className="sheetwrap"
            variants={backdropVariants}
            initial="hidden"
            animate="shown"
            exit="gone"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <motion.div
              ref={sheet}
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label="More pages"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { type: 'spring', stiffness: 520, damping: 44 } }}
              exit={{ y: 30, opacity: 0, transition: { duration: 0.14 } }}
            >
              <div className="sheet__head">
                <p className="sheet__title">More</p>
                <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
                  <IconX size={16} />
                </button>
              </div>
              <ul className="sheet__grid">
                {MORE_PAGES.map((target) => {
                  const meta = PAGE_META[target];
                  const mark = markFor(target, marks, setup);
                  return (
                    <li key={target}>
                      <a
                        href={`#/${target}`}
                        className={`sheet__item ${page === target ? 'is-on' : ''}`}
                        aria-current={page === target ? 'page' : undefined}
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                          event.preventDefault();
                          go(target);
                        }}
                      >
                        <span className="sheet__icon" aria-hidden="true">
                          <meta.Icon size={18} />
                        </span>
                        <span className="sheet__label">{meta.title}</span>
                        {mark ? <span className="sheet__mark">{mark.node}</span> : null}
                      </a>
                    </li>
                  );
                })}
              </ul>
              <div className="sheet__dry">{dryRun}</div>
              <div className="sheet__acct">
                <span className="sheet__email">{email}</span>
                <SignOutButton email={email} className="signout sheet__signout" />
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
