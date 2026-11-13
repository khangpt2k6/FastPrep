import { useCallback, useEffect, useState } from 'react';
import { PROOFS_BUCKET, TABLES, supabase } from '../lib/supabase';
import { linkedInAccount, type LinkedInAccount } from '../lib/linkedin';
import { safeFileName } from '../lib/resume';

export const MAX_LINKEDIN_BYTES = 10 * 1024 * 1024;

/** Why a file cannot be the LinkedIn profile, or null when it can. LinkedIn's "Save to PDF" gives a PDF. */
export function checkLinkedInFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith('.pdf')) return 'Use the PDF that LinkedIn saves.';
  if (file.size > MAX_LINKEDIN_BYTES) return 'The file is over 10 MB.';
  if (file.size === 0) return 'The file is empty.';
  return null;
}

export interface LinkedInImport {
  /** The command the agent runs. */
  id: number;
  /** The file in storage, removed once the agent is done with it. */
  path: string;
}

/**
 * Uploads the profile PDF and asks the agent to add it to the profile. The agent never treats it as the resume.
 * Files left by earlier imports are removed first.
 */
export async function importLinkedIn(userId: string, file: File): Promise<LinkedInImport> {
  const folder = `${userId}/linkedin`;
  const storage = supabase.storage.from(PROOFS_BUCKET);
  const { data: old } = await storage.list(folder);
  if (old && old.length > 0) await storage.remove(old.map((each) => `${folder}/${each.name}`));
  const path = `${folder}/${Date.now()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await storage.upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase
    .from(TABLES.commands)
    .insert({ kind: 'linkedin', payload: { path, name: file.name }, dry_run: true })
    .select('id')
    .single<{ id: number }>();
  if (error) {
    await storage.remove([path]);
    // 23514: the kind is not in the table's check yet.
    if (error.code === '23514') throw new Error('Importing needs the latest supabase/schema.sql.');
    throw error;
  }
  return { id: data.id, path };
}

export type ImportState = { status: 'pending' | 'running' | 'done' | 'failed'; error: string };

/** Follows the command until the agent is done with it, then removes the uploaded file. Null when there is none. */
export function useLinkedInImport(running: LinkedInImport | null): ImportState | null {
  const [state, setState] = useState<ImportState | null>(null);
  useEffect(() => {
    if (!running) {
      setState(null);
      return;
    }
    let alive = true;
    let timer = 0;
    setState({ status: 'pending', error: '' });
    const ask = async () => {
      const { data } = await supabase.from(TABLES.commands).select('status,error').eq('id', running.id).maybeSingle<ImportState>();
      if (!alive) return;
      if (data) setState({ status: data.status, error: data.error ?? '' });
      if (data && (data.status === 'done' || data.status === 'failed')) {
        void supabase.storage.from(PROOFS_BUCKET).remove([running.path]);
        return;
      }
      timer = window.setTimeout(ask, 2000);
    };
    void ask();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [running]);
  return state;
}

/** The LinkedIn account linked to this one: null when there is none or it could not be asked. */
export function useLinkedInAccount() {
  const [account, setAccount] = useState<LinkedInAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    linkedInAccount()
      .then((found) => setAccount(found))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(reload, [reload]);
  return { account, loading, reload };
}
