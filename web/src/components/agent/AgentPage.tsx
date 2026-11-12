import type { ComponentType, ReactNode, SVGProps } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { AgentRow, CommandRow, JobRow, LiveStatus, LoadError } from '../../lib/types';
import { LAYOUT_CAP, SPRING, riseItem } from '../../lib/motion';
import { AnimatedNumber, Swap } from '../motion';
import { clock, plural, stateLabel, timeAgo, type TagColor } from '../../lib/format';
import { Callout, Tag } from '../common';
import { IconActivity, IconAlert, IconBriefcase, IconClock, IconFile, IconHash, IconRadar, IconSearch, IconSend, IconSpark, IconTerminal } from '../Icons';
import { StatusDot } from '../shell/StatusControls';
import { CurrentJob, StartHint, agentTone, logItem, type LogEntry } from './live';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const COMMAND_KIND: Record<string, string> = { apply: 'Apply', search: 'Search', cover_letter: 'Letters' };

const COMMAND_STATUS: Record<CommandRow['status'], { label: string; color: TagColor }> = {
  pending: { label: 'Waiting', color: 'gray' },
  running: { label: 'Running', color: 'blue' },
  done: { label: 'Done', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
};

const LIVE_WORD: Record<LiveStatus, string> = { live: 'Connected', down: 'Reconnecting', connecting: 'Connecting' };

interface AgentPageProps {
  agent: AgentRow | null;
  online: boolean;
  loading: boolean;
  error: LoadError | null;
  onRetry: () => void;
  now: number;
  tail: LogEntry[];
  commands: CommandRow[];
  live: LiveStatus;
  sent: number;
  /** The job being filled right now, if any. */
  current: JobRow | null;
}

/** One property row, like a Notion page property: an icon and a name, then the value. */
function Prop({ icon: Icon, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  return (
    <div className="prop">
      <dt className="prop__name">
        <Icon size={15} />
        {label}
      </dt>
      <dd className="prop__value">{children}</dd>
    </div>
  );
}

export function AgentPage({ agent, online, loading, error, onRetry, now, tail, commands, live, sent, current }: AgentPageProps) {
  const state = online ? agent?.state ?? 'idle' : 'offline';
  const tone = agentTone(online, state);
  const word = loading ? 'Connecting' : stateLabel(state);
  const lines = [...tail].reverse();
  const recent = [...commands].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 10);

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
      {!online && !loading ? (
        <Callout tone="gray" icon={<IconTerminal size={16} />}>
          <span className="callout__line">
            Start the agent: <StartHint />
          </span>
        </Callout>
      ) : null}

      <dl className="props">
        <Prop icon={IconActivity} label="State">
          <span className="propstate">
            <StatusDot tone={loading ? 'off' : tone} />
            <Swap id={word}>{word}</Swap>
          </span>
        </Prop>
        <Prop icon={IconClock} label="Last seen">
          {agent?.last_seen ? timeAgo(agent.last_seen, now) : <span className="muted">Never</span>}
        </Prop>
        {online && current ? (
          <Prop icon={IconBriefcase} label="Current job">
            <CurrentJob job={current} />
          </Prop>
        ) : null}
        <Prop icon={IconFile} label="Resume">
          {agent?.resume_name || <span className="muted">Not loaded</span>}
        </Prop>
        <Prop icon={IconSpark} label="Model">
          {agent?.model || <span className="muted">Unknown</span>}
        </Prop>
        <Prop icon={IconSearch} label="Found">
          <AnimatedNumber className="num" id="agent-found" value={agent?.jobs_found ?? 0} />
        </Prop>
        <Prop icon={IconHash} label="Scored">
          <AnimatedNumber className="num" id="agent-scored" value={agent?.jobs_scored ?? 0} />
        </Prop>
        <Prop icon={IconSend} label="Sent">
          <AnimatedNumber className="num" id="apps-sent" value={sent} />
        </Prop>
        <Prop icon={IconRadar} label="Realtime">
          <span className={`live-${live}`}>
            <Swap id={live}>{LIVE_WORD[live]}</Swap>
          </span>
        </Prop>
      </dl>

      <section className="section" aria-labelledby="log-title">
        <h2 id="log-title" className="section__label">
          Log
        </h2>
        {lines.length === 0 ? (
          <p className="empty-line">No log lines yet.</p>
        ) : (
          <ol className={`logtail code ${online ? '' : 'is-past'}`} aria-live="polite">
            <AnimatePresence initial={false}>
              {lines.map((e, i) => (
                <motion.li key={`${e.at}-${e.message}`} className={i === 0 && online ? 'is-current' : ''} layout="position" {...logItem}>
                  <time>{clock(e.at)}</time>
                  <span className="logtail__state">{e.state}</span>
                  <span className="logtail__msg">{e.message}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </section>

      <section className="section" aria-labelledby="cmds-title">
        <h2 id="cmds-title" className="section__label">
          Commands
        </h2>
        {recent.length === 0 ? (
          <p className="empty-line">No commands yet.</p>
        ) : (
          <div className="dblist">
            <div className="dblist__head cmd__grid" aria-hidden="true">
              <span className="dblist__col">Type</span>
              <span className="dblist__col">Detail</span>
              <span className="dblist__col">Status</span>
              <span className="dblist__col dblist__col--end">Created</span>
            </div>
            <ul className="dblist__rows">
              <AnimatePresence initial={false}>
                {recent.map((c, i) => {
                  const status = c.status === 'pending' && !online ? { label: 'Waiting for agent', color: 'gray' as TagColor } : COMMAND_STATUS[c.status];
                  return (
                    <motion.li
                      className="dbrow cmd"
                      key={c.id}
                      layout={i < LAYOUT_CAP ? 'position' : false}
                      variants={riseItem}
                      custom={0}
                      initial="hidden"
                      animate="shown"
                      exit="gone"
                      transition={{ layout: SPRING }}
                    >
                      <div className="cmd__grid">
                        <span className="cmd__kind">{COMMAND_KIND[c.kind] ?? c.kind}</span>
                        <span className="cmd__what">
                          {c.kind === 'apply' ? plural(c.job_ids.length, 'job') : c.kind === 'cover_letter' ? plural(c.job_ids.length, 'letter') : 'More jobs'}
                          {c.kind === 'apply' ? c.dry_run ? <Tag color="blue">Dry run</Tag> : <Tag color="red">Live</Tag> : null}
                        </span>
                        <span>
                          <span className={`tag tag--${status.color} tag--status ${c.status === 'running' ? 'is-live' : ''}`}>
                            <span className="tag__dot" aria-hidden="true" />
                            <Swap id={`${status.label}`}>{status.label}</Swap>
                          </span>
                        </span>
                        <time className="cmd__time num">{timeAgo(c.created_at, now)}</time>
                      </div>
                      {c.status === 'failed' && c.error ? <p className="cmd__error">{c.error}</p> : null}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
