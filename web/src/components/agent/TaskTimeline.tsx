// A task's run as the reply in a chat: who ran it (Claude Code or Codex, and the model), how it went, its steps folded
// under one pill ("Worked for 1m 12s · 6 steps"), then the answer in full and the files it made. A step is one short
// line: an icon on a thin thread, a word for what it did and what it did it to ("Ran grep -n ... cover_letter/__init__.py"),
// the whole line in its tooltip and its output one click away. While it runs, the latest steps stay open over a
// shimmering line for the step it is on; once done, they fold.
import { useEffect, useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { EASE_OUT } from '../../lib/motion';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { BrandLogo } from '../BrandLogo';
import { Shimmer } from '../motion';
import { Markdown } from '../Markdown';
import {
  IconActivity,
  IconAlert,
  IconChat,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconDownload,
  IconFile,
  IconGlobe,
  IconPencil,
  IconSearch,
  IconSliders,
  IconSpark,
  IconTerminal,
  IconX,
} from '../Icons';

export type Engine = 'claude' | 'codex';

/** One step of a run, as the task runner writes it: what kind, one line (flattened, at most 300 characters), and
 * sometimes more (a command's output, or the whole text when the line was cut). A "file" is a file the run made: its
 * name, and its path in the bucket. */
export interface TaskEvent {
  kind: string;
  text: string;
  detail?: string;
  at?: string;
}

export interface TaskRow {
  id: number;
  engine: Engine | string;
  prompt: string;
  status: string;
  output: string;
  step: string;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  /** The steps, once the runner writes them; absent on an older database. */
  events?: TaskEvent[] | null;
  /** The model and effort picked for the run: empty for the engine's own, absent on an older database. */
  model?: string | null;
  effort?: string | null;
}

export const ENGINE_NAME: Record<Engine, string> = { claude: 'Claude Code', codex: 'Codex' };

/** "12s", "1m 12s", "1h 3m". */
export function took(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** The answer in an older runner's plain log: Codex repeats its last message after "tokens used" and the count. */
export function answerOf(output: string): string {
  const text = output.trim();
  const match = /(?:^|\n)tokens used\s*\n[\d,.]+\s*\n([\s\S]+)$/i.exec(text);
  return (match ? match[1] : text).trim();
}

const flat = (text: string) => text.replace(/\s+/g, ' ').trim();
const cut = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const same = (a: string, b: string) => flat(a).slice(0, 100) === flat(b).slice(0, 100);

/** Markdown marks off a line that shows as plain text: bold, italics, code and links keep only their words. */
const plain = (text: string) =>
  text
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1');

/** A path by its last two parts: "cover_letter/__init__.py". */
export function shortPath(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.length > 2 ? parts.slice(-2).join('/') : parts.join('/') || path;
}

// A path worth shortening in a command: a whole one from the drive or the root, or one four folders deep. A short
// relative path (".venv/Scripts/python.exe") already reads well as it is.
const pathLike = (text: string) => {
  if (text.includes('://')) return false;
  const parts = text.split(/[\\/]+/).filter(Boolean).length;
  return parts >= (/^(?:[A-Za-z]:)?[\\/]/.test(text) ? 3 : 4);
};

// A leading "cd <folder> &&" or "cd <folder>;": every command runs in the repository anyway.
const CD = /^\s*(?:cd|pushd|set-location)\s+(?:\/d\s+)?(?:"[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:&&|;)\s*/i;
// A path in quotes, or a bare one with two or more slashes in it.
const QUOTED = /(["'])([^"'\n]*[\\/][^"'\n]*)\1/g;
const BARE = /(^|[\s=(])((?:[A-Za-z]:)?(?:[^\s"'|&;<>()]*[\\/]){2,}[^\s"'|&;<>()]*)/g;

/** A shell command the way a person reads it: no "cd" into the repository first, and paths by their last two parts. */
export function shortCommand(command: string): string {
  let text = flat(command);
  while (CD.test(text)) text = text.replace(CD, '');
  text = text.replace(QUOTED, (whole, quote: string, inner: string) => {
    if (!pathLike(inner)) return whole;
    const short = shortPath(inner);
    return /\s/.test(short) ? `${quote}${short}${quote}` : short;
  });
  return text.replace(BARE, (whole, lead: string, path: string) => (pathLike(path) ? `${lead}${shortPath(path)}` : whole));
}

/** A page by its site and the end of its path: "stripe.com/jobs/listing". */
function shortUrl(text: string): string {
  try {
    const url = new URL(text);
    const parts = url.pathname.split('/').filter(Boolean);
    return `${url.host.replace(/^www\./, '')}${parts.length ? `/${parts.slice(-2).join('/')}` : ''}`;
  } catch {
    return text;
  }
}

type Tone = 'plum' | 'mist' | 'ink' | 'sky' | 'ember' | 'pine' | 'sand' | 'rose';

/** A step as the page draws it. */
interface StepView {
  tone: Tone;
  icon: ReactNode;
  /** What it did, said short: "Ran", and "Running" while it does. Empty for thoughts, messages and errors. */
  label: string;
  now: string;
  /** What it did it to, short: a command, a path, a pattern, a page. */
  target: string;
  /** Thoughts, messages and errors are a line of text instead of a target. */
  text: string;
  /** The whole line, for the tooltip, and over the output when the target had to be shortened. */
  full: string;
  /** What opens under the row: the output, or the whole text of a long line. */
  more: string;
  /** The opened part is output (monospace) rather than prose. */
  code: boolean;
}

const ICON = 13;

function viewOf(event: TaskEvent): StepView {
  const line = flat(event.text);
  const detail = (event.detail ?? '').trim();
  const prose = (tone: Tone, icon: ReactNode, now: string): StepView => ({
    tone,
    icon,
    label: '',
    now,
    target: '',
    text: plain(line),
    full: line,
    more: detail || (line.length > 80 ? event.text.trim() : ''),
    code: false,
  });
  const act = (tone: Tone, icon: ReactNode, label: string, now: string, target: string): StepView => ({
    tone,
    icon,
    label,
    now,
    target: cut(target),
    text: '',
    full: line,
    more: detail,
    code: true,
  });
  switch (event.kind) {
    case 'think':
      return prose('plum', <IconSpark size={ICON} />, 'Thinking');
    case 'say':
      return prose('mist', <IconChat size={ICON} />, 'Writing');
    case 'error':
      return prose('rose', <IconAlert size={ICON} />, 'Stopping');
    case 'run':
      return act('ink', <IconTerminal size={ICON} />, 'Ran', 'Running', shortCommand(line));
    case 'read':
      return act('sky', <IconFile size={ICON} />, 'Read', 'Reading', shortPath(line));
    case 'search':
      return act('sky', <IconSearch size={ICON} />, 'Searched', 'Searching', line);
    case 'edit':
      return act('ember', <IconPencil size={ICON} />, 'Edited', 'Editing', line.split(/\s*,\s*/).map(shortPath).join(', '));
    case 'web':
      return /^https?:\/\//i.test(line)
        ? act('pine', <IconGlobe size={ICON} />, 'Opened', 'Opening', shortUrl(line))
        : act('pine', <IconGlobe size={ICON} />, 'Searched', 'Searching', line);
    default: {
      // Claude Code writes "Name: what it got"; Codex writes "server tool".
      const named = /^([^:\s]+):\s*([\s\S]*)$/.exec(line);
      const words = line.split(' ');
      const name = cut((named ? named[1] : words[words.length - 1]).split('__').pop() || 'Tool', 28);
      return act('sand', <IconSliders size={ICON} />, name, name, named ? named[2] : words.slice(0, -1).join(' '));
    }
  }
}

// The runner's line for the step it is on: a Claude Code tool ("Bash: ls") or a Codex step ("Run: ls").
const STEP_KINDS: Record<string, string> = {
  Bash: 'run',
  Run: 'run',
  Read: 'read',
  Grep: 'search',
  Glob: 'search',
  Edit: 'edit',
  MultiEdit: 'edit',
  Write: 'edit',
  NotebookEdit: 'edit',
  WebSearch: 'web',
  WebFetch: 'web',
  Search: 'web',
};

/** The step a run is on, from the runner's line for it, as a step of its own. "Starting" and the like stay words. */
function stepNow(step: string): TaskEvent | null {
  const text = step.trim();
  if (!text) return null;
  const match = /^([A-Za-z]\w*):\s+([\s\S]+)$/.exec(text);
  if (!match) return { kind: 'think', text };
  const kind = STEP_KINDS[match[1]];
  return kind ? { kind, text: match[2] } : { kind: 'tool', text };
}

/** The time, every second, while a run is live: its clock moves between the data's updates. */
function useClock(live: boolean, now: number): number {
  const [tick, setTick] = useState(now);
  useEffect(() => {
    if (!live) return;
    setTick(Date.now());
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live]);
  return live ? Math.max(now, tick) : now;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // An older browser, or a page without clipboard access: the hidden box way.
    try {
      const box = document.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', '');
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      const done = document.execCommand('copy');
      box.remove();
      return done;
    } catch {
      return false;
    }
  }
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => setDone(false), 1600);
    return () => window.clearTimeout(timer);
  }, [done]);
  return (
    <button
      type="button"
      className={`run__copy ${done ? 'is-done' : ''}`}
      onClick={() => void copyText(text).then(setDone)}
      title={done ? 'Copied' : 'Copy'}
      aria-label={done ? 'Copied' : 'Copy answer'}
    >
      {done ? <IconCheck size={14} /> : <IconCopy size={14} />}
    </button>
  );
}

const STATUS: Record<string, { label: string; icon: ReactNode }> = {
  pending: { label: 'Queued', icon: <IconClock size={12} /> },
  running: { label: 'Running', icon: null },
  done: { label: 'Done', icon: <IconCheck size={12} /> },
  failed: { label: 'Failed', icon: <IconAlert size={12} /> },
  cancelled: { label: 'Cancelled', icon: <IconX size={12} /> },
};

function StatusChip({ status }: { status: string }) {
  const info = STATUS[status];
  if (!info) return <span className="xstat xstat--cancelled">{status}</span>;
  return (
    <span className={`xstat xstat--${status}`}>
      {status === 'running' ? <span className="xstat__dot" aria-hidden="true" /> : info.icon}
      {status === 'running' ? <Shimmer>{info.label}</Shimmer> : info.label}
    </span>
  );
}

/** One step: its icon on the thread, then what it did. A step with more to show opens in place. */
function Step({ view, open, onToggle, now = false }: { view: StepView; open: boolean; onToggle: () => void; now?: boolean }) {
  const reduce = useReducedMotion();
  // The whole line goes over the output only when the row had to shorten it.
  const head = view.code && view.full !== view.target ? view.full : '';
  const more = !now && Boolean(view.more || head);
  const body = (
    <>
      <span className="step__node" aria-hidden="true">
        {now ? null : view.icon}
      </span>
      {view.label ? <span className="step__label">{now ? <Shimmer>{view.now}</Shimmer> : view.label}</span> : null}
      {view.target ? <code className="step__chip">{view.target}</code> : null}
      {view.text ? <span className="step__text">{now ? <Shimmer>{view.text}</Shimmer> : view.text}</span> : null}
      {more ? <IconChevronRight size={14} className={`step__more ${open ? 'is-open' : ''}`} /> : null}
    </>
  );
  return (
    <>
      {more ? (
        <button type="button" className="step__row" onClick={onToggle} aria-expanded={open} title={view.full}>
          {body}
        </button>
      ) : (
        <div className="step__row" title={view.full || undefined}>
          {body}
        </div>
      )}
      <AnimatePresence initial={false}>
        {open && more ? (
          <motion.div
            className="step__fold"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: EASE_OUT }}
          >
            {view.code ? (
              <pre className="step__out">
                {head ? <span className="step__whole">{head}</span> : null}
                {head && view.more ? '\n\n' : null}
                {view.more}
              </pre>
            ) : (
              <div className="step__out step__out--prose">
                <Markdown text={view.more} />
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

// The kinds of file a run hands back, by their ending: a short tag and a tint.
const FILE_TONE: Record<string, string> = {
  pdf: 'rose',
  doc: 'sky',
  docx: 'sky',
  xls: 'pine',
  xlsx: 'pine',
  csv: 'pine',
  ppt: 'ember',
  pptx: 'ember',
  png: 'plum',
  jpg: 'plum',
  jpeg: 'plum',
};

/** A file the run made: opens in a new tab, with a button to save it. */
function TaskFile({ name, path }: { name: string; path: string }) {
  const open = useSignedUrl(path, '');
  const save = useSignedUrl(path, '', name);
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1].toLowerCase() ?? '';
  return (
    <span className="run__file">
      <span className={`run__filetype run__filetype--${FILE_TONE[ext] ?? 'mist'}`} aria-hidden="true">
        {ext ? ext.slice(0, 4).toUpperCase() : <IconFile size={14} />}
      </span>
      {open.url ? (
        <a href={open.url} target="_blank" rel="noreferrer" className="run__filename" title={`Open ${name}`}>
          {name}
        </a>
      ) : (
        <span className="run__filename" title={open.failed ? 'Not found' : undefined}>
          {name}
        </span>
      )}
      {save.url ? (
        <a href={save.url} className="run__filesave" aria-label={`Download ${name}`} title="Download">
          <IconDownload size={15} />
        </a>
      ) : null}
    </span>
  );
}

// While a run is live, only its latest steps show; the rest fold under "+N earlier".
const LIVE_STEPS = 4;

export function TaskTimeline({ task, now, model = '', onCancel, online = true }: {
  task: TaskRow;
  now: number;
  /** The model and effort as a label ("Opus 5.5 · High"); '' for the engine's own. */
  model?: string;
  onCancel?: (id: number) => void;
  /** Whether this PC is online, for a queued run's line. */
  online?: boolean;
}) {
  const reduce = useReducedMotion();
  const foldId = useId();
  const engine: Engine = task.engine === 'codex' ? 'codex' : 'claude';
  const live = task.status === 'running' || task.status === 'pending';
  const running = task.status === 'running';
  const all = Array.isArray(task.events) ? task.events.filter((e) => e && typeof e.text === 'string') : [];
  // Files the run made, sent to the bucket: shown under the answer, not as steps.
  const files = all.filter((e) => e.kind === 'file' && e.detail);
  const events = all.filter((e) => e.kind !== 'file');

  // A finished run's answer is its output, which the runner keeps whole. The last thing it said is the same text cut to
  // one line of 300 characters (whole in `detail` when longer), so that is only the fallback.
  const lastSay = !live && events.length && events[events.length - 1].kind === 'say' ? events[events.length - 1] : null;
  let steps = lastSay ? events.slice(0, -1) : events;
  let answer = live ? '' : answerOf(task.output || '') || (lastSay ? (lastSay.detail || lastSay.text).trim() : '');

  // A failed run says why once: what the engine said as it stopped, then the runner's own reason. With no answer the
  // runner keeps the tail of the engine's words as the error, and those are already shown as the answer.
  let failure = '';
  if (task.status === 'failed') {
    const stop = [...events].reverse().find((e) => e.kind === 'error');
    const said = stop ? (stop.detail || stop.text).trim() : '';
    let reason = (task.error || '').trim();
    if (answer && said && same(answer, said)) answer = '';
    if (reason && answer && flat(answer).includes(flat(reason).slice(0, 160))) reason = '';
    if (reason && said && same(reason, said)) reason = '';
    failure = [said, reason].filter(Boolean).join('\n\n') || 'Stopped with an error';
  }

  // The step it is on. The runner names a step as it starts it, and that step is also the newest in the list: it shows
  // as the live line until its output comes back. After that the name is stale and the engine is thinking.
  let current: TaskEvent | null = null;
  if (running) {
    const named = stepNow(task.step);
    current = named ?? { kind: 'think', text: 'Thinking' };
    if (named && named.kind !== 'think') {
      const recent = steps.slice(-6);
      const at = recent.map((e) => e.kind === named.kind && same(e.text, named.text)).lastIndexOf(true);
      if (at !== -1 && at === recent.length - 1 && !recent[at].detail) steps = steps.slice(0, -1);
      else if (at !== -1) current = { kind: 'think', text: 'Thinking' };
    }
  }
  const nowView = current ? viewOf(current) : null;

  const [open, setOpen] = useState(live);
  const [whole, setWhole] = useState(false);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  // Unfold while it works, fold once it is done.
  useEffect(() => setOpen(live), [live]);
  // An answer that arrives while the page is open rises in; the ones already there are simply there.
  const [seenLive] = useState(live);

  const clock = useClock(live, now);
  const start = Date.parse(task.started_at ?? task.created_at);
  const end = task.finished_at ? Date.parse(task.finished_at) : clock;
  const time = Number.isFinite(start) && Number.isFinite(end) ? took(end - start) : '';
  // The runner leaves a note on a finished run ("6 turns · 72s · about 0.12 USD of plan usage").
  const note = live ? '' : task.step;

  const count = steps.length;
  const pill = count > 0 || running;
  const hidden = running && !whole ? Math.max(0, count - LIVE_STEPS) : 0;
  const shown = steps.map((event, index) => ({ event, index })).slice(hidden);

  const rise = reduce ? { opacity: 0 } : { opacity: 0, y: 6, filter: 'blur(3px)' };
  const rest = reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' };

  return (
    <div className={`run run--${engine} ${live ? 'is-live' : ''}`}>
      <header className="run__head">
        <span className={`run__avatar run__avatar--${engine}`} aria-hidden="true">
          <BrandLogo brand={engine === 'codex' ? 'openai' : 'claude'} size={16} />
        </span>
        <span className="run__name">{ENGINE_NAME[engine]}</span>
        {model ? <span className="run__model">{model}</span> : null}
        <StatusChip status={task.status} />
        {!pill && time && task.status !== 'pending' ? (
          <span className="run__took num" title={note || undefined}>
            {time}
          </span>
        ) : null}
        {live && onCancel ? (
          <button type="button" className="icon-btn icon-btn--danger run__cancel" onClick={() => onCancel(task.id)} title="Cancel" aria-label="Cancel run">
            <IconX size={15} />
          </button>
        ) : null}
      </header>

      <div className="run__body">
        {task.status === 'pending' ? (
          <p className="run__wait">
            <span className="run__waitdot" aria-hidden="true" />
            {online ? <Shimmer>Waiting for this PC</Shimmer> : 'Waiting for this PC to come online'}
          </p>
        ) : null}

        {pill ? (
          <button type="button" className="run__pill" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={foldId} title={note || undefined}>
            <IconActivity size={14} className="run__pillicon" />
            <span>
              {running ? 'Working' : 'Worked'}
              {time ? (
                <>
                  {' for '}
                  <span className="num">{time}</span>
                </>
              ) : null}
            </span>
            {count ? (
              <>
                <span className="run__sep" aria-hidden="true">
                  ·
                </span>
                <span className="num">
                  {count} {count === 1 ? 'step' : 'steps'}
                </span>
              </>
            ) : null}
            <IconChevronDown size={14} className={`run__chev ${open ? 'is-flipped' : ''}`} />
          </button>
        ) : null}

        <AnimatePresence initial={false}>
          {pill && open ? (
            <motion.div
              id={foldId}
              className="run__fold"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.28, ease: EASE_OUT }}
            >
              <ol className="steps">
                {hidden ? (
                  <li className="steps__earlier">
                    <button type="button" className="steps__more" onClick={() => setWhole(true)}>
                      +{hidden} earlier
                    </button>
                  </li>
                ) : null}
                <AnimatePresence initial={false}>
                  {shown.map(({ event, index }) => {
                    const key = `${index}:${event.at ?? ''}`;
                    const view = viewOf(event);
                    return (
                      <motion.li
                        key={key}
                        className={`step step--${view.tone} step--${event.kind}`}
                        initial={rise}
                        animate={rest}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT }}
                      >
                        <Step view={view} open={Boolean(opened[key])} onToggle={() => setOpened((o) => ({ ...o, [key]: !o[key] }))} />
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
                {nowView ? (
                  <li className="step step--now" aria-live="polite">
                    <Step view={nowView.label ? nowView : { ...nowView, text: nowView.full }} open={false} onToggle={() => undefined} now />
                  </li>
                ) : null}
              </ol>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {answer ? (
          <motion.div
            className="run__answer"
            initial={seenLive ? { opacity: 0, y: reduce ? 0 : 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, ease: EASE_OUT }}
          >
            <Markdown text={answer} />
            <CopyButton text={answer} />
          </motion.div>
        ) : null}

        {files.length ? (
          <div className="run__files">
            {files.map((file) => (
              <TaskFile key={file.detail} name={file.text} path={file.detail ?? ''} />
            ))}
          </div>
        ) : null}

        {failure ? (
          <div className="run__fail">
            <span className="run__failicon" aria-hidden="true">
              <IconAlert size={14} />
            </span>
            <p className="run__failtext">{failure}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
