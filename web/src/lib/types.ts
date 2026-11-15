export type AgentState =
  | 'idle'
  | 'starting'
  | 'reading'
  | 'searching'
  | 'scoring'
  | 'ready'
  | 'applying'
  | 'writing'
  | 'applied'
  | 'error'
  | 'paused'
  | 'offline';

export interface AgentRow {
  user_id: string;
  state: AgentState | string;
  message: string;
  resume_name: string;
  model: string;
  jobs_found: number;
  jobs_scored: number;
  last_seen: string;
  /** When the agent last brought new postings; missing until the agent and schema have it. */
  fetched_at?: string | null;
  /** When it will bring postings next. */
  next_fetch_at?: string | null;
  /** How many new jobs the last round found. */
  fetched_new?: number | null;
}

/** The agent's switches, one row per user. A missing row means the defaults. */
export interface AgentSettings {
  paused: boolean;
  auto_fetch: boolean;
  /** 1 to 48 hours between rounds. */
  fetch_hours: number;
  /** New jobs scored per round, 0 to 200. */
  fetch_limit: number;
  /** Who answers the agent's structured questions (scores, letters, resume reading): the OpenAI API, or Codex on the
   * ChatGPT plan. Form filling is always on the API. */
  engine: AiEngine;
  /** The most the API may cost a day and a month, in dollars; null is no limit. */
  budget_day: number | null;
  budget_month: number | null;
}

/** The OpenAI API (paid per use), or a plan the person already pays for: Codex (ChatGPT) or Claude Code (Claude). */
export type AiEngine = 'api' | 'codex' | 'claude';

/** One day of automation_usage, as the agent writes it: what the API cost, and how often Codex was asked. */
export interface UsageRow {
  user_id: string;
  /** The person's own day, YYYY-MM-DD. */
  day: string;
  api_usd: number;
  api_calls: number;
  codex_runs: number;
  tokens_in: number;
  tokens_out: number;
  updated_at: string;
  /** What the day went on, by kind of work: the API's dollars and the plan's questions. Absent on an older database. */
  breakdown?: { usd?: Record<string, number>; runs?: Record<string, number> } | null;
}

export interface AgentSettingsRow extends AgentSettings {
  user_id: string;
  updated_at: string;
}

export type ResumeStatus = 'uploaded' | 'reading' | 'active' | 'failed' | 'old';

export interface ResumeRow {
  id: number;
  name: string;
  /** A name for it on the page, such as "ML". Undefined until the database has the column. */
  label?: string;
  path: string;
  size: number;
  status: ResumeStatus | string;
  error: string;
  /** What the agent read, as {search, profile}; see lib/resume.ts. */
  data: unknown;
  created_at: string;
  updated_at: string;
}

export type JobStatus =
  | 'new'
  | 'scored'
  | 'applying'
  | 'submitted'
  | 'unconfirmed'
  | 'refused'
  | 'blocked'
  | 'failed'
  | 'passed_over';

export interface JobRow {
  id: string;
  title: string;
  /** The raw name from the job source, such as a Workday path ("cisco/wd5/cisco_careers"). */
  company: string;
  /** A clean display name from the agent, such as "Cisco". Rows written before the agent fills it lack it: read a missing one as ''. */
  company_name?: string;
  /** The company's web domain for its logo, such as "cisco.com". Rows written before the agent fills it lack it: read a missing one as ''. */
  company_domain?: string;
  location: string;
  url: string;
  score: number | null;
  status: JobStatus | string;
  note: string;
  reason: string;
  screenshot_path: string;
  dry_run: boolean;
  updated_at: string;
  /** When the agent first found the job; rows from before the column have none. */
  found_at?: string | null;
  /** When the source posted it; rows from before the agent kept it lack it. */
  posted_at?: string | null;
  /** Its US places as the agent read them, "Remote; Camden, NJ"; empty or missing when it placed none. */
  place?: string;
  /** Those places as [latitude, longitude], for the distance filter. */
  points?: [number, number][] | null;
}

export type CommandStatus = 'pending' | 'running' | 'done' | 'failed';

export interface CommandRow {
  id: number;
  kind: 'apply' | 'search' | 'cover_letter' | 'resume' | 'linkedin' | 'calendar_add';
  job_ids: string[];
  dry_run: boolean;
  status: CommandStatus;
  error: string;
  created_at: string;
}

export interface ProfileRow {
  user_id: string;
  data: unknown;
  completed: boolean;
  updated_by: 'web' | 'agent' | string;
  updated_at: string;
}

export type AnswerLength = '' | 'Short' | 'Medium' | 'Detailed';

/** How the agent writes open answers. One row per user. */
export interface Preferences {
  tone: string;
  length: AnswerLength;
  highlight: string;
  avoid: string;
  notes: string;
  sample: string;
  learn: boolean;
}

export interface PreferencesRow extends Preferences {
  user_id: string;
  updated_at: string;
}

export interface MemoryRow {
  id: number;
  question: string;
  answer: string;
  source: 'user' | 'learned';
  pinned: boolean;
  company: string;
  job_title: string;
  job_id: string;
  created_at: string;
  updated_at: string;
}

export interface LoadError {
  /** missing-table means schema.sql has not been run on this project yet. */
  kind: 'missing-table' | 'other';
  message: string;
}

export type LiveStatus = 'connecting' | 'live' | 'down';
