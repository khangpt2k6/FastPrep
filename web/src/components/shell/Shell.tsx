import type { ReactNode } from 'react';
import type { NotifyPrefs } from '../../hooks/useNotifyPrefs';
import type { Page } from '../../hooks/useRoute';
import type { JobRow } from '../../lib/types';
import { TopProgress } from '../motion';
import { NotifyMenu } from './NotifyMenu';
import { Sidebar, TabBar, type AgentCardProps, type Marks, type SetupMark } from './Sidebar';
import { TopBar } from './TopBar';
import { DryRunSwitch } from './StatusControls';

interface ShellProps {
  page: Page;
  onNavigate: (page: Page) => void;
  marks: Marks;
  setup: SetupMark;
  agent: AgentCardProps;
  /** The agent works through a queue: the ember bar runs along the top. */
  working: boolean;
  dryRun: boolean;
  onDryRun: (value: boolean) => void;
  notify: NotifyPrefs;
  /** The latest applications, for the alerts menu. */
  recent: JobRow[];
  onOpenRecent: () => void;
  email: string;
  /** Above the page, inside the column (the preview's controls). */
  top?: ReactNode;
  children: ReactNode;
}

/** The frame of every page: the granite sidebar on a desktop, a top bar and a tab bar on a phone, one page column. */
export function Shell({ page, onNavigate, marks, setup, agent, working, dryRun, onDryRun, notify, recent, onOpenRecent, email, top, children }: ShellProps) {
  const alerts = (variant: 'sidebar' | 'bar') => <NotifyMenu prefs={notify} recent={recent} now={agent.now} onOpenRecent={onOpenRecent} variant={variant} />;
  return (
    <div className={`app ${dryRun ? '' : 'is-live'}`}>
      <TopProgress active={working} />
      {/* The route lives in the hash, so the skip link moves focus itself instead of changing it. */}
      <a
        className="skiplink"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to the page
      </a>
      <aside className="app__side">
        <Sidebar page={page} onNavigate={onNavigate} marks={marks} setup={setup} />
      </aside>
      <div className="app__col">
        <TopBar onNavigate={onNavigate} agent={agent} dryRun={<DryRunSwitch dryRun={dryRun} onChange={onDryRun} compact />} alerts={alerts('bar')} email={email} />
        <main className="app__main" id="main" tabIndex={-1}>
          <div className="column" data-page={page}>
            {top}
            {children}
          </div>
        </main>
      </div>
      <TabBar page={page} onNavigate={onNavigate} marks={marks} setup={setup} email={email} dryRun={<DryRunSwitch dryRun={dryRun} onChange={onDryRun} compact />} />
    </div>
  );
}
