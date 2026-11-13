// A resume uploaded on the Set up page and what the agent read from it (automation_resumes.data).
// data is {search?: {goals, cities, countries, titles}, profile?: {personal, education, experience, skills}}.
import { cleanProfile, mergeProfile, type Profile } from './profile';
import type { ResumeRow } from './types';

export interface ResumeSearch {
  /** Job titles the agent searches for. */
  titles: string[];
  cities: string[];
  countries: string[];
  /** What the person is after, in their words. */
  goals: string;
}

/** The parts of a profile a resume can fill. */
export type ResumeProfile = Pick<Profile, 'personal' | 'education' | 'experience' | 'skills'>;

export interface ResumeRead {
  search: ResumeSearch;
  profile: ResumeProfile;
  /** True when the agent wrote anything at all. */
  any: boolean;
}

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const RESUME_ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);

function strings(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const s = typeof item === 'string' ? item.trim() : typeof item === 'number' ? String(item) : '';
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out;
}

/** What the agent read, in a safe shape whatever the row holds. */
export function readResume(data: unknown): ResumeRead {
  const d = isPlain(data) ? data : {};
  const s = isPlain(d.search) ? d.search : {};
  const search: ResumeSearch = {
    titles: strings(s.titles),
    cities: strings(s.cities),
    countries: strings(s.countries),
    goals: typeof s.goals === 'string' ? s.goals.trim() : '',
  };
  const merged = mergeProfile(isPlain(d.profile) ? d.profile : {});
  const profile: ResumeProfile = {
    personal: merged.personal,
    education: merged.education,
    experience: merged.experience,
    skills: merged.skills,
  };
  const any =
    search.titles.length + search.cities.length + search.countries.length + profile.education.length + profile.experience.length + profile.skills.length > 0 ||
    Boolean(search.goals) ||
    Object.values(profile.personal).some((v) => v.trim() !== '');
  return { search, profile, any };
}

/** The row's data with edited search and profile parts, keeping anything else the agent stored. */
export function writeResume(data: unknown, read: Pick<ResumeRead, 'search' | 'profile'>): Record<string, unknown> {
  const base = isPlain(data) ? data : {};
  const clean = cleanProfile({ ...mergeProfile({}), ...read.profile });
  return {
    ...base,
    search: {
      titles: read.search.titles,
      cities: read.search.cities,
      countries: read.search.countries,
      goals: read.search.goals.trim(),
    },
    profile: { personal: clean.personal, education: clean.education, experience: clean.experience, skills: clean.skills },
  };
}

/**
 * The profile after using a resume: education, experience and skills come from the resume, personal fields are filled
 * only where empty, and work authorization, self-identification, preferences and other answers stay as they are.
 */
export function applyResume(current: Profile, read: ResumeProfile): Profile {
  const personal = { ...current.personal };
  for (const key of Object.keys(personal) as (keyof Profile['personal'])[]) {
    const incoming = (read.personal[key] ?? '').trim();
    if (!personal[key].trim() && incoming) personal[key] = incoming;
  }
  return cleanProfile({
    ...current,
    personal,
    education: read.education.length > 0 ? read.education : current.education,
    experience: read.experience.length > 0 ? read.experience : current.experience,
    skills: read.skills.length > 0 ? read.skills : current.skills,
  });
}

/** Why a file cannot be used, or null when it can. */
export function checkResumeFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.pdf') && !name.endsWith('.docx')) return 'Use a PDF or a .docx file.';
  if (file.size > MAX_RESUME_BYTES) return 'The file is over 10 MB.';
  if (file.size === 0) return 'The file is empty.';
  return null;
}

export function contentTypeOf(file: File): string {
  if (file.type) return file.type;
  return file.name.toLowerCase().endsWith('.docx')
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/pdf';
}

/** A storage-safe version of a file name: letters, digits, dot, dash and underscore. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.]+/, '')
    .slice(-80);
  return cleaned || 'resume.pdf';
}

export const isPdfName = (name: string) => name.toLowerCase().endsWith('.pdf');

/** Resume rows newest first. */
export function byNewest(rows: ResumeRow[]): ResumeRow[] {
  return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
}

/** The resume every application sends, if any. */
export function activeResume(rows: ResumeRow[]): ResumeRow | null {
  return byNewest(rows).find((r) => r.status === 'active') ?? null;
}

/** A resume the agent has not finished with yet. */
export const isPending = (row: ResumeRow) => row.status === 'uploaded' || row.status === 'reading';
