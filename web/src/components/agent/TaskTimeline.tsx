// A task's run as a timeline, the way an AI coding tool shows its work: what it thinks, the commands it runs, the files it
// reads, each step sliding in as it happens, then the answer. While it runs, a shimmering line says it is working and for
// how long; once done, the steps fold under "Worked for 1m 12s".
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Shimmer } from '../motion';
import { Markdown, MarkdownLine } from '../Markdown';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { IconAlert, IconChat, IconChevronDown, IconDownload, IconFile, IconGlobe, IconPencil, IconSearch, IconSliders, IconSpark, IconTerminal } from '../Icons';

export type Engine = 'claude' | 'codex';

/** One step of a run, as the task runner writes it: what kind, one line, and sometimes more. */
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
}

const KINDS: Record<string, { icon: ReactNode; tone: string }> = {
  think: { icon: <IconSpark size={12} />, tone: 'think' },
  run: { icon: <IconTerminal size={12} />, tone: 'run' },
  read: { icon: <IconFile size={12} />, tone: 'read' },
  search: { icon: <IconSearch size={12} />, tone: 'read' },
  edit: { icon: <IconPencil size={12} />, tone: 'edit' },
  web: { icon: <IconGlobe size={12} />, tone: 'web' },
  tool: { icon: <IconSliders size={12} />, tone: 'tool' },
  say: { icon: <IconChat size={12} />, tone: 'say' },
  error: { icon: <IconAlert size={12} />, tone: 'error' },
};

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

export function TaskTimeline({ task, now }: { task: TaskRow; now: number }) {
  const live = task.status === 'running' || task.status === 'pending';
  const all = Array.isArray(task.events) ? task.events.filter((e) => e && typeof e.text === 'string') : [];
  // Files the run made, sent to the bucket: shown under the answer, not as steps.
  const files = all.filter((e) => e.kind === 'file' && e.detail);
  const events = all.filter((e) => e.kind !== 'file');
  // The last thing it said is the answer; the rest are its steps.
  const last = events.length && events[events.length - 1].kind === 'say' && !live ? events[events.length - 1] : null;
  const steps = last ? events.slice(0, -1) : events;
  const answer = last ? last.text : !live && !events.length ? answerOf(task.output || '') : '';
  const [open, setOpen] = useState(live);
  // Unfold while it works, fold once it is done.
  useEffect(() => setOpen(live), [live]);

  const start = Date.parse(task.started_at ?? task.created_at);
  const end = task.finished_at ? Date.parse(task.finished_at) : now;
  const time = Number.isFinite(start) ? took(end - start) : '';
  const summary = task.status === 'pending' ? 'Waiting for your computer' : live ? `Working${time ? ` · ${time}` : ''}` : `Worked${time ? ` for ${time}` : ''}`;

  return (
    <div className={`tl ${live ? 'is-live' : ''}`}>
      <button type="button" className="tl__summary" onClick={() => setOpen((v) => !v)} aria-expanded={open} disabled={!steps.length && !live}>
        <span className={`tl__dot ${live ? 'is-live' : ''}`} aria-hidden="true" />
        {live ? <Shimmer>{summary}</Shimmer> : <span>{summary}</span>}
        {steps.length ? <span className="tl__count num">{steps.length}</span> : null}
        {steps.length ? <IconChevronDown size={14} className={`tl__chev ${open ? 'is-flipped' : ''}`} /> : null}
      </button>
      <AnimatePresence initial={false}>
        {open && (steps.length || live) ? (
          <motion.div
            className="tl__fold"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <ol className="tl__steps">
              <AnimatePresence initial={false}>
                {steps.map((event, i) => {
                  const kind = KINDS[event.kind] ?? KINDS.tool;
                  return (
                    <motion.li
                      key={`${i}:${event.at ?? ''}`}
                      className={`tl__step tl__step--${kind.tone}`}
                      initial={{ opacity: 0, y: 8, filter: 'blur(3px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <span className="tl__node">{kind.icon}</span>
                      <span className="tl__line">
                        {event.kind === 'run' ? <code className="tl__code">{event.text}</code> : <MarkdownLine text={event.text} />}
                        {event.detail ? (
                          <details className="tl__detail">
                            <summary>More</summary>
                            <pre>{event.detail}</pre>
                          </details>
                        ) : null}
                      </span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
              {live ? (
                <li className="tl__step tl__step--now">
                  <span className="tl__node tl__node--now" aria-hidden="true" />
                  <span className="tl__line">
                    <Shimmer>{task.status === 'pending' ? 'Queued' : task.step || 'Thinking'}</Shimmer>
                  </span>
                </li>
              ) : null}
            </ol>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {answer ? (
        <motion.div className="tl__answer" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <Markdown text={answer} />
        </motion.div>
      ) : null}
      {files.length ? (
        <div className="tl__files">
          {files.map((file) => (
            <TaskFile key={file.detail} name={file.text} path={file.detail ?? ''} />
          ))}
        </div>
      ) : null}
      {task.error && task.status === 'failed' ? <p className="tl__error">{task.error}</p> : null}
    </div>
  );
}

/** A file the run made: opens in a new tab, with a button to save it. */
function TaskFile({ name, path }: { name: string; path: string }) {
  const open = useSignedUrl(path, '');
  const save = useSignedUrl(path, '', name);
  return (
    <span className="tl__file">
      <IconFile size={14} />
      {open.url ? (
        <a href={open.url} target="_blank" rel="noreferrer" className="tl__file-name">
          {name}
        </a>
      ) : (
        <span className="tl__file-name">{open.failed ? `${name} (not found)` : name}</span>
      )}
      {save.url ? (
        <a href={save.url} className="tl__file-save" aria-label={`Download ${name}`} title="Download">
          <IconDownload size={14} />
        </a>
      ) : null}
    </span>
  );
}
