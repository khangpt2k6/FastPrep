// Tasks for Claude Code or Codex, typed on the dashboard and run on the person's computer by the task runner
// (src/agent_automation/ui/tasks.py), on their own Claude or ChatGPT plan. No API key of the agent is used. These are the
// pieces the Automation page is made of: the data, the composer docked under the transcript, and the transcript itself.
import { useCallback, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { supabase, TABLES } from '../../lib/supabase';
import { timeAgo } from '../../lib/format';
import { EASE_OUT, SPRING } from '../../lib/motion';
import { useLiveTable } from '../../hooks/useLiveTable';
import { BrandLogo, type Brand } from '../BrandLogo';
import { IconAlert, IconArrowRight, IconBriefcase, IconCalendar, IconTarget } from '../Icons';
import type { ModelCatalog } from '../../lib/types';
import { ModelPicker, modelLabel, modelsOf } from './ModelPicker';
import { TaskTimeline, type Engine, type TaskRow } from './TaskTimeline';
import './tasks.css';

const ENGINES: { value: Engine; brand: Brand; name: string; plan: string }[] = [
  { value: 'claude', brand: 'claude', name: 'Claude Code', plan: 'Claude plan' },
  { value: 'codex', brand: 'openai', name: 'Codex', plan: 'ChatGPT plan' },
];

/** Tasks to start from: a short label with its icon and tint, and the task it types. */
export const PRESETS = [
  { label: 'New internships', Icon: IconBriefcase, tone: 'ember', prompt: 'Fetch new internship jobs, score them against my resume and add them to the dashboard' },
  { label: 'Interview prep', Icon: IconCalendar, tone: 'sky', prompt: 'Prepare me for my next interview on the calendar: likely questions and short answers' },
  { label: 'Missing skills', Icon: IconTarget, tone: 'pine', prompt: 'Which skills do my top 20 jobs ask for that my resume does not show?' },
];

// The engine picked last, kept in this browser so the next task starts with it.
const ENGINE_KEY = 'tasks:engine';

function lastEngine(): Engine {
  try {
    return window.localStorage.getItem(ENGINE_KEY) === 'codex' ? 'codex' : 'claude';
  } catch {
    return 'claude';
  }
}

function keepEngine(engine: Engine) {
  try {
    window.localStorage.setItem(ENGINE_KEY, engine);
  } catch {
    // A browser that keeps nothing: the choice holds until the page reloads.
  }
}

/** The person's tasks, newest first, live. */
export function useTasks(userId: string) {
  // Every column: `events` is there only once the database has it, and naming it would fail the load before then.
  const load = useCallback(
    () => supabase.from(TABLES.tasks).select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20).returns<TaskRow[]>(),
    [userId],
  );
  return useLiveTable<TaskRow>({ table: TABLES.tasks, userId, load, keyOf: (row) => (row.id === undefined ? undefined : String(row.id)), pollMs: 5000 });
}

/** Adds a task for the runner on the person's computer; resolves to an error message, or '' when it was added. The
 * model and the effort go only when picked, so a database without their columns still takes a plain task. */
export async function addTask(engine: Engine, prompt: string, model = '', effort = ''): Promise<string> {
  const { error } = await supabase.from(TABLES.tasks).insert({ engine, prompt, ...(model ? { model } : {}), ...(effort ? { effort } : {}) });
  return error ? error.message : '';
}

/** The model and effort picked last for each engine, kept in this browser. */
function lastPick(engine: Engine): { model: string; effort: string } {
  try {
    return { model: window.localStorage.getItem(`tasks:model:${engine}`) ?? '', effort: window.localStorage.getItem(`tasks:effort:${engine}`) ?? '' };
  } catch {
    return { model: '', effort: '' };
  }
}

function keepPick(engine: Engine, model: string, effort: string) {
  try {
    window.localStorage.setItem(`tasks:model:${engine}`, model);
    window.localStorage.setItem(`tasks:effort:${engine}`, effort);
  } catch {
    // Kept until the page reloads.
  }
}

export async function cancelTask(id: number) {
  await supabase.from(TABLES.tasks).update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', id).in('status', ['pending', 'running']);
}

/** Claude Code or Codex: a logo and a name each, the one in use filled with its tint. */
function EngineSwitch({ value, onChange }: { value: Engine; onChange: (engine: Engine) => void }) {
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = value === 'claude' ? 'codex' : 'claude';
    onChange(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-engine="${next}"]`)?.focus();
  };
  return (
    <div className="eswitch" role="radiogroup" aria-label="Engine" onKeyDown={step}>
      {ENGINES.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-engine={option.value}
            className={`eswitch__btn eswitch__btn--${option.value} ${on ? 'is-on' : ''}`}
            onClick={() => onChange(option.value)}
            title={`${option.name}, on your ${option.plan}`}
          >
            {on ? <motion.span layoutId="eswitch-pill" className="eswitch__pill" transition={SPRING} /> : null}
            <BrandLogo brand={option.brand} size={14} />
            <span className="eswitch__name">{option.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The presets as small chips, for the end of the transcript, over the composer. */
export function PresetChips({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <motion.div
      className="qchips"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      {PRESETS.map((preset) => (
        <button key={preset.label} type="button" className="qchip" onClick={() => onPick(preset.prompt)} title={preset.prompt}>
          <span className={`qchip__icon qchip__icon--${preset.tone}`} aria-hidden="true">
            <preset.Icon size={13} />
          </span>
          {preset.label}
        </button>
      ))}
    </motion.div>
  );
}

// The box grows with what is typed, one line to eight, then scrolls.
const LINE = 22;
const MAX_LINES = 8;
const PAD = 12;

/** Say what to do, pick the engine and the model, send it to this PC. Enter sends, Shift+Enter adds a line. */
export function TaskComposer({ onRun, disabled = '', catalog, value, onChange, inputRef }: {
  onRun: (engine: Engine, prompt: string, model: string, effort: string) => Promise<string>;
  /** Why a run cannot go now ("This PC is offline"); '' when it can. */
  disabled?: string;
  catalog?: ModelCatalog | null;
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLTextAreaElement>;
}) {
  const own = useRef<HTMLTextAreaElement>(null);
  const input = inputRef ?? own;
  const [engine, setEngine] = useState<Engine>(lastEngine);
  const [pick, setPick] = useState(() => lastPick(lastEngine()));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const text = value.trim();
  const blocked = Boolean(disabled);

  useLayoutEffect(() => {
    const box = input.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, LINE * MAX_LINES + PAD)}px`;
  }, [value, input]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!text || busy || blocked) return;
    setBusy(true);
    setProblem('');
    const error = await onRun(engine, text, pick.model, pick.effort);
    setBusy(false);
    if (error) setProblem(error);
    else onChange('');
  }

  function keys(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div className="composer">
      <form className="composer__box" onSubmit={submit}>
        <textarea
          ref={input}
          className="composer__input"
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={keys}
          placeholder="Describe a task"
          aria-label="Task"
        />
        <div className="composer__bar">
          <EngineSwitch
            value={engine}
            onChange={(next) => {
              setEngine(next);
              keepEngine(next);
              setPick(lastPick(next));
            }}
          />
          <span className="composer__model">
            <ModelPicker
              engine={engine}
              catalog={catalog}
              model={pick.model}
              effort={pick.effort}
              compact
              onChange={(model, effort) => {
                setPick({ model, effort });
                keepPick(engine, model, effort);
              }}
            />
          </span>
          <span className="composer__space" />
          {blocked ? (
            <span className="composer__offline" title={disabled}>
              <span className="composer__offdot" aria-hidden="true" />
              {disabled}
            </span>
          ) : null}
          <button
            type="submit"
            className={`composer__send ${busy ? 'is-busy' : ''}`}
            disabled={busy || !text || blocked}
            title="Run on this PC"
            aria-label="Run on this PC"
          >
            {busy ? <span className="spinner" aria-hidden="true" /> : <IconArrowRight size={17} />}
          </button>
        </div>
      </form>
      {problem ? (
        <p className="composer__error" role="alert">
          <IconAlert size={14} />
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/** Oldest first, the way a chat reads: the newest run sits over the composer. */
export const byTime = (a: TaskRow, b: TaskRow) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id;

function TaskItem({ task, now, onCancel, catalog, online }: {
  task: TaskRow;
  now: number;
  onCancel: (id: number) => void;
  catalog?: ModelCatalog | null;
  online: boolean;
}) {
  const engine: Engine = task.engine === 'codex' ? 'codex' : 'claude';
  const model = task.model || task.effort ? modelLabel(modelsOf(engine, catalog), task.model ?? '', task.effort ?? '') : '';
  const when = Date.parse(task.created_at);
  return (
    <motion.li
      className="xchg"
      data-id={task.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <div className="xchg__ask">
        <p className="xchg__bubble">{task.prompt}</p>
        <time className="xchg__when num" dateTime={task.created_at} title={Number.isFinite(when) ? new Date(when).toLocaleString() : undefined}>
          {timeAgo(task.created_at, now)}
        </time>
      </div>
      <TaskTimeline task={task} now={now} model={model} onCancel={onCancel} online={online} />
    </motion.li>
  );
}

/** The runs as a transcript: each prompt on the right, the reply under it on the left. */
export function TaskList({ tasks, now, onCancel, catalog, online = true }: {
  tasks: TaskRow[];
  now: number;
  onCancel: (id: number) => void;
  catalog?: ModelCatalog | null;
  online?: boolean;
}) {
  const sorted = [...tasks].sort(byTime);
  return (
    <ol className="xlog" aria-label="Runs">
      <AnimatePresence initial={false}>
        {sorted.map((task) => (
          <TaskItem key={task.id} task={task} now={now} onCancel={onCancel} catalog={catalog} online={online} />
        ))}
      </AnimatePresence>
    </ol>
  );
}
