import { useCallback } from 'react';
import { TABLES, supabase } from '../lib/supabase';
import type { CoverLetterRow, CoverSettings, CoverTemplate } from '../lib/coverLetter';
import { useLiveTable } from './useLiveTable';

export function useCoverTemplates(userId: string) {
  const load = useCallback(
    () =>
      supabase
        .from(TABLES.coverTemplates)
        .select('id,name,description,body,builtin,updated_at')
        .eq('user_id', userId)
        .order('builtin', { ascending: false })
        .order('name')
        .returns<CoverTemplate[]>(),
    [userId],
  );
  return useLiveTable<CoverTemplate>({ table: TABLES.coverTemplates, userId, load, keyOf: (row) => row.id, pollMs: 60_000 });
}

export function useCoverSettings(userId: string) {
  const load = useCallback(
    () => supabase.from(TABLES.coverSettings).select('*').eq('user_id', userId).limit(1).returns<CoverSettings[]>(),
    [userId],
  );
  const table = useLiveTable<CoverSettings>({ table: TABLES.coverSettings, userId, load, keyOf: (row) => row.user_id, pollMs: 60_000 });
  return { ...table, settings: table.rows[0] ?? null };
}

export function useCoverLetters(userId: string) {
  const load = useCallback(
    () =>
      supabase
        .from(TABLES.coverLetters)
        .select('job_id,template_id,body,pdf_path,problems,updated_by,updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(500)
        .returns<CoverLetterRow[]>(),
    [userId],
  );
  return useLiveTable<CoverLetterRow>({ table: TABLES.coverLetters, userId, load, keyOf: (row) => row.job_id });
}

export async function saveCoverSettings(enabled: boolean, templateId: string) {
  const { error } = await supabase
    .from(TABLES.coverSettings)
    .upsert({ enabled, template_id: templateId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function saveCoverTemplate(template: Pick<CoverTemplate, 'id' | 'name' | 'description' | 'body'>) {
  const { error } = await supabase
    .from(TABLES.coverTemplates)
    .upsert({ ...template, builtin: false, updated_at: new Date().toISOString() }, { onConflict: 'user_id,id' });
  if (error) throw error;
}

export async function deleteCoverTemplate(id: string) {
  const { error } = await supabase.from(TABLES.coverTemplates).delete().eq('id', id).eq('builtin', false);
  if (error) throw error;
}

/** The person's edit of a letter: the agent sends it as written from now on. */
export async function saveCoverLetter(jobId: string, body: string) {
  const { error } = await supabase
    .from(TABLES.coverLetters)
    .update({ body, updated_by: 'web', updated_at: new Date().toISOString() })
    .eq('job_id', jobId);
  if (error) throw error;
}

/**
 * Asks the agent for letters for these jobs without applying. 'write' writes the ones not kept yet, 'fresh' drops the kept
 * ones first (edits included) and writes them all again; both ask the model. 'pdf' only makes the kept letters' PDFs again:
 * no model, so it is the one that may wait while the agent is paused or offline.
 */
export async function sendCoverLetters(jobIds: string[], mode: 'write' | 'fresh' | 'pdf' = 'write') {
  if (mode === 'fresh') {
    const { error } = await supabase.from(TABLES.coverLetters).delete().in('job_id', jobIds);
    if (error) throw error;
  }
  const payload = mode === 'pdf' ? { pdf_only: true } : {};
  const { error } = await supabase.from(TABLES.commands).insert({ kind: 'cover_letter', job_ids: jobIds, dry_run: true, payload });
  if (error) throw error;
}
