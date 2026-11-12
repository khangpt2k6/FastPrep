import type { ComponentType, MouseEvent, ReactNode, SVGProps } from 'react';
import type { Page } from '../../hooks/useRoute';
import { IconBot, IconBriefcase, IconLetter, IconLogout, IconMemory, IconSend, IconSliders, IconUser, Logo } from '../Icons';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

export const NAV: { page: Page; label: string; short: string; Icon: Icon }[] = [
  { page: 'jobs', label: 'Jobs', short: 'Jobs', Icon: IconBriefcase },
  { page: 'applications', label: 'Applications', short: 'Applied', Icon: IconSend },
  { page: 'agent', label: 'Agent', short: 'Agent', Icon: IconBot },
  { page: 'profile', label: 'Profile', short: 'Profile', Icon: IconUser },
  { page: 'preferences', label: 'Preferences', short: 'Prefs', Icon: IconSliders },
  { page: 'memory', label: 'Memory', short: 'Memory', Icon: IconMemory },
  { page: 'letters', label: 'Cover letters', short: 'Letters', Icon: IconLetter },
];

interface SidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  /** Small live markers per page (a count, a dot) plus words for screen readers. */
  marks: Partial<Record<Page, { node: ReactNode; label: string }>>;
  email: string;
  onSignOut: () => void;
  notify: ReactNode;
}

/** A left icon rail on desktop; the same links become a bottom tab bar on phones. */
export function Sidebar({ page, onNavigate, marks, email, onSignOut, notify }: SidebarProps) {
  const go = (target: Page) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(target);
  };

  return (
    <nav className="sidebar" aria-label="Main">
      <a className="sidebar__logo" href="#/jobs" onClick={go('jobs')} aria-label="Agent Automation home">
        <Logo size={38} />
      </a>
      <ul className="sidebar__nav">
        {NAV.map(({ page: target, label, short, Icon }) => (
          <li key={target}>
            <a
              href={`#/${target}`}
              className={`navitem ${page === target ? 'is-active' : ''}`}
              aria-current={page === target ? 'page' : undefined}
              aria-label={marks[target] ? `${label}, ${marks[target]?.label}` : label}
              onClick={go(target)}
            >
              <span className="navitem__icon" aria-hidden="true">
                <Icon size={21} />
                {marks[target]?.node ?? null}
              </span>
              <span className="navitem__label navitem__label--long">{label}</span>
              <span className="navitem__label navitem__label--short">{short}</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="sidebar__foot">
        {notify}
        <button type="button" className="navitem" onClick={onSignOut} title={`Signed in as ${email}`}>
          <span className="navitem__icon">
            <IconLogout size={20} />
          </span>
          <span className="navitem__label">Sign out</span>
        </button>
      </div>
    </nav>
  );
}
