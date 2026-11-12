import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

// One person uses this page, so it signs in as the agent's own account (AGENT_EMAIL, AGENT_PASSWORD) by itself.
const ownerEmail = __AGENT_EMAIL__.trim();
const ownerPassword = __AGENT_PASSWORD__;

/** Set when the build has no Supabase settings or no agent login, so the page can say so instead of failing. */
export const configError: string | null =
  !url || !anonKey
    ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.'
    : !ownerEmail || !ownerPassword
      ? 'Missing AGENT_EMAIL or AGENT_PASSWORD.'
      : null;

// With no settings the client gets a harmless placeholder; App shows the config screen and never calls it.
export const supabase = createClient(url || 'http://localhost', anonKey || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Signs in as the agent's account, the same one the agent writes with, so every row it writes is readable here. */
export async function signInAsOwner(): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword });
  return error ? error.message : null;
}

/** Names from supabase/schema.sql. */
export const TABLES = {
  agent: 'automation_agent',
  jobs: 'automation_jobs',
  commands: 'automation_commands',
  profile: 'automation_profile',
  preferences: 'automation_preferences',
  memory: 'automation_memory',
  coverTemplates: 'automation_cover_templates',
  coverSettings: 'automation_cover_settings',
  coverLetters: 'automation_cover_letters',
} as const;

export const PROOFS_BUCKET = 'automation-proofs';
