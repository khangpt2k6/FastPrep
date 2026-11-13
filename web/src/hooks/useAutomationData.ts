import { useCallback, useEffect, useState } from 'react';
import { TABLES, supabase } from '../lib/supabase';
import { toLoadError } from '../lib/errors';
import type {
  AgentRow,
  AgentSettings,
  AgentSettingsRow,
  CommandRow,
  JobRow,
  LoadError,
  MemoryRow,
  Preferences,
  PreferencesRow,
  ProfileRow,
} from '../lib/types';
import { useLiveTable } from './useLiveTable';

// Every column: company_name and company_domain come through once the agent adds them, and naming them
// before the table has them would fail the whole read.
const JOB_COLUMNS = '*';

export function useAgent(userId: string) {
  const load = useCallback(
    () => supabase.from(TABLES.agent).select('*').eq('user_id', userId).limit(1).returns<AgentRow[]>(),
    [userId],
  );
  const table = useLiveTable<AgentRow>({
    table: TABLES.agent,
    userId,
    load,
    keyOf: (row) => row.user_id,
    pollMs: 10_000,
  });
  return { ...table, agent: table.rows[0] ?? null };
}

export function useJobs(userId: string) {
  const load = useCallback(
    () =>
      supabase
        .from(TABLES.jobs)
        .select(JOB_COLUMNS)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1000)
        .returns<JobRow[]>(),
    [userId],
  );
  return useLiveTable<JobRow>({ table: TABLES.jobs, userId, load, keyOf: (row) => row.id });
}

export function useCommands(userId: string) {
  const load = useCallback(
    () =>
      supabase
        .from(TABLES.commands)
        .select('id,kind,job_ids,dry_run,status,error,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(15)
        .returns<CommandRow[]>(),
    [userId],
  );
  return useLiveTable<CommandRow>({
    table: TABLES.commands,
    userId,
    load,
    keyOf: (row) => (row.id === undefined ? undefined : String(row.id)),
  });
}

export function useProfileRow(userId: string) {
  const load = useCallback(
    () => supabase.from(TABLES.profile).select('*').eq('user_id', userId).limit(1).returns<ProfileRow[]>(),
    [userId],
  );
  const table = useLiveTable<ProfileRow>({
    table: TABLES.profile,
    userId,
    load,
    keyOf: (row) => row.user_id,
    pollMs: 60_000,
  });
  return { ...table, row: table.rows[0] ?? null };
}

const MEMORY_COLUMNS = 'id,question,answer,source,pinned,company,job_title,job_id,created_at,updated_at';

export function useMemory(userId: string) {
  const load = useCallback(
    () =>
      supabase
        .from(TABLES.memory)
        .select(MEMORY_COLUMNS)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(500)
        .returns<MemoryRow[]>(),
    [userId],
  );
  return useLiveTable<MemoryRow>({
    table: TABLES.memory,
    userId,
    load,
    keyOf: (row) => (row.id === undefined ? undefined : String(row.id)),
    pollMs: 30_000,
  });
}

export async function teachAnswer(question: string, answer: string) {
  const { error } = await supabase.from(TABLES.memory).insert({ question, answer, source: 'user' });
  if (error) throw error;
}

/** Editing an answer makes it yours: source becomes 'user'. */
export async function editAnswer(id: number, answer: string) {
  const { error } = await supabase
    .from(TABLES.memory)
    .update({ answer, source: 'user', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function setPinned(id: number, pinned: boolean) {
  const { error } = await supabase.from(TABLES.memory).update({ pinned }).eq('id', id);
  if (error) throw error;
}

export async function deleteAnswer(id: number) {
  const { error } = await supabase.from(TABLES.memory).delete().eq('id', id);
  if (error) throw error;
}

export const DEFAULT_PREFERENCES: Preferences = {
  tone: '',
  length: '',
  highlight: '',
  avoid: '',
  notes: '',
  sample: '',
  learn: true,
};

/** Preferences are only edited on their own page, so a plain fetch is enough (no realtime). */
export function usePreferences(userId: string) {
  const [row, setRow] = useState<PreferencesRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);

  const reload = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from(TABLES.preferences)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle<PreferencesRow>();
      if (err) setError(toLoadError(err));
      else {
        setRow(data);
        setError(null);
      }
    } catch (err) {
      setError(toLoadError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { row, loading, error, reload };
}

export async function savePreferences(prefs: Preferences) {
  const { error } = await supabase
    .from(TABLES.preferences)
    .upsert({ ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function sendApply(jobIds: string[], dryRun: boolean) {
  const { error } = await supabase.from(TABLES.commands).insert({ kind: 'apply', job_ids: jobIds, dry_run: dryRun });
  if (error) throw error;
}

/** What a command cancelled on the page says: the agent finishes the application under way and starts no other. */
export const CANCELLED = 'Cancelled on the page';

/** Cancels a command that has not finished. A running apply stops after the job in progress. */
export async function cancelCommand(id: number) {
  const { error } = await supabase.from(TABLES.commands).update({ status: 'failed', error: CANCELLED }).eq('id', id).in('status', ['pending', 'running']);
  if (error) throw error;
}

/** Takes one job out of the commands still waiting or running; a command left with no job is cancelled. */
export async function unqueueJob(jobId: string, commands: CommandRow[]) {
  for (const c of commands) {
    if ((c.kind !== 'apply' && c.kind !== 'cover_letter') || (c.status !== 'pending' && c.status !== 'running') || !c.job_ids.includes(jobId)) continue;
    const rest = c.job_ids.filter((id) => id !== jobId);
    if (rest.length === 0) {
      await cancelCommand(c.id);
      continue;
    }
    const { error } = await supabase.from(TABLES.commands).update({ job_ids: rest }).eq('id', c.id).in('status', ['pending', 'running']);
    if (error) throw error;
  }
}

export async function sendSearch() {
  const { error } = await supabase.from(TABLES.commands).insert({ kind: 'search' });
  if (error) throw error;
}

/** What the agent does with no settings row yet. Keep in step with automation_settings in supabase/schema.sql. */
export const DEFAULT_SETTINGS: AgentSettings = { paused: false, auto_fetch: true, fetch_hours: 3, fetch_limit: 40 };

/** The stored settings over the defaults; anything missing or out of range falls back. */
export function readSettings(row: Partial<AgentSettingsRow> | null | undefined): AgentSettings {
  const d = DEFAULT_SETTINGS;
  if (!row) return { ...d };
  const hours = Number(row.fetch_hours);
  const limit = Number(row.fetch_limit);
  return {
    paused: typeof row.paused === 'boolean' ? row.paused : d.paused,
    auto_fetch: typeof row.auto_fetch === 'boolean' ? row.auto_fetch : d.auto_fetch,
    fetch_hours: Number.isFinite(hours) && hours >= 1 && hours <= 48 ? hours : d.fetch_hours,
    fetch_limit: Number.isFinite(limit) && limit >= 0 && limit <= 200 ? limit : d.fetch_limit,
  };
}

/** The agent's switches, live: pausing it, automatic fetching and how much each round scores. */
export function useAgentSettings(userId: string) {
  const load = useCallback(
    () => supabase.from(TABLES.settings).select('*').eq('user_id', userId).limit(1).returns<AgentSettingsRow[]>(),
    [userId],
  );
  const table = useLiveTable<AgentSettingsRow>({
    table: TABLES.settings,
    userId,
    load,
    keyOf: (row) => row.user_id,
    pollMs: 30_000,
  });
  return { ...table, settings: table.rows[0] ?? null };
}

export async function saveAgentSettings(settings: AgentSettings) {
  const { paused, auto_fetch, fetch_hours, fetch_limit } = settings;
  const { error } = await supabase
    .from(TABLES.settings)
    .upsert({ paused, auto_fetch, fetch_hours, fetch_limit, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function saveProfileRow(data: unknown, completed: boolean) {
  const { error } = await supabase
    .from(TABLES.profile)
    .upsert({ data, completed, updated_by: 'web', updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}
