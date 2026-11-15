// Where the person has applied before, from the inbox (by hand or by the agent, as their mail shows it): a job at a company
// with an application for a role like it is one they already applied to, and another role there is worth knowing about.
import { displayName } from './format';
import type { InboxRow } from './inbox';
import { normName } from './jobs';
import type { JobRow } from './types';

export interface Prior {
  /** An application to a role like this one at the same company; false when only the company is the same. */
  same: boolean;
  role: string;
  status: string;
  at: string;
}

// Words that say little about which role it is.
const PLAIN = new Set(['intern', 'internship', 'interns', 'the', 'and', 'for', 'with', 'summer', 'fall', 'spring', 'winter', 'coop', 'program', 'students', 'student']);

function words(role: string): Set<string> {
  return new Set(
    role
      .toLowerCase()
      .replace(/co-?op/g, 'coop')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 1 && !PLAIN.has(w) && !/^20\d\d$/.test(w)),
  );
}

const SEASONS = ['summer', 'fall', 'autumn', 'spring', 'winter'];

/** The seasons and years a role names: "Summer 2027" is another opening than "Fall 2026". */
function terms(role: string): { seasons: Set<string>; years: Set<string> } {
  const text = role.toLowerCase();
  return { seasons: new Set(SEASONS.filter((s) => text.includes(s))), years: new Set(text.match(/20\d\d/g) ?? []) };
}

/** Both name some, and none in common. */
function apart(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  for (const x of a) if (b.has(x)) return false;
  return true;
}

/** Whether two role names are the same role, give or take the word intern. Two that name other terms (seasons or years
 * with none in common) are other openings. */
export function sameRole(a: string, b: string): boolean {
  const ta = terms(a);
  const tb = terms(b);
  if (apart(ta.seasons, tb.seasons) || apart(ta.years, tb.years)) return false;
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return false;
  // Nearly the same words both ways: "Software Engineer Intern" is not "Software Engineer Intern, iOS" (another team).
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / (x.size + y.size - shared) >= 0.75;
}

/** The inbox's applications by company. */
export function priorApplications(inbox: InboxRow[]): Map<string, InboxRow[]> {
  const by = new Map<string, InboxRow[]>();
  for (const row of inbox) {
    const key = normName(row.company);
    if (!key) continue;
    const list = by.get(key);
    if (list) list.push(row);
    else by.set(key, [row]);
  }
  return by;
}

/** The application before this job, if any: one for a role like it, else the latest at the same company. */
export function priorFor(job: Pick<JobRow, 'title' | 'company' | 'company_name' | 'company_domain'>, by: Map<string, InboxRow[]>): Prior | null {
  const rows = by.get(normName(displayName(job)));
  if (!rows?.length) return null;
  const like = rows.find((row) => row.role && sameRole(row.role, job.title));
  const pick = like ?? [...rows].sort((a, b) => Date.parse(b.applied_at || b.updated_at) - Date.parse(a.applied_at || a.updated_at))[0];
  return { same: Boolean(like), role: pick.role, status: pick.status, at: pick.applied_at || pick.updated_at };
}
