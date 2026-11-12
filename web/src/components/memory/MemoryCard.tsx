import { useEffect, useState } from 'react';
import type { MemoryRow } from '../../lib/types';
import { timeAgo } from '../../lib/format';
import { useOverflow } from '../../hooks/useOverflow';
import { IconPencil, IconPin, IconSpark, IconTrash, IconUser } from '../Icons';

interface MemoryCardProps {
  row: MemoryRow;
  now: number;
  /** Resolves true when saved. */
  onSave: (answer: string) => Promise<boolean>;
  onPin: () => void;
  onDelete: () => void;
}

export function MemoryCard({ row, now, onSave, onPin, onDelete }: MemoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.answer);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(row.answer);
  }, [row.answer, editing]);

  const [answerRef, clamped] = useOverflow<HTMLParagraphElement>(row.answer, open, editing);
  const where = [row.company, row.job_title].filter(Boolean).join(', ');

  async function save() {
    if (!draft.trim()) return;
    setBusy(true);
    const ok = await onSave(draft.trim());
    setBusy(false);
    if (ok) setEditing(false);
  }

  return (
    <li className={`card memcard ${row.pinned ? 'is-pinned' : ''}`}>
      <div className="memcard__head">
        <p className="memcard__q">{row.question}</p>
        {row.pinned ? (
          <span className="pinmark" title="Pinned: used word for word">
            <IconPin size={14} />
            Pinned
          </span>
        ) : null}
      </div>

      {editing ? (
        <div className="memcard__edit">
          <label className="sr-only" htmlFor={`answer-${row.id}`}>
            Answer
          </label>
          <textarea
            id={`answer-${row.id}`}
            className="input textarea"
            rows={Math.min(10, Math.max(4, Math.ceil(draft.length / 90)))}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="memcard__editbar">
            <span className="field__hint">Saving makes this answer yours.</span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setEditing(false);
                setDraft(row.answer);
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={busy || !draft.trim()}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <p ref={answerRef} className={`memcard__a ${open ? 'is-open' : ''}`}>
            {row.answer}
          </p>
          {open || clamped ? (
            <button type="button" className="link-btn link-btn--sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </>
      )}

      <div className="memcard__foot">
        <p className="memcard__meta">
          {row.source === 'learned' ? (
            <>
              <IconSpark size={14} />
              {where ? `Learned at ${where}` : 'Learned while applying'}
            </>
          ) : (
            <>
              <IconUser size={14} />
              {where ? `Yours, from ${where}` : 'Added by you'}
            </>
          )}
          <span className="memcard__time mono">{timeAgo(row.updated_at, now)}</span>
        </p>
        {!editing ? (
          <div className="memcard__actions">
            <button type="button" className="ghostbtn" onClick={() => setEditing(true)}>
              <IconPencil size={15} />
              Edit
            </button>
            <button type="button" className={`ghostbtn ${row.pinned ? 'is-on' : ''}`} onClick={onPin} aria-pressed={row.pinned}>
              <IconPin size={15} />
              {row.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button type="button" className="ghostbtn ghostbtn--danger" onClick={onDelete}>
              <IconTrash size={15} />
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
