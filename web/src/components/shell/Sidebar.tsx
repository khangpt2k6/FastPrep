import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Page } from '../../hooks/useRoute';
import { SPRING } from '../../lib/motion';
import { CompanyLogo } from '../CompanyLogo';
import { linkClick, MoreMenu } from './Navbar';
import { MAIN_PAGES, PAGE_META, YOU_PAGES } from './pages';
import { ProgressDot } from './ProgressDot';

export { ProgressDot };

/** Setup progress for the nav: how far along, and whether it is done. */
export interface SetupMark {
  done: boolean;
  /** 0 to 1. */
  progress: number;
  label: string;
}

/** A company in the sidebar's list, with how many jobs the agent has from it. */
export interface SideCompany {
  key: string;
  name: string;
  domain?: string;
  count: number;
}

type Marks = Partial<Record<Page, { node: ReactNode; label: string }>>;

interface DashSidebarProps {
  page: Page;
  onNavigate: (page: Page) => void;
  /** Small live markers per page (a count, a dot) plus words for screen readers. */
  marks: Marks;
  setup?: SetupMark;
  /** The companies with the most jobs, for a quick filter of the Jobs page. */
  companies?: SideCompany[];
  activeCompany?: string | null;
  onCompany?: (key: string | null) => void;
}

/**
 * The left column, after Arena's DashSidebar: the pages with a white raised card under the current one (its icon
 * turns violet), the person's own pages, then the companies the agent found the most jobs at.
 */
export function DashSidebar({ page, onNavigate, marks, setup, companies = [], activeCompany = null, onCompany }: DashSidebarProps) {
  const item = (target: Page) => {
    const meta = PAGE_META[target];
    const on = page === target;
    const mark =
      target === 'setup' && setup && !setup.done
        ? {
            node: (
              <span className="setupmark num">
                <ProgressDot value={setup.progress} />
                {Math.round(setup.progress * 2)}/2
              </span>
            ),
            label: setup.label,
          }
        : marks[target];
    return (
      <li key={target}>
        <a
          href={`#/${target}`}
          className={`sideitem press ${on ? 'is-on' : ''} ${target === 'setup' && setup && !setup.done ? 'is-todo' : ''}`}
          aria-current={on ? 'page' : undefined}
          aria-label={mark ? `${meta.title}, ${mark.label}` : meta.title}
          onClick={linkClick(onNavigate, target)}
        >
          {on ? <motion.span className="sideitem__card" layoutId="side-card" transition={SPRING} aria-hidden="true" /> : null}
          <span className="sideitem__icon" aria-hidden="true">
            <meta.Icon size={18} />
          </span>
          <span className="sideitem__label" aria-hidden="true">
            {meta.title}
          </span>
          {mark ? (
            <span className="sideitem__mark" aria-hidden="true">
              {mark.node}
            </span>
          ) : null}
        </a>
      </li>
    );
  };

  return (
    <nav className="dashside" aria-label="Sections">
      <ul className="dashside__list">{MAIN_PAGES.map(item)}</ul>
      <hr className="dashside__rule" />
      <p className="dashside__label">You</p>
      <ul className="dashside__list">{YOU_PAGES.map(item)}</ul>
      {companies.length > 0 && onCompany ? (
        <>
          <hr className="dashside__rule" />
          <p className="dashside__label">Top companies</p>
          <ul className="dashside__list">
            {companies.map((c) => {
              const on = activeCompany === c.key && page === 'jobs';
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    className={`sideitem sideitem--company press ${on ? 'is-picked' : ''}`}
                    aria-pressed={on}
                    onClick={() => onCompany(on ? null : c.key)}
                    title={on ? 'Show every company' : `Jobs at ${c.name}`}
                  >
                    <CompanyLogo name={c.name} domain={c.domain} size={24} />
                    <span className="sideitem__label">{c.name}</span>
                    <span className="sideitem__count num">{c.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </nav>
  );
}

/** The phone's bottom bar: five pages and More. */
export function TabBar({ page, onNavigate, marks, setup, email, more }: {
  page: Page;
  onNavigate: (page: Page) => void;
  marks: Marks;
  setup?: SetupMark;
  email: string;
  /** Controls inside More, such as the dry run switch. */
  more?: ReactNode;
}) {
  const tabs: Page[] = ['jobs', 'applications', 'inbox', 'agent', 'companies'];
  return (
    <nav className="tabbar" aria-label="Pages">
      {tabs.map((target) => {
        const meta = PAGE_META[target];
        const on = page === target;
        const mark = marks[target];
        return (
          <a
            key={target}
            href={`#/${target}`}
            className={`tab press ${on ? 'is-on' : ''}`}
            aria-current={on ? 'page' : undefined}
            aria-label={mark ? `${meta.title}, ${mark.label}` : meta.title}
            onClick={linkClick(onNavigate, target)}
          >
            {on ? <motion.span className="tab__pill" layoutId="tab-pill" transition={SPRING} aria-hidden="true" /> : null}
            <span className="tab__icon" aria-hidden="true">
              <meta.Icon size={19} />
            </span>
            <span className="tab__label" aria-hidden="true">
              {meta.short}
            </span>
            {mark ? (
              <span className="tab__mark" aria-hidden="true">
                {mark.node}
              </span>
            ) : null}
          </a>
        );
      })}
      <MoreMenu page={page} onNavigate={onNavigate} email={email} setup={setup}>
        {more}
      </MoreMenu>
    </nav>
  );
}
