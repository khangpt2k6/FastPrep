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
  company: string;
  location: string;
  url: string;
  score: number | null;
  status: JobStatus | string;
  note: string;
  reason: string;
  screenshot_path: string;
  dry_run: boolean;
  updated_at: string;
}

export type CommandStatus = 'pending' | 'running' | 'done' | 'failed';

export interface CommandRow {
  id: number;
  kind: 'apply' | 'search' | 'cover_letter';
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
