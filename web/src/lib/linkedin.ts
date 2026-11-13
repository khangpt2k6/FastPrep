// "Connect LinkedIn": LinkedIn's own sign-in (OpenID Connect), linked to the dashboard account through Supabase Auth.
// It gives a name, an email and a picture and nothing else: LinkedIn opens the rest of a profile, its jobs and Easy
// Apply to its partners only. The profile itself comes in as a file instead (see hooks/useLinkedIn.ts).
import type { UserIdentity } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const LINKEDIN_PROVIDER = 'linkedin_oidc';

const RETURN_KEY = 'linkedin-return';
const ERROR_KEY = 'linkedin-error';

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// Back from LinkedIn's sign-in the browser lands on the site's root, with what came of it in the address. Once the
// Supabase client has read it, the person goes back to Profile, where they started.
function onReturn() {
  const kept = store();
  if (!kept || kept.getItem(RETURN_KEY) !== '1') return;
  kept.removeItem(RETURN_KEY);
  const hash = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''));
  const query = new URLSearchParams(window.location.search);
  const error = hash.get('error_description') ?? query.get('error_description') ?? hash.get('error') ?? query.get('error');
  if (error) kept.setItem(ERROR_KEY, error);
  const { data } = supabase.auth.onAuthStateChange(() => {
    data.subscription.unsubscribe();
    window.setTimeout(() => {
      window.history.replaceState(null, '', window.location.pathname);
      window.location.hash = '#/profile';
    }, 0);
  });
}

onReturn();

/** Why the last try at connecting failed, once; '' when it did not. */
export function takeLinkedInError(): string {
  const kept = store();
  const error = kept?.getItem(ERROR_KEY) ?? '';
  if (error) kept?.removeItem(ERROR_KEY);
  return error;
}

export interface LinkedInAccount {
  identity: UserIdentity;
  name: string;
  email: string;
  picture: string;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** The LinkedIn account linked to this one, or null. */
export async function linkedInAccount(): Promise<LinkedInAccount | null> {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  const identity = data.identities.find((each) => each.provider === LINKEDIN_PROVIDER);
  if (!identity) return null;
  const said = identity.identity_data ?? {};
  return {
    identity,
    name: text(said.name) || [text(said.given_name), text(said.family_name)].filter(Boolean).join(' '),
    email: text(said.email),
    picture: text(said.picture),
  };
}

/** What Supabase said when it would not start the sign-in, in words that say what to set up. */
function setupProblem(message: string): string {
  if (/manual linking/i.test(message)) return 'Linking accounts is off for this project. Turn on "Allow manual linking" in Supabase Auth (docs/linkedin.md).';
  if (/not enabled|unsupported provider/i.test(message)) return 'LinkedIn sign-in is not set up for this project yet. The steps are in docs/linkedin.md.';
  if (/bearer token|session missing/i.test(message)) return 'Sign in to the dashboard first.';
  return message;
}

/** Sends the browser to LinkedIn to sign in. Answers with why it could not, or null while the browser is leaving. */
export async function connectLinkedIn(): Promise<string | null> {
  const kept = store();
  kept?.setItem(RETURN_KEY, '1');
  try {
    const { error } = await supabase.auth.linkIdentity({
      provider: LINKEDIN_PROVIDER,
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (!error) return null;
    kept?.removeItem(RETURN_KEY);
    return setupProblem(error.message);
  } catch (thrown) {
    kept?.removeItem(RETURN_KEY);
    return setupProblem(thrown instanceof Error ? thrown.message : String(thrown));
  }
}

export async function disconnectLinkedIn(account: LinkedInAccount): Promise<void> {
  const { error } = await supabase.auth.unlinkIdentity(account.identity);
  if (error) throw error;
}
