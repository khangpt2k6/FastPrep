import { useState } from 'react';
import { dayKey } from '../../lib/overview';
import { CALENDAR_KINDS, monthWeeks, shortDate, type CalendarKind } from '../../lib/calendar';
import { IconChevronRight } from '../Icons';

const MONTH = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
const WEEKDAYS: [string, string][] = [
  ['M', 'Monday'],
  ['T', 'Tuesday'],
  ['W', 'Wednesday'],
  ['T', 'Thursday'],
  ['F', 'Friday'],
  ['S', 'Saturday'],
  ['S', 'Sunday'],
];

/**
 * A month at a glance: a dot per event on each day, colored by kind, today ringed in ember. A day with events is a
 * button that takes the agenda to it.
 */
export function MonthGrid({ kinds, now, picked, onPick }: {
  /** The kinds of events per day key (yyyy-mm-dd). */
  kinds: Map<string, CalendarKind[]>;
  now: number;
  picked: string | null;
  onPick: (key: string) => void;
}) {
  const today = new Date(now);
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const weeks = monthWeeks(cursor.y, cursor.m);
  const todayKey = dayKey(now);
  const shift = (by: number) => setCursor((c) => {
    const d = new Date(c.y, c.m + by, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  return (
    <section className="card mgrid" aria-label="Month">
      <header className="mgrid__head">
        <p className="mgrid__title">{MONTH.format(new Date(cursor.y, cursor.m, 1))}</p>
        <div className="mgrid__nav">
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => shift(-1)} aria-label="Previous month">
            <IconChevronRight size={15} className="is-flipped" />
          </button>
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => shift(1)} aria-label="Next month">
            <IconChevronRight size={15} />
          </button>
        </div>
      </header>
      <table className="mgrid__table">
        <thead>
          <tr>
            {WEEKDAYS.map(([short, long]) => (
              <th key={long} scope="col" abbr={long}>
                {short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((ms) => {
                const key = dayKey(ms);
                const day = new Date(ms);
                const list = kinds.get(key) ?? [];
                const out = day.getMonth() !== cursor.m;
                const cls = `mgrid__day ${out ? 'is-out' : ''} ${key === todayKey ? 'is-today' : ''} ${picked === key ? 'is-picked' : ''}`;
                const dots = (
                  <span className="mgrid__dots" aria-hidden="true">
                    {list.slice(0, 3).map((k, i) => (
                      <span key={i} className={`mgrid__dot kind--${k}`} />
                    ))}
                  </span>
                );
                return (
                  <td key={ms}>
                    {list.length ? (
                      <button type="button" className={cls} onClick={() => onPick(key)} aria-label={`${shortDate(ms)}: ${list.length === 1 ? '1 event' : `${list.length} events`}`} aria-pressed={picked === key}>
                        <span className="mgrid__num num">{day.getDate()}</span>
                        {dots}
                      </button>
                    ) : (
                      <span className={cls}>
                        <span className="mgrid__num num">{day.getDate()}</span>
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mgrid__legend" aria-label="Kinds">
        {CALENDAR_KINDS.map((k) => (
          <li key={k.kind}>
            <span className={`mgrid__dot kind--${k.kind}`} aria-hidden="true" />
            {k.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
