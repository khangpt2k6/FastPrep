// Tasks for Claude Code or Codex, typed here and run on the person's computer by the task runner
// (src/agent_automation/ui/tasks.py), on their own Claude or ChatGPT plan. No API key of the agent is used.
import { useCallback, useState, type FormEvent } from 'react';
import { supabase, TABLES } from '../../lib/supabase';
import { timeAgo } from '../../lib/format';
import { useLiveTable } from '../../hooks/useLiveTable';
import { useUserId } from '../../hooks/useDocuments';
import { Group } from '../settings';
import { Shimmer } from '../motion';
import { IconBot, IconPlay, IconX } from '../Icons';
import './tasks.css';

type Engine = 'claude' | 'codex';
type TaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

interface TaskRow {
  id: number;
  engine: Engine;
  prompt: string;
  status: TaskStatus | string;
  output: string;
  step: string;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const ENGINE_LABEL: Record<Engine, string> = { claude: 'Claude Code', codex: 'Codex' };
const STATUS_LABEL: Record<string, string> = { pending: 'Queued', running: 'Running', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' };
const PRESETS = [
  'Fetch new internship jobs, score them against my resume and add them to the dashboard',
  'Prepare me for my next interview on the calendar: likely questions and short answers',
  'Which skills do my top 20 jobs ask for that my resume does not show?',
];

function useTasks(userId: string) {
  const load = useCallback(
    () =>
      supabase
        .from(TABLES.tasks)
        .select('id,engine,prompt,status,output,step,error,created_at,started_at,finished_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(15)
        .returns<TaskRow[]>(),
    [userId],
  );
  return useLiveTable<TaskRow>({ table: TABLES.tasks, userId, load, keyOf: (row) => (row.id === undefined ? undefined : String(row.id)), pollMs: 5000 });
}

function TaskItem({ task, now }: { task: TaskRow; now: number }) {
  const [open, setOpen] = useState(task.status === 'running');
  const live = task.status === 'pending' || task.status === 'running';
  async function cancel() {
    await supabase.from(TABLES.tasks).update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', task.id).in('status', ['pending', 'running']);
  }
  return (
    <li className={`task task--${task.status}`}>
      <div className="task__head">
        <span className={`task__status task__status--${task.status}`}>{STATUS_LABEL[task.status] ?? task.status}</span>
        <span className="task__engine">{ENGINE_LABEL[task.engine as Engine] ?? task.engine}</span>
        <span className="task__time num">{timeAgo(task.created_at, now)}</span>
        {live ? (
          <button type="button" className="btn btn--ghost btn--sm task__cancel" onClick={cancel}>
            <IconX size={13} />
            Cancel
          </button>
        ) : null}
      </div>
      <button type="button" className="task__prompt" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {task.prompt}
      </button>
      {task.status === 'running' && task.step ? (
        <p className="task__step">
          <Shimmer>{task.step}</Shimmer>
        </p>
      ) : null}
      {task.status === 'pending' ? <p className="task__step">Waiting for the task runner on your computer</p> : null}
      {open && (task.output || task.error) ? (
        <div className="task__body">
          {task.output ? <pre className="task__output">{task.output}</pre> : null}
          {task.error && task.status === 'failed' ? <p className="task__error">{task.error}</p> : null}
          {task.status !== 'running' && task.step ? <p className="task__meta num">{task.step}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

/** Type a task, pick the engine, and watch it run on your computer. */
export function TasksCard({ now }: { now: number }) {
  const userId = useUserId();
  const { rows, error } = useTasks(userId);
  const [prompt, setPrompt] = useState('');
  const [engine, setEngine] = useState<Engine>('claude');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const missing = error?.kind === 'missing-table';
  const tasks = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    setBusy(true);
    setProblem('');
    if (!userId) return;
    const { error: insertError } = await supabase.from(TABLES.tasks).insert({ engine, prompt: text });
    setBusy(false);
    if (insertError) setProblem(insertError.message);
    else setPrompt('');
  }

  return (
    <Group title="Tasks" icon={<IconBot size={15} />} tone="plum">
      {missing ? (
        <p className="tasks__note">Needs the latest supabase/schema.sql.</p>
      ) : (
        <form className="tasks__form" onSubmit={submit}>
          <textarea
            id="task-prompt"
            className="input tasks__input"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Fetch new AI intern jobs in Florida and add them to the dashboard"
            aria-label="Task"
          />
          <div className="tasks__presets">
            {PRESETS.map((p) => (
              <button key={p} type="button" className="tasks__preset" onClick={() => setPrompt(p)}>
                {p}
              </button>
            ))}
          </div>
          <div className="tasks__bar">
            <div className="tasks__engines" role="radiogroup" aria-label="Engine">
              {(['claude', 'codex'] as Engine[]).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={engine === value} className={`tasks__engine ${engine === value ? 'is-on' : ''}`} onClick={() => setEngine(value)}>
                  {ENGINE_LABEL[value]}
                </button>
              ))}
            </div>
            <span className="tasks__hint">Runs on your computer, on your own plan</span>
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !prompt.trim()}>
              <IconPlay size={13} />
              Run
            </button>
          </div>
          {problem ? <p className="tasks__error">{problem}</p> : null}
        </form>
      )}
      {tasks.length > 0 ? (
        <ul className="tasks__list">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} now={now} />
          ))}
        </ul>
      ) : null}
    </Group>
  );
}
