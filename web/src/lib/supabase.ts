import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

/** Set when the build has no Supabase settings, so the page can say so instead of failing. */
export const configError: string | null =
  !url || !anonKey ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.' : null;

// With no settings the client gets a harmless placeholder; App shows the config screen and never calls it.
export const supabase = createClient(url || 'http://localhost', anonKey || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Names from supabase/schema.sql. */
export const TABLES = {
  agent: 'automation_agent',
  jobs: 'automation_jobs',
  commands: 'automation_commands',
  profile: 'automation_profile',
  preferences: 'automation_preferences',
  memory: 'automation_memory',
} as const;

export const PROOFS_BUCKET = 'automation-proofs';
