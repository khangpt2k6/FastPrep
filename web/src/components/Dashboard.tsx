import { lazy, Suspense } from 'react';
import type { DashboardProps } from './DashboardApp';
import { BootSplash } from './Splash';

// The dashboard loads as its own chunk, so the sign-in screen comes up without it and no chunk passes 500 kB.
const DashboardApp = lazy(() => import('./DashboardApp'));

/** The signed-in app. Shows the splash while its code loads. */
export function Dashboard(props: DashboardProps) {
  return (
    <Suspense fallback={<BootSplash />}>
      <DashboardApp {...props} />
    </Suspense>
  );
}
