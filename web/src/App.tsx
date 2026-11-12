import { lazy, Suspense } from 'react';
import { configError } from './lib/supabase';
import { useSession } from './hooks/useSession';
import { Aurora } from './components/Aurora';
import { Dashboard } from './components/Dashboard';
import { Notice } from './components/Notice';
import { BootError, BootSplash } from './components/Splash';

// Dev-only motion preview with mock data at #/__preview. Dropped from production builds.
const Preview = import.meta.env.DEV ? lazy(() => import('./components/motion/Preview')) : null;

export default function App() {
  return (
    <>
      <Aurora />
      <Screen />
    </>
  );
}

function Screen() {
  if (Preview && window.location.hash.startsWith('#/__preview')) {
    return (
      <Suspense fallback={null}>
        <Preview />
      </Suspense>
    );
  }
  if (configError) {
    return (
      <Notice title="Supabase is not configured">
        <p className="mono">{configError}</p>
        <p>
          Add them to the repo root <code>.env</code>, then restart the dev server.
        </p>
      </Notice>
    );
  }
  return <OwnerGate />;
}

function OwnerGate() {
  const { session, ready, error, retry } = useSession();
  if (error) return <BootError message={error} onRetry={retry} />;
  if (!ready || !session) return <BootSplash />;
  return <Dashboard key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} />;
}
