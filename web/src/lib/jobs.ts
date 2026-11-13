// Filters for the Jobs page, company keys (shared with Companies), sorting and the match meter's words.
import { displayName, isNewJob, logoDomain } from './format';
import type { JobRow } from './types';

export type SortKey = 'score' | 'new';
export type MinScore = 0 | 3 | 4;

export const SORT_LABEL: Record<SortKey, string> = {
  score: 'Best match',
  new: 'Newest',
};

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

export interface JobFilters {
  query: string;
  minScore: MinScore;
  /** Only jobs found in the last 24 hours. */
  newOnly: boolean;
  /** Only the starred ones. */
  savedOnly: boolean;
  company: string | null;
  saved: Set<string>;
  now: number;
}

export function filterJobs(jobs: JobRow[], f: JobFilters): JobRow[] {
  const q = f.query.trim().toLowerCase();
  return jobs.filter((job) => {
    if ((job.score ?? 0) < f.minScore) return false;
    if (f.newOnly && !isNewJob(job, f.now)) return false;
    if (f.savedOnly && !f.saved.has(job.id)) return false;
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
  if (key === 'new') return list.sort((a, b) => foundTime(b) - foundTime(a) || byScore(a, b));
  return list.sort((a, b) => byScore(a, b) || byName(a, b));
}

/** When the job was found, for the row's time column. */
export function foundAt(job: JobRow): string {
  return job.found_at || job.updated_at;
}

/** The match meter's word: Strong 4 and up, Good 3 and up, Fair below. */
export function matchWord(score: number): 'Strong' | 'Good' | 'Fair' {
  if (score >= 4) return 'Strong';
  if (score >= 3) return 'Good';
  return 'Fair';
}

/** Remote, Hybrid or On site, read from the location (and the title, where some postings say it). */
export function workMode(job: Pick<JobRow, 'location' | 'title'>): '' | 'Remote' | 'Hybrid' | 'On site' {
  const text = `${job.location} ${job.title}`;
  if (/\bhybrid\b/i.test(text)) return 'Hybrid';
  if (/\bremote\b/i.test(text)) {
    // "Remote; London" or "San Francisco, CA; Remote" offer both: remote is the useful part.
    return 'Remote';
  }
  return job.location.trim() ? 'On site' : '';
}
