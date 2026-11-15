import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Page } from '../../hooks/useRoute';
import type { AgentRow, AgentSettings } from '../../lib/types';
import { SPRING, backdropVariants } from '../../lib/motion';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { SignOutButton } from '../auth/SignOutButton';
import { IconGrid, IconX, Logo } from '../Icons';
import { linkClick } from './nav';
import { MAIN_PAGES, MORE_PAGES, PAGE_META, TAB_PAGES, YOU_PAGES } from './pages';
import { ProgressDot } from './ProgressDot';

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
  /** Why Find more is off (agent offline or paused), or '' when it can go. */
  blocked?: string;
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
}

/** The granite sidebar: the logo and the pages, icon and a short word each. It never scrolls. */
export function Sidebar({ page, onNavigate, marks, setup }: SidebarProps) {
  const item = (target: Page) => {
    const meta = PAGE_META[target];
    const on = page === target;
    const mark = markFor(target, marks, setup);
    return (
      <li key={target}>
        <a
          href={`#/${target}`}
          className={`snav snav--${meta.tone} ${on ? 'is-on' : ''}`}
          aria-current={on ? 'page' : undefined}
          aria-label={mark ? `${meta.title}, ${mark.label}` : meta.title}
          onClick={linkClick(onNavigate, target)}
        >
          {on ? <motion.span className="snav__bg" layoutId="snav-bg" transition={SPRING} aria-hidden="true" /> : null}
          <span className="snav__icon" aria-hidden="true">
            <meta.Icon size={16} />
          </span>
          <span className="snav__label" aria-hidden="true">
            {meta.short}
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

  return (
    <div className="side">
      <a className="side__brand" href="#/overview" onClick={linkClick(onNavigate, 'overview')} aria-label="Agent Automation, overview">
        <Logo size={28} light />
        <span className="side__name" aria-hidden="true">
          Agent Automation
        </span>
      </a>
      <nav className="side__nav" aria-label="Pages">
        <ul className="side__list">{MAIN_PAGES.map(item)}</ul>
        <p className="side__label" aria-hidden="true">
          You
        </p>
        <ul className="side__list" aria-label="You">
          {YOU_PAGES.map(item)}
        </ul>
      </nav>
    </div>
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
