import { useCallback, useEffect, useRef } from 'react';
import { PROOFS_BUCKET, TABLES, supabase } from '../lib/supabase';
import { contentTypeOf, safeFileName } from '../lib/resume';
import type { ResumeRow } from '../lib/types';
import { useLiveTable } from './useLiveTable';

const RESUME_COLUMNS = 'id,name,path,size,status,error,data,created_at,updated_at';

/** The person's resumes, newest first, live. A missing table reports error.kind 'missing-table'. */
export function useResumes(userId: string) {
  const load = useCallback(
    () =>
      supabase
        .from(TABLES.resumes)
        .select(RESUME_COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
        .returns<ResumeRow[]>(),
    [userId],
  );
  return useLiveTable<ResumeRow>({
    table: TABLES.resumes,
    userId,
    load,
    keyOf: (row) => (row.id === undefined ? undefined : String(row.id)),
    pollMs: 15_000,
  });
}

/**
 * Uploads the file to the proofs bucket, adds its row and asks the agent to read it.
 * Resolves with the new row's id.
 */
export async function uploadResume(userId: string, file: File): Promise<number> {
  const path = `${userId}/resumes/${Date.now()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(PROOFS_BUCKET)
    .upload(path, file, { contentType: contentTypeOf(file), upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase
    .from(TABLES.resumes)
    .insert({ name: file.name, path, size: file.size, status: 'uploaded' })
    .select('id')
    .single<{ id: number }>();
  if (error) throw error;
  const { error: commandError } = await supabase
    .from(TABLES.commands)
    .insert({ kind: 'resume', payload: { resume_id: data.id }, dry_run: true });
  if (commandError) throw commandError;
  return data.id;
}

/** Removes an old or failed resume: the file first, then its row. */
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
