// Dev-only preview at #/__preview: the real pages with mock data, plus buttons that fake live events.
// App.tsx only loads this behind import.meta.env.DEV, so it never ships in a production build.
import { useEffect, useMemo, useState } from 'react';
import type { AgentRow, CommandRow, JobRow, MemoryRow } from '../../lib/types';
import type { NotifyPrefs } from '../../hooks/useNotifyPrefs';
import type { LiveTable } from '../../hooks/useLiveTable';
import type { Page } from '../../hooks/useRoute';
import { AgentPage } from '../agent/AgentPage';
import { useLogTail } from '../agent/live';
import { ApplicationsPage } from '../applications/ApplicationsPage';
import { Callout } from '../common';
import { ConfirmSubmit } from '../ConfirmSubmit';
import { IconRadar, IconUser } from '../Icons';
import { ActionBar } from '../jobs/ActionBar';
import { JobsPage, type MinScore } from '../jobs/JobsPage';
import { Lightbox } from '../Lightbox';
import { MemoryPage } from '../memory/MemoryPage';
import { LiveCallout, OfflineCallout } from '../shell/Notices';
import { NotifyMenu } from '../shell/NotifyMenu';
import { MobileBar, PageHeader } from '../shell/PageHeader';
import { PAGE_ICON, PAGE_TITLE, Sidebar } from '../shell/Sidebar';
import { AgentStatus, DryRunSwitch } from '../shell/StatusControls';
import { BootError, BootSplash } from '../Splash';
import { Toasts, useToasts } from '../Toasts';
import { PageTransition } from './PageTransition';

const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();

/** A stand-in screenshot: a plain form page drawn as an SVG. */
const SHOT = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='1000' viewBox='0 0 800 1000'><rect width='800' height='1000' fill='#ffffff'/><rect x='60' y='60' width='300' height='28' rx='4' fill='#37352f'/>${[160, 250, 340, 430, 520]
    .map((y) => `<rect x='60' y='${y}' width='180' height='14' rx='3' fill='#c9c8c4'/><rect x='60' y='${y + 24}' width='680' height='40' rx='4' fill='none' stroke='#d7d6d2' stroke-width='2'/>`)
    .join('')}<rect x='60' y='640' width='200' height='48' rx='6' fill='#2383e2'/></svg>`,
)}`;

/** Real domains, so logo sizes can be checked: cisco.com and boeing.com serve only 16px icons. */
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
    job('a2', 'Snap Inc.', 'Snap', 'snap.com', 'Software Engineer, Infrastructure', 'Seattle, WA', 4.4, { status: 'submitted', note: 'Confirmation page reached.', screenshot_path: SHOT, updated_at: iso(30) }),
    job('a3', 'elevenlabs', 'ElevenLabs', 'elevenlabs.io', 'Software Engineer, Full Stack', 'Remote', 4.6, {
      status: 'blocked',
      reason: 'dry_run',
      dry_run: true,
      screenshot_path: SHOT,
      note: "Dry run (AGENT_DRY_RUN is set): filled, send control button[type='submit'] found, nothing sent.\nFilled required fields with the profile name, email and phone. Uploaded resume.pdf. Answered 3 open questions from Memory.",
      updated_at: iso(80),
    }),
    job('a4', 'verkada', 'Verkada', 'verkada.com', 'Software Engineer, Backend', 'San Mateo, CA', 4.0, {
      status: 'blocked',
      reason: 'closed',
      dry_run: true,
      note: "The posting redirects to the employer's job board error page.",
      updated_at: iso(140),
    }),
    job('a5', 'g2i', 'G2i', 'g2i.co', 'Senior Frontend Engineer', 'Remote', 3.8, { status: 'unconfirmed', note: 'Pressed submit; no confirmation page appeared.', updated_at: iso(220) }),
    job('a6', 'scopely', 'Scopely', 'scopely.com', 'Data Engineer', 'Culver City, CA', 3.5, { status: 'failed', reason: 'form_not_loaded', note: 'The form timed out on page 3.', updated_at: iso(400) }),
    job('a7', 'Northwind Labs', '', '', 'QA Engineer', 'Remote', 3.1, { status: 'blocked', reason: 'missing_info', note: 'The form asks for a security clearance level.', updated_at: iso(900) }),
    job('a8', 'jobgether', 'Jobgether', 'jobgether.com', 'Platform Engineer', 'Remote', 3.4, { status: 'refused', note: 'The form rejected the phone number format.', updated_at: iso(1300) }),
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
  { id: 3, question: 'Describe a project you are proud of.', answer: 'An agent that scores job postings against my resume and fills the applications in a real browser. It runs on my laptop, reports to a dashboard, and never sends anything in dry run.', source: 'learned', pinned: false, company: 'cisco/wd5/cisco_careers', job_title: 'Software Engineer Intern', job_id: 'j0', created_at: iso(200), updated_at: iso(200) },
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
const PAGES: Page[] = ['jobs', 'applications', 'agent', 'memory'];

export default function Preview() {
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
  const [shot, setShot] = useState<{ job: JobRow; url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { toasts, push, dismiss } = useToasts();
  const online = tone !== 'off';
  const shownAgent = useMemo<AgentRow>(() => ({ ...agent, state: TONE_STATE[tone], last_seen: online ? agent.last_seen : iso(180) }), [agent, tone, online]);
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
    { id: 0, kind: 'apply', job_ids: ['a6'], dry_run: false, status: 'failed', error: 'The browser closed before the form loaded.', created_at: iso(400) },
  ];
  const memory: LiveTable<MemoryRow> = { rows: MEMORY, loading, error: null, live: 'live', reload: () => undefined };

  const finish = () => {
    setJobs((list) => list.map((j) => (j.status === 'applying' ? { ...j, status: 'submitted', note: 'Confirmation page reached.', screenshot_path: SHOT, updated_at: iso(0) } : j)));
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

  const dryRunSwitch = <DryRunSwitch dryRun={dryRun} onChange={setDryRun} />;
  const status = (compact: boolean) => (
    <AgentStatus agent={shownAgent} online={online} loading={false} now={now} live="live" onOpen={() => setPage('agent')} compact={compact} />
  );
  const alerts = (variant: 'sidebar' | 'bar') => (
    <NotifyMenu prefs={PREFS} recent={applications.slice(0, 5)} now={now} onOpenRecent={() => setPage('applications')} variant={variant} />
  );

  let actions = null;
  let content;
  if (page === 'jobs') {
    actions = (
      <>
        <button type="button" className="btn btn--secondary btn--sm" onClick={newJob}>
          <IconRadar size={14} />
          Find jobs
        </button>
        {dryRunSwitch}
      </>
    );
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
        notices={
          <>
            {!dryRun ? <LiveCallout /> : null}
            {!online ? <OfflineCallout /> : null}
            <Callout
              tone="yellow"
              icon={<IconUser size={16} />}
              action={
                <button type="button" className="btn btn--primary btn--sm">
                  Finish
                </button>
              }
            >
              <strong>Profile incomplete.</strong> Needed before applying.
            </Callout>
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
                push({ tone: 'ok', title: `${chosen.length} jobs queued for dry run` });
                setSelected(new Set());
              } else setConfirm(chosen);
            }}
            onLetters={() => push({ tone: 'ok', title: `Writing ${selected.size} letters` })}
            writing={false}
            onClear={() => setSelected(new Set())}
          />
        }
      />
    );
  } else if (page === 'applications') {
    actions = dryRunSwitch;
    content = (
      <ApplicationsPage
        items={applications}
        loading={loading}
        error={null}
        onRetry={() => undefined}
        now={now}
        onOpenShot={(j, url) => setShot({ job: j, url })}
        onOpenAnswers={() => setPage('memory')}
        answerCounts={new Map([['a3', 3], ['a2', 4]])}
        dryRun={dryRun}
        online={online}
        queued={new Set(['a8'])}
        notices={!dryRun ? <LiveCallout /> : null}
        onApplyAgain={(j) => (dryRun ? push({ tone: 'ok', title: '1 job queued for dry run' }) : setConfirm([j]))}
      />
    );
  } else if (page === 'memory') {
    content = <MemoryPage memory={memory} now={now} job={null} onClearJob={() => undefined} toast={push} />;
  } else {
    content = (
      <AgentPage
        agent={shownAgent}
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

  return (
    <div className={`shell ${dryRun ? '' : 'is-live'}`}>
      <Sidebar
        page={page}
        onNavigate={(target) => setPage(PAGES.includes(target) ? target : 'jobs')}
        marks={{
          applications: { node: <span className="navcount num">1</span>, label: '1 in progress' },
          profile: { node: <span className="navdot navdot--orange" />, label: 'incomplete' },
        }}
        alerts={alerts('sidebar')}
        status={status(false)}
      />
      <div className="shell__main">
        <MobileBar status={status(true)} alerts={alerts('bar')} />
        <main className="shell__content">
          <div className="devbar" aria-label="Preview controls">
            <span className="devbar__label">Preview</span>
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
              Agent: {TONE_STATE[tone]}
            </button>
            <button type="button" className="btn btn--sm btn--secondary" onClick={() => setLoading((v) => !v)}>
              {loading ? 'Loaded' : 'Loading'}
            </button>
            <button type="button" className="btn btn--sm btn--secondary" onClick={() => push({ tone: 'info', title: 'New answer learned', detail: 'Why do you want to work here?' })}>
              Toast
            </button>
            <button type="button" className="btn btn--sm btn--secondary" onClick={() => push({ tone: 'error', title: 'Could not queue jobs', detail: 'JWT expired' })}>
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
          <PageTransition pageKey={page}>
            <PageHeader icon={PAGE_ICON[page]} title={PAGE_TITLE[page]} actions={actions} />
            {content}
          </PageTransition>
        </main>
      </div>
      <ConfirmSubmit jobs={confirm} onCancel={() => setConfirm(null)} onConfirm={() => setConfirm(null)} />
      <Lightbox shot={shot} onClose={() => setShot(null)} />
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
