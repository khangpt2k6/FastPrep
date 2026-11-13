import { useCallback, useEffect, useState } from 'react';
import { PROOFS_BUCKET, TABLES, supabase } from '../lib/supabase';
import { safeFileName } from '../lib/resume';
import { useLiveTable } from './useLiveTable';

/** A file a form may ask for besides the resume (automation_documents). For now the only kind is the transcript. */
export interface DocumentRow {
  id: number;
  kind: 'transcript' | string;
  name: string;
  path: string;
  size: number;
  created_at: string;
}

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const TRANSCRIPT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.docx';

const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const kindOf = (name: string) => name.toLowerCase().split('.').pop() ?? '';

/** Why a file cannot be used as a transcript, or null when it can. */
export function checkTranscriptFile(file: File): string | null {
  if (!(kindOf(file.name) in TYPES)) return 'Use a PDF, an image or a .docx file.';
  if (file.size > MAX_DOCUMENT_BYTES) return 'The file is over 10 MB.';
  if (file.size === 0) return 'The file is empty.';
  return null;
}

/** The signed-in person's id, '' until the stored session is read (and in the preview, which has none). */
export function useUserId(): string {
  const [id, setId] = useState('');
  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive) setId(data.session?.user.id ?? '');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return id;
}

/** The person's documents, live. A missing table reports error.kind 'missing-table'. */
export function useDocuments(userId: string) {
  const load = useCallback(
    () =>
      supabase
        .from(TABLES.documents)
        .select('id,kind,name,path,size,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
        .returns<DocumentRow[]>(),
    [userId],
  );
  return useLiveTable<DocumentRow>({
    table: TABLES.documents,
    userId,
    load,
    keyOf: (row) => (row.id === undefined ? undefined : String(row.id)),
    pollMs: 30_000,
  });
}

/** The newest transcript: the one the agent keeps for the forms. */
export function newestTranscript(rows: DocumentRow[]): DocumentRow | null {
  const mine = rows.filter((r) => r.kind === 'transcript');
  mine.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  return mine[0] ?? null;
}

/** Removes a document: its row first, so the agent stops sending it even if the file cannot be removed. */
export async function deleteDocument(row: Pick<DocumentRow, 'id' | 'path'>) {
  const { error } = await supabase.from(TABLES.documents).delete().eq('id', row.id);
  if (error) throw error;
  if (row.path) await supabase.storage.from(PROOFS_BUCKET).remove([row.path]);
}

/** Uploads the file and adds its row; the transcripts it replaces are removed after it is in. */
export async function uploadTranscript(userId: string, file: File, replaces: DocumentRow[]) {
  const path = `${userId}/documents/${Date.now()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from(PROOFS_BUCKET)
    .upload(path, file, { contentType: file.type || TYPES[kindOf(file.name)] || 'application/octet-stream', upsert: false });
  if (uploadError) throw uploadError;
  const { error } = await supabase.from(TABLES.documents).insert({ kind: 'transcript', name: file.name, path, size: file.size });
  if (error) {
    await supabase.storage.from(PROOFS_BUCKET).remove([path]);
    throw error;
  }
  for (const old of replaces) {
    try {
      await deleteDocument(old);
    } catch {
      // The new one is already the newest; an old row left behind changes nothing the agent does.
    }
  }
}
