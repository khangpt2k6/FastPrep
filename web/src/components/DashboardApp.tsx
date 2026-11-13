import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorText } from '../lib/errors';
import { APPLICATION_STATUSES, WORKING_STATES, companyName, displayName, isOnline, plural, statusInfo, stopReason } from '../lib/format';
import { mergeProfile, profileProgress, validatePersonal } from '../lib/profile';
import { applyResume, activeResume, byNewest, isPending, writeResume, type ResumeProfile } from '../lib/resume';
import { atCompany, filterJobs, sortJobs } from '../lib/jobs';
import { confetti } from '../lib/confetti';
import { playChime, showBrowserNotification } from '../lib/notify';
import type { AgentSettings, JobRow, LiveStatus } from '../lib/types';
import {
  readSettings,
  saveAgentSettings,
  saveProfileRow,
  sendApply,
  sendSearch,
  useAgent,
  useAgentSettings,
  useCommands,
  useJobs,
  useMemory,
  useProfileRow,
} from '../hooks/useAutomationData';
import { deleteResume, saveResumeData, uploadResume, useResumeActivated, useResumes } from '../hooks/useResumes';
import { useFinishedApplications } from '../hooks/useFinishedApplications';
import { useNewMemories } from '../hooks/useNewMemories';
import { useNotifyPrefs } from '../hooks/useNotifyPrefs';
import { useNow } from '../hooks/useNow';
import { useSavedJobs } from '../hooks/useSavedJobs';
import { sendCoverLetters, useCoverLetters } from '../hooks/useCoverLetters';
import { useCalendar } from '../hooks/useCalendar';
import { useInbox } from '../hooks/useInbox';
import { useRoute } from '../hooks/useRoute';
import { AgentPage } from './agent/AgentPage';
import { agentTone, useLogTail } from './agent/live';
import { ApplicationsPage } from './applications/ApplicationsPage';
import { Callout, SkeletonPanel } from './common';
import { ConfirmSubmit } from './ConfirmSubmit';
import { ErrorBoundary } from './ErrorBoundary';
import { IconPencil, IconUser } from './Icons';
import { ActionBar } from './jobs/ActionBar';
import { JobsPage, NO_JOB_FILTERS, type JobFilterState } from './jobs/JobsPage';
import { Lightbox } from './Lightbox';
import { Notice } from './Notice';
import { REVIEW_STEP, type WizardReason } from './profile/wizardSteps';
import { LiveCallout, OfflineCallout } from './shell/Notices';
import { PageHeader } from './shell/PageHeader';
import { PAGE_META } from './shell/pages';
import { Shell } from './shell/Shell';
import type { AgentCardProps, Marks, SetupMark } from './shell/Sidebar';
import { statusWords } from './shell/StatusControls';
import { Toasts, useToasts, type ToastTone } from './Toasts';
import { PageTransition } from './motion';
import { UpcomingCard } from './calendar/UpcomingCard';
import { nextInterviewLine } from '../lib/calendar';
import { companyLookup } from '../lib/overview';

// Heavier pages load on first visit, so the first page comes up fast.
const CoverLettersPage = lazy(() => import('./letters/CoverLettersPage').then((m) => ({ default: m.CoverLettersPage })));
const PreferencesPage = lazy(() => import('./PreferencesPage').then((m) => ({ default: m.PreferencesPage })));
const MemoryPage = lazy(() => import('./memory/MemoryPage').then((m) => ({ default: m.MemoryPage })));
const ProfilePage = lazy(() => import('./profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const ProfileWizard = lazy(() => import('./profile/ProfileWizard').then((m) => ({ default: m.ProfileWizard })));
const SetupPage = lazy(() => import('./setup/SetupPage').then((m) => ({ default: m.SetupPage })));
const CompaniesPage = lazy(() => import('./companies/CompaniesPage'));
const InboxView = lazy(() => import('./inbox/InboxPage').then((m) => ({ default: m.InboxView })));
const OverviewPage = lazy(() => import('./overview/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const CalendarPage = lazy(() => import('./calendar/CalendarPage'));
const RulesPage = lazy(() => import('./rules/RulesPage').then((m) => ({ default: m.RulesPage })));

export interface DashboardProps {
  userId: string;
  /** The account's email: the profile wizard fills it in when the profile has none yet. */
  email: string;
}

function combineLive(statuses: LiveStatus[]): LiveStatus {
  if (statuses.every((s) => s === 'live')) return 'live';
  if (statuses.some((s) => s === 'down')) return 'down';
  return 'connecting';
}

// One command is worked through form by form, a few minutes each: a few dozen is an afternoon.
const MAX_PER_APPLY = 25;

/** Toast and notification text for a finished application. A dry run never reads as sent. */
function finishedMessage(job: JobRow): { title: string; detail?: string; tone: ToastTone; good: boolean } {
  const name = displayName(job);
  switch (job.status) {
    case 'submitted':
      return { title: `Sent to ${name}`, tone: 'ok', good: true };
    case 'unconfirmed':
      return { title: `Sent to ${name}, unconfirmed`, tone: 'ok', good: true };
    case 'blocked': {
      const info = statusInfo(job);
      if (info.tone === 'filled') return { title: `Filled at ${name} (dry run)`, tone: 'ok', good: true };
      return { title: `${info.label} at ${name}`, detail: stopReason(job) || undefined, tone: 'warn', good: false };
    }
    case 'refused':
      return { title: `Refused at ${name}`, tone: 'error', good: false };
    default:
      return { title: `Failed at ${name}`, tone: 'error', good: false };
  }
}

/** A loading page in the shape of a card of rows. */
function PageSkeleton() {
  return <SkeletonPanel count={5} />;
}

export default function DashboardApp({ userId, email }: DashboardProps) {
  const { page, params, navigate, setParams } = useRoute();
  const now = useNow(2000);
  const agentT = useAgent(userId);
  const jobsT = useJobs(userId);
  const commandsT = useCommands(userId);
  const profileT = useProfileRow(userId);
  const memoryT = useMemory(userId);
  const settingsT = useAgentSettings(userId);
  const resumesT = useResumes(userId);
  const lettersT = useCoverLetters(userId);
  const inboxT = useInbox(userId);
  const calendarT = useCalendar(userId);
  const notify = useNotifyPrefs();
  const { toasts, push, dismiss } = useToasts();
  const tail = useLogTail(agentT.agent);
  const { saved, toggle: toggleSaved } = useSavedJobs();

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dryRun, setDryRun] = useState(true);
  const [filters, setFilters] = useState<Omit<JobFilterState, 'company'>>(NO_JOB_FILTERS);
  const [applyBusy, setApplyBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [lettersBusy, setLettersBusy] = useState(false);
  const [confirmJobs, setConfirmJobs] = useState<JobRow[] | null>(null);
  const [shot, setShot] = useState<{ job: JobRow; url: string } | null>(null);
  const [override, setOverride] = useState<AgentSettings | null>(null);
  const [wizard, setWizard] = useState<{ open: boolean; key: number; step: number; reason: WizardReason }>({ open: false, key: 0, step: 0, reason: 'auto' });

  const agent = agentT.agent;
  const online = isOnline(agent?.state, agent?.last_seen, now);
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const working = online && WORKING_STATES.includes(state);
  const profileRow = profileT.row;
  const profileReady = !profileT.loading && !profileT.error;
  const profile = useMemo(() => mergeProfile(profileRow?.data), [profileRow]);
  const sections = useMemo(() => profileProgress(profile), [profile]);
  // Saved as complete and every section filled: a profile saved before a question became required is not complete.
  const profileComplete = profileRow?.completed === true && sections.every((s) => s.done);

  // The agent's switches: the stored row, or what was just changed until the row catches up.
  const stored = useMemo(() => readSettings(settingsT.settings), [settingsT.settings]);
  const settings = override ?? stored;
  const settingsMissing = settingsT.error?.kind === 'missing-table';
  useEffect(() => {
    if (override && JSON.stringify(override) === JSON.stringify(stored)) setOverride(null);
  }, [stored, override]);

  const changeSettings = useCallback(
    async (patch: Partial<AgentSettings>) => {
      const next = { ...(override ?? stored), ...patch };
      setOverride(next);
      try {
        await saveAgentSettings(next);
        settingsT.reload();
        if ('paused' in patch) push({ tone: 'ok', title: patch.paused ? 'Agent paused' : 'Agent on' });
      } catch (error) {
        setOverride(null);
        push({ tone: 'error', title: 'Could not save the setting', detail: errorText(error) });
      }
    },
    [override, stored, settingsT, push],
  );

  // Jobs that can still be applied to.
  const candidates = useMemo(() => jobsT.rows.filter((j) => (j.status === 'scored' || j.status === 'new') && j.score !== null), [jobsT.rows]);
  const company = page === 'jobs' ? params.get('company') : null;
  const jobFilters: JobFilterState = { ...filters, company };
  const visible = useMemo(
    () => sortJobs(filterJobs(candidates, { ...filters, company, saved, now }), filters.sort),
    // now only matters for New only; a minute of drift is fine.
    [candidates, filters, company, saved, filters.newOnly ? Math.floor(now / 60000) : 0],
  );
  const companyLabel = useMemo(() => {
    if (!company) return '';
    const hit = candidates.find((j) => atCompany(j, company));
    return hit ? displayName(hit) : company;
  }, [candidates, company]);

  const applications = useMemo(
    () => jobsT.rows.filter((j) => APPLICATION_STATUSES.includes(j.status)).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
    [jobsT.rows],
  );
  const sent = useMemo(() => applications.filter((j) => ['sent', 'unconfirmed'].includes(statusInfo(j).tone)).length, [applications]);
  // Company names and logos for the calendar's companies, through the jobs.
  const lookup = useMemo(() => companyLookup(jobsT.rows), [jobsT.rows]);

  // The form the agent is filling right now, shown on the agent page.
  const current = useMemo(() => applications.find((j) => j.status === 'applying') ?? null, [applications]);

  // Jobs already handed to the agent in a command it has not finished.
  const queued = useMemo(() => {
    const ids = new Set<string>();
    for (const c of commandsT.rows) {
      if (c.kind === 'apply' && (c.status === 'pending' || c.status === 'running')) c.job_ids.forEach((id) => ids.add(id));
    }
    return ids;
  }, [commandsT.rows]);
  const searchPending = commandsT.rows.some((c) => c.kind === 'search' && (c.status === 'pending' || c.status === 'running'));
  const searching = searchBusy || (online && (state === 'searching' || state === 'scoring')) || (online && searchPending);

  const chosen = useMemo(() => candidates.filter((j) => selected.has(j.id) && !queued.has(j.id)), [candidates, selected, queued]);

  const answerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of memoryT.rows) if (r.job_id) counts.set(r.job_id, (counts.get(r.job_id) ?? 0) + 1);
    return counts;
  }, [memoryT.rows]);

  // Set up: a resume the agent made active, then a finished profile.
  const resumesMissing = resumesT.error?.kind === 'missing-table';
  const active = useMemo(() => activeResume(resumesT.rows), [resumesT.rows]);
  const pending = useMemo(() => byNewest(resumesT.rows).find(isPending) ?? null, [resumesT.rows]);
  const hasResume = Boolean(active) || Boolean(agent?.resume_name);
  const setupDone = hasResume && profileComplete;
  const setupMark: SetupMark = {
    done: setupDone,
    progress: ((hasResume ? 1 : 0) + (profileComplete ? 1 : 0)) / 2,
    label: setupDone ? 'done' : `${(hasResume ? 1 : 0) + (profileComplete ? 1 : 0)} of 2 done`,
  };

  // First load with no resume anywhere: start at Set up, once, and keep the profile wizard from opening over it.
  const setupDecided = useRef(false);
  const sentToSetup = useRef(false);
  const [decided, setDecided] = useState(false);
  useEffect(() => {
    if (setupDecided.current || agentT.loading || resumesT.loading) return;
    setupDecided.current = true;
    if (!resumesT.error) {
      const started = resumesT.rows.some((r) => r.status === 'active' || isPending(r));
      if (!started && !agent?.resume_name) {
        sentToSetup.current = true;
        navigate('setup');
      }
    }
    setDecided(true);
  }, [agentT.loading, resumesT.loading, resumesT.error, resumesT.rows, agent, navigate]);

  // Open the profile wizard once on load when the profile is missing or unfinished, unless Set up came first.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!profileReady || !decided || autoOpened.current) return;
    autoOpened.current = true;
    if (sentToSetup.current) return;
    if (!profileRow || !profileRow.completed) setWizard((w) => ({ open: true, key: w.key + 1, step: 0, reason: 'auto' }));
  }, [profileReady, profileRow, decided]);

  const openWizard = useCallback((step: number, reason: WizardReason = 'manual') => {
    setWizard((w) => ({ open: true, key: w.key + 1, step, reason }));
  }, []);

  const onFinish = useCallback(
    (job: JobRow) => {
      const msg = finishedMessage(job);
      push({ tone: msg.tone, title: msg.title, detail: msg.detail });
      if (notify.enabled) showBrowserNotification(msg.title, job.title, `job-${job.id}`);
      if (notify.sound) playChime(msg.good);
      // Only a real send gets confetti: a dry run fills and stops.
      if ((job.status === 'submitted' || job.status === 'unconfirmed') && !job.dry_run) confetti();
    },
    [push, notify.enabled, notify.sound],
  );
  useFinishedApplications(jobsT.rows, !jobsT.loading && !jobsT.error, onFinish);

  useNewMemories(memoryT.rows, !memoryT.loading && !memoryT.error, (fresh) => {
    push({ tone: 'info', title: fresh.length === 1 ? 'New answer learned' : `${fresh.length} answers learned`, detail: fresh.length === 1 ? fresh[0].question : undefined });
  });

  useResumeActivated(resumesT.rows, !resumesT.loading && !resumesT.error, (row) => {
    confetti();
    push({ tone: 'ok', title: 'Resume ready', detail: row.name });
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
      push({ tone: 'ok', title: dryRun ? `${plural(jobs.length, 'job')} queued for dry run` : `${plural(jobs.length, 'job')} queued to send` });
      commandsT.reload();
    } catch (error) {
      push({ tone: 'error', title: 'Could not queue jobs', detail: errorText(error) });
    } finally {
      setApplyBusy(false);
    }
  }

  function requestApply() {
    if (chosen.length === 0 || !online) return;
    if (chosen.length > MAX_PER_APPLY) {
      push({ tone: 'warn', title: `Select ${MAX_PER_APPLY} or fewer jobs` });
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
      push({ tone: 'ok', title: online ? 'Searching for jobs' : 'Search queued' });
      commandsT.reload();
    } catch (error) {
      push({ tone: 'error', title: 'Could not start search', detail: errorText(error) });
    } finally {
      setSearchBusy(false);
    }
  }

  async function writeLetters() {
    if (chosen.length === 0) return;
    setLettersBusy(true);
    try {
      await sendCoverLetters(chosen.map((j) => j.id));
      push({ tone: 'ok', title: online ? `Writing ${plural(chosen.length, 'letter')}` : 'Letters queued' });
      commandsT.reload();
      navigate('letters');
    } catch (error) {
      push({ tone: 'error', title: 'Could not queue letters', detail: errorText(error) });
    } finally {
      setLettersBusy(false);
    }
  }

  async function applyResumeToProfile(read: ResumeProfile) {
    const next = applyResume(profile, read);
    const completed = profileRow?.completed === true && profileProgress(next).every((s) => s.done);
    await saveProfileRow(next, completed);
    profileT.reload();
    openWizard(REVIEW_STEP, 'manual');
  }

  const coreTables = [agentT, jobsT, commandsT, profileT];
  const live = combineLive(coreTables.map((t) => t.live));

  if (coreTables.some((t) => t.error?.kind === 'missing-table')) {
    return (
      <Notice
        title="Database not set up"
        action={
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        }
      >
        <p>
          Run <code className="code">supabase/schema.sql</code> in the SQL editor.
        </p>
      </Notice>
    );
  }

  const applyingCount = applications.filter((j) => j.status === 'applying').length;
  const marks: Marks = {};
  if (applyingCount > 0) marks.applications = { node: <span className="navcount num">{applyingCount}</span>, label: `${applyingCount} in progress` };
  if (profileReady && !profileComplete) marks.profile = { node: <span className="navdot navdot--ember" />, label: 'incomplete' };
  if (candidates.length > 0) marks.jobs = { node: <span className="navcount num">{candidates.length}</span>, label: `${candidates.length} jobs` };

  const agentCard: AgentCardProps = {
    agent,
    online,
    loading: agentT.loading,
    now,
    settings,
    settingsOff: settingsMissing || settingsT.loading,
    onSettings: (patch: Partial<AgentSettings>) => void changeSettings(patch),
    searching,
    onSearch: () => void search(),
  };
  const tone = agentT.loading ? 'off' : agentTone(online, state);
  const words = statusWords(agent, online, agentT.loading, now, tone);

  const notices = (applying: boolean) => (
    <>
      {applying && !dryRun ? <LiveCallout /> : null}
      {!online && !agentT.loading ? <OfflineCallout /> : null}
      {applying && profileReady && !profileComplete ? (
        <Callout
          tone="yellow"
          icon={<IconUser size={16} />}
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={() => openWizard(0)}>
              Finish
            </button>
          }
        >
          <strong>Profile incomplete.</strong> Needed before applying.
        </Callout>
      ) : null}
    </>
  );
  const dock = (
    <ActionBar
      count={chosen.length}
      dryRun={dryRun}
      online={online}
      applying={applyBusy}
      onApply={requestApply}
      onLetters={writeLetters}
      writing={lettersBusy}
      onClear={() => setSelected(new Set())}
    />
  );

  const jobParam = page === 'memory' ? params.get('job') : null;
  const jobRow = jobParam ? jobsT.rows.find((j) => j.id === jobParam) : undefined;
  const memoryRow = jobParam ? memoryT.rows.find((r) => r.job_id === jobParam) : undefined;
  const jobFilter = jobParam
    ? {
        id: jobParam,
        company: jobRow ? displayName(jobRow) : memoryRow?.company ? companyName(memoryRow.company) : 'this job',
        domain: jobRow?.company_domain ?? '',
      }
    : null;

  const meta = PAGE_META[page];
  let header: ReactNode = <PageHeader title={meta.title} subtitle={meta.sub} />;
  let content: ReactNode;
  switch (page) {
    case 'overview':
      header = null;
      content = (
        <>
          <OverviewPage
            firstName={profile.personal.first_name}
            agent={agent}
            tone={tone}
            state={state}
            line={words.line}
            jobs={jobsT.rows}
            candidates={candidates}
            jobsLoading={jobsT.loading}
            jobsError={jobsT.error}
            letters={lettersT.rows}
            inbox={inboxT.rows}
            inboxLoading={inboxT.loading}
            inboxMissing={inboxT.error?.kind === 'missing-table'}
            commands={commandsT.rows}
            now={now}
            searching={searching}
            onSearch={() => void search()}
            onReviewStrong={() => {
              setFilters({ ...NO_JOB_FILTERS, minScore: 4 });
              navigate('jobs');
            }}
            onNavigate={(p) => navigate(p)}
            selected={selected}
            queued={queued}
            onToggle={toggle}
            notices={notices(false)}
            upcoming={
              calendarT.error?.kind === 'missing-table' ? null : (
                <UpcomingCard rows={calendarT.rows} now={now} loading={calendarT.loading} lookup={lookup} onOpen={() => navigate('calendar')} />
              )
            }
            briefExtra={nextInterviewLine(calendarT.rows, now, (c) => lookup(c)?.name ?? c)}
          />
          {dock}
        </>
      );
      break;
    case 'jobs': {
      const narrowed = filters.query !== '' || filters.minScore !== 0 || filters.newOnly || filters.savedOnly || Boolean(company);
      header = <PageHeader title={meta.title} subtitle={meta.sub} count={jobsT.loading ? undefined : narrowed ? `${visible.length} of ${candidates.length}` : candidates.length} />;
      content = (
        <JobsPage
          candidates={candidates}
          visible={visible}
          loading={jobsT.loading}
          error={jobsT.error}
          onRetry={jobsT.reload}
          selected={selected}
          queued={queued}
          onToggle={toggle}
          onToggleAll={toggleAll}
          saved={saved}
          onSave={toggleSaved}
          filters={jobFilters}
          onFilters={(patch) => {
            const { company: nextCompany, ...rest } = patch;
            if (nextCompany !== undefined) setParams({ company: nextCompany });
            if (Object.keys(rest).length) setFilters((f) => ({ ...f, ...rest }));
          }}
          onClearFilters={() => {
            setFilters(NO_JOB_FILTERS);
            setParams({ company: null });
          }}
          companyLabel={companyLabel}
          searching={searching}
          onSearch={() => void search()}
          now={now}
          notices={notices(true)}
          actionBar={dock}
        />
      );
      break;
    }
    case 'applications':
      header = <PageHeader title={meta.title} subtitle={meta.sub} count={applications.length || undefined} />;
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
          dryRun={dryRun}
          online={online}
          queued={queued}
          notices={!dryRun ? <LiveCallout /> : null}
          onApplyAgain={(job) => {
            if (!online) return;
            if (dryRun) void apply([job]);
            else setConfirmJobs([job]);
          }}
        />
      );
      break;
    case 'inbox':
      content = <InboxView table={inboxT} now={now} jobs={jobsT.rows} />;
      break;
    case 'calendar':
      header = null;
      content = <CalendarPage userId={userId} table={calendarT} jobs={jobsT.rows} inbox={inboxT.rows} now={now} online={online} toast={push} />;
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
          sent={sent}
          current={current}
          settings={settings}
          settingsState={{ loading: settingsT.loading, missing: settingsMissing, error: settingsT.error && !settingsMissing ? settingsT.error.message : null }}
          onSettings={(patch) => void changeSettings(patch)}
        />
      );
      break;
    case 'profile':
      header = (
        <PageHeader
          title={meta.title}
          subtitle={meta.sub}
          actions={
            profileReady ? (
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => openWizard(profileComplete ? REVIEW_STEP : 0)}>
                <IconPencil size={14} />
                Edit profile
              </button>
            ) : null
          }
        />
      );
      content = profileT.error ? (
        <Callout tone="red" icon={<IconUser size={16} />}>
          {profileT.error.message}
        </Callout>
      ) : profileT.loading ? (
        <PageSkeleton />
      ) : (
        <ProfilePage
          profile={profile}
          row={profileRow}
          onEdit={(step) => openWizard(step)}
          resume={{ active, pending, loading: resumesT.loading, missing: resumesMissing, agentName: agent?.resume_name ?? '' }}
          now={now}
          onReplace={() => navigate('setup')}
        />
      );
      break;
    case 'preferences':
      content = <PreferencesPage userId={userId} onSaved={() => push({ tone: 'ok', title: 'Preferences saved' })} onManageMemory={() => navigate('memory')} />;
      break;
    case 'rules':
      content = <RulesPage userId={userId} toast={push} onNavigate={(p) => navigate(p)} />;
      break;
    case 'memory':
      content = <MemoryPage memory={memoryT} now={now} job={jobFilter} onClearJob={() => navigate('memory')} toast={push} jobs={jobsT.rows} />;
      break;
    case 'letters':
      content = <CoverLettersPage userId={userId} jobs={jobsT.rows} online={online} now={now} toast={push} profile={profile} />;
      break;
    case 'companies':
      header = null;
      content = <CompaniesPage jobs={candidates} params={params} setParams={setParams} onSeeJobs={(key) => navigate('jobs', { company: key })} />;
      break;
    case 'setup':
      header = null;
      content = (
        <SetupPage
          resumes={resumesT}
          online={online}
          now={now}
          onUpload={(file) => uploadResume(userId, file)}
          onDelete={(row) => deleteResume(row)}
          onSaveRead={(row, read) => saveResumeData(row.id, writeResume(row.data, read))}
          onApply={applyResumeToProfile}
          onSeeJobs={() => navigate('jobs')}
          onEditProfile={() => openWizard(REVIEW_STEP)}
          toast={push}
        />
      );
      break;
  }

  return (
    <>
      <Shell
        page={page}
        onNavigate={(target) => navigate(target)}
        marks={marks}
        setup={setupMark}
        agent={agentCard}
        working={working}
        dryRun={dryRun}
        onDryRun={setDryRun}
        notify={notify}
        recent={applications.slice(0, 5)}
        onOpenRecent={() => navigate('applications')}
        email={email}
      >
        <PageTransition pageKey={page}>
          {header}
          <ErrorBoundary resetKey={page}>
            <Suspense fallback={<PageSkeleton />}>{content}</Suspense>
          </ErrorBoundary>
        </PageTransition>
      </Shell>

      {profileReady && wizard.key > 0 ? (
        <Suspense fallback={null}>
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
              push({ tone: 'ok', title: 'Profile saved' });
            }}
            onPersisted={profileT.reload}
            onDraftError={(message) => push({ tone: 'error', title: 'Draft not saved', detail: message })}
          />
        </Suspense>
      ) : null}

      <ConfirmSubmit jobs={confirmJobs} onCancel={() => setConfirmJobs(null)} onConfirm={() => confirmJobs && apply(confirmJobs)} />
      <Lightbox shot={shot} onClose={() => setShot(null)} />
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </>
  );
}
