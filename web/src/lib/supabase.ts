import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

/** Set when the build has no Supabase settings, so the page can say so instead of failing. */
export const configError: string | null = !url || !anonKey ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.' : null;

// With no settings the client gets a harmless placeholder; App shows the config screen and never calls it.
export const supabase = createClient(url || 'http://localhost', anonKey || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Signs in with what the person typed. It is the account the agent writes with (AGENT_EMAIL), so its rows are readable
 *  here. Answers with why it failed, or null. No login is kept in the page's script. */
export async function signIn(email: string, password: string): Promise<string | null> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return null;
    return error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message;
  } catch (thrown) {
    return thrown instanceof Error ? thrown.message : String(thrown);
  }
}

/** Ends the session in this browser; the page goes back to the sign-in screen. */
export async function signOut(): Promise<void> {
  // Local scope: the agent on the computer is signed in to the same account and must stay signed in.
  await supabase.auth.signOut({ scope: 'local' });
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
  settings: 'automation_settings',
  resumes: 'automation_resumes',
  rules: 'automation_rules',
  documents: 'automation_documents',
  tasks: 'automation_tasks',
  usage: 'automation_usage',
} as const;

export const PROOFS_BUCKET = 'automation-proofs';
