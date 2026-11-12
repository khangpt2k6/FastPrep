import type { ComponentType, MouseEvent, ReactNode, SVGProps } from 'react';
import { motion } from 'motion/react';
import type { Page } from '../../hooks/useRoute';
import { SPRING } from '../../lib/motion';
import { IconBot, IconBriefcase, IconLetter, IconMemory, IconSend, IconSliders, IconUser, Logo } from '../Icons';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

/** Tiny labels under the icons; the full page names are in FULL. */
export const NAV: { page: Page; label: string; Icon: Icon }[] = [
  { page: 'jobs', label: 'Jobs', Icon: IconBriefcase },
  { page: 'applications', label: 'Applied', Icon: IconSend },
  { page: 'agent', label: 'Agent', Icon: IconBot },
  { page: 'profile', label: 'Profile', Icon: IconUser },
  { page: 'preferences', label: 'Prefs', Icon: IconSliders },
  { page: 'memory', label: 'Memory', Icon: IconMemory },
  { page: 'letters', label: 'Letters', Icon: IconLetter },
];

/** Full names for screen readers and tooltips, where the tiny labels are abbreviated. */
const FULL: Record<Page, string> = {
  jobs: 'Jobs',
  applications: 'Applications',
  agent: 'Agent',
  profile: 'Profile',
  preferences: 'Preferences',
  memory: 'Memory',
  letters: 'Cover letters',
};

interface SidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  /** Small live markers per page (a count, a dot) plus words for screen readers. */
  marks: Partial<Record<Page, { node: ReactNode; label: string }>>;
}

/** A dark glass icon rail on desktop; the same links become a bottom tab bar on phones. */
export function Sidebar({ page, onNavigate, marks }: SidebarProps) {
  const go = (target: Page) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(target);
  };

  return (
    <nav className="sidebar" aria-label="Main">
      <a className="sidebar__logo" href="#/jobs" onClick={go('jobs')} aria-label="Agent Automation home" title="Agent Automation">
        <Logo size={38} />
      </a>
      <ul className="sidebar__nav">
        {NAV.map(({ page: target, label, Icon }) => {
          const name = FULL[target];
          const mark = marks[target];
          return (
            <li key={target}>
              <a
                href={`#/${target}`}
                className={`navitem ${page === target ? 'is-active' : ''}`}
                aria-current={page === target ? 'page' : undefined}
                aria-label={mark ? `${name}, ${mark.label}` : name}
                title={name}
                onClick={go(target)}
              >
                {page === target ? <motion.span className="navitem__pill" layoutId="nav-active" transition={SPRING} aria-hidden="true" /> : null}
                <span className="navitem__icon" aria-hidden="true">
                  <Icon size={20} />
                  {mark?.node ?? null}
                </span>
                <span className="navitem__label" aria-hidden="true">
                  {label}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
