// Tampa time: the clock, greetings, "today", calendar days and printed dates all follow America/New_York, wherever
// the browser is.

export const TZ = 'America/New_York';

const DAY = 86_400_000;
const formats = new Map<string, Intl.DateTimeFormat>();

/** An Intl formatter in Tampa time, made once per set of options. */
export function tampaFormat(options: Intl.DateTimeFormatOptions, locale = 'en-US'): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let hit = formats.get(key);
  if (!hit) {
    hit = new Intl.DateTimeFormat(locale, { ...options, timeZone: TZ });
    formats.set(key, hit);
  }
  return hit;
}

export interface TampaParts {
  year: number;
  /** 1 to 12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 Sunday to 6 Saturday */
  weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The wall clock in Tampa at a moment. */
export function tampaParts(ms: number): TampaParts {
  const parts = tampaFormat({ year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short', hourCycle: 'h23' }).formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: Math.max(0, WEEKDAYS.indexOf(get('weekday'))),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A Tampa calendar day, yyyy-mm-dd. */
export function tampaDayKey(ms: number): string {
  const p = tampaParts(ms);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The moment Tampa's day began, for a moment in it. */
export function tampaStartOfDay(ms: number): number {
  const p = tampaParts(ms);
  return Math.floor(ms / 1000) * 1000 - ((p.hour * 60 + p.minute) * 60 + p.second) * 1000;
}

/** The start of the Tampa day n days after the one `dayStart` begins (safe across daylight saving changes). */
export function tampaAddDays(dayStart: number, n: number): number {
  return tampaStartOfDay(dayStart + n * DAY + 12 * 3_600_000);
}

/** Midnight in Tampa of a calendar date (month 1 to 12). */
export function tampaMidnight(year: number, month: number, day: number): number {
  // Noon UTC of that date is the same calendar day in Tampa; step back to its start.
  return tampaStartOfDay(Date.UTC(year, month - 1, day, 12));
}

/** Whole Tampa days from `from` to `to`: 0 the same day, 1 the next. */
export function tampaDayDiff(from: number, to: number): number {
  return Math.round((tampaStartOfDay(to) - tampaStartOfDay(from)) / DAY);
}

/** "Good morning" by the hour in Tampa. */
export function tampaGreeting(ms: number): string {
  const h = tampaParts(ms).hour;
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** True from 7 in the evening to 6 in the morning in Tampa: the clock shows a moon. */
export const isTampaNight = (ms: number) => {
  const h = tampaParts(ms).hour;
  return h < 6 || h >= 19;
};

/** "9:41 PM" */
export const tampaTime = (ms: number) => tampaFormat({ hour: 'numeric', minute: '2-digit' }).format(ms);

/** "Nov 3", or "Nov 3, 2025" when it is not this year in Tampa. */
export function tampaDate(ms: number, now: number = Date.now()): string {
  const same = tampaParts(ms).year === tampaParts(now).year;
  return tampaFormat(same ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }).format(ms);
}
