import { forwardRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { LAYOUT_CAP, SPRING, riseItem } from '../../lib/motion';
import type { MemoryRow } from '../../lib/types';
import { companyName, timeAgo } from '../../lib/format';
import { useOverflow } from '../../hooks/useOverflow';
import { CompanyLogo } from '../CompanyLogo';
import { IconPencil, IconPin, IconSpark, IconTrash, IconUser } from '../Icons';

interface MemoryCardProps {
  row: MemoryRow;
  now: number;
  /** Resolves true when saved. */
  onSave: (answer: string) => Promise<boolean>;
  onPin: () => void;
  onDelete: () => void;
  /** Position in the list, for the entrance stagger. */
  index?: number;
}

export const MemoryCard = forwardRef<HTMLLIElement, MemoryCardProps>(function MemoryCard({ row, now, onSave, onPin, onDelete, index = 0 }, ref) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.answer);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(row.answer);
  }, [row.answer, editing]);

  const [answerRef, clamped] = useOverflow<HTMLParagraphElement>(row.answer, open, editing);
  // The memory row has the raw company name and no domain, so the tile is a monogram.
  const company = row.company ? companyName(row.company) : '';
  const learned = row.source === 'learned';

  async function save() {
    if (!draft.trim()) return;
    setBusy(true);
    const ok = await onSave(draft.trim());
    setBusy(false);
    if (ok) setEditing(false);
  }

  return (
    <motion.li
      ref={ref}
      className={`memcard ${index % 2 === 0 ? 'is-striped' : ''} ${row.pinned ? 'is-pinned' : ''}`}
      layout={index < LAYOUT_CAP ? 'position' : false}
      variants={riseItem}
      custom={index}
      initial="hidden"
      animate="shown"
      exit="gone"
      transition={{ layout: SPRING }}
    >
      <div className="memcard__head">
        <p className="memcard__q">{row.question}</p>
        {row.pinned ? (
          <span className="pinmark" title="Pinned, used word for word" aria-label="Pinned">
            <IconPin size={14} />
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
            <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={busy || !draft.trim()} title="Edited answers count as yours">
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
              {open ? 'Less' : 'More'}
            </button>
          ) : null}
        </>
      )}

      <div className="memcard__foot">
        <p className="memcard__meta">
          <span className="memcard__src" title={learned ? 'Learned while applying' : 'Added by you'}>
            {learned ? <IconSpark size={13} /> : <IconUser size={13} />}
            <span className="sr-only">{learned ? 'Learned' : 'Mine'}</span>
          </span>
          {company ? <CompanyLogo name={company} size={22} /> : null}
          {company ? <span className="memcard__where">{company}</span> : <span className="memcard__where">{learned ? 'Learned' : 'Mine'}</span>}
          {row.job_title ? <span className="memcard__job">{row.job_title}</span> : null}
          <span className="memcard__time num">{timeAgo(row.updated_at, now)}</span>
        </p>
        {!editing ? (
          <div className="memcard__actions">
            <button type="button" className="icon-btn" onClick={() => setEditing(true)} aria-label="Edit answer" title="Edit">
              <IconPencil size={15} />
            </button>
            <button
              type="button"
              className={`icon-btn ${row.pinned ? 'is-on' : ''}`}
              onClick={onPin}
              aria-pressed={row.pinned}
              aria-label={row.pinned ? 'Unpin' : 'Pin'}
              title={row.pinned ? 'Unpin' : 'Pin (use word for word)'}
            >
              <IconPin size={15} />
            </button>
            <button type="button" className="icon-btn icon-btn--danger" onClick={onDelete} aria-label="Delete answer" title="Delete">
              <IconTrash size={15} />
            </button>
          </div>
        ) : null}
      </div>
    </motion.li>
  );
});
