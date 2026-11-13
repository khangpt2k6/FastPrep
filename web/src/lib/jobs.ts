// Filters and groupings for the Jobs page: kinds of roles read from titles, companies, tracks and sorting.
import { displayName, isNewJob, logoDomain } from './format';
import type { JobRow } from './types';

export type Track = 'all' | 'new' | 'remote' | 'top' | 'saved';
export type SortKey = 'score' | 'new' | 'company' | 'title';
export type MinScore = 0 | 3 | 4;

export const SORT_LABEL: Record<SortKey, string> = {
  score: 'Best match',
  new: 'Newest',
  company: 'Company',
  title: 'Title',
};

/** Kinds of roles, tried in this order; a title can be more than one. "Software" catches the rest. */
const KINDS: [string, RegExp][] = [
  ['AI/ML', /\b(ai|a\.i\.|ml|machine learning|deep learning|llm|nlp|computer vision|genai|generative|applied scientist)\b/i],
  ['Data', /\b(data|analytics|analyst|bi|business intelligence|scientist)\b/i],
  ['Backend', /\b(back[\s-]?end|server|api|services?|distributed)\b/i],
  ['Frontend', /\b(front[\s-]?end|ui|ux|web)\b/i],
  ['Full stack', /\bfull[\s-]?stack\b/i],
  ['Mobile', /\b(mobile|ios|android|react native|flutter)\b/i],
  ['Cloud & infra', /\b(infra|infrastructure|devops|sre|site reliability|cloud|platform|systems)\b/i],
  ['Security', /\b(security|cyber|appsec)\b/i],
  ['Embedded', /\b(embedded|firmware|hardware|robotics|fpga)\b/i],
  ['QA', /\b(qa|quality|test|sdet)\b/i],
];

/** The kinds a job title reads as; a plain engineering title is "Software". */
export function roleKinds(title: string): string[] {
  const found = KINDS.filter(([, test]) => test.test(title)).map(([name]) => name);
  if (found.length === 0 && /\b(software|swe|developer|engineer|engineering|programmer|intern)\b/i.test(title)) return ['Software'];
  if (found.length > 0 && /\bsoftware\b/i.test(title)) found.push('Software');
  return found;
}

/** Kinds with how many jobs each, most first. */
export function kindCounts(jobs: JobRow[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const job of jobs) for (const kind of roleKinds(job.title)) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** A name as a key: "Snap Inc." and "snap" read the same. */
export function normName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|technologies|technology|labs?|group|holdings)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

/** One key per company: its domain when the agent found one, else its normalized name. */
export function companyKey(job: Pick<JobRow, 'company' | 'company_name' | 'company_domain'>): string {
  return logoDomain(job.company_domain) || normName(displayName(job));
}

/** True when a job is at the company a filter names, by domain or by name. */
export function atCompany(job: Pick<JobRow, 'company' | 'company_name' | 'company_domain'>, key: string): boolean {
  if (!key) return true;
  const want = key.toLowerCase();
  const domain = logoDomain(job.company_domain);
  if (domain && (domain === want || domain.endsWith(`.${want}`) || want.endsWith(`.${domain}`))) return true;
  const name = normName(displayName(job));
  return Boolean(name) && (name === normName(key) || name === normName(want.replace(/\.[a-z.]+$/, '')));
}

export interface CompanyCount {
  key: string;
  name: string;
  domain: string;
  count: number;
}

/** Companies with how many jobs each, most first. */
export function companyCounts(jobs: JobRow[]): CompanyCount[] {
  const map = new Map<string, CompanyCount>();
  for (const job of jobs) {
    const key = companyKey(job);
    if (!key) continue;
    const hit = map.get(key);
    if (hit) hit.count += 1;
    else map.set(key, { key, name: displayName(job), domain: logoDomain(job.company_domain), count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export const isRemote = (job: Pick<JobRow, 'location' | 'title'>) => /\bremote\b/i.test(`${job.location} ${job.title}`);

export interface JobFilters {
  query: string;
  minScore: MinScore;
  track: Track;
  role: string | null;
  company: string | null;
  saved: Set<string>;
  now: number;
}

/** True when a job passes the track alone, for the track pills' counts. */
export function onTrack(job: JobRow, track: Track, saved: Set<string>, now: number): boolean {
  switch (track) {
    case 'new':
      return isNewJob(job, now);
    case 'remote':
      return isRemote(job);
    case 'top':
      return (job.score ?? 0) >= 4;
    case 'saved':
      return saved.has(job.id);
    default:
      return true;
  }
}

export function filterJobs(jobs: JobRow[], f: JobFilters): JobRow[] {
  const q = f.query.trim().toLowerCase();
  return jobs.filter((job) => {
    if ((job.score ?? 0) < f.minScore) return false;
    if (!onTrack(job, f.track, f.saved, f.now)) return false;
    if (f.role && !roleKinds(job.title).includes(f.role)) return false;
    if (f.company && !atCompany(job, f.company)) return false;
    if (!q) return true;
    return `${job.title} ${job.company} ${displayName(job)} ${job.location}`.toLowerCase().includes(q);
  });
}

const foundTime = (job: JobRow) => Date.parse(job.found_at ?? '') || Date.parse(job.updated_at) || 0;

export function sortJobs(jobs: JobRow[], key: SortKey): JobRow[] {
  const byScore = (a: JobRow, b: JobRow) => (b.score ?? 0) - (a.score ?? 0);
  const byName = (a: JobRow, b: JobRow) => displayName(a).localeCompare(displayName(b));
  const list = [...jobs];
  switch (key) {
    case 'new':
      return list.sort((a, b) => foundTime(b) - foundTime(a) || byScore(a, b));
    case 'company':
      return list.sort((a, b) => byName(a, b) || byScore(a, b));
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title) || byScore(a, b));
    default:
      return list.sort((a, b) => byScore(a, b) || byName(a, b));
  }
}

/** When the job was found, for the row's time column. */
export function foundAt(job: JobRow): string {
  return job.found_at || job.updated_at;
}

/** A score's tier for its color: teal 4 and up, amber 3 to 3.9, red below 3. */
export function scoreTier(score: number | null): 'high' | 'mid' | 'low' | 'none' {
  if (score === null || !Number.isFinite(score)) return 'none';
  if (score >= 4) return 'high';
  if (score >= 3) return 'mid';
  return 'low';
}
