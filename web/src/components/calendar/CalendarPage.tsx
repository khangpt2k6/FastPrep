// The Calendar: interviews, calls with companies and deadlines from the person's Google Calendar, which the agent on
// their computer reads and pushes here. Up next, the agenda by day, a month at a glance, and adding an event.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { LiveTable } from '../../hooks/useLiveTable';
import { addCalendarEvent, useCalendarCommands } from '../../hooks/useCalendar';
import {
  clockTime,
  countdown,
  dayLabel,
  durationText,
  endOf,
  endsIn,
  isJobHunt,
  isMeetingLink,
  kindInfo,
  kindsByDay,
  linkName,
  pendingRow,
  shortDate,
  startOf,
  timeRange,
  type CalendarCommand,
  type CalendarKind,
  type CalendarPayload,
  type CalendarRow,
} from '../../lib/calendar';
import { displayName } from '../../lib/format';
import type { InboxRow } from '../../lib/inbox';
import { companyLookup, dayKey } from '../../lib/overview';
import type { JobRow } from '../../lib/types';
import { CompanyLogo } from '../CompanyLogo';
import { EmptyState, PillGroup, Tag } from '../common';
import { IconCalendar, IconChevronDown, IconGoogle, IconLink, IconMapPin, IconPlus, IconVideo } from '../Icons';
import { Wolf, type WolfMood } from '../mascot/Wolf';
import { Contours } from '../motif';
import { Shimmer } from '../motion';
import { PageHeader } from '../shell/PageHeader';
import type { ToastInput } from '../Toasts';
import { AddEventDialog } from './AddEventDialog';
import { MonthGrid } from './MonthGrid';
import './calendar.css';

type Scope = 'hunt' | 'all';
const SCOPE_KEY = 'calendar-scope';

function readScope(): Scope {
  try {
    return window.localStorage.getItem(SCOPE_KEY) === 'all' ? 'all' : 'hunt';
  } catch {
    return 'hunt';
  }
}

/** The wolf's mood for what is coming: cheering for an interview, at the laptop for a call, and so on. */
const MOOD: Record<CalendarKind, WolfMood> = { interview: 'cheer', call: 'laptop', assessment: 'thinking', deadline: 'checklist', other: 'music' };

type Lookup = ReturnType<typeof companyLookup>;

/** A row in the agenda, or a pending one on its way to Google Calendar, or one that failed. */
interface AgendaItem {
  row: CalendarRow;
  /** The command adding it, while it is not in the calendar yet. */
  command?: CalendarCommand;
}

const WEEK = 7 * 86_400_000;

const SOURCE: Record<string, string> = { google: 'From Google Calendar', web: 'Added on this page', agent: 'Added by the agent' };

/** Items in day groups ("Today", "Tomorrow", "Thu, Nov 14"), in the order given. */
function groupByDay(items: AgendaItem[], now: number): { key: string; label: string; date: number; items: AgendaItem[] }[] {
  const groups = new Map<string, { key: string; label: string; date: number; items: AgendaItem[] }>();
  for (const item of items) {
    const start = startOf(item.row);
    const key = dayKey(start);
    const hit = groups.get(key);
    if (hit) hit.items.push(item);
    else groups.set(key, { key, label: dayLabel(start, now), date: start, items: [item] });
  }
  return [...groups.values()];
}

function EventRow({ item, now, lookup, online, index }: { item: AgendaItem; now: number; lookup: Lookup; online: boolean; index: number }) {
  const { row, command } = item;
  const info = kindInfo(row.kind);
  const hit = row.company ? lookup(row.company) : null;
  const company = hit?.name ?? row.company;
  const start = startOf(row);
  const happening = !command && !row.all_day && start <= now && now < endOf(row);
  const failed = command?.status === 'failed';
  const where = row.url ? linkName(row.url) : row.location;
  return (
    <li
      className={`agrow kind--${row.kind} ${command ? (failed ? 'is-failed' : 'is-pending') : ''} ${happening ? 'is-now' : ''}`}
      style={{ '--i': Math.min(index, 10) } as CSSProperties}
    >
      <span className="agrow__time">
        <span className="agrow__start num">{row.all_day ? 'All day' : clockTime(start)}</span>
        {!row.all_day ? <span className="agrow__dur num">{durationText(row)}</span> : null}
      </span>
      <span className="agrow__mark" aria-hidden="true" />
      {company ? (
        <CompanyLogo name={company} domain={hit?.domain} size={32} className="agrow__logo" />
      ) : (
        <span className="agrow__icon" aria-hidden="true">
          <IconCalendar size={16} />
        </span>
      )}
      <span className="agrow__main">
        <span className="agrow__titleline">
          <span className="agrow__title">{row.title}</span>
          {happening ? <span className="agrow__now">Now</span> : null}
        </span>
        <span className="agrow__meta">
          {company ? <span className="agrow__co">{company}</span> : null}
          {where ? (
            <span className="agrow__where">
              {row.url ? <IconVideo size={13} /> : <IconMapPin size={13} />}
              {where}
            </span>
          ) : null}
        </span>
        {command ? (
          failed ? (
            <span className="agrow__error" role="status">
              Could not add it: {command.error || 'the agent stopped.'}
            </span>
          ) : (
            <span className="agrow__note" role="status">
              {online ? <Shimmer>Adding to Google Calendar</Shimmer> : 'Waits for the agent to come online'}
            </span>
          )
        ) : null}
      </span>
      <Tag color={info.color} className="agrow__kind">
        {info.label}
      </Tag>
      <span className="agrow__source" title={SOURCE[row.source] ?? SOURCE.google}>
        {row.source === 'google' ? <IconGoogle size={14} /> : <span className="agrow__here">{row.source === 'agent' ? 'by agent' : 'added here'}</span>}
        <span className="sr-only">{SOURCE[row.source] ?? SOURCE.google}</span>
      </span>
      <span className="agrow__act">
        {row.url && isMeetingLink(row.url) && !command ? (
          <a className="btn btn--secondary btn--xs" href={row.url} target="_blank" rel="noreferrer" aria-label={`Join ${row.title}`}>
            <IconVideo size={13} />
            Join
          </a>
        ) : row.url && !command ? (
          <a className="icon-btn" href={row.url} target="_blank" rel="noreferrer" aria-label={`Open the link for ${row.title}`} title="Open link">
            <IconLink size={15} />
          </a>
        ) : null}
      </span>
    </li>
  );
}

/** The next event as a big countdown, with Join when it is a video call, and the wolf in a fitting mood. */
function UpNext({ row, now, lookup, onAdd }: { row: CalendarRow | null; now: number; lookup: Lookup; onAdd: () => void }) {
  if (!row) {
    return (
      <section className="card upnext upnext--empty" aria-label="Up next">
        <Contours className="upnext__map" />
        <div className="upnext__text">
          <p className="upnext__eyebrow">Up next</p>
          <p className="upnext__title">Nothing on the calendar ahead</p>
          <p className="upnext__meta">Interviews and calls the agent finds in your Google Calendar show up here.</p>
          <div className="upnext__actions">
            <button type="button" className="btn btn--secondary" onClick={onAdd}>
              <IconPlus size={15} />
              Add to calendar
            </button>
          </div>
        </div>
        <span className="upnext__wolf">
          <Wolf mood="music" size={104} motion="idle" />
        </span>
      </section>
    );
  }
  const info = kindInfo(row.kind);
  const hit = row.company ? lookup(row.company) : null;
  const company = hit?.name ?? row.company;
  const start = startOf(row);
  const now0 = !row.all_day && start <= now;
  const big = now0 ? 'Now' : countdown(row, now);
  return (
    <section className={`card upnext kind--${row.kind}`} aria-labelledby="upnext-title">
      <Contours className="upnext__map" />
      <div className="upnext__text">
        <p className="upnext__eyebrow">
          Up next
          <Tag color={info.color}>{info.label}</Tag>
        </p>
        <p className="upnext__count" aria-live="polite">
          {big.charAt(0).toUpperCase() + big.slice(1)}
          {now0 ? <span className="upnext__ends">{endsIn(row, now)}</span> : null}
        </p>
        <h2 className="upnext__title" id="upnext-title">
          {row.title}
        </h2>
        <p className="upnext__meta">
          {company ? (
            <span className="upnext__co">
              <CompanyLogo name={company} domain={hit?.domain} size={22} />
              {company}
            </span>
          ) : null}
          <span className="num">
            {dayLabel(start, now)}, {timeRange(row)}
          </span>
          {row.url ? <span>{linkName(row.url)}</span> : row.location ? <span>{row.location}</span> : null}
        </p>
        {row.url ? (
          <div className="upnext__actions">
            {isMeetingLink(row.url) ? (
              <a className="btn btn--ember" href={row.url} target="_blank" rel="noreferrer">
                <IconVideo size={15} />
                Join {linkName(row.url)}
              </a>
            ) : (
              <a className="btn btn--secondary" href={row.url} target="_blank" rel="noreferrer">
                <IconLink size={15} />
                Open link
              </a>
            )}
          </div>
        ) : null}
      </div>
      <span className="upnext__wolf">
        <Wolf mood={MOOD[row.kind]} size={112} motion={now0 ? 'bob' : 'idle'} eager />
      </span>
    </section>
  );
}

interface CalendarViewProps {
  table: Pick<LiveTable<CalendarRow>, 'rows' | 'loading' | 'error' | 'reload'>;
  /** The page's 'calendar_add' commands: other kinds are left out here. */
  commands: CalendarCommand[];
  jobs: JobRow[];
  inbox: InboxRow[];
  now: number;
  online: boolean;
  onAdd: (payload: CalendarPayload) => Promise<void>;
  toast: (toast: ToastInput) => void;
}

/** The page's content for a table of events, so the preview can feed it mock rows. */
export function CalendarView({ table, commands, jobs, inbox, now, online, onAdd, toast }: CalendarViewProps) {
  const [scope, setScope] = useState<Scope>(readScope);
  const [adding, setAdding] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const lookup = useMemo(() => companyLookup(jobs), [jobs]);
  const missing = table.error?.kind === 'missing-table';
  const minute = Math.floor(now / 60000);

  const changeScope = (next: Scope) => {
    setScope(next);
    try {
      window.localStorage.setItem(SCOPE_KEY, next);
    } catch {
      // A private window keeps the choice for this visit only.
    }
  };

  // Rows on the agenda: the calendar's own, then the ones on their way. A command whose event has arrived drops out.
  const items = useMemo(() => {
    const known = new Set(table.rows.map((r) => `${r.title}|${startOf(r)}`));
    const recent = now - 3 * 86_400_000;
    const waiting: AgendaItem[] = [];
    for (const c of commands) {
      if (c.kind !== 'calendar_add') continue;
      if (c.status === 'done') continue;
      if (c.status === 'failed' && Date.parse(c.created_at) < recent) continue;
      const row = pendingRow(c);
      if (!row || known.has(`${row.title}|${startOf(row)}`)) continue;
      waiting.push({ row, command: c });
    }
    const all: AgendaItem[] = [...table.rows.map((row) => ({ row })), ...waiting];
    return scope === 'hunt' ? all.filter((i) => isJobHunt(i.row) || i.command) : all;
    // The minute is enough: failed commands age out of view slowly.
  }, [table.rows, commands, scope, minute]);

  const t = minute * 60000;
  const ahead = useMemo(() => items.filter((i) => endOf(i.row) > t).sort((a, b) => startOf(a.row) - startOf(b.row)), [items, t]);
  const past = useMemo(() => items.filter((i) => endOf(i.row) <= t && endOf(i.row) > t - WEEK).sort((a, b) => startOf(b.row) - startOf(a.row)), [items, t]);
  const groups = useMemo(() => groupByDay(ahead, t), [ahead, t]);
  const pastGroups = useMemo(() => groupByDay(past, t), [past, t]);
  const next = ahead.find((i) => !i.command)?.row ?? null;
  const kinds = useMemo(() => kindsByDay(items.map((i) => i.row)), [items]);

  // Names for the add dialog's suggestions: the jobs' companies and the inbox's.
  const companies = useMemo(() => {
    const names = new Set<string>();
    for (const j of jobs) names.add(displayName(j));
    for (const r of inbox) names.add(lookup(r.company)?.name ?? r.company);
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b)).slice(0, 300);
  }, [jobs, inbox, lookup]);

  // A day picked on the month grid: open Earlier when it is there, then bring the day into view.
  useEffect(() => {
    if (!scrollTo) return;
    const el = document.getElementById(`cal-day-${scrollTo}`);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
    setScrollTo(null);
  }, [scrollTo, showEarlier]);

  const pick = (key: string) => {
    setPicked(key);
    if (pastGroups.some((g) => g.key === key)) setShowEarlier(true);
    setScrollTo(key);
  };

  async function add(payload: CalendarPayload) {
    await onAdd(payload);
    toast({ tone: 'ok', title: online ? 'Adding to Google Calendar' : 'Queued for Google Calendar', detail: payload.title });
  }

  const header = (
    <PageHeader
      page="calendar"
      title="Calendar"
      actions={
        <>
          <PillGroup<Scope>
            label="Show"
            value={scope}
            onChange={changeScope}
            options={[
              { value: 'hunt', label: 'Job hunt only' },
              { value: 'all', label: 'Everything' },
            ]}
          />
          <button type="button" className="btn btn--primary" onClick={() => setAdding(true)} disabled={missing}>
            <IconPlus size={15} />
            Add to calendar
          </button>
        </>
      }
    />
  );

  let body;
  if (missing) {
    body = (
      <div className="card">
        <EmptyState wolf="thinking" title="Calendar not set up yet" text="Needs the latest supabase/schema.sql. Run it once, then start the agent." />
      </div>
    );
  } else if (table.error) {
    body = (
      <div className="card">
        <EmptyState
          wolf="thinking"
          title="Could not load the calendar"
          text={table.error.message}
          action={
            <button type="button" className="btn btn--secondary btn--sm" onClick={table.reload}>
              Try again
            </button>
          }
        />
      </div>
    );
  } else if (table.loading) {
    body = (
      <div className="calskel" aria-busy="true" aria-label="Loading">
        <span className="skeleton calskel__hero" />
        <span className="skeleton calskel__line" />
        <span className="skeleton calskel__line" />
        <span className="skeleton calskel__line calskel__line--short" />
      </div>
    );
  } else if (table.rows.length === 0 && items.length === 0) {
    body = (
      <div className="card">
        <EmptyState
          friend="panda-idea"
          title="No events yet"
          text="The agent syncs your Google Calendar here."
          action={
            <button type="button" className="btn btn--secondary btn--sm" onClick={() => setAdding(true)}>
              <IconPlus size={14} />
              Add to calendar
            </button>
          }
        />
      </div>
    );
  } else {
    body = (
      <>
        <UpNext row={next} now={now} lookup={lookup} onAdd={() => setAdding(true)} />
        <div className="calgrid">
          <section className="card agenda" aria-label="Agenda">
            {groups.length === 0 ? (
              <div className="agenda__empty">
                <p>{scope === 'hunt' ? 'Nothing for the job hunt ahead.' : 'Nothing ahead.'}</p>
                {scope === 'hunt' && table.rows.length > 0 ? (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => changeScope('all')}>
                    Show everything
                  </button>
                ) : null}
              </div>
            ) : (
              groups.map((g) => (
                <section key={g.key} id={`cal-day-${g.key}`} className="agday" aria-labelledby={`cal-h-${g.key}`}>
                  <h2 className="agday__head" id={`cal-h-${g.key}`}>
                    <span className="agday__label">{g.label}</span>
                    {g.label === 'Today' || g.label === 'Tomorrow' ? <span className="agday__date num">{shortDate(g.date)}</span> : null}
                    <span className="agday__count num">{g.items.length}</span>
                  </h2>
                  <ul className="agday__list">
                    {g.items.map((item, i) => (
                      <EventRow key={item.row.id} item={item} now={now} lookup={lookup} online={online} index={i} />
                    ))}
                  </ul>
                </section>
              ))
            )}
            {pastGroups.length ? (
              <div className="agenda__earlier">
                <button type="button" className="agenda__toggle" aria-expanded={showEarlier} onClick={() => setShowEarlier((v) => !v)}>
                  <IconChevronDown size={15} className={showEarlier ? 'is-flipped' : ''} />
                  Earlier
                  <span className="num">{past.length}</span>
                </button>
                {showEarlier
                  ? pastGroups.map((g) => (
                      <section key={g.key} id={`cal-day-${g.key}`} className="agday agday--past" aria-labelledby={`cal-h-${g.key}`}>
                        <h2 className="agday__head" id={`cal-h-${g.key}`}>
                          <span className="agday__label">{g.label}</span>
                          <span className="agday__count num">{g.items.length}</span>
                        </h2>
                        <ul className="agday__list">
                          {g.items.map((item, i) => (
                            <EventRow key={item.row.id} item={item} now={now} lookup={lookup} online={online} index={i} />
                          ))}
                        </ul>
                      </section>
                    ))
                  : null}
              </div>
            ) : null}
          </section>
          <aside className="calside">
            <MonthGrid kinds={kinds} now={now} picked={picked} onPick={pick} />
          </aside>
        </div>
      </>
    );
  }

  return (
    <div className="calpage page">
      {header}
      {body}
      <AddEventDialog open={adding} onClose={() => setAdding(false)} onAdd={add} companies={companies} now={now} online={online} />
    </div>
  );
}

/** The page wired to Supabase. */
export function CalendarPage({ userId, jobs, inbox, now, online, toast, table }: {
  userId: string;
  jobs: JobRow[];
  inbox: InboxRow[];
  now: number;
  online: boolean;
  toast: (toast: ToastInput) => void;
  /** The dashboard already follows the calendar for the Overview; the page shares it. */
  table: LiveTable<CalendarRow>;
}) {
  const commands = useCalendarCommands(userId);
  return (
    <CalendarView
      table={table}
      commands={commands.rows}
      jobs={jobs}
      inbox={inbox}
      now={now}
      online={online}
      toast={toast}
      onAdd={async (payload) => {
        await addCalendarEvent(payload);
        commands.reload();
      }}
    />
  );
}

export default CalendarPage;
