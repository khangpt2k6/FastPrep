import type { LoadError } from './types';

interface ErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/** PostgREST says PGRST205 (or Postgres 42P01) when a table is not there yet. */
export function toLoadError(error: unknown): LoadError {
  const e = (error ?? {}) as ErrorLike;
  const text = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`.toLowerCase();
  const missing =
    e.code === 'PGRST205' ||
    e.code === '42P01' ||
    text.includes('schema cache') ||
    (text.includes('relation') && text.includes('does not exist'));
  return {
    kind: missing ? 'missing-table' : 'other',
    message: e.message || (error instanceof Error ? error.message : 'Something went wrong.'),
  };
}

export function errorText(error: unknown): string {
  const e = toLoadError(error);
  return e.kind === 'missing-table' ? 'Database not set up: run supabase/schema.sql' : e.message;
}
