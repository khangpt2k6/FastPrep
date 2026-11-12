import { useMemo, useState, type ReactNode } from 'react';
import type { MemoryRow } from '../../lib/types';
import { errorText } from '../../lib/errors';
import { plural } from '../../lib/format';
import { deleteAnswer, editAnswer, setPinned, teachAnswer } from '../../hooks/useAutomationData';
import type { LiveTable } from '../../hooks/useLiveTable';
import { Dialog } from '../Dialog';
import { AnimatePresence } from 'motion/react';
import { EmptyState, PillGroup, SkeletonCards } from '../common';
import { IconAlert, IconMemory, IconPlus, IconSearch, IconX } from '../Icons';
import { SetupCard } from '../SetupCard';
import type { ToastInput } from '../Toasts';
import { MemoryCard } from './MemoryCard';

type Filter = 'all' | 'learned' | 'user' | 'pinned';

interface MemoryPageProps {
  memory: LiveTable<MemoryRow>;
  now: number;
  /** From "View answers it wrote" on an application: only that job's answers. */
  job: { id: string; company: string } | null;
  onClearJob: () => void;
  toast: (toast: ToastInput) => void;
}

function TeachDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!question.trim() || !answer.trim()) {
      setError('Write both the question and the answer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await teachAnswer(question.trim(), answer.trim());
      setQuestion('');
      setAnswer('');
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy="teach-title" className="smalldialog">
      <header className="smalldialog__head">
        <h2 id="teach-title">Teach an answer</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <IconX size={18} />
        </button>
      </header>
      <p className="smalldialog__text">When a form asks this question, the agent uses your answer.</p>
      <div className="field">
        <label className="field__label" htmlFor="teach-q">
          Question
        </label>
        <input
          id="teach-q"
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Why do you want to work here?"
          data-autofocus
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="teach-a">
          Answer
        </label>
        <textarea
          id="teach-a"
          className="input textarea"
          rows={5}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Write it the way you would say it."
        />
      </div>
      {error ? (
        <p className="form-msg form-msg--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="smalldialog__actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={submit} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <IconPlus size={15} />}
          Save answer
        </button>
      </div>
    </Dialog>
  );
}

export function MemoryPage({ memory, now, job, onClearJob, toast }: MemoryPageProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [teaching, setTeaching] = useState(false);
  const [doomed, setDoomed] = useState<MemoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const scoped = useMemo(() => (job ? memory.rows.filter((r) => r.job_id === job.id) : memory.rows), [memory.rows, job]);

  const counts = useMemo(
    () => ({
      all: scoped.length,
      learned: scoped.filter((r) => r.source === 'learned').length,
      user: scoped.filter((r) => r.source === 'user').length,
      pinned: scoped.filter((r) => r.pinned).length,
    }),
    [scoped],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped
      .filter((r) => (filter === 'all' ? true : filter === 'pinned' ? r.pinned : r.source === filter))
      .filter((r) => !q || r.question.toLowerCase().includes(q) || r.answer.toLowerCase().includes(q))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updated_at) - Date.parse(a.updated_at));
  }, [scoped, filter, query]);

  async function run(action: () => Promise<void>, failure: string) {
    try {
      await action();
      memory.reload();
      return true;
    } catch (err) {
      toast({ tone: 'error', title: failure, detail: errorText(err) });
      return false;
    }
  }

  async function confirmDelete() {
    if (!doomed) return;
    setDeleting(true);
    const ok = await run(() => deleteAnswer(doomed.id), 'Could not delete the answer');
    setDeleting(false);
    if (ok) {
      setDoomed(null);
      toast({ tone: 'ok', title: 'Answer deleted' });
    }
  }

  if (memory.error?.kind === 'missing-table') return <SetupCard table="automation_memory" />;

  let body: ReactNode;
  if (memory.error) {
    body = (
      <EmptyState
        icon={<IconAlert size={22} />}
        title="Could not load memory"
        action={
          <button type="button" className="btn btn--secondary btn--sm" onClick={memory.reload}>
            Try again
          </button>
        }
      >
        {memory.error.message}
      </EmptyState>
    );
  } else if (memory.loading) {
    body = <SkeletonCards count={3} />;
  } else if (scoped.length === 0) {
    body = (
      <EmptyState
        icon={<IconMemory size={22} />}
        title={job ? `No saved answers for ${job.company} yet` : 'Nothing yet'}
        action={
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setTeaching(true)}>
            <IconPlus size={15} />
            Teach an answer
          </button>
        }
      >
        Answers appear here after the agent fills applications, or teach one yourself.
      </EmptyState>
    );
  } else if (shown.length === 0) {
    body = <p className="empty-line">No answers match. Try another filter or search.</p>;
  } else {
    body = (
      <ul className="cardlist">
        <AnimatePresence>
        {shown.map((row, i) => (
          <MemoryCard
            key={row.id}
            index={i}
            row={row}
            now={now}
            onSave={(answer) => run(() => editAnswer(row.id, answer), 'Could not save the answer')}
            onPin={() => void run(() => setPinned(row.id, !row.pinned), 'Could not change the pin')}
            onDelete={() => setDoomed(row)}
          />
        ))}
        </AnimatePresence>
      </ul>
    );
  }

  return (
    <div className="page page--memory">
      <div className="toolbar">
        <PillGroup<Filter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'learned', label: 'Learned', count: counts.learned },
            { value: 'user', label: 'Yours', count: counts.user },
            { value: 'pinned', label: 'Pinned', count: counts.pinned },
          ]}
        />
        <label className="searchbox">
          <IconSearch size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions and answers"
            aria-label="Search questions and answers"
          />
        </label>
        <button type="button" className="btn btn--dark toolbar__more" onClick={() => setTeaching(true)}>
          <IconPlus size={16} />
          Teach an answer
        </button>
      </div>

      {job ? (
        <div className="scopechip">
          <span>
            Showing answers for <strong>{job.company}</strong>
          </span>
          <button type="button" className="icon-btn icon-btn--sm" onClick={onClearJob} aria-label="Show all answers">
            <IconX size={14} />
          </button>
        </div>
      ) : null}

      {!memory.loading && !memory.error && scoped.length > 0 ? (
        <p className="listmeta">
          {plural(shown.length, 'answer')}
          {counts.pinned > 0 ? `, ${counts.pinned} pinned and used word for word` : ''}
        </p>
      ) : null}

      {body}

      <TeachDialog
        open={teaching}
        onClose={() => setTeaching(false)}
        onSaved={() => {
          setTeaching(false);
          memory.reload();
          toast({ tone: 'ok', title: 'Answer saved', detail: 'The agent will use it when a form asks that question.' });
        }}
      />

      <Dialog open={doomed !== null} onClose={() => setDoomed(null)} labelledBy="delete-title" className="smalldialog">
        <h2 id="delete-title" className="smalldialog__title">
          Delete this answer?
        </h2>
        <p className="smalldialog__text">
          {doomed ? <strong>{doomed.question}</strong> : null}
          <br />
          The agent will stop reusing it. This cannot be undone.
        </p>
        <div className="smalldialog__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setDoomed(null)} data-autofocus>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? <span className="spinner" aria-hidden="true" /> : null}
            Delete
          </button>
        </div>
      </Dialog>
    </div>
  );
}
