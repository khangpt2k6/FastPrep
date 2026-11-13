import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { APPLICATION_STATUSES, statusInfo } from '../../lib/format';
import type { JobRow } from '../../lib/types';
import { Wolf } from '../mascot/Wolf';
import { IconChevronRight } from '../Icons';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day, yyyy-mm-dd. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Days the agent finished an application on (sent, filled or stopped). */
export function applyDays(jobs: JobRow[]): Set<string> {
  const days = new Set<string>();
  for (const job of jobs) {
    if (!APPLICATION_STATUSES.includes(job.status) || job.status === 'applying') continue;
    const at = Date.parse(job.updated_at);
    if (Number.isFinite(at)) days.add(dayKey(new Date(at)));
  }
  return days;
}

/** Days in a row with an application, ending today, or yesterday while today is still open. */
export function streakOf(days: Set<string>, today = new Date()): number {
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH = new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' });

function Arrow({ back, onClick }: { back?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={back ? 'Previous month' : 'Next month'} className="cal__arrow press">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
        <path d={back ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** "Day 12, Nov 2026" with a dot on every day the agent applied, and the streak. */
export function CalendarCard({ days, now }: { days: Set<string>; now: number }) {
  const today = new Date(now);
  const todayKey = dayKey(today);
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const streak = streakOf(days, today);
  const year = view.getFullYear();
  const month = view.getMonth();
  const lead = new Date(year, month, 1).getDay();
  const length = new Date(year, month + 1, 0).getDate();
  const onThisMonth = year === today.getFullYear() && month === today.getMonth();

  return (
    <section className="card cal" aria-label="Calendar">
      <header className="cal__head">
        <button
          type="button"
          className="cal__today"
          onClick={() => setView(new Date(today.getFullYear(), today.getMonth(), 1))}
          disabled={onThisMonth}
          title={onThisMonth ? undefined : 'Back to today'}
        >
          Day {today.getDate()}
        </button>
        <span className="cal__month">{MONTH.format(view)}</span>
        <span className="cal__arrows">
          <Arrow back onClick={() => setView(new Date(year, month - 1, 1))} />
          <Arrow onClick={() => setView(new Date(year, month + 1, 1))} />
        </span>
      </header>
      <div className="cal__grid cal__grid--days" aria-hidden="true">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="cal__grid">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length }, (_, i) => {
          const date = new Date(year, month, i + 1);
          const key = dayKey(date);
          const isToday = key === todayKey;
          const lit = days.has(key);
          return (
            <span key={key} className="cal__cell">
              <span className={`cal__day num ${isToday ? 'is-today' : key > todayKey ? 'is-future' : lit ? 'is-lit' : ''}`} aria-current={isToday ? 'date' : undefined}>
                {i + 1}
              </span>
              <span className={`cal__dot ${lit ? 'is-lit' : ''}`} />
              {lit ? <span className="sr-only">applied</span> : null}
            </span>
          );
        })}
      </div>
      <footer className="cal__foot">
        <span className="cal__label">Streak</span>
        <span className={`cal__streak num ${streak ? 'is-on' : ''}`}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M8.6 1.2c.3 2.3-1 3.4-2.1 4.6C5.4 7 4.2 8.3 4.2 10.3A3.9 3.9 0 0 0 8 14.5a4 4 0 0 0 3.8-4.2c0-1.6-.7-2.7-1.4-3.4.1 1.2-.4 2-1.1 2.3.4-2.6-.1-5.8-.7-8Z" />
          </svg>
          {streak} {streak === 1 ? 'day' : 'days'}
        </span>
      </footer>
    </section>
  );
}

/** False for the first frame, so arcs and bars grow in from nothing. */
function useArrived(): boolean {
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return arrived;
}

type Part = 'sent' | 'filled' | 'blocked';
const PARTS: { key: Part; label: string }[] = [
  { key: 'sent', label: 'Sent' },
  { key: 'filled', label: 'Filled' },
  { key: 'blocked', label: 'Stopped' },
];

/** How finished applications ended: sent, filled in a dry run, or stopped. */
export function applicationParts(jobs: JobRow[]): Record<Part, number> {
  const out: Record<Part, number> = { sent: 0, filled: 0, blocked: 0 };
  for (const job of jobs) {
    if (!APPLICATION_STATUSES.includes(job.status) || job.status === 'applying') continue;
    const tone = statusInfo(job).tone;
    if (tone === 'sent' || tone === 'unconfirmed') out.sent += 1;
    else if (tone === 'filled') out.filled += 1;
    else out.blocked += 1;
  }
  return out;
}

const R = 38;
const CIRC = 2 * Math.PI * R;
const GAP = 8;

/** A donut of sent, filled and stopped, a bar for each, and the wolf on top, after Arena's progress card. */
export function ProgressCard({ parts, onOpen }: { parts: Record<Part, number>; onOpen: () => void }) {
  const arrived = useArrived();
  const total = parts.sent + parts.filled + parts.blocked;
  let start = 0;
  return (
    <section className="card prog" aria-label="Applications">
      <header className="prog__head">
        <Wolf mood={parts.sent > 0 ? 'cheer' : 'checklist'} size={36} motion="none" className="prog__wolf" />
        <h2 className="prog__title">Applications</h2>
        <button type="button" className="cal__arrow press prog__open" onClick={onOpen} aria-label="Open applications">
          <IconChevronRight size={15} />
        </button>
      </header>
      <div className="prog__body">
        <div className="prog__ring">
          <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden="true" className="prog__svg">
            {total === 0 ? <circle cx="48" cy="48" r={R} fill="none" stroke="var(--line)" strokeWidth="6" /> : null}
            {PARTS.map((p) => {
              const span = total ? (parts[p.key] / total) * CIRC : 0;
              const len = Math.max(0, span - (span > GAP ? GAP : 0));
              const offset = -start;
              start += span;
              if (!len) return null;
              return (
                <circle
                  key={p.key}
                  className={`prog__arc prog__arc--${p.key}`}
                  cx="48"
                  cy="48"
                  r={R}
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${arrived ? len : 0} ${CIRC}`}
                  strokeDashoffset={offset}
                />
              );
            })}
          </svg>
          <span className="prog__center">
            <span className="prog__total num">{total}</span>
            <span className="prog__word">Done</span>
          </span>
        </div>
        <ul className="prog__list">
          {PARTS.map((p) => (
            <li key={p.key}>
              <span className="prog__row">
                <span className={`prog__name prog__name--${p.key}`}>{p.label}</span>
                <span className="prog__count num">
                  {parts[p.key]}
                  <span className="prog__of">/{total}</span>
                </span>
              </span>
              <span className="prog__bar">
                <span className={`prog__fill prog__fill--${p.key}`} style={{ width: arrived && total ? `${(parts[p.key] / total) * 100}%` : 0 }} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** A card in the rail with a heading and anything under it. */
export function RailCard({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card railcard" aria-label={title}>
      <header className="railcard__head">
        <h2 className="railcard__title">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Days with applications, memoized from the job rows. */
export function useApplyDays(jobs: JobRow[]) {
  return useMemo(() => applyDays(jobs), [jobs]);
}
