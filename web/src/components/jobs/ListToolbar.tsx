import { useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SORT_LABEL, type MinScore, type SortKey } from '../../lib/jobs';
import { menuVariants } from '../../lib/motion';
import { useDismiss } from '../shell/Navbar';
import { AnimatedNumber, ProgressRing } from '../motion';
import { IconCheck, IconFilter, IconSearch } from '../Icons';

function Popover({ children, label, role = 'menu' }: { children: ReactNode; label: string; role?: 'menu' | 'dialog' }) {
  return (
    <motion.div className="menu popover" role={role} aria-label={label} variants={menuVariants} initial="hidden" animate="shown" exit="gone">
      {children}
    </motion.div>
  );
}

function SortMenu({ sort, onSort }: { sort: SortKey; onSort: (key: SortKey) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useDismiss(box, open, () => setOpen(false));
  return (
    <div ref={box} className="pop">
      <button
        type="button"
        className={`btn-icon press ${sort !== 'score' ? 'is-on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort, ${SORT_LABEL[sort]}`}
        title={`Sort: ${SORT_LABEL[sort]}`}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 13V3M2.5 5.5 5 3l2.5 2.5M11 3v10M8.5 10.5 11 13l2.5-2.5" />
        </svg>
      </button>
      <AnimatePresence>
        {open ? (
          <Popover label="Sort">
            {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={sort === key}
                className="menuitem"
                onClick={() => {
                  onSort(key);
                  setOpen(false);
                }}
              >
                <span>{SORT_LABEL[key]}</span>
                <span className="menuitem__check" aria-hidden="true">
                  {sort === key ? <IconCheck size={14} /> : null}
                </span>
              </button>
            ))}
          </Popover>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const SCORES: { value: MinScore; label: string }[] = [
  { value: 0, label: 'Any' },
  { value: 3, label: '3+' },
  { value: 4, label: '4+' },
];

function FilterMenu({ minScore, onMinScore }: { minScore: MinScore; onMinScore: (value: MinScore) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useDismiss(box, open, () => setOpen(false));
  const on = minScore !== 0;
  return (
    <div ref={box} className="pop">
      <button
        type="button"
        className={`btn-icon press ${open ? 'is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={on ? `Filters, score ${minScore} or more` : 'Filters'}
        title="Filter"
        onClick={() => setOpen((v) => !v)}
      >
        <IconFilter size={16} />
        {on ? <span className="btn-icon__dot" aria-hidden="true" /> : null}
      </button>
      <AnimatePresence>
        {open ? (
          <Popover label="Filters" role="dialog">
            <p className="popover__head" id="minscore-label">
              Minimum score
            </p>
            <div className="chips" role="group" aria-labelledby="minscore-label">
              {SCORES.map((s) => (
                <button key={s.value} type="button" className={`fchip press ${minScore === s.value ? 'is-on' : ''}`} aria-pressed={minScore === s.value} onClick={() => onMinScore(s.value)}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="popover__foot">
              <button type="button" className="btn btn--ghost btn--sm" disabled={!on} onClick={() => onMinScore(0)}>
                Clear
              </button>
            </div>
          </Popover>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

interface ListToolbarProps {
  query: string;
  onQuery: (value: string) => void;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  minScore: MinScore;
  onMinScore: (value: MinScore) => void;
  shown: number;
  total: number;
  /** "66/300 scored": jobs scored of jobs found. */
  scored: number;
  found: number;
  /** The Find more button, on the right. */
  action?: ReactNode;
}

/** The list card's top row: a search pill, round sort and filter buttons, the count, and the scored ring. */
export function ListToolbar({ query, onQuery, sort, onSort, minScore, onMinScore, shown, total, scored, found, action }: ListToolbarProps) {
  const filtered = shown !== total;
  return (
    <div className="ltool">
      <label className="searchpill">
        <span className="sr-only">Search jobs</span>
        <IconSearch size={15} />
        <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search jobs" />
      </label>
      <SortMenu sort={sort} onSort={onSort} />
      <FilterMenu minScore={minScore} onMinScore={onMinScore} />
      <span className="countpill num" aria-label={filtered ? `${shown} of ${total} jobs shown` : `${total} jobs`}>
        <AnimatedNumber value={shown} from={shown} duration={0.3} />
        {filtered ? <span className="countpill__of">/{total}</span> : null}
        <span className="countpill__word">{(filtered ? total : shown) === 1 ? 'job' : 'jobs'}</span>
      </span>
      <span className="ltool__end">
        {found > 0 ? (
          <span className="ltool__scored num" title={`${scored} of ${found} postings scored`}>
            <ProgressRing value={found ? scored / found : 0} size={18} stroke={2.5} />
            <span>
              <strong>{scored.toLocaleString()}</strong>/{found.toLocaleString()} scored
            </span>
          </span>
        ) : null}
        {action}
      </span>
    </div>
  );
}
