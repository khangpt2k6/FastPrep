import { useState, type ReactNode } from 'react';
import { CANCELLED } from '../../hooks/useAutomationData';
import { AnimatePresence, motion } from 'motion/react';
import type { AgentRow, AgentSettings, AiEngine, CommandRow, JobRow, LiveStatus, LoadError } from '../../lib/types';
import { LAYOUT_CAP, SPRING, riseItem } from '../../lib/motion';
import { AnimatedNumber, Shimmer, Swap, WaitingLines } from '../motion';
import { clock, plural, stateLabel, timeAgo, untilText, usd, waitingLines, type TagColor } from '../../lib/format';
import { Callout, Tag } from '../common';
import { Dialog } from '../Dialog';
import { Group, GroupNote, NavRow, PillSelect, SettingRow, ToggleRow, type PillOption } from '../settings';
import { IconActivity, IconAlert, IconCheckCircle, IconClock, IconDownload, IconFile, IconFilter, IconGauge, IconInfo, IconSliders, IconSpark, IconTerminal, IconX } from '../Icons';
import { WolfRing } from '../mascot/Wolf';
import { Contours } from '../motif';
import { CurrentJob, START_SHORTCUT, StartHint, agentTone, logItem, type LogEntry } from './live';
import { TasksCard } from './TasksCard';
import { EnginePicker, type EngineOption } from './EnginePicker';
import { BrandLogo } from '../BrandLogo';

const COMMAND_KIND: Record<string, string> = { apply: 'Apply', search: 'Search', cover_letter: 'Letters', resume: 'Resume', linkedin: 'LinkedIn', calendar_add: 'Calendar' };

const COMMAND_STATUS: Record<CommandRow['status'], { label: string; color: TagColor }> = {
  pending: { label: 'Waiting', color: 'gray' },
  running: { label: 'Running', color: 'blue' },
  done: { label: 'Done', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
};

// The page's own link to the database, not the agent: shown only while the agent is online, so it never sits beside "Offline".
const LIVE_WORD: Record<LiveStatus, string> = { live: 'Live updates', down: 'Updates paused', connecting: 'Connecting' };

const HOURS = [1, 3, 6, 12, 24];
const LIMITS = [20, 40, 80];

/** The options, plus the stored value when it is one the page does not offer (set by hand in the database). */
function withCurrent(values: number[], current: number): number[] {
  return values.includes(current) ? values : [...values, current].sort((a, b) => a - b);
}

const hourOptions = (current: number): PillOption<number>[] =>
  withCurrent(HOURS, current).map((h) => ({ value: h, label: h === 1 ? 'Every hour' : `Every ${h} hours` }));

const limitOptions = (current: number): PillOption<number>[] =>
  withCurrent(LIMITS, current).map((n) => ({ value: n, label: `${n} jobs`, hint: n <= 20 ? 'Least credit' : n >= 80 ? 'Most choice' : undefined }));

const ENGINES: EngineOption<AiEngine>[] = [
  { value: 'api', brand: 'openai', name: 'OpenAI API', note: 'Pay per use' },
  { value: 'codex', brand: 'openai', name: 'Codex', note: 'ChatGPT plan' },
  { value: 'claude', brand: 'claude', name: 'Claude Code', note: 'Claude plan' },
];

// A budget's options in dollars; NO_LIMIT stands for no limit (null in the database).
const NO_LIMIT = -1;
const DAY_BUDGETS = [1, 2, 5, 10];
const MONTH_BUDGETS = [10, 20, 50, 100];

const budgetOptions = (values: number[], current: number | null): PillOption<number>[] => [
  ...withCurrent(values, current ?? values[0]).map((n) => ({ value: n, label: usd(n) })),
  { value: NO_LIMIT, label: 'No limit' },
];

/** What the AI cost against the budget: "Today $0.42 / $2 · Month $3.10 / $20 · Codex 12". */
export function usageLine(usage: Usage, settings: AgentSettings): string {
  const of = (spent: number, limit: number | null) => (limit === null ? usd(spent) : `${usd(spent)} / ${usd(limit)}`);
  const parts = [`Today ${of(usage.day, settings.budget_day)}`, `Month ${of(usage.month, settings.budget_month)}`];
  if (settings.engine === 'codex' || usage.codexToday) parts.push(`Codex ${usage.codexToday}`);
  return parts.join(' · ');
}

/** What the API cost today and this month, how often Codex was asked today, and whether a budget is used up. */
export interface Usage {
  day: number;
  month: number;
  codexToday: number;
  reached: boolean;
}

export interface SettingsState {
  loading: boolean;
  /** The table is not in the database yet: the controls are shown off. */
  missing: boolean;
  error: string | null;
}

interface AgentPageProps {
  agent: AgentRow | null;
  online: boolean;
  loading: boolean;
  error: LoadError | null;
  onRetry: () => void;
  now: number;
  tail: LogEntry[];
  commands: CommandRow[];
  /** Cancels a command still waiting or running. */
  onCancel?: (id: number) => void;
  live: LiveStatus;
  sent: number;
  /** The job being filled right now, if any. */
  current: JobRow | null;
  settings: AgentSettings;
  settingsState: SettingsState;
  onSettings: (patch: Partial<AgentSettings>) => void;
  /** What the AI cost; null while the usage table is not in the database. */
  usage?: Usage | null;
  /** In place of the live Tasks card: the page's preview passes one with sample tasks. */
  tasks?: ReactNode;
}

/** "Last check 47m ago, 12 new. Next in 2h 13m." */
export function checkLine(agent: AgentRow | null, settings: AgentSettings, online: boolean, now: number): string {
  const parts: string[] = [];
  if (agent?.fetched_at) {
    const ago = timeAgo(agent.fetched_at, now);
    parts.push(`Job list updated ${ago}, ${agent.fetched_new ?? 0} new.`);
  } else {
    parts.push(settings.auto_fetch ? 'No check yet.' : 'Job list updated only when you press Find more.');
  }
  if (!settings.auto_fetch) parts.push(agent?.fetched_at ? 'Automatic checks are off: next update when you press Find more.' : '');
  else if (settings.paused) parts.push('Next check when the agent is on.');
  else if (!online) parts.push('Next check when the agent is online.');
  else {
    const until = untilText(agent?.next_fetch_at, now);
    parts.push(until ? `Next in ${until}.` : 'Next check soon.');
  }
  return parts.filter(Boolean).join(' ');
}

function heroWord(state: string): string {
  return state === 'idle' || state === 'ready' ? 'Ready' : stateLabel(state);
}

function HowItWorks({ open, onClose, limit }: { open: boolean; onClose: () => void; limit: number }) {
  const steps: { icon: ReactNode; title: string; text: string }[] = [
    {
      icon: <IconDownload size={18} />,
      title: 'Fresh postings',
      text: 'Every few hours the agent downloads the newest postings from a public job database built from company career sites: Greenhouse, Lever, Ashby, Workday and more.',
    },
    { icon: <IconFilter size={18} />, title: 'Your search', text: 'It keeps the internships that match your search.' },
    {
      icon: <IconSpark size={18} />,
      title: 'Scored for you',
      text: `It scores up to ${limit} of them against your resume. Scoring uses a little AI credit. An idle agent uses none.`,
    },
    { icon: <IconCheckCircle size={18} />, title: 'You decide', text: 'Nothing is sent without you.' },
  ];
  return (
    <Dialog open={open} onClose={onClose} labelledBy="how-title" className="smalldialog howdialog">
      <header className="smalldialog__head">
        <h2 id="how-title">Search process</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <IconX size={18} />
        </button>
      </header>
      <ol className="howsteps">
        {steps.map((s, i) => (
          <motion.li
            key={s.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.08 + i * 0.07, duration: 0.3 } }}
          >
            <span className="howsteps__icon" aria-hidden="true">
              {s.icon}
            </span>
            <span className="howsteps__text">
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </span>
          </motion.li>
        ))}
      </ol>
      <div className="smalldialog__actions">
        <button type="button" className="btn btn--primary" onClick={onClose} data-autofocus>
          Got it
        </button>
      </div>
    </Dialog>
  );
}

function Stat({ label, value, id, hint }: { label: string; value: number; id: string; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <span className="stat__label">{label}</span>
      <AnimatedNumber className="stat__value num" id={id} value={value} />
    </div>
  );
}

export function AgentPage(props: AgentPageProps) {
  const { agent, online, loading, error, onRetry, now, tail, commands, live, sent, current, settings, settingsState, onSettings, usage = null } = props;
  const [how, setHow] = useState(false);
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone = loading ? 'off' : agentTone(online, state);
  const busy = tone === 'busy';
  const word = loading ? 'Connecting' : heroWord(state);
  const message = online ? agent?.message ?? '' : '';
  const lines = [...tail].reverse();
  const recent = [...commands].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 10);
  const off = settingsState.missing || settingsState.loading;
  const seen = agent?.last_seen ? timeAgo(agent.last_seen, now) : '';

  let say: ReactNode;
  if (loading) say = <Shimmer tone="inverse">Connecting to the agent</Shimmer>;
  else if (!online)
    say = (
      <>
        Double-click <strong className="nowrap">{START_SHORTCUT}</strong> on your desktop to start it.
      </>
    );
  else if (tone === 'paused') say = 'Paused. It finishes what it is doing and waits.';
  else if (message) say = <Shimmer tone="inverse" active={busy}>{message}</Shimmer>;
  else say = busy ? <Shimmer tone="inverse">Working</Shimmer> : 'Waiting for jobs from this page.';

  return (
    <div className="page page--agent">
      {error ? (
        <Callout
          tone="red"
          icon={<IconAlert size={16} />}
          action={
            <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
              Retry
            </button>
          }
        >
          {error.message}
        </Callout>
      ) : null}

      <section className={`hero hero--${tone}`} aria-labelledby="hero-state">
        <Contours className="hero__map" />
        <div className="hero__ring">
          <WolfRing tone={loading ? 'off' : tone} state={state} size={136} />
        </div>
        <div className="hero__body">
          <p className="hero__eyebrow">
            <span className={`sdot sdot--${loading ? 'off' : tone}`} aria-hidden="true" />
            Agent
          </p>
          <h2 className="hero__state" id="hero-state">
            <Swap id={word}>{word}</Swap>
          </h2>
          <p className={`hero__say ${tone === 'bad' ? 'is-bad' : ''}`} aria-live="polite">
            {say}
          </p>
          {busy ? <WaitingLines className="hero__wait" lines={waitingLines(state, message)} every={3200} tone="inverse" /> : null}
          {online && current ? (
            <div className="hero__now">
              <CurrentJob job={current} />
            </div>
          ) : null}
          <ul className="hero__meta">
            <li title="Last heartbeat">
              <IconClock size={14} />
              {seen ? `Seen ${seen}` : 'Never seen'}
            </li>
            {agent?.model ? (
              <li title="Model">
                <BrandLogo brand="openai" size={14} />
                {agent.model}
              </li>
            ) : null}
            <li title="Resume">
              <IconFile size={14} />
              {agent?.resume_name || 'No resume loaded'}
            </li>
            {online ? (
              <li className={`live-${live}`} title="This page's live link to the database">
                <span className={`livedot livedot--${live}`} aria-hidden="true" />
                <Swap id={live}>{LIVE_WORD[live]}</Swap>
              </li>
            ) : null}
          </ul>
          {!online && !loading ? (
            <p className="hero__alt">
              Or run <StartHint />
            </p>
          ) : null}
        </div>
      </section>

      <Group title="Controls" icon={<IconSliders size={15} />} tone="ember">
        <ToggleRow
          title="Agent on"
          checked={!settings.paused}
          onChange={(on) => onSettings({ paused: !on })}
          disabled={off}
          description={
            !online && !loading ? (
              <>
                Offline now. Double-click <strong className="nowrap">{START_SHORTCUT}</strong> on your desktop to start it.
              </>
            ) : undefined
          }
        />
        <ToggleRow
          title="Find new jobs automatically"
          checked={settings.auto_fetch}
          onChange={(v) => onSettings({ auto_fetch: v })}
          disabled={off}
        />
        <SettingRow title="Check every" className={!settings.auto_fetch ? 'is-dim' : ''}>
          <PillSelect<number>
            label="Check every"
            value={settings.fetch_hours}
            options={hourOptions(settings.fetch_hours)}
            display={(o) => (o.value === 1 ? '1 hour' : `${o.value} hours`)}
            onChange={(v) => onSettings({ fetch_hours: v })}
            disabled={off || !settings.auto_fetch}
          />
        </SettingRow>
        <SettingRow
          title="New jobs scored per round"
          className={!settings.auto_fetch ? 'is-dim' : ''}
        >
          <PillSelect<number>
            label="New jobs scored per round"
            value={settings.fetch_limit}
            options={limitOptions(settings.fetch_limit)}
            display={(o) => String(o.value)}
            onChange={(v) => onSettings({ fetch_limit: v })}
            disabled={off || !settings.auto_fetch}
          />
        </SettingRow>
        <p className="srow__note num">
          <IconClock size={14} />
          {checkLine(agent, settings, online, now)}
        </p>
        <SettingRow title="AI engine" className="srow--stack">
          <EnginePicker<AiEngine>
            label="AI engine"
            value={settings.engine}
            options={ENGINES}
            onChange={(v) => onSettings({ engine: v })}
            disabled={off}
          />
        </SettingRow>
        <SettingRow title="Daily budget">
          <PillSelect<number>
            label="Daily budget"
            value={settings.budget_day ?? NO_LIMIT}
            options={budgetOptions(DAY_BUDGETS, settings.budget_day)}
            onChange={(v) => onSettings({ budget_day: v === NO_LIMIT ? null : v })}
            disabled={off}
          />
        </SettingRow>
        <SettingRow title="Monthly budget" className="srow--last">
          <PillSelect<number>
            label="Monthly budget"
            value={settings.budget_month ?? NO_LIMIT}
            options={budgetOptions(MONTH_BUDGETS, settings.budget_month)}
            onChange={(v) => onSettings({ budget_month: v === NO_LIMIT ? null : v })}
            disabled={off}
          />
        </SettingRow>
        {usage ? (
          <p className={`srow__note num ${usage.reached ? 'is-warn' : ''}`}>
            <IconGauge size={14} />
            {usage.reached ? `Budget used up · ${usageLine(usage, settings)}` : usageLine(usage, settings)}
          </p>
        ) : null}
        <NavRow title="Search process" icon={<IconInfo size={18} />} onClick={() => setHow(true)} />
      </Group>
      {settingsState.missing ? (
        <GroupNote tone="warn">
          Needs the latest <code className="code">supabase/schema.sql</code>
        </GroupNote>
      ) : settingsState.error ? (
        <GroupNote tone="warn">{settingsState.error}</GroupNote>
      ) : null}

      {props.tasks ?? <TasksCard now={now} />}

      <Group title="Activity" icon={<IconActivity size={15} />} tone="sky" bare>
        <div className="card stats">
          <Stat label="Found" value={agent?.jobs_found ?? 0} id="agent-found" hint="Postings the agent has seen" />
          <Stat label="Scored" value={agent?.jobs_scored ?? 0} id="agent-scored" hint="Jobs scored against your resume" />
          <Stat label="Sent" value={sent} id="apps-sent" hint="Applications sent to employers" />
          <Stat label="New last check" value={agent?.fetched_new ?? 0} id="agent-new" hint="New jobs the last check found" />
        </div>
      </Group>

      <Group title="Log" icon={<IconTerminal size={15} />} tone="sand">
        {lines.length === 0 ? (
          <p className="empty-line">No log lines yet.</p>
        ) : (
          <ol className={`logtail ${online ? '' : 'is-past'}`} aria-live="polite">
            <AnimatePresence initial={false}>
              {lines.map((e, i) => (
                <motion.li key={`${e.at}-${e.message}`} className={i === 0 && online ? 'is-current' : ''} layout="position" {...logItem}>
                  <time className="num">{clock(e.at)}</time>
                  <span className="logtail__state">{stateLabel(e.state)}</span>
                  <span className="logtail__msg">{i === 0 && online && busy ? <Shimmer tone="strong">{e.message}</Shimmer> : e.message}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </Group>

      <Group title="History" icon={<IconClock size={15} />} tone="pine">
        {recent.length === 0 ? (
          <p className="empty-line">No commands yet.</p>
        ) : (
          <div className="listcard">
            <div className="listhead cmd__grid" aria-hidden="true">
              <span className="listhead__col">Type</span>
              <span className="listhead__col">Detail</span>
              <span className="listhead__col">Status</span>
              <span className="listhead__col listhead__col--end">Created</span>
            </div>
            <ul className="dblist__rows">
              <AnimatePresence initial={false}>
                {recent.map((c, i) => {
                  const cancelled = c.status === 'failed' && c.error === CANCELLED;
                  const status = cancelled
                    ? { label: 'Cancelled', color: 'gray' as TagColor }
                    : c.status === 'pending' && !online
                      ? { label: 'Waiting for agent', color: 'gray' as TagColor }
                      : COMMAND_STATUS[c.status];
                  const open = c.status === 'pending' || c.status === 'running';
                  return (
                    <motion.li
                      className="dbrow cmd"
                      key={c.id}
                      layout={i < LAYOUT_CAP ? 'position' : false}
                      variants={riseItem}
                      custom={i}
                      initial="hidden"
                      animate="shown"
                      exit="gone"
                      transition={{ layout: SPRING }}
                    >
                      <div className="cmd__grid">
                        <span className="cmd__kind">{COMMAND_KIND[c.kind] ?? c.kind}</span>
                        <span className="cmd__what">
                          {c.kind === 'apply'
                            ? plural(c.job_ids.length, 'job')
                            : c.kind === 'cover_letter'
                              ? plural(c.job_ids.length, 'letter')
                              : c.kind === 'resume'
                                ? 'Read resume'
                                : c.kind === 'linkedin'
                                  ? 'Read LinkedIn profile'
                                  : c.kind === 'calendar_add'
                                    ? 'Add an event'
                                    : 'More jobs'}
                          {c.kind === 'apply' ? c.dry_run ? <Tag color="yellow">Dry run</Tag> : <Tag color="red">Live</Tag> : null}
                        </span>
                        <span>
                          <span className={`tag tag--${status.color} tag--status ${c.status === 'running' ? 'is-live' : ''}`}>
                            <span className="tag__dot" aria-hidden="true" />
                            <Swap id={`${status.label}`}>{status.label}</Swap>
                          </span>
                          {open && props.onCancel ? (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm cmd__cancel"
                              onClick={() => props.onCancel?.(c.id)}
                              title={c.status === 'running' ? 'Stops after the job in progress' : 'Take it out of the queue'}
                            >
                              Cancel
                            </button>
                          ) : null}
                        </span>
                        <time className="cmd__time num">{timeAgo(c.created_at, now)}</time>
                      </div>
                      {c.status === 'failed' && c.error && !cancelled ? <p className="cmd__error">{c.error}</p> : null}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>
        )}
      </Group>

      <HowItWorks open={how} onClose={() => setHow(false)} limit={settings.fetch_limit} />
    </div>
  );
}
