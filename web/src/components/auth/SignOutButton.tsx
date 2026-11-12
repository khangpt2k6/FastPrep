import { useState } from 'react';
import { signOut } from '../../lib/supabase';
import './signin.css';

/** Ends the session in this browser. The gate in App sees it and shows the sign-in screen. */
export function SignOutButton({ email, className = 'signout' }: { email: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const leave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={className} onClick={leave} disabled={busy} title={`Signed in as ${email}`}>
      <span className="signout__who">{email}</span>
      <span>Sign out</span>
    </button>
  );
}
