// Dev-only preview at #/__preview: the real pages with mock data, plus buttons that fake live events.
// App.tsx only loads this behind import.meta.env.DEV, so it never ships in a production build.
import { useEffect, useMemo, useState } from 'react';
import type { AgentRow, CommandRow, JobRow, MemoryRow } from '../../lib/types';
import type { NotifyPrefs } from '../../hooks/useNotifyPrefs';
import type { LiveTable } from '../../hooks/useLiveTable';
import { useSpotlight } from '../../hooks/useSpotlight';
import { AgentCard } from '../agent/AgentCard';
import { AgentPage } from '../agent/AgentPage';
import { useLogTail } from '../agent/live';
import { ApplicationsPage } from '../applications/ApplicationsPage';
import { ConfirmSubmit } from '../ConfirmSubmit';
import { ActionBar } from '../jobs/ActionBar';
import { JobsPage, type MinScore } from '../jobs/JobsPage';
import { MemoryPage } from '../memory/MemoryPage';
import { ApplicationsSummaryCard, ProfileCard } from '../RailCards';
import { NotifyMenu } from '../shell/NotifyMenu';
import { PageHeader } from '../shell/PageHeader';
import { Sidebar } from '../shell/Sidebar';
import { AgentTicker, DryRunSwitch } from '../shell/StatusControls';
import { BootError, BootSplash } from '../Splash';
import { Toasts, useToasts } from '../Toasts';
import { PageTransition } from './PageTransition';
import type { Page } from '../../hooks/useRoute';

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();

/** Real domains, so the logo sizes can be checked: cisco.com and boeing.com serve only 16px icons. */
const COMPANIES: [raw: string, name: string, domain: string, title: string, location: string, score: number][] = [
  ['cisco/wd5/cisco_careers', 'Cisco', 'cisco.com', 'Software Engineer Full-Stack / Backend I (Intern), United States', 'San Jose, California, US, United States of America; Austin, Texas, US; RTP, North Carolina, US', 4.9],
  ['elevenlabs', 'ElevenLabs', 'elevenlabs.io', 'Backend Engineer, Voice Platform', 'Remote; London, United Kingdom', 4.7],
  ['scopely', 'Scopely', 'scopely.com', 'Software Engineer, Game Services', 'Culver City, CA', 4.5],
  ['verkada', 'Verkada', 'verkada.com', 'Frontend Engineer, Command Platform', 'San Mateo, CA', 4.3],
  ['Snap Inc.', 'Snap', 'snap.com', 'Software Engineer, Camera Platform', 'Los Angeles, CA; Seattle, WA; New York, NY', 4.1],
  ['g2i', 'G2i', 'g2i.co', 'React Native Engineer', 'Remote', 3.9],
  ['jobgether', 'Jobgether', 'jobgether.com', 'Full Stack Developer', 'Remote; Ireland; Europe; United States; Poland; United Kingdom', 3.6],
  ['DTCC Candidate Experience Site', 'DTCC', 'dtcc.com', 'Software Engineer', 'Tampa, FL, United States', 3.4],
  ['The Cadmus Group, Inc.', 'Cadmus', 'cadmusgroup.com', 'Jr. Full Stack Developer', 'Arlington, VA', 3.2],
  ['Northwind Labs', '', '', 'Data Analyst', 'Chicago, IL', 2.6],
];

function job(id: string, raw: string, name: string, domain: string, title: string, location: string, score: number, rest: Partial<JobRow> = {}): JobRow {
  return {
    id,
    title,
    company: raw,
    company_name: name,
    company_domain: domain,
    location,
    url: 'https://example.com',
    score,
    status: 'scored',
    note: '',
    reason: '',
    screenshot_path: '',
    dry_run: false,
    updated_at: iso(5),
    ...rest,
  };
}

function mockJobs(): JobRow[] {
  const jobs = COMPANIES.map(([raw, name, domain, title, location, score], i) => job(`j${i}`, raw, name, domain, title, location, score));
  jobs.push(
    job('a1', 'Boeing', 'Boeing', 'boeing.com', 'Software Engineer, Associate', 'Seattle, WA', 4.2, { status: 'applying', updated_at: iso(1) }),
    job('a2', 'Snap Inc.', 'Snap', 'snap.com', 'Software Engineer, Infrastructure', 'Seattle, WA', 4.4, { status: 'submitted', note: 'Confirmation page reached.', updated_at: iso(30) }),
    job('a3', 'elevenlabs', 'ElevenLabs', 'elevenlabs.io', 'Software Engineer, Full Stack', 'Remote', 4.6, {
      status: 'blocked',
      reason: 'dry_run',
      dry_run: true,
      note: "Dry run (AGENT_DRY_RUN is set): filled, send control button[type='submit'] found, nothing sent.\nFilled required fields with the profile name, email and phone. Uploaded resume.pdf. Answered 3 open questions from Memory.",
      updated_at: iso(80),
    }),
    job('a4', 'verkada', 'Verkada', 'verkada.com', 'Software Engineer, Backend', 'San Mateo, CA', 4.0, {
      status: 'blocked',
      reason: 'closed',
      dry_run: true,
      note: "The requested Verkada job posting redirects to the employer's Greenhouse board error page saying the job is no longer open.",
      updated_at: iso(140),
    }),
    job('a5', 'g2i', 'G2i', 'g2i.co', 'Senior Frontend Engineer', 'Remote', 3.8, { status: 'unconfirmed', note: 'Pressed submit; no confirmation page appeared.', updated_at: iso(220) }),
    job('a6', 'scopely', 'Scopely', 'scopely.com', 'Data Engineer', 'Culver City, CA', 3.5, { status: 'failed', reason: 'form_not_loaded', note: 'The form timed out on page 3.', updated_at: iso(400) }),
    job('a7', 'Northwind Labs', '', '', 'QA Engineer', 'Remote', 3.1, { status: 'refused', note: 'The form rejected the phone number format.', updated_at: iso(900) }),
  );
  return jobs;
}

const AGENT: AgentRow = {
  user_id: 'u',
  state: 'applying',
  message: '1/2 Boeing: Software Engineer, Associate: filling page 2',
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
  'scoring 24 new postings against the resume',
];

const MEMORY: MemoryRow[] = [
  { id: 1, question: 'Why do you want to work at ElevenLabs?', answer: 'I have been building voice tools on the side for two years, and your API is the one I reach for first. I want to work on the platform that made those projects possible, and help it scale to the next million developers.', source: 'learned', pinned: true, company: 'elevenlabs', job_title: 'Software Engineer, Full Stack', job_id: 'a3', created_at: iso(80), updated_at: iso(80) },
  { id: 2, question: 'Are you legally authorized to work in the United States?', answer: 'Yes.', source: 'user', pinned: true, company: '', job_title: '', job_id: '', created_at: iso(3000), updated_at: iso(3000) },
  { id: 3, question: 'Describe a project you are proud of.', answer: 'An agent that scores job postings against my resume and fills the applications in a real browser. It runs on my laptop, reports live to a dashboard, and never sends anything in dry run.', source: 'learned', pinned: false, company: 'cisco/wd5/cisco_careers', job_title: 'Software Engineer Intern', job_id: 'j0', created_at: iso(200), updated_at: iso(200) },
  { id: 4, question: 'How did you hear about this role?', answer: 'Company website.', source: 'learned', pinned: false, company: 'verkada', job_title: 'Software Engineer, Backend', job_id: 'a4', created_at: iso(140), updated_at: iso(140) },
];

const PREFS: NotifyPrefs = {
  permission: 'default',
  enabled: false,
  muted: false,
  sound: false,
  request: () => undefined,
  setMuted: () => undefined,
  setSound: () => undefined,
};

type Tone = 'calm' | 'busy' | 'off' | 'bad';
const TONE_STATE: Record<Tone, string> = { calm: 'ready', busy: 'applying', off: 'offline', bad: 'error' };
const TONES: Tone[] = ['busy', 'calm', 'off', 'bad'];

const TITLES: Partial<Record<Page, string>> = { jobs: 'Jobs', applications: 'Applications', agent: 'Agent', memory: 'Memory' };

export default function Preview() {
  useSpotlight();
  const [page, setPage] = useState<Page>('jobs');
  const [screen, setScreen] = useState<'app' | 'splash' | 'error'>('app');
  const [jobs, setJobs] = useState<JobRow[]>(mockJobs);
  const [agent, setAgent] = useState<AgentRow>(AGENT);
  const [tone, setTone] = useState<Tone>('busy');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [minScore, setMinScore] = useState<MinScore>(0);
  const [query, setQuery] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [confirm, setConfirm] = useState<JobRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const { toasts, push, dismiss } = useToasts();
  const shownAgent = useMemo<AgentRow>(() => ({ ...agent, state: TONE_STATE[tone] }), [agent, tone]);
  const online = tone !== 'off';
  const tail = useLogTail(shownAgent);
  const now = Date.now();

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 900);
    return () => window.clearTimeout(t);
  }, []);

  const candidates = useMemo(() => jobs.filter((j) => j.status === 'scored').sort((a, b) => (b.score ?? 0) - (a.score ?? 0)), [jobs]);
  const visible = candidates.filter((j) => (j.score ?? 0) >= minScore && `${j.title} ${j.company_name}`.toLowerCase().includes(query.toLowerCase()));
  const applications = jobs.filter((j) => j.status !== 'scored').sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const current = online ? applications.find((j) => j.status === 'applying') ?? null : null;
  const commands: CommandRow[] = [
    { id: 3, kind: 'cover_letter', job_ids: ['j1', 'j2'], dry_run: true, status: 'pending', error: '', created_at: iso(1) },
    { id: 2, kind: 'apply', job_ids: ['a1', 'a2'], dry_run: true, status: 'running', error: '', created_at: iso(2) },
    { id: 1, kind: 'search', job_ids: [], dry_run: false, status: 'done', error: '', created_at: iso(40) },
  ];
  const memory: LiveTable<MemoryRow> = { rows: MEMORY, loading, error: null, live: 'live', reload: () => undefined };

  const finish = () => {
    setJobs((list) => list.map((j) => (j.status === 'applying' ? { ...j, status: 'submitted', note: 'Confirmation page reached.', updated_at: iso(0) } : j)));
    push({ tone: 'ok', title: 'Sent to Boeing' });
  };
  const newJob = () => {
    const n = jobs.length;
    setJobs((list) => [job(`n${n}`, 'jobgether', 'Jobgether', 'jobgether.com', 'Data Analyst II', 'Remote; United States', 4.8, { updated_at: iso(0) }), ...list]);
  };
  const reset = () => {
    setJobs(mockJobs());
    setSelected(new Set());
  };
  const logLine = () =>
    setAgent((a) => ({ ...a, message: `${LINES[Math.floor(Math.random() * LINES.length)]} (${new Date().toLocaleTimeString()})`, jobs_scored: a.jobs_scored + 7 }));
  const nextTone = () => setTone((t) => TONES[(TONES.indexOf(t) + 1) % TONES.length]);

  if (screen !== 'app') {
    return (
      <>
        {screen === 'splash' ? <BootSplash /> : <BootError message="Invalid login credentials" onRetry={() => setScreen('app')} />}
        <div className="devbar devbar--float">
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => setScreen('app')}>
            Back
          </button>
        </div>
      </>
    );
  }

  const agentCard = <AgentCard agent={shownAgent} online={online} loading={false} now={now} current={current} onOpen={() => setPage('agent')} />;

  let content;
  if (page === 'jobs') {
    content = (
      <JobsPage
        candidates={candidates}
        visible={visible}
        loading={loading}
        error={null}
        onRetry={() => undefined}
        selected={selected}
        queued={new Set(['j8'])}
        onToggle={(id) =>
          setSelected((s) => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
          })
        }
        onToggleAll={(ids, on) => setSelected(on ? new Set(ids) : new Set())}
        minScore={minScore}
        onMinScore={setMinScore}
        query={query}
        onQuery={setQuery}
        onClearFilters={() => {
          setMinScore(0);
          setQuery('');
        }}
        searching={false}
        onSearch={newJob}
        rail={
          <>
            {agentCard}
            <ProfileCard
              sections={[
                { title: 'Personal', done: true, step: 0 },
                { title: 'Education', done: true, step: 1 },
                { title: 'Experience', done: true, step: 2 },
                { title: 'Skills', done: false, step: 3 },
              ]}
              onContinue={() => undefined}
            />
          </>
        }
        actionBar={
          <ActionBar
            count={selected.size}
            dryRun={dryRun}
            online={online}
            applying={false}
            onApply={() => {
              const chosen = candidates.filter((j) => selected.has(j.id));
              if (dryRun) {
                push({ tone: 'ok', title: `Dry run queued for ${chosen.length} jobs` });
                setSelected(new Set());
              } else setConfirm(chosen);
            }}
            onLetters={() => push({ tone: 'ok', title: `Writing ${selected.size} cover letters` })}
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
        onOpenAnswers={() => setPage('memory')}
        answerCounts={new Map([['a3', 3], ['a2', 4]])}
        rail={
          <>
            {agentCard}
            <ApplicationsSummaryCard items={applications} />
          </>
        }
        dryRun={dryRun}
        online={online}
        queued={new Set(['a7'])}
        onApplyAgain={(j) => (dryRun ? push({ tone: 'ok', title: 'Dry run queued for 1 job' }) : setConfirm([j]))}
      />
    );
  } else if (page === 'memory') {
    content = <MemoryPage memory={memory} now={now} job={null} onClearJob={() => undefined} toast={push} />;
  } else {
    content = (
      <AgentPage
        agent={online ? shownAgent : { ...shownAgent, last_seen: iso(180) }}
        online={online}
        loading={false}
        error={null}
        onRetry={() => undefined}
        now={now}
        tail={tail}
        commands={commands}
        live="live"
        sent={applications.filter((j) => j.status === 'submitted' || j.status === 'unconfirmed').length}
        current={current}
      />
    );
  }

  const go = (target: Page) => setPage(TITLES[target] ? target : 'jobs');

  return (
    <div className={`shell ${dryRun ? '' : 'is-live'}`}>
      <Sidebar
        page={page}
        onNavigate={go}
        marks={{
          applications: { node: <span className="navitem__badge mono">1</span>, label: '1 in progress' },
          ...(online ? { agent: { node: <span className="navitem__live" />, label: 'online' } } : {}),
          profile: { node: <span className="navitem__dot navitem__dot--warn" />, label: 'needs setup' },
        }}
      />
      <div className="shell__main">
        <PageHeader
          title={TITLES[page] ?? 'Preview'}
          live={!dryRun}
          agent={
            <AgentTicker
              agent={online ? shownAgent : { ...shownAgent, last_seen: iso(180) }}
              online={online}
              loading={false}
              now={now}
              live="live"
              onOpen={() => setPage('agent')}
            />
          }
          mode={<DryRunSwitch dryRun={dryRun} onChange={setDryRun} />}
          alerts={<NotifyMenu prefs={PREFS} recent={applications.slice(0, 5)} now={now} onOpenRecent={() => setPage('applications')} />}
        />
        <div className="devbar" aria-label="Preview controls">
          <span className="devbar__label mono">preview</span>
          <button type="button" className="btn btn--sm btn--primary" onClick={finish}>
            Finish
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={newJob}>
            New job
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={logLine}>
            Log line
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={nextTone}>
            Orb: {tone}
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => setLoading((v) => !v)}>
            {loading ? 'Loaded' : 'Loading'}
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => push({ tone: 'info', title: 'Learned: Why do you want to work here?' })}>
            Toast
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => push({ tone: 'error', title: 'Could not queue the apply', detail: 'JWT expired' })}>
            Error
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => setScreen('splash')}>
            Splash
          </button>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => setScreen('error')}>
            Boot error
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={reset}>
            Reset
          </button>
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
