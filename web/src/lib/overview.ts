// The Overview's numbers, all derived from rows the app already loads: jobs (applications included), cover letters,
// the inbox, agent commands and the agent row. Pure functions, so the preview can feed them mock rows.
import type { CoverLetterRow } from './coverLetter';
import { APPLICATION_STATUSES, displayName, logoDomain, plural, statusInfo } from './format';
import type { InboxRow } from './inbox';
import { companyKey } from './jobs';
import type { AgentRow, CommandRow, JobRow } from './types';

const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** A local calendar day, yyyy-mm-dd. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** The last n local days, oldest first. */
export function lastDays(n: number, now: number): string[] {
  const today = startOfDay(now);
  return Array.from({ length: n }, (_, i) => dayKey(today - (n - 1 - i) * DAY));
}

/** How many of the times fall on each of the days. */
export function countByDay(times: (string | null | undefined)[], days: string[]): number[] {
  const index = new Map(days.map((d, i) => [d, i]));
  const out = days.map(() => 0);
  for (const t of times) {
    if (!t) continue;
    const ms = Date.parse(t);
    if (!Number.isFinite(ms)) continue;
    const i = index.get(dayKey(ms));
    if (i !== undefined) out[i] += 1;
  }
  return out;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface Kpi {
  key: 'found' | 'strong' | 'letters' | 'applied' | 'replies' | 'interviews';
  label: string;
  value: number;
  /** Daily counts for the last 14 days, oldest first. */
  series: number[];
  /** The last 7 days against the 7 before. */
  thisWeek: number;
  lastWeek: number;
  /** A short gray note under the number, such as dry runs counted apart. */
  note?: string;
}

const isSent = (j: JobRow) => j.status === 'submitted' || j.status === 'unconfirmed';
const isFinished = (j: JobRow) => APPLICATION_STATUSES.includes(j.status) && j.status !== 'applying';
const isReply = (r: InboxRow) => r.status !== 'applied' && r.status !== 'withdrawn';
const isInterview = (r: InboxRow) => r.status === 'interview' || r.status === 'offer';
const isStrong = (j: JobRow) => (j.score ?? 0) >= 4;

export interface OverviewInput {
  jobs: JobRow[];
  letters: CoverLetterRow[];
  inbox: InboxRow[];
  commands: CommandRow[];
  agent: AgentRow | null;
  now: number;
}

/** Postings the agent has seen: its own counter, else the rows it kept. */
export const foundCount = (agent: AgentRow | null, jobs: JobRow[]) => Math.max(agent?.jobs_found ?? 0, jobs.length);

export function buildKpis({ jobs, letters, inbox, agent, now }: OverviewInput): Kpi[] {
  const days = lastDays(14, now);
  const split = (series: number[]) => ({ thisWeek: sum(series.slice(7)), lastWeek: sum(series.slice(0, 7)) });
  const make = (key: Kpi['key'], label: string, value: number, times: (string | null | undefined)[], note?: string): Kpi => {
    const series = countByDay(times, days);
    return { key, label, value, series, ...split(series), note };
  };
  const sent = jobs.filter(isSent);
  const dryRuns = jobs.filter((j) => isFinished(j) && statusInfo(j).tone === 'filled').length;
  return [
    make('found', 'Found', foundCount(agent, jobs), jobs.map((j) => j.found_at)),
    make('strong', 'Strong matches', jobs.filter(isStrong).length, jobs.filter(isStrong).map((j) => j.found_at)),
    make('letters', 'Letters written', letters.length, letters.map((l) => l.updated_at)),
    make('applied', 'Applied', sent.length, sent.map((j) => j.updated_at), dryRuns ? `${plural(dryRuns, 'dry run')} counted apart` : undefined),
    make('replies', 'Replies', inbox.filter(isReply).length, inbox.filter(isReply).map((r) => r.updated_at)),
    make('interviews', 'Interviews', inbox.filter(isInterview).length, inbox.filter(isInterview).map((r) => r.updated_at)),
  ];
}

export interface TrailStage {
  key: string;
  label: string;
  count: number;
}

/** The pipeline, from a posting found to an interview. */
export function buildTrail({ jobs, letters, inbox, agent }: OverviewInput): TrailStage[] {
  return [
    { key: 'found', label: 'Found', count: foundCount(agent, jobs) },
    { key: 'strong', label: 'Strong match', count: jobs.filter(isStrong).length },
    { key: 'letter', label: 'Letter', count: letters.length },
    { key: 'applied', label: 'Applied', count: jobs.filter(isSent).length },
    { key: 'replied', label: 'Replied', count: inbox.filter(isReply).length },
    { key: 'interview', label: 'Interview', count: inbox.filter(isInterview).length },
  ];
}

export interface HeatDay {
  day: string;
  date: number;
  applications: number;
  letters: number;
  total: number;
  future: boolean;
}

/** Twelve weeks of applications and letters, one column per week (Monday first), the current week last. */
export function buildHeatmap({ jobs, letters, now }: OverviewInput): HeatDay[][] {
  const today = startOfDay(now);
  const weekday = (new Date(today).getDay() + 6) % 7; // Monday 0
  const start = today - (weekday + 7 * 11) * DAY;
  const apps = new Map<string, number>();
  const lets = new Map<string, number>();
  for (const j of jobs) if (isFinished(j)) {
    const k = dayKey(Date.parse(j.updated_at));
    apps.set(k, (apps.get(k) ?? 0) + 1);
  }
  for (const l of letters) {
    const k = dayKey(Date.parse(l.updated_at));
    lets.set(k, (lets.get(k) ?? 0) + 1);
  }
  return Array.from({ length: 12 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = start + (w * 7 + d) * DAY;
      const key = dayKey(date);
      const a = apps.get(key) ?? 0;
      const l = lets.get(key) ?? 0;
      return { day: key, date, applications: a, letters: l, total: a + l, future: date > today };
    }),
  );
}

/** Heatmap level 0 to 4 for a day's total. */
export const heatLevel = (n: number) => (n <= 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/** Scores 1 to 5 in half steps. */
export function scoreHistogram(jobs: JobRow[]): Bin[] {
  const bins: Bin[] = Array.from({ length: 8 }, (_, i) => ({ from: 1 + i * 0.5, to: 1.5 + i * 0.5, count: 0 }));
  for (const j of jobs) {
    if (j.score === null || !Number.isFinite(j.score)) continue;
    const i = Math.min(7, Math.max(0, Math.floor((j.score - 1) / 0.5)));
    bins[i].count += 1;
  }
  return bins;
}

export interface CompanyStat {
  key: string;
  name: string;
  domain: string;
  count: number;
  best: number;
}

/** The companies with the most scored jobs, each with its best score. */
export function topCompanies(jobs: JobRow[], n = 6): CompanyStat[] {
  const map = new Map<string, CompanyStat>();
  for (const j of jobs) {
    if (j.score === null) continue;
    const key = companyKey(j);
    if (!key) continue;
    const hit = map.get(key);
    if (hit) {
      hit.count += 1;
      hit.best = Math.max(hit.best, j.score);
    } else map.set(key, { key, name: displayName(j), domain: logoDomain(j.company_domain), count: 1, best: j.score });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.best - a.best || a.name.localeCompare(b.name)).slice(0, n);
}

const KIND_TESTS: [string, RegExp][] = [
  ['AI/ML', /\b(ai|a\.i\.|ml|machine learning|deep learning|llm|nlp|computer vision|genai|generative|applied scientist)\b/i],
  ['Data', /\b(data|analytics|analyst|bi|business intelligence|scientist)\b/i],
  ['Mobile', /\b(mobile|ios|android|react native|flutter)\b/i],
  ['Frontend', /\b(front[\s-]?end|ui|ux|web)\b/i],
  ['Backend', /\b(back[\s-]?end|server|api|services?|distributed|infrastructure|infra|platform|systems|cloud|devops|sre)\b/i],
  ['Software', /\b(software|swe|developer|engineer|engineering|full[\s-]?stack|programmer)\b/i],
];

export const KINDS = ['Software', 'Backend', 'AI/ML', 'Data', 'Frontend', 'Mobile', 'Other'];

/** One kind per job title, the first that fits; the rest are Other. */
export function primaryKind(title: string): string {
  return KIND_TESTS.find(([, test]) => test.test(title))?.[0] ?? 'Other';
}

/** Scored jobs per kind of role, most first, Other last. */
export function kindBreakdown(jobs: JobRow[]): { name: string; count: number }[] {
  const counts = new Map(KINDS.map((k) => [k, 0]));
  for (const j of jobs) if (j.score !== null) counts.set(primaryKind(j.title), (counts.get(primaryKind(j.title)) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .filter((k) => k.count > 0)
    .sort((a, b) => (a.name === 'Other' ? 1 : b.name === 'Other' ? -1 : b.count - a.count));
}

export const INBOX_ORDER: { status: string; label: string }[] = [
  { status: 'applied', label: 'Applied' },
  { status: 'assessment', label: 'Assessment' },
  { status: 'interview', label: 'Interview' },
  { status: 'offer', label: 'Offer' },
  { status: 'rejected', label: 'Rejected' },
];

export function inboxBreakdown(inbox: InboxRow[]): { status: string; label: string; count: number }[] {
  return INBOX_ORDER.map((s) => ({ ...s, count: inbox.filter((r) => r.status === s.status).length }));
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: 'letter' | 'sent' | 'filled' | 'stopped' | 'found' | 'command';
  text: string;
  name?: string;
  domain?: string;
}

const COMMAND_TEXT: Record<string, (c: CommandRow) => string> = {
  search: () => 'Asked the agent for more jobs',
  apply: (c) => `Queued ${plural(c.job_ids.length, 'application')}${c.dry_run ? ' as a dry run' : ''}`,
  cover_letter: (c) => `Asked for ${plural(c.job_ids.length, 'letter')}`,
  resume: () => 'Sent a resume to read',
  linkedin: () => 'Sent a LinkedIn profile to read',
  calendar_add: () => 'Asked to add an event to Google Calendar',
};

/** The latest things that happened, newest first. Jobs found are grouped per day. */
export function recentActivity({ jobs, letters, commands }: OverviewInput, n = 8): ActivityItem[] {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const items: ActivityItem[] = [];
  for (const l of letters) {
    const job = byId.get(l.job_id);
    const name = job ? displayName(job) : 'a job';
    items.push({ id: `l-${l.job_id}`, at: l.updated_at, kind: 'letter', text: `Letter written for ${name}`, name: job ? name : undefined, domain: job?.company_domain });
  }
  for (const j of jobs) {
    if (!isFinished(j)) continue;
    const name = displayName(j);
    const tone = statusInfo(j).tone;
    const kind = tone === 'sent' || tone === 'unconfirmed' ? 'sent' : tone === 'filled' ? 'filled' : 'stopped';
    const text = kind === 'sent' ? `Sent to ${name}` : kind === 'filled' ? `Filled at ${name}, dry run` : `${statusInfo(j).label} at ${name}`;
    items.push({ id: `a-${j.id}`, at: j.updated_at, kind, text, name, domain: j.company_domain });
  }
  const found = new Map<string, { at: string; count: number }>();
  for (const j of jobs) {
    if (!j.found_at) continue;
    const k = dayKey(Date.parse(j.found_at));
    const hit = found.get(k);
    if (!hit) found.set(k, { at: j.found_at, count: 1 });
    else {
      hit.count += 1;
      if (j.found_at > hit.at) hit.at = j.found_at;
    }
  }
  for (const [k, f] of found) items.push({ id: `f-${k}`, at: f.at, kind: 'found', text: `${plural(f.count, 'new job')} found` });
  for (const c of commands) {
    const text = (COMMAND_TEXT[c.kind] ?? (() => `Command ${c.kind}`))(c);
    items.push({ id: `c-${c.id}`, at: c.created_at, kind: 'command', text });
  }
  return items.filter((i) => Number.isFinite(Date.parse(i.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, n);
}

export function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** One sentence on how the hunt is going. */
export function briefing({ jobs, inbox, now }: OverviewInput): string {
  const scored = jobs.filter((j) => j.score !== null).length;
  if (scored === 0) return 'The agent has not scored any internships yet. Ask it to find some.';
  const strong = jobs.filter(isStrong).length;
  const weekAgo = now - 7 * DAY;
  const thisWeek = jobs.filter((j) => isSent(j) && Date.parse(j.updated_at) >= weekAgo).length;
  const interviews = inbox.filter(isInterview).length;
  return `${plural(scored, 'internship')} scored, ${plural(strong, 'strong match', 'strong matches')}. ${plural(thisWeek, 'application')} this week, ${plural(interviews, 'interview')}.`;
}

/** A company row in the inbox, resolved to a display name and a logo domain through the jobs when it can be. */
export function companyLookup(jobs: JobRow[]) {
  const byName = new Map<string, { name: string; domain: string }>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const j of jobs) {
    const name = displayName(j);
    const domain = logoDomain(j.company_domain);
    for (const key of [norm(name), norm(j.company)]) if (key && (!byName.has(key) || (domain && !byName.get(key)?.domain))) byName.set(key, { name, domain });
  }
  return (raw: string) => byName.get(norm(raw)) ?? null;
}
