// Tasks for Claude Code or Codex, typed on the dashboard and run on the person's computer by the task runner
// (src/agent_automation/ui/tasks.py), on their own Claude or ChatGPT plan. No API key of the agent is used. These are the
// pieces the Automation page is made of: the composer, a task's row, the list, and the data.
import { useCallback, useState, type FormEvent } from 'react';
import { supabase, TABLES } from '../../lib/supabase';
import { timeAgo } from '../../lib/format';
import { useLiveTable } from '../../hooks/useLiveTable';
import { BrandLogo } from '../BrandLogo';
import { IconPlay, IconX } from '../Icons';
import { EnginePicker, type EngineOption } from './EnginePicker';
import { TaskTimeline, type Engine, type TaskRow } from './TaskTimeline';
import './tasks.css';

const ENGINE_LABEL: Record<Engine, string> = { claude: 'Claude Code', codex: 'Codex' };
const ENGINES: EngineOption<Engine>[] = [
  { value: 'claude', brand: 'claude', name: 'Claude Code', note: 'Claude plan' },
  { value: 'codex', brand: 'openai', name: 'Codex', note: 'ChatGPT plan' },
];
const STATUS_LABEL: Record<string, string> = { pending: 'Queued', running: 'Running', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' };
// A short chip, and the task it types.
const PRESETS = [
  { label: 'New internships', prompt: 'Fetch new internship jobs, score them against my resume and add them to the dashboard' },
  { label: 'Interview prep', prompt: 'Prepare me for my next interview on the calendar: likely questions and short answers' },
  { label: 'Missing skills', prompt: 'Which skills do my top 20 jobs ask for that my resume does not show?' },
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

/** Adds a task for the runner on the person's computer; resolves to an error message, or '' when it was added. */
export async function addTask(engine: Engine, prompt: string): Promise<string> {
  const { error } = await supabase.from(TABLES.tasks).insert({ engine, prompt });
  return error ? error.message : '';
}

export async function cancelTask(id: number) {
  await supabase.from(TABLES.tasks).update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', id).in('status', ['pending', 'running']);
}

/** Pick the AI, say what to do, run it. */
export function TaskComposer({ onRun, disabled = '' }: { onRun: (engine: Engine, prompt: string) => Promise<string>; disabled?: string }) {
  const [prompt, setPrompt] = useState('');
  const [engine, setEngine] = useState<Engine>(lastEngine);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || disabled) return;
    setBusy(true);
    setProblem('');
    const error = await onRun(engine, text);
    setBusy(false);
    if (error) setProblem(error);
    else setPrompt('');
  }

  return (
    <form className="tasks__form" onSubmit={submit}>
      <EnginePicker
        label="Engine"
        value={engine}
        options={ENGINES}
        onChange={(value) => {
          setEngine(value);
          keepEngine(value);
        }}
      />
      <textarea
        id="task-prompt"
        className="input tasks__input"
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="What should it do?"
        aria-label="Task"
      />
      <div className="tasks__presets">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="tasks__preset" onClick={() => setPrompt(p.prompt)} title={p.prompt}>
            {p.label}
          </button>
        ))}
      </div>
      <button type="submit" className="btn btn--primary tasks__run" disabled={busy || !prompt.trim() || Boolean(disabled)} title={disabled || undefined}>
        <IconPlay size={13} />
        Run on this PC
      </button>
      {problem ? <p className="tasks__error">{problem}</p> : null}
    </form>
  );
}

function TaskItem({ task, now, onCancel }: { task: TaskRow; now: number; onCancel: (id: number) => void }) {
  const live = task.status === 'pending' || task.status === 'running';
  const engine = task.engine === 'codex' ? 'codex' : 'claude';
  return (
    <li className={`task task--${task.status}`}>
      <div className="task__head">
        <span className={`task__status task__status--${task.status}`}>{STATUS_LABEL[task.status] ?? task.status}</span>
        <span className="task__engine">
          <BrandLogo brand={engine === 'codex' ? 'openai' : 'claude'} size={13} />
          {ENGINE_LABEL[engine]}
        </span>
        <span className="task__time num">{timeAgo(task.created_at, now)}</span>
        {live ? (
          <button type="button" className="btn btn--ghost btn--sm task__cancel" onClick={() => onCancel(task.id)}>
            <IconX size={13} />
            Cancel
          </button>
        ) : null}
      </div>
      <p className="task__prompt">{task.prompt}</p>
      <TaskTimeline task={task} now={now} />
    </li>
  );
}

/** The runs, newest first, each with its timeline. */
export function TaskList({ tasks, now, onCancel }: { tasks: TaskRow[]; now: number; onCancel: (id: number) => void }) {
  const sorted = [...tasks].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return (
    <ul className="tasks__list">
      {sorted.map((task) => (
        <TaskItem key={task.id} task={task} now={now} onCancel={onCancel} />
      ))}
    </ul>
  );
}
