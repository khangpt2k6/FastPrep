// Dev-only motion preview at #/__preview: the real pages with mock data, plus buttons that fake live events.
// App.tsx only loads this behind import.meta.env.DEV, so it never ships in a production build.
import { useEffect, useMemo, useState } from 'react';
import type { AgentRow, CommandRow, JobRow } from '../../lib/types';
import { AgentCard, LiveStrip } from '../agent/AgentCard';
import { AgentPage } from '../agent/AgentPage';
import { useLogTail } from '../agent/live';
import { ApplicationsPage } from '../applications/ApplicationsPage';
import { ConfirmSubmit } from '../ConfirmSubmit';
import { ActionBar } from '../jobs/ActionBar';
import { JobsPage, type MinScore } from '../jobs/JobsPage';
import { ApplicationsSummaryCard, ProfileCard } from '../RailCards';
import { PageHeader } from '../shell/PageHeader';
import { Sidebar } from '../shell/Sidebar';
import { AgentPill, DryRunSwitch } from '../shell/StatusControls';
import { Toasts, useToasts } from '../Toasts';
import { PageTransition } from './PageTransition';
import type { Page } from '../../hooks/useRoute';

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();

const COMPANIES = [
  ['Northwind Labs', 'Data Analyst', 'Remote', 4.6],
  ['Fernhill Studio', 'Frontend Engineer Intern', 'Austin, TX', 4.1],
  ['Bluebird Health', 'Software Engineer, New Grad', 'Boston, MA', 3.9],
  ['Copperline', 'Product Analyst', 'Chicago, IL', 3.6],
  ['Marlow & Finch', 'Junior Data Scientist', 'New York, NY', 4.3],
  ['Tidewater Systems', 'Backend Engineer', 'Remote', 3.4],
  ['Quarry AI', 'ML Engineer Intern', 'San Francisco, CA', 4.8],
  ['Oakridge Logistics', 'Operations Analyst', 'Dallas, TX', 3.2],
] as const;

function mockJobs(): JobRow[] {
  const jobs: JobRow[] = COMPANIES.map(([company, title, location, score], i) => ({
    id: `j${i}`,
    title,
    company,
    location,
    url: 'https://example.com',
    score,
    status: 'scored',
    note: '',
    reason: '',
    screenshot_path: '',
    dry_run: false,
    updated_at: iso(i * 7 + 3),
  }));
  jobs.push(
    { ...jobs[0], id: 'a1', company: 'Halcyon Bank', title: 'Analyst Intern', status: 'applying', updated_at: iso(1) },
    { ...jobs[0], id: 'a2', company: 'Pinecrest', title: 'Data Engineer', status: 'submitted', note: 'Confirmation page reached.', updated_at: iso(30) },
    { ...jobs[0], id: 'a3', company: 'Juniper Robotics', title: 'Software Intern', status: 'blocked', reason: 'dry_run', dry_run: true, note: 'Filled every page. Dry run, so not submitted.', updated_at: iso(80) },
    { ...jobs[0], id: 'a4', company: 'Vantage Labs', title: 'QA Engineer', status: 'failed', note: 'The form timed out on page 3.', updated_at: iso(200) },
  );
  return jobs;
}

const AGENT: AgentRow = {
  user_id: 'u',
  state: 'applying',
  message: '1/2 Halcyon Bank: Analyst Intern: filling page 2',
  resume_name: 'resume_2026.pdf',
  model: 'gpt-5-mini',
  jobs_found: 1284,
  jobs_scored: 312,
  last_seen: iso(0),
};

const LINES = [
  'reading the form on page 3',
  'answering: Why do you want to work here?',
  'uploading resume_2026.pdf',
  'checking required fields',
  'pressing submit',
];

export default function Preview() {
  const [page, setPage] = useState<Page>('applications');
  const [jobs, setJobs] = useState<JobRow[]>(mockJobs);
  const [agent, setAgent] = useState<AgentRow>(AGENT);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [minScore, setMinScore] = useState<MinScore>(0);
  const [query, setQuery] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [confirm, setConfirm] = useState<JobRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const { toasts, push, dismiss } = useToasts();
  const tail = useLogTail(agent);
  const now = Date.now();

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 900);
    return () => window.clearTimeout(t);
  }, []);

  const candidates = useMemo(() => jobs.filter((j) => j.status === 'scored').sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [jobs]);
  const visible = candidates.filter((j) => (j.score ?? 0) >= minScore && j.title.toLowerCase().includes(query.toLowerCase()));
  const applications = jobs.filter((j) => j.status !== 'scored');
  const commands: CommandRow[] = [
    { id: 2, kind: 'apply', job_ids: ['a1', 'a2'], dry_run: true, status: 'running', error: '', created_at: iso(2) },
    { id: 1, kind: 'search', job_ids: [], dry_run: false, status: 'done', error: '', created_at: iso(40) },
  ];

  const finish = () => {
    setJobs((list) => list.map((j) => (j.status === 'applying' ? { ...j, status: 'submitted', note: 'Confirmation page reached.', updated_at: iso(0) } : j)));
    push({ tone: 'ok', title: 'Sent to Halcyon Bank', detail: 'Analyst Intern' });
  };
  const newJob = () => {
    const n = jobs.length;
    setJobs((list) => [{ ...list[0], id: `n${n}`, company: `Lumen ${n}`, title: 'Data Analyst II', score: 4.9, status: 'scored', updated_at: iso(0) }, ...list]);
  };
  const reset = () => setJobs(mockJobs());
  const logLine = () => setAgent((a) => ({ ...a, message: LINES[Math.floor(Math.random() * LINES.length)] + ` (${new Date().toLocaleTimeString()})`, jobs_scored: a.jobs_scored + 7 }));

  const strip = <LiveStrip agent={agent} online onOpen={() => setPage('agent')} />;
  const agentCard = <AgentCard agent={agent} online loading={false} now={now} tail={tail} onOpen={() => setPage('agent')} />;

  let content;
  if (page === 'jobs') {
    content = (
      <JobsPage
        candidates={candidates}
        visible={visible}
        loading={loading}
        error={null}
        onRetry={() => undefined}
        now={now}
        selected={selected}
        queued={new Set()}
        onToggle={(id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
        onToggleAll={(ids, on) => setSelected(on ? new Set(ids) : new Set())}
        minScore={minScore}
        onMinScore={setMinScore}
        query={query}
        onQuery={setQuery}
        onClearFilters={() => { setMinScore(0); setQuery(''); }}
        searching={false}
        onSearch={newJob}
        strip={strip}
        rail={
          <>
            {agentCard}
            <ProfileCard complete={false} sections={[{ title: 'Personal', done: true, step: 0 }, { title: 'Education', done: true, step: 1 }, { title: 'Experience', done: false, step: 2 }]} onOpen={() => undefined} onContinue={() => undefined} />
          </>
        }
        actionBar={
          <ActionBar
            count={selected.size}
            dryRun={dryRun}
            online
            applying={false}
            searching={false}
            onApply={() => setConfirm(candidates.filter((j) => selected.has(j.id)))}
            onSearch={newJob}
            onLetters={() => undefined}
            writing={false}
            onClear={() => setSelected(new Set())}
          />
        }
      />
    );
  } else if (page === 'applications') {
    content = (
      <ApplicationsPage
        items={applications}
        loading={loading}
        error={null}
        onRetry={() => undefined}
        now={now}
        onOpenShot={() => undefined}
        onOpenAnswers={() => undefined}
        answerCounts={new Map([['a2', 4]])}
        strip={strip}
        rail={
          <>
            {agentCard}
            <ApplicationsSummaryCard items={applications} onOpen={() => undefined} />
          </>
        }
        dryRun={dryRun}
        online
        queued={new Set()}
        onApplyAgain={() => undefined}
      />
    );
  } else {
    content = (
      <AgentPage agent={agent} online loading={false} error={null} onRetry={() => undefined} now={now} tail={tail} commands={commands} live="live" sent={applications.filter((j) => j.status === 'submitted').length} />
    );
  }

  return (
    <div className="shell">
      <Sidebar page={page} onNavigate={setPage} marks={{ agent: { node: <span className="navitem__live" />, label: 'online' } }} email="demo@example.com" onSignOut={() => undefined} notify={null} />
      <div className="shell__main">
        <PageHeader
          title={page[0].toUpperCase() + page.slice(1)}
          subtitle="Motion preview with mock data."
          notify={null}
          onSignOut={() => undefined}
          right={
            <>
              <AgentPill online state={agent.state} live="live" onClick={() => setPage('agent')} />
              <DryRunSwitch dryRun={dryRun} onChange={setDryRun} />
            </>
          }
        />
        <div className="toolbar" style={{ padding: '0 32px 12px' }}>
          <button type="button" className="btn btn--sm btn--primary" onClick={finish}>Finish application</button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={newJob}>New job arrives</button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={logLine}>Agent log line</button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => push({ tone: 'info', title: 'New answer learned', detail: 'While applying to Pinecrest' })}>Toast</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={reset}>Reset</button>
        </div>
        <main className="shell__content">
          <PageTransition pageKey={page}>{content}</PageTransition>
        </main>
      </div>
      <ConfirmSubmit jobs={confirm} onCancel={() => setConfirm(null)} onConfirm={() => setConfirm(null)} />
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
