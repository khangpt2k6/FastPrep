import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { errorText } from '../lib/errors';
import { APPLICATION_STATUSES, isOnline, plural, statusInfo } from '../lib/format';
import { mergeProfile, profileProgress, validatePersonal } from '../lib/profile';
import { playChime, showBrowserNotification } from '../lib/notify';
import type { JobRow, LiveStatus } from '../lib/types';
import { sendApply, sendSearch, useAgent, useCommands, useJobs, useMemory, useProfileRow } from '../hooks/useAutomationData';
import { useFinishedApplications } from '../hooks/useFinishedApplications';
import { useNewMemories } from '../hooks/useNewMemories';
import { useNotifyPrefs } from '../hooks/useNotifyPrefs';
import { useNow } from '../hooks/useNow';
import { sendCoverLetters } from '../hooks/useCoverLetters';
import { CoverLettersPage } from './letters/CoverLettersPage';
import { useRoute, type Page } from '../hooks/useRoute';
import { AgentCard, LiveStrip } from './agent/AgentCard';
import { AgentPage } from './agent/AgentPage';
import { useLogTail } from './agent/live';
import { ApplicationsPage } from './applications/ApplicationsPage';
import { SkeletonCards } from './common';
import { ConfirmSubmit } from './ConfirmSubmit';
import { ErrorBoundary } from './ErrorBoundary';
import { ActionBar } from './jobs/ActionBar';
import { JobsPage, type MinScore } from './jobs/JobsPage';
import { Lightbox } from './Lightbox';
import { MemoryPage } from './memory/MemoryPage';
import { Notice } from './Notice';
import { PreferencesPage } from './PreferencesPage';
import { ProfilePage } from './profile/ProfilePage';
import { ProfileWizard, REVIEW_STEP, type WizardReason } from './profile/ProfileWizard';
import { ApplicationsSummaryCard, ProfileCard } from './RailCards';
import { NotifyMenu } from './shell/NotifyMenu';
import { PageHeader } from './shell/PageHeader';
import { Sidebar } from './shell/Sidebar';
import { AgentPill, DryRunSwitch } from './shell/StatusControls';
import { Toasts, useToasts, type ToastTone } from './Toasts';
import { PageTransition } from './motion';

interface DashboardProps {
  userId: string;
  email: string;
}

const HEADINGS: Record<Page, { title: string; subtitle: string }> = {
  jobs: { title: 'Jobs', subtitle: 'Scored against your resume. Pick a few and let the agent apply.' },
  applications: { title: 'Applications', subtitle: 'Every form the agent worked on, newest first.' },
  agent: { title: 'Agent', subtitle: 'The app on your computer that fills the forms, live.' },
  profile: { title: 'Profile', subtitle: 'What the agent tells employers about you.' },
  preferences: {
    title: 'Preferences',
    subtitle: 'How the agent writes answers to open questions on applications, like “Why do you want to work here?”',
  },
  memory: {
    title: 'Memory',
    subtitle: 'Answers the agent wrote or you taught it. When a form asks the same question, it reuses them. Pinned answers are used word for word.',
  },
  letters: {
    title: 'Cover letters',
    subtitle: 'Pick a template. For each job the agent writes only the highlighted parts, then attaches the letter to the application.',
  },
};

function combineLive(statuses: LiveStatus[]): LiveStatus {
  if (statuses.every((s) => s === 'live')) return 'live';
  if (statuses.some((s) => s === 'down')) return 'down';
  return 'connecting';
}

/** Toast and notification text for a finished application. */
// One command is worked through form by form, a few minutes each: a few dozen is an afternoon.
const MAX_PER_APPLY = 25;

function finishedMessage(job: JobRow): { title: string; detail: string; tone: ToastTone; good: boolean } {
  switch (job.status) {
    case 'submitted':
      return { title: `Sent to ${job.company}`, detail: job.title, tone: 'ok', good: true };
    case 'unconfirmed':
      return { title: `Sent to ${job.company} (not confirmed)`, detail: job.title, tone: 'ok', good: true };
    case 'blocked':
      return job.reason === 'dry_run'
        ? { title: 'Filled, not sent (dry run)', detail: `${job.company}: ${job.title}`, tone: 'ok', good: true }
        : { title: `${statusInfo(job).label} at ${job.company}`, detail: job.title, tone: 'warn', good: false };
    case 'refused':
      return { title: `Refused by form at ${job.company}`, detail: job.title, tone: 'error', good: false };
    default:
      return { title: `Failed at ${job.company}`, detail: job.title, tone: 'error', good: false };
  }
}

export function Dashboard({ userId, email }: DashboardProps) {
  const { page, params, navigate } = useRoute();
  const now = useNow(2000);
  const agentT = useAgent(userId);
  const jobsT = useJobs(userId);
  const commandsT = useCommands(userId);
  const profileT = useProfileRow(userId);
  const memoryT = useMemory(userId);
  const notify = useNotifyPrefs();
  const { toasts, push, dismiss } = useToasts();
  const tail = useLogTail(agentT.agent);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dryRun, setDryRun] = useState(true);
  const [minScore, setMinScore] = useState<MinScore>(3);
  const [query, setQuery] = useState('');
  const [applyBusy, setApplyBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [lettersBusy, setLettersBusy] = useState(false);
  const [confirmJobs, setConfirmJobs] = useState<JobRow[] | null>(null);
  const [shot, setShot] = useState<{ job: JobRow; url: string } | null>(null);
  const [wizard, setWizard] = useState<{ open: boolean; key: number; step: number; reason: WizardReason }>({
    open: false,
    key: 0,
    step: 0,
    reason: 'auto',
  });

  const agent = agentT.agent;
  const online = isOnline(agent?.state, agent?.last_seen, now);
  const profileRow = profileT.row;
  const profileReady = !profileT.loading && !profileT.error;
  const profile = useMemo(() => mergeProfile(profileRow?.data), [profileRow]);
  const sections = useMemo(() => profileProgress(profile), [profile]);
  // Saved as complete and every section filled: a profile saved before a question became required is not complete.
  const profileComplete = profileRow?.completed === true && sections.every((s) => s.done);

  // Jobs that can still be applied to, best first.
  const candidates = useMemo(
    () =>
      jobsT.rows
        .filter((j) => (j.status === 'scored' || j.status === 'new') && j.score !== null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.company.localeCompare(b.company)),
    [jobsT.rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter(
      (j) => (j.score ?? 0) >= minScore && (!q || j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)),
    );
  }, [candidates, minScore, query]);

  const applications = useMemo(
    () =>
      jobsT.rows
        .filter((j) => APPLICATION_STATUSES.includes(j.status))
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
    [jobsT.rows],
  );

  // Jobs already handed to the agent in a command it has not finished.
  const queued = useMemo(() => {
    const ids = new Set<string>();
    for (const c of commandsT.rows) {
      if (c.kind === 'apply' && (c.status === 'pending' || c.status === 'running')) c.job_ids.forEach((id) => ids.add(id));
    }
    return ids;
  }, [commandsT.rows]);

  const chosen = useMemo(() => candidates.filter((j) => selected.has(j.id) && !queued.has(j.id)), [candidates, selected, queued]);

  const answerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of memoryT.rows) if (r.job_id) counts.set(r.job_id, (counts.get(r.job_id) ?? 0) + 1);
    return counts;
  }, [memoryT.rows]);

  // Open the profile wizard once after sign-in when the profile is missing or unfinished.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!profileReady || autoOpened.current) return;
    autoOpened.current = true;
    if (!profileRow || !profileRow.completed) setWizard((w) => ({ open: true, key: w.key + 1, step: 0, reason: 'auto' }));
  }, [profileReady, profileRow]);

  const openWizard = useCallback((step: number, reason: WizardReason = 'manual') => {
    setWizard((w) => ({ open: true, key: w.key + 1, step, reason }));
  }, []);

  const onFinish = useCallback(
    (job: JobRow) => {
      const msg = finishedMessage(job);
      push({ tone: msg.tone, title: msg.title, detail: msg.detail });
      if (notify.enabled) showBrowserNotification(msg.title, msg.detail, `job-${job.id}`);
      if (notify.sound) playChime(msg.good);
    },
    [push, notify.enabled, notify.sound],
  );
  useFinishedApplications(jobsT.rows, !jobsT.loading && !jobsT.error, onFinish);

  useNewMemories(memoryT.rows, !memoryT.loading && !memoryT.error, (fresh) => {
    push({
      tone: 'info',
      title: fresh.length === 1 ? `New answer learned: ${fresh[0].question}` : `${fresh.length} new answers learned`,
      detail: fresh.length === 1 && fresh[0].company ? `While applying to ${fresh[0].company}` : 'Review them in Memory.',
    });
  });

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (select ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  async function apply(jobs: JobRow[]) {
    setConfirmJobs(null);
    setApplyBusy(true);
    try {
      await sendApply(
        jobs.map((j) => j.id),
        dryRun,
      );
      setSelected(new Set());
      push({
        tone: 'ok',
        title: `${plural(jobs.length, 'job')} sent to the agent`,
        detail: dryRun ? 'Dry run: forms get filled, nothing is submitted.' : 'The agent will fill and submit each form.',
      });
      commandsT.reload();
    } catch (error) {
      push({ tone: 'error', title: 'Could not send the apply command', detail: errorText(error) });
    } finally {
      setApplyBusy(false);
    }
  }

  function requestApply() {
    if (chosen.length === 0 || !online) return;
    if (chosen.length > MAX_PER_APPLY) {
      push({ tone: 'warn', title: `Pick at most ${MAX_PER_APPLY} jobs at a time`, detail: `${chosen.length} are selected. Each form takes the agent a few minutes.` });
      return;
    }
    if (!profileComplete) {
      const personalOk = Object.keys(validatePersonal(profile.personal)).length === 0;
      openWizard(personalOk && profileRow ? REVIEW_STEP : 0, 'apply');
      return;
    }
    if (dryRun) void apply(chosen);
    else setConfirmJobs(chosen);
  }

  async function search() {
    setSearchBusy(true);
    try {
      await sendSearch();
      push({
        tone: 'ok',
        title: 'Asked the agent for more jobs',
        detail: online ? 'New scored jobs show up here as they come in.' : 'Queued. The agent picks it up when it starts.',
      });
      commandsT.reload();
    } catch (error) {
      push({ tone: 'error', title: 'Could not send the search command', detail: errorText(error) });
    } finally {
      setSearchBusy(false);
    }
  }

  async function writeLetters() {
    if (chosen.length === 0) return;
    setLettersBusy(true);
    try {
      await sendCoverLetters(chosen.map((j) => j.id));
      push({
        tone: 'ok',
        title: `Writing ${plural(chosen.length, 'cover letter')}`,
        detail: online ? 'Read and edit them on the Cover letters page. Nothing is sent.' : 'Queued. The agent writes them when it starts.',
      });
      commandsT.reload();
      navigate('letters');
    } catch (error) {
      push({ tone: 'error', title: 'Could not ask for cover letters', detail: errorText(error) });
    } finally {
      setLettersBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const coreTables = [agentT, jobsT, commandsT, profileT];
  const live = combineLive(coreTables.map((t) => t.live));
  const heading = HEADINGS[page];

  if (coreTables.some((t) => t.error?.kind === 'missing-table')) {
    return (
      <Notice
        title="Database not set up: run supabase/schema.sql"
        action={
          <>
            <button type="button" className="btn btn--dark" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button type="button" className="btn btn--ghost" onClick={signOut}>
              Sign out
            </button>
          </>
        }
      >
        <p>The tables this page reads are not in your Supabase project yet.</p>
        <ol className="steps-list">
          <li>Open the Supabase dashboard for this project, then the SQL editor.</li>
          <li>
            Paste the contents of <code>supabase/schema.sql</code> and run it.
          </li>
          <li>Come back here and reload.</li>
        </ol>
      </Notice>
    );
  }

  const applyingCount = applications.filter((j) => j.status === 'applying').length;
  const marks: Partial<Record<Page, { node: ReactNode; label: string }>> = {};
  if (applyingCount > 0) marks.applications = { node: <span className="navitem__badge mono">{applyingCount}</span>, label: `${applyingCount} in progress` };
  if (online) marks.agent = { node: <span className="navitem__live" />, label: 'online' };
  if (profileReady && !profileComplete) marks.profile = { node: <span className="navitem__dot navitem__dot--warn" />, label: 'needs setup' };

  const agentCard = (
    <AgentCard agent={agent} online={online} loading={agentT.loading} now={now} tail={tail} onOpen={() => navigate('agent')} />
  );
  const strip = <LiveStrip agent={agent} online={online} onOpen={() => navigate('agent')} />;

  const jobParam = page === 'memory' ? params.get('job') : null;
  const jobFilter = jobParam
    ? {
        id: jobParam,
        company:
          jobsT.rows.find((j) => j.id === jobParam)?.company ||
          memoryT.rows.find((r) => r.job_id === jobParam)?.company ||
          'this job',
      }
    : null;

  let content: ReactNode;
  switch (page) {
    case 'jobs':
      content = (
        <JobsPage
          candidates={candidates}
          visible={visible}
          loading={jobsT.loading}
          error={jobsT.error}
          onRetry={jobsT.reload}
          now={now}
          selected={selected}
          queued={queued}
          onToggle={toggle}
          onToggleAll={toggleAll}
          minScore={minScore}
          onMinScore={setMinScore}
          query={query}
          onQuery={setQuery}
          onClearFilters={() => {
            setMinScore(0);
            setQuery('');
          }}
          searching={searchBusy}
          onSearch={search}
          strip={strip}
          rail={
            <>
              {agentCard}
              <ProfileCard
                complete={profileComplete}
                sections={sections}
                onOpen={() => navigate('profile')}
                onContinue={() => openWizard(0)}
              />
            </>
          }
          actionBar={
            <ActionBar
              count={chosen.length}
              dryRun={dryRun}
              online={online}
              applying={applyBusy}
              searching={searchBusy}
              onApply={requestApply}
              onSearch={search}
              onLetters={writeLetters}
              writing={lettersBusy}
              onClear={() => setSelected(new Set())}
            />
          }
        />
      );
      break;
    case 'applications':
      content = (
        <ApplicationsPage
          items={applications}
          loading={jobsT.loading}
          error={jobsT.error}
          onRetry={jobsT.reload}
          now={now}
          onOpenShot={(job, url) => setShot({ job, url })}
          onOpenAnswers={(job) => navigate('memory', { job: job.id })}
          answerCounts={answerCounts}
          strip={strip}
          rail={
            <>
              {agentCard}
              <ApplicationsSummaryCard items={applications} onOpen={() => navigate('applications')} />
            </>
          }
          dryRun={dryRun}
          online={online}
          queued={queued}
          onApplyAgain={(job) => {
            if (!online) return;
            if (dryRun) void apply([job]);
            else setConfirmJobs([job]);
          }}
        />
      );
      break;
    case 'agent':
      content = (
        <AgentPage
          agent={agent}
          online={online}
          loading={agentT.loading}
          error={agentT.error}
          onRetry={agentT.reload}
          now={now}
          tail={tail}
          commands={commandsT.rows}
          live={live}
          sent={applications.filter((j) => j.status === 'submitted' || j.status === 'unconfirmed').length}
        />
      );
      break;
    case 'profile':
      content = profileT.error ? (
        <p className="card inline-error inline-error--card">{profileT.error.message}</p>
      ) : profileT.loading ? (
        <SkeletonCards count={2} />
      ) : (
        <ProfilePage profile={profile} row={profileRow} email={email} onEdit={(step) => openWizard(step)} />
      );
      break;
    case 'preferences':
      content = (
        <PreferencesPage
          userId={userId}
          onSaved={() => push({ tone: 'ok', title: 'Preferences saved', detail: 'The agent uses them on the next form.' })}
        />
      );
      break;
    case 'memory':
      content = (
        <MemoryPage memory={memoryT} now={now} job={jobFilter} onClearJob={() => navigate('memory')} toast={push} />
      );
      break;
    case 'letters':
      content = <CoverLettersPage userId={userId} jobs={jobsT.rows} online={online} now={now} toast={push} />;
      break;
  }

  return (
    <div className="shell">
      <Sidebar
        page={page}
        onNavigate={(target) => navigate(target)}
        marks={marks}
        email={email}
        onSignOut={signOut}
        notify={<NotifyMenu prefs={notify} variant="sidebar" />}
      />
      <div className="shell__main">
        <PageHeader
          title={heading.title}
          subtitle={heading.subtitle}
          notify={<NotifyMenu prefs={notify} variant="header" />}
          onSignOut={signOut}
          right={
            <>
              <AgentPill online={online} state={agent?.state ?? 'idle'} live={live} onClick={() => navigate('agent')} />
              <DryRunSwitch dryRun={dryRun} onChange={setDryRun} />
            </>
          }
        />
        <main className="shell__content" id="main">
          <PageTransition pageKey={page}>
            <ErrorBoundary resetKey={page}>{content}</ErrorBoundary>
          </PageTransition>
        </main>
      </div>

      {profileReady ? (
        <ProfileWizard
          open={wizard.open}
          openKey={wizard.key}
          startStep={wizard.step}
          reason={wizard.reason}
          row={profileRow}
          accountEmail={email}
          onClose={() => setWizard((w) => ({ ...w, open: false }))}
          onSaved={() => {
            setWizard((w) => ({ ...w, open: false }));
            push({ tone: 'ok', title: 'Profile saved', detail: 'The agent uses it to answer application forms.' });
          }}
          onPersisted={profileT.reload}
          onDraftError={(message) => push({ tone: 'error', title: 'Draft not saved', detail: message })}
        />
      ) : null}

      <ConfirmSubmit jobs={confirmJobs} onCancel={() => setConfirmJobs(null)} onConfirm={() => confirmJobs && apply(confirmJobs)} />
      <Lightbox shot={shot} onClose={() => setShot(null)} />
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
