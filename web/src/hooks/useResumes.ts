import { useCallback, useEffect, useRef } from 'react';
import { PROOFS_BUCKET, TABLES, supabase } from '../lib/supabase';
import { contentTypeOf, safeFileName } from '../lib/resume';
import type { ResumeRow } from '../lib/types';
import { useLiveTable } from './useLiveTable';

const RESUME_COLUMNS = 'id,name,label,path,size,status,error,data,created_at,updated_at';
/** The columns before resumes had labels, for a database that does not have the column yet. */
const COLUMNS_WITHOUT_LABEL = 'id,name,path,size,status,error,data,created_at,updated_at';

/** True when an error says the label column is not in this database yet (42703, or PostgREST's schema cache). */
function missingLabel(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return Boolean(e && (e.code === '42703' || e.code === 'PGRST204' || /\blabel\b/i.test(e.message ?? '')));
}

/** The person's resumes, newest first, live. A missing table reports error.kind 'missing-table'. */
export function useResumes(userId: string) {
  const load = useCallback(async () => {
    const query = (columns: string) =>
      supabase.from(TABLES.resumes).select(columns).eq('user_id', userId).order('created_at', { ascending: false }).limit(30).returns<ResumeRow[]>();
    const first = await query(RESUME_COLUMNS);
    return first.error && missingLabel(first.error) ? query(COLUMNS_WITHOUT_LABEL) : first;
  }, [userId]);
  return useLiveTable<ResumeRow>({
    table: TABLES.resumes,
    userId,
    load,
    keyOf: (row) => (row.id === undefined ? undefined : String(row.id)),
    pollMs: 15_000,
  });
}

export interface UploadOptions {
  /** A name for it on the page, such as "ML". */
  label?: string;
  /**
   * True (Set up, or "Make it the default"): the agent installs it for every application and searches again.
   * False: the agent only reads it and keeps it on the page; the search and the scores stay as they are.
   */
  activate?: boolean;
}

/**
 * Uploads the file to the proofs bucket, adds its row and asks the agent to read it.
 * Resolves with the new row's id.
 */
export async function uploadResume(userId: string, file: File, { label = '', activate = true }: UploadOptions = {}): Promise<number> {
  const path = `${userId}/resumes/${Date.now()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(PROOFS_BUCKET)
    .upload(path, file, { contentType: contentTypeOf(file), upsert: false });
  if (uploadError) throw uploadError;
  const row: Record<string, unknown> = { name: file.name, path, size: file.size, status: 'uploaded' };
  const insert = (withLabel: boolean) =>
    supabase
      .from(TABLES.resumes)
      .insert(withLabel ? { ...row, label: label.trim() } : row)
      .select('id')
      .single<{ id: number }>();
  let result = await insert(Boolean(label.trim()));
  // A database without the label column still takes the resume; the label waits for the schema.
  if (result.error && label.trim() && missingLabel(result.error)) result = await insert(false);
  if (result.error || !result.data) throw result.error ?? new Error('The resume was not saved.');
  const id = result.data.id;
  const { error: commandError } = await supabase
    .from(TABLES.commands)
    .insert({ kind: 'resume', payload: activate ? { resume_id: id } : { resume_id: id, activate: false }, dry_run: true });
  if (commandError) throw commandError;
  return id;
}

/** Asks the agent to make a kept resume the default: it installs it, marks the others old and searches again. */
export async function makeResumeDefault(id: number) {
  const { error } = await supabase.from(TABLES.commands).insert({ kind: 'resume', payload: { resume_id: id }, dry_run: true });
  if (error) throw error;
}

/** Names a resume on the page. */
export async function setResumeLabel(id: number, label: string) {
  const { error } = await supabase.from(TABLES.resumes).update({ label: label.trim(), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) {
    if (missingLabel(error)) throw new Error('Labels need the latest supabase/schema.sql.');
    throw error;
  }
}

/** Removes a resume that is not the default: the file first, then its row. */
export async function deleteResume(row: Pick<ResumeRow, 'id' | 'path'>) {
  if (row.path) {
    const { error } = await supabase.storage.from(PROOFS_BUCKET).remove([row.path]);
    if (error) throw error;
  }
  const { error } = await supabase.from(TABLES.resumes).delete().eq('id', row.id);
  if (error) throw error;
}

/** Saves the edited search and profile parts back on the resume row. */
export async function saveResumeData(id: number, data: Record<string, unknown>) {
  const { error } = await supabase.from(TABLES.resumes).update({ data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/**
 * Calls `onActive` when a resume becomes active while the page is open (from uploaded or reading).
 * The first load only records where things stand.
 */
export function useResumeActivated(rows: ResumeRow[], loaded: boolean, onActive: (row: ResumeRow) => void) {
  const seen = useRef<Map<number, string> | null>(null);
  const handler = useRef(onActive);
  handler.current = onActive;
  useEffect(() => {
    if (!loaded) return;
    const before = seen.current;
    const next = new Map<number, string>();
    for (const row of rows) {
      next.set(row.id, row.status);
      const was = before?.get(row.id);
      if (before && row.status === 'active' && was !== 'active' && (was === undefined || was === 'uploaded' || was === 'reading')) {
        handler.current(row);
      }
    }
    seen.current = next;
  }, [rows, loaded]);
}
