import { configError } from './lib/supabase';
import { useSession } from './hooks/useSession';
import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import { Notice } from './components/Notice';

export default function App() {
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
