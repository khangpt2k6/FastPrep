import { lazy, Suspense, useEffect, useState } from 'react';
import { configError } from './lib/supabase';
import { useSession } from './hooks/useSession';
import { Dashboard } from './components/Dashboard';
import { Notice } from './components/Notice';
import { BootError, BootSplash } from './components/Splash';
import { SignIn } from './components/auth/SignIn';
import { SignOutButton } from './components/auth/SignOutButton';

// Dev-only motion preview with mock data at #/__preview. Dropped from production builds.
const Preview = import.meta.env.DEV ? lazy(() => import('./components/motion/Preview')) : null;

const isPreviewHash = () => window.location.hash.startsWith('#/__preview');

/** True while the address is #/__preview. Follows the hash, so leaving it never strands a demo on mock data. */
function usePreviewMode(): boolean {
  const [on, setOn] = useState(() => Boolean(Preview) && isPreviewHash());
  useEffect(() => {
    if (!Preview) return;
    const sync = () => setOn(isPreviewHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  return on;
}

export default function App() {
  const preview = usePreviewMode();
  if (Preview && preview) {
    return (
      <Suspense fallback={null}>
        <Preview />
      </Suspense>
    );
  }
  if (configError) {
    return (
      <Notice title="Supabase not configured">
        <p>{configError}</p>
        <p>
          Add them to <code className="code">.env</code> and restart.
        </p>
      </Notice>
    );
  }
  return <OwnerGate />;
}

function OwnerGate() {
  const { session, ready, error, note, signIn, retry } = useSession();
  if (error) return <BootError message={error} onRetry={retry} />;
  if (!ready) return <BootSplash />;
  // Nothing of the dashboard is rendered, and no row is asked for, before a person signs in.
  if (!session) return <SignIn onSignIn={signIn} note={note} />;
  const email = session.user.email ?? '';
  return (
    <>
      <Dashboard key={session.user.id} userId={session.user.id} email={email} />
      <SignOutButton email={email} className="signout signout--floating" />
    </>
  );
}
