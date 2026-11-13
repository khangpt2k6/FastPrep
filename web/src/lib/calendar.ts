// The Calendar: upcoming interviews, calls with companies and deadlines, read from the person's Google Calendar by the
// agent on their computer. Pure helpers, so the preview can feed them mock rows.
import type { TagColor } from './format';
import { dayKey } from './overview';

/** Named in supabase/schema.sql. Kept here, next to its only users, until it joins TABLES in supabase.ts. */
export const CALENDAR_TABLE = 'automation_calendar';

export type CalendarKind = 'interview' | 'call' | 'assessment' | 'deadline' | 'other';
export type CalendarSource = 'google' | 'web' | 'agent';

/** One event, as the agent pushed it from Google Calendar (or added it from this page). */
export interface CalendarRow {
  user_id?: string;
  /** The event's UID in Google Calendar. */
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string;
  /** A meeting link, when there is one. */
  url: string;
  kind: CalendarKind;
  company: string;
  notes: string;
  source: CalendarSource;
  synced_at: string;
}

/** What the page asks the agent to put in Google Calendar (a 'calendar_add' command). */
export interface CalendarPayload {
  title: string;
  /** ISO 8601 with the local offset, such as 2026-11-14T10:00:00-05:00. */
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string;
  url: string;
  notes: string;
  kind: CalendarKind;
  company: string;
}

/** A 'calendar_add' command, for the rows still on their way and the ones that failed. */
export interface CalendarCommand {
  id: number;
  kind: string;
  payload: Partial<CalendarPayload> | null;
  status: 'pending' | 'running' | 'done' | 'failed';
  error: string;
  created_at: string;
}

export const CALENDAR_KINDS: { kind: CalendarKind; label: string; color: TagColor }[] = [
  { kind: 'interview', label: 'Interview', color: 'orange' },
  { kind: 'call', label: 'Call', color: 'blue' },
  { kind: 'assessment', label: 'Assessment', color: 'yellow' },
  { kind: 'deadline', label: 'Deadline', color: 'red' },
  { kind: 'other', label: 'Other', color: 'gray' },
];

export function kindInfo(kind: string): { kind: CalendarKind; label: string; color: TagColor } {
  return CALENDAR_KINDS.find((k) => k.kind === kind) ?? CALENDAR_KINDS[CALENDAR_KINDS.length - 1];
}

/** Interviews, calls, assessments and deadlines: everything but the rest of the person's calendar. */
export const isJobHunt = (row: Pick<CalendarRow, 'kind'>) => row.kind !== 'other';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * The calendar day of an all-day event. Google gives a date: stored as midnight UTC it is that UTC date, stored as
 * local midnight with its offset it is the local date.
 */
function allDayStart(iso: string): number {
  const d = new Date(iso);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function startOf(row: Pick<CalendarRow, 'starts_at' | 'all_day'>): number {
  return row.all_day ? allDayStart(row.starts_at) : Date.parse(row.starts_at);
}

/** When it ends: its own end, a day for an all-day event, an hour when it has none. */
export function endOf(row: Pick<CalendarRow, 'starts_at' | 'ends_at' | 'all_day'>): number {
  const start = startOf(row);
  if (row.all_day) {
    const end = row.ends_at ? allDayStart(row.ends_at) : start + DAY;
    return Math.max(end, start + DAY);
  }
  const end = row.ends_at ? Date.parse(row.ends_at) : NaN;
  return Number.isFinite(end) && end > start ? end : start + HOUR;
}

/** Events that have not ended yet, soonest first. */
export function upcoming<T extends Pick<CalendarRow, 'starts_at' | 'ends_at' | 'all_day'>>(rows: T[], now: number): T[] {
  return rows.filter((r) => Number.isFinite(startOf(r)) && endOf(r) > now).sort((a, b) => startOf(a) - startOf(b));
}

/** Events that ended in the last week, newest first. */
export function earlier<T extends Pick<CalendarRow, 'starts_at' | 'ends_at' | 'all_day'>>(rows: T[], now: number): T[] {
  return rows.filter((r) => endOf(r) <= now && endOf(r) > now - 7 * DAY).sort((a, b) => startOf(b) - startOf(a));
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const WEEKDAY_DATE = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' });
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "Today", "Tomorrow", "Yesterday", or "Thu, Nov 14". */
export function dayLabel(ms: number, now: number): string {
  const diff = Math.round((startOfDay(ms) - startOfDay(now)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return WEEKDAY_DATE.format(ms);
}

export const shortDate = (ms: number) => WEEKDAY_DATE.format(ms);

export const clockTime = (ms: number) => TIME.format(ms);

/** "10:00 to 10:45 AM", "11:30 AM to 12:15 PM", or "All day". */
export function timeRange(row: Pick<CalendarRow, 'starts_at' | 'ends_at' | 'all_day'>): string {
  if (row.all_day) return 'All day';
  const a = TIME.format(startOf(row));
  const b = TIME.format(endOf(row));
  const period = /\s?(AM|PM)$/i;
  const pa = a.match(period)?.[1];
  const pb = b.match(period)?.[1];
  return pa && pb && pa === pb ? `${a.replace(period, '')} to ${b}` : `${a} to ${b}`;
}

/** "45 min", "1 h", "1 h 30 min". */
export function durationText(row: Pick<CalendarRow, 'starts_at' | 'ends_at' | 'all_day'>): string {
  if (row.all_day) return '';
  const mins = Math.round((endOf(row) - startOf(row)) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "in 2 h 14 min", "in 3 days", "now", "today": how long until it starts. */
export function countdown(row: Pick<CalendarRow, 'starts_at' | 'ends_at' | 'all_day'>, now: number): string {
  const start = startOf(row);
  if (row.all_day) {
    const days = Math.round((start - startOfDay(now)) / DAY);
    if (days <= 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
  }
  const ms = start - now;
  if (ms <= 0) return 'now';
  const mins = Math.ceil(ms / 60000);
  if (mins < 1) return 'in under a minute';
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return mins % 60 ? `in ${hours} h ${mins % 60} min` : `in ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 2) return hours % 24 ? `in 1 day ${hours % 24} h` : 'in 1 day';
  return `in ${days} days`;
}

/** Minutes until it ends, for an event happening now. */
export function endsIn(row: Pick<CalendarRow, 'starts_at' | 'ends_at' | 'all_day'>, now: number): string {
  const mins = Math.max(1, Math.ceil((endOf(row) - now) / 60000));
  return mins < 60 ? `ends in ${mins} min` : `ends in ${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim();
}

const MEETING = /(meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|chime\.aws|gotomeeting\.com|bluejeans\.com)/i;

/** True for a video meeting link (Meet, Zoom, Teams and the like): the page shows Join for it. */
export const isMeetingLink = (url: string) => /^https?:\/\//i.test(url) && MEETING.test(url);

/** "Google Meet", "Zoom", ... for a meeting link, else the host. */
export function linkName(url: string): string {
  if (/meet\.google\.com/i.test(url)) return 'Google Meet';
  if (/zoom\.us/i.test(url)) return 'Zoom';
  if (/teams\.(microsoft|live)\.com/i.test(url)) return 'Microsoft Teams';
  if (/webex\.com/i.test(url)) return 'Webex';
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export interface DayGroup<T> {
  key: string;
  label: string;
  date: number;
  rows: T[];
}

/** Rows in day groups, in the order given. */
export function byDay<T extends Pick<CalendarRow, 'starts_at' | 'all_day'>>(rows: T[], now: number): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();
  for (const row of rows) {
    const start = startOf(row);
    const key = dayKey(start);
    const hit = groups.get(key);
    if (hit) hit.rows.push(row);
    else groups.set(key, { key, label: dayLabel(start, now), date: startOfDay(start), rows: [row] });
  }
  return [...groups.values()];
}

/** The kinds of events on each day, for the month grid's dots. */
export function kindsByDay(rows: Pick<CalendarRow, 'starts_at' | 'all_day' | 'kind'>[]): Map<string, CalendarKind[]> {
  const out = new Map<string, CalendarKind[]>();
  for (const row of rows) {
    const key = dayKey(startOf(row));
    const list = out.get(key) ?? [];
    list.push(row.kind);
    out.set(key, list);
  }
  return out;
}

/** The weeks of a month, Monday first, as day starts; days of the next and previous month fill the edges. */
export function monthWeeks(year: number, month: number): number[][] {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const count = Math.ceil((lead + days) / 7);
  return Array.from({ length: count }, (_, w) => Array.from({ length: 7 }, (_, d) => new Date(year, month, 1 - lead + w * 7 + d).getTime()));
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A local date and time as ISO 8601 with its offset: 2026-11-14T10:00:00-05:00. */
export function isoWithOffset(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** What the add dialog holds. */
export interface EventDraft {
  kind: CalendarKind;
  company: string;
  title: string;
  /** yyyy-mm-dd */
  date: string;
  /** hh:mm, 24 hours */
  time: string;
  minutes: number;
  allDay: boolean;
  url: string;
  location: string;
  notes: string;
}

export const DURATIONS = [15, 30, 45, 60, 90];

/** The title the dialog offers for a kind and a company. */
export function suggestTitle(kind: CalendarKind, company: string): string {
  const who = company.trim();
  switch (kind) {
    case 'interview':
      return who ? `Interview with ${who}` : 'Interview';
    case 'call':
      return who ? `Call with ${who}` : 'Call';
    case 'assessment':
      return who ? `${who} online assessment` : 'Online assessment';
    case 'deadline':
      return who ? `${who} application deadline` : 'Application deadline';
    default:
      return who;
  }
}

export function newDraft(now: number): EventDraft {
  const tomorrow = new Date(now + DAY);
  return {
    kind: 'interview',
    company: '',
    title: suggestTitle('interview', ''),
    date: `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`,
    time: '10:00',
    minutes: 45,
    allDay: false,
    url: '',
    location: '',
    notes: '',
  };
}

export type DraftErrors = Partial<Record<'title' | 'date' | 'time' | 'url', string>>;

export function validateDraft(d: EventDraft, now: number): DraftErrors {
  const errors: DraftErrors = {};
  if (!d.title.trim()) errors.title = 'Give it a title.';
  else if (d.title.trim().length > 200) errors.title = 'Keep the title under 200 characters.';
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.date);
  if (!day) errors.date = 'Pick a date.';
  if (!d.allDay && !/^\d{2}:\d{2}$/.test(d.time)) errors.time = 'Pick a start time.';
  if (d.url.trim() && !/^https?:\/\/\S+\.\S+/i.test(d.url.trim())) errors.url = 'Use a full link, starting with https://';
  if (day && !errors.time) {
    const start = draftStart(d);
    if (start && start.getTime() < now - 7 * DAY) errors.date = 'That is more than a week ago.';
  }
  return errors;
}

function draftStart(d: EventDraft): Date | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.date);
  if (!day) return null;
  const [h, m] = d.allDay ? [0, 0] : d.time.split(':').map(Number);
  return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), h, m);
}

/** The command payload for a valid draft: local times with their offset. */
export function toPayload(d: EventDraft): CalendarPayload {
  const start = draftStart(d) as Date;
  const end = d.allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) : new Date(start.getTime() + d.minutes * 60000);
  return {
    title: d.title.trim(),
    starts_at: isoWithOffset(start),
    ends_at: isoWithOffset(end),
    all_day: d.allDay,
    location: d.location.trim(),
    url: d.url.trim(),
    notes: d.notes.trim(),
    kind: d.kind,
    company: d.company.trim(),
  };
}

/** A pending command as a row for the agenda, so it shows where it will land. */
export function pendingRow(c: CalendarCommand): CalendarRow | null {
  const p = c.payload;
  if (!p || !p.starts_at || !p.title) return null;
  return {
    id: `cmd-${c.id}`,
    title: p.title,
    starts_at: p.starts_at,
    ends_at: p.ends_at ?? null,
    all_day: Boolean(p.all_day),
    location: p.location ?? '',
    url: p.url ?? '',
    kind: (p.kind as CalendarKind) ?? 'other',
    company: p.company ?? '',
    notes: p.notes ?? '',
    source: 'web',
    synced_at: c.created_at,
  };
}

/** One line for the Overview's briefing: the next interview, when there is one. */
export function nextInterviewLine(rows: CalendarRow[], now: number, name: (company: string) => string = (c) => c): string {
  const next = upcoming(rows.filter((r) => r.kind === 'interview'), now)[0];
  if (!next) return '';
  const start = startOf(next);
  const day = dayLabel(start, now);
  const dayPart = day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : `on ${day}`;
  const timePart = next.all_day ? '' : ` at ${clockTime(start)}`;
  const who = next.company ? ` with ${name(next.company)}` : '';
  return `Next interview ${dayPart}${timePart}${who}.`;
}
