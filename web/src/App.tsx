import { lazy, Suspense } from 'react';
import { configError } from './lib/supabase';
import { useSession } from './hooks/useSession';
import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import { Notice } from './components/Notice';

// Dev-only motion preview with mock data at #/__preview. Dropped from production builds.
const Preview = import.meta.env.DEV ? lazy(() => import('./components/motion/Preview')) : null;

export default function App() {
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
        <p>{configError}</p>
        <p>
          Put both values in the repo root <code>.env</code> (or in the hosting project's environment variables) and
          restart the dev server. <code>web/.env.example</code> lists the names.
        </p>
      </Notice>
    );
  }
  return <SignedInGate />;
}

function SignedInGate() {
  const { session, ready } = useSession();
  if (!ready) {
    return (
      <div className="boot" role="status" aria-live="polite">
        <span className="boot__dot" />
        Connecting
      </div>
    );
  }
  if (!session) return <AuthScreen />;
  return <Dashboard key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} />;
}
