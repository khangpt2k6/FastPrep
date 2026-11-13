import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Page } from '../../hooks/useRoute';
import { SPRING, menuVariants } from '../../lib/motion';
import { SignOutButton } from '../auth/SignOutButton';
import { IconChevronDown, Logo } from '../Icons';
import { ProgressDot } from './ProgressDot';
import { MAIN_PAGES, PAGE_META, YOU_PAGES } from './pages';

/** Closes a popover on a press outside it or on Escape, and gives focus back to its button. */
export function useDismiss(box: RefObject<HTMLElement>, open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) latest.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [box, open]);
}

/** A click that changes page in place, except with a modifier key (new tab) or another button. */
export function linkClick(onNavigate: (page: Page) => void, target: Page) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(target);
  };
}

/** The mark and the name: "Agent" in ink, "Automation" in violet. */
export function Wordmark({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <a className="wordmark press" href="#/jobs" onClick={linkClick(onNavigate, 'jobs')} aria-label="Agent Automation, jobs">
      <Logo size={30} />
      <span className="wordmark__text" aria-hidden="true">
        Agent<span className="wordmark__accent">Automation</span>
      </span>
    </a>
  );
}

/** The person's initial on a round button; it opens a small menu with the email and Sign out. */
export function AccountMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useDismiss(box, open, () => {
    setOpen(false);
    button.current?.focus();
  });
  const initial = (email.trim()[0] ?? '?').toUpperCase();
  return (
    <div className="acct" ref={box}>
      <button
        ref={button}
        type="button"
        className="acct__btn press"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account, ${email || 'signed in'}`}
        title={email}
        onClick={() => setOpen((v) => !v)}
      >
        {initial}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div className="menu acct__menu" role="menu" aria-label="Account" variants={menuVariants} initial="hidden" animate="shown" exit="gone">
            <p className="acct__who">
              <span className="acct__label">Signed in as</span>
              <span className="acct__email">{email || 'this account'}</span>
            </p>
            <SignOutButton email={email} className="signout acct__signout" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

interface NavbarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  /** Right side, in order: the agent's pill, the applied ring, alerts, the dry run switch, the account. */
  status: ReactNode;
  ring?: ReactNode;
  alerts?: ReactNode;
  dryRun?: ReactNode;
  account?: ReactNode;
  /** Set up's progress, for its link in the tablet strip. */
  setup?: { done: boolean; progress: number };
}

/**
 * The top bar: the wordmark, the main pages as pills (the current one in violet-soft with a violet ring), then the
 * agent, the progress ring, alerts, dry run and the account. On a tablet every page moves to a second row that scrolls.
 */
export function Navbar({ page, onNavigate, status, ring, alerts, dryRun, account, setup }: NavbarProps) {
  const pill = (target: Page, strip: boolean) => {
    const on = page === target;
    const meta = PAGE_META[target];
    return (
      <a
        key={target}
        href={`#/${target}`}
        className={`navlink press ${on ? 'is-on' : ''}`}
        aria-current={on ? 'page' : undefined}
        onClick={linkClick(onNavigate, target)}
      >
        {on ? <motion.span className="navlink__pill" layoutId={strip ? 'navstrip-pill' : 'navlink-pill'} transition={SPRING} aria-hidden="true" /> : null}
        <span className="navlink__label">{meta.title}</span>
        {strip && target === 'setup' && setup && !setup.done ? <ProgressDot value={setup.progress} size={14} /> : null}
      </a>
    );
  };
  return (
    <header className="navbar">
      <div className="navbar__row">
        <Wordmark onNavigate={onNavigate} />
        <nav className="navlinks" aria-label="Main">
          {MAIN_PAGES.map((p) => pill(p, false))}
        </nav>
        <div className="navbar__right">
          {status}
          {ring ? <span className="navbar__ring">{ring}</span> : null}
          {alerts}
          {dryRun ? <span className="navbar__dry">{dryRun}</span> : null}
          {account ? <span className="navbar__acct">{account}</span> : null}
        </div>
      </div>
      <nav className="navstrip" aria-label="Pages">
        {[...MAIN_PAGES, ...YOU_PAGES].map((p) => pill(p, true))}
      </nav>
    </header>
  );
}

/** "More" in the phone's tab bar: the pages that do not fit, and the account. */
export function MoreMenu({ page, onNavigate, email, setup, children }: {
  page: Page;
  onNavigate: (page: Page) => void;
  email: string;
  setup?: { done: boolean; progress: number };
  /** Extra controls at the top of the menu, such as the dry run switch. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pages: Page[] = ['letters', ...YOU_PAGES];
  const here = pages.includes(page);
  useDismiss(box, open, () => setOpen(false));
  return (
    <div className="more" ref={box}>
      <button type="button" className={`tab press ${here ? 'is-on' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {here ? <motion.span className="tab__pill" layoutId="tab-pill" transition={SPRING} aria-hidden="true" /> : null}
        <span className="tab__icon" aria-hidden="true">
          <IconChevronDown size={18} className={open ? 'is-flipped' : ''} />
        </span>
        <span className="tab__label">More</span>
        {setup && !setup.done ? <span className="tab__dot" aria-hidden="true" /> : null}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div className="menu more__menu" role="menu" aria-label="More pages" variants={menuVariants} initial="hidden" animate="shown" exit="gone">
            {children ? <div className="more__extra">{children}</div> : null}
            {pages.map((target) => {
              const meta = PAGE_META[target];
              return (
                <a
                  key={target}
                  role="menuitem"
                  href={`#/${target}`}
                  className={`menuitem ${page === target ? 'is-on' : ''}`}
                  aria-current={page === target ? 'page' : undefined}
                  onClick={(event) => {
                    setOpen(false);
                    linkClick(onNavigate, target)(event);
                  }}
                >
                  <meta.Icon size={17} />
                  <span>{meta.title}</span>
                  {target === 'setup' && setup && !setup.done ? <ProgressDot value={setup.progress} size={14} /> : null}
                </a>
              );
            })}
            <div className="more__acct">
              <span className="acct__email">{email}</span>
              <SignOutButton email={email} className="signout more__signout" />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
