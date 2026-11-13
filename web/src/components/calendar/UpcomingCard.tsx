import { useMemo, type CSSProperties } from 'react';
import { countdown, dayLabel, isJobHunt, kindInfo, startOf, timeRange, upcoming, type CalendarRow } from '../../lib/calendar';
import type { companyLookup } from '../../lib/overview';
import { CompanyLogo } from '../CompanyLogo';
import { Tag } from '../common';
import { IconCalendar } from '../Icons';
import './calendar.css';

/** The Overview's look ahead: the next three job hunt events with how long until each. */
export function UpcomingCard({ rows, now, loading, lookup, onOpen }: {
  rows: CalendarRow[];
  now: number;
  loading: boolean;
  lookup: ReturnType<typeof companyLookup>;
  onOpen: () => void;
}) {
  const minute = Math.floor(now / 60000);
  const next = useMemo(() => upcoming(rows.filter(isJobHunt), minute * 60000).slice(0, 3), [rows, minute]);
  return (
    <section className="card upcoming" aria-labelledby="upcoming-title">
      <header className="upcoming__head">
        <h2 className="upcoming__title" id="upcoming-title">
          <IconCalendar size={16} />
          Upcoming
        </h2>
        <button type="button" className="btn btn--ghost btn--xs" onClick={onOpen}>
          Calendar
        </button>
      </header>
      {loading ? (
        <div className="upcoming__list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="skeleton upcoming__skel" />
          ))}
        </div>
      ) : next.length ? (
        <ol className="upcoming__list">
          {next.map((row, i) => {
            const info = kindInfo(row.kind);
            const hit = row.company ? lookup(row.company) : null;
            const company = hit?.name ?? row.company;
            const start = startOf(row);
            const now0 = !row.all_day && start <= now;
            const when = now0 ? 'Now' : countdown(row, now);
            return (
              <li key={row.id} className={`upcoming__item kind--${row.kind}`} style={{ '--i': i } as CSSProperties}>
                <span className="upcoming__when">{when.charAt(0).toUpperCase() + when.slice(1)}</span>
                <span className="upcoming__what">
                  <Tag color={info.color}>{info.label}</Tag>
                  <span className="upcoming__name" title={row.title}>
                    {row.title}
                  </span>
                </span>
                <span className="upcoming__meta">
                  {company ? <CompanyLogo name={company} domain={hit?.domain} size={18} /> : null}
                  <span className="num">
                    {dayLabel(start, now)}, {timeRange(row)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="upcoming__empty">
          No interviews, calls or deadlines ahead.{' '}
          <button type="button" className="link-btn" onClick={onOpen}>
            Add one
          </button>
        </p>
      )}
    </section>
  );
}
