import type { ComponentType, MouseEvent, ReactNode, SVGProps } from 'react';
import { motion } from 'motion/react';
import type { Page } from '../../hooks/useRoute';
import { SPRING } from '../../lib/motion';
import { IconBot, IconBriefcase, IconLetter, IconMemory, IconSend, IconSliders, IconUser, Logo } from '../Icons';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** Page names and icons. `short` is for the phone tab bar, where seven labels must fit. */
export const NAV: { page: Page; label: string; short: string; Icon: Icon }[] = [
  { page: 'jobs', label: 'Jobs', short: 'Jobs', Icon: IconBriefcase },
  { page: 'applications', label: 'Applications', short: 'Applied', Icon: IconSend },
  { page: 'agent', label: 'Agent', short: 'Agent', Icon: IconBot },
  { page: 'profile', label: 'Profile', short: 'Profile', Icon: IconUser },
  { page: 'preferences', label: 'Preferences', short: 'Prefs', Icon: IconSliders },
  { page: 'memory', label: 'Memory', short: 'Memory', Icon: IconMemory },
  { page: 'letters', label: 'Cover letters', short: 'Letters', Icon: IconLetter },
];

export const PAGE_ICON = Object.fromEntries(NAV.map((n) => [n.page, n.Icon])) as Record<Page, Icon>;
export const PAGE_TITLE = Object.fromEntries(NAV.map((n) => [n.page, n.label])) as Record<Page, string>;

interface SidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  /** Small live markers per page (a count, a dot) plus words for screen readers. */
  marks: Partial<Record<Page, { node: ReactNode; label: string }>>;
  /** The Alerts row and its menu. */
  alerts?: ReactNode;
  /** The agent's status line, at the bottom. */
  status?: ReactNode;
}

/** A Notion-style sidebar on desktop; on phones the same links become a bottom tab bar. */
export function Sidebar({ page, onNavigate, marks, alerts, status }: SidebarProps) {
  const go = (target: Page) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(target);
  };

  return (
    <nav className="sidebar" aria-label="Main">
      <a className="sidebar__head" href="#/jobs" onClick={go('jobs')}>
        <Logo size={22} />
        <span className="sidebar__name">Agent Automation</span>
      </a>
      <ul className="sidebar__nav">
        {NAV.map(({ page: target, label, short, Icon }) => {
          const mark = marks[target];
          return (
            <li key={target}>
              <a
                href={`#/${target}`}
                className={`navitem ${page === target ? 'is-active' : ''}`}
                aria-current={page === target ? 'page' : undefined}
                aria-label={mark ? `${label}, ${mark.label}` : label}
                onClick={go(target)}
              >
                {page === target ? <motion.span className="navitem__pill" layoutId="nav-active" transition={SPRING} aria-hidden="true" /> : null}
                <span className="navitem__icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className="navitem__label navitem__label--long" aria-hidden="true">
                  {label}
                </span>
                <span className="navitem__label navitem__label--short" aria-hidden="true">
                  {short}
                </span>
                {mark ? (
                  <span className="navitem__mark" aria-hidden="true">
                    {mark.node}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
      {alerts ? <div className="sidebar__alerts">{alerts}</div> : null}
      {status ? <div className="sidebar__status">{status}</div> : null}
    </nav>
  );
}
