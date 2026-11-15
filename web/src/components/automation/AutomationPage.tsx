// The Automation page: a chat with this PC. A task typed here runs on the person's own computer with Claude Code or Codex,
// on their own plan, and comes back step by step, then with its answer. Oldest run at the top, newest at the bottom, over
// a composer that stays docked under the transcript.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useUserId } from '../../hooks/useDocuments';
import { IconAlert, IconArrowRight, IconInfo } from '../Icons';
import { Wolf } from '../mascot/Wolf';
import { GuideDialog } from '../guide/GuideDialog';
import { PRESETS, PresetChips, TaskComposer, TaskList, addTask, byTime, cancelTask, useTasks } from '../agent/TasksCard';
import type { Engine, TaskRow } from '../agent/TaskTimeline';
import type { ModelCatalog } from '../../lib/types';
import './automation.css';

export interface AutomationViewProps {
  tasks: TaskRow[];
  /** The tasks table is not in the database yet. */
  missing?: boolean;
  /** The runs are still on their way. */
  loading?: boolean;
  /** Why the runs did not load, when they did not. */
  error?: string;
  now: number;
  /** Whether the agent on the person's computer is online: tasks run there. */
  online: boolean;
  /** The models this computer's engines offer. */
  catalog?: ModelCatalog | null;
  onRun: (engine: Engine, prompt: string, model: string, effort: string) => Promise<string>;
  onCancel: (id: number) => void;
}

/**
 * Keeps the newest run in view the way a chat does: at the bottom when the page opens, scrolled to when a new run
 * comes in, and followed as it works while the reader is already near the bottom.
 */
function useFollow(tasks: TaskRow[]) {
  const last = tasks.length ? [...tasks].sort(byTime)[tasks.length - 1] : null;
  const mark = last ? `${last.id}:${last.status}:${last.events?.length ?? 0}:${last.output ? 1 : 0}` : '';
  const seen = useRef<number | null>(null);
  const near = useRef(true);

  useEffect(() => {
    const measure = () => {
      const page = document.documentElement;
      near.current = page.scrollHeight - (window.scrollY + window.innerHeight) < 220;
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    return () => window.removeEventListener('scroll', measure);
  }, []);

  useEffect(() => {
    if (!last) return;
    const first = seen.current === null;
    const fresh = !first && seen.current !== last.id;
    if (!first && !fresh && !near.current) {
      seen.current = last.id;
      return;
    }
    const still = first || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // After the frame, once the new rows have their height. The run counts as seen only once the page has moved to it.
    const frame = window.requestAnimationFrame(() => {
      seen.current = last.id;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: still ? 'auto' : 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
    // The mark says what changed at the end of the transcript; nothing else is a reason to move.
  }, [mark]);
}

/** No runs yet: the wolf at its laptop and three tasks to start from. */
function Hero({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="auto__hero">
      <Wolf mood="laptop" size={120} motion="idle" eager className="auto__wolf" />
      <h2 className="auto__herotitle">New run</h2>
      <ul className="auto__presets">
        {PRESETS.map((preset, i) => (
          <li key={preset.label} style={{ animationDelay: `${120 + i * 60}ms` }}>
            <button type="button" className="preset" onClick={() => onPick(preset.prompt)} title={preset.prompt}>
              <span className={`ibadge ibadge--${preset.tone} ibadge--lg`} aria-hidden="true">
                <preset.Icon size={19} />
              </span>
              <span className="preset__foot">
                <span className="preset__label">{preset.label}</span>
                <IconArrowRight size={15} className="preset__go" />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Runs on their way: two quiet exchanges. */
function Skeleton() {
  return (
    <div className="auto__skel" aria-busy="true" aria-label="Loading runs">
      {[62, 44].map((width, i) => (
        <div className="auto__skelx" key={width} style={{ animationDelay: `${i * 120}ms` }}>
          <span className="skeleton auto__skelask" style={{ width: `${width}%` }} />
          <span className="auto__skelreply">
            <span className="skeleton auto__skelava" />
            <span className="auto__skellines">
              <span className="skeleton skeleton--line" style={{ width: '38%' }} />
              <span className="skeleton auto__skelcard" />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function AutomationView({ tasks, missing = false, loading = false, error = '', now, online, catalog, onRun, onCancel }: AutomationViewProps) {
  const [guide, setGuide] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const runs = useMemo(() => tasks.filter((t) => t && t.id !== undefined), [tasks]);
  useFollow(runs);

  const pick = (prompt: string) => {
    setDraft(prompt);
    input.current?.focus();
  };

  return (
    <div className="page auto">
      <div className="auto__chat">
        <div className="auto__bar">
          <span className={`pcpill ${online ? 'is-on' : ''}`} role="status">
            <span className="pcpill__dot" aria-hidden="true" />
            {online ? 'This PC online' : 'This PC offline'}
          </span>
          <button type="button" className="btn btn--ghost btn--sm auto__guide" onClick={() => setGuide(true)}>
            <IconInfo size={14} />
            Guide
          </button>
        </div>

        {missing ? (
          <p className="auto__note">
            <span className="auto__noteicon" aria-hidden="true">
              <IconAlert size={15} />
            </span>
            Needs the latest supabase/schema.sql.
          </p>
        ) : (
          <>
            <section className="auto__log" aria-label="Transcript">
              {runs.length ? (
                <>
                  <TaskList tasks={runs} now={now} onCancel={onCancel} catalog={catalog} online={online} />
                  <AnimatePresence initial={false}>{draft ? null : <PresetChips key="chips" onPick={pick} />}</AnimatePresence>
                </>
              ) : loading ? (
                <Skeleton />
              ) : error ? (
                <p className="auto__note auto__note--error" title={error}>
                  <span className="auto__noteicon" aria-hidden="true">
                    <IconAlert size={15} />
                  </span>
                  Runs did not load
                </p>
              ) : (
                <Hero onPick={pick} />
              )}
            </section>
            <div className="auto__dock">
              <TaskComposer onRun={onRun} catalog={catalog} disabled={online ? '' : 'This PC is offline'} value={draft} onChange={setDraft} inputRef={input} />
            </div>
          </>
        )}
      </div>
      <GuideDialog open={guide} onClose={() => setGuide(false)} start="automation" />
    </div>
  );
}

/** The page wired to the database. */
export function AutomationPage({ now, online, catalog }: { now: number; online: boolean; catalog?: ModelCatalog | null }) {
  const userId = useUserId();
  const { rows, error, loading } = useTasks(userId);
  return (
    <AutomationView
      tasks={rows}
      missing={error?.kind === 'missing-table'}
      loading={loading || !userId}
      error={error && error.kind !== 'missing-table' ? error.message : ''}
      now={now}
      online={online}
      catalog={catalog}
      onRun={(engine, prompt, model, effort) => (userId ? addTask(engine, prompt, model, effort) : Promise.resolve('Not signed in'))}
      onCancel={(id) => void cancelTask(id)}
    />
  );
}
