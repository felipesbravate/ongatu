'use client';
// The tracker renders in the browser only: its figures depend on today's date and on data that loads from
// /api after sign-in, so server-rendered HTML would only be an empty shell that mismatches on hydration.
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AppSkeleton, LoginSkeleton } from '../ui/Loading.jsx';
import { pendingJoin } from './boards.js';

const TrackerApp = dynamic(() => import('./TrackerApp.jsx'), { ssr: false, loading: () => <AppSkeleton /> });
const AccountApp = dynamic(() => import('./AccountApp.jsx'), { ssr: false, loading: () => <AppSkeleton account /> });
const OnboardingApp = dynamic(() => import('../onboarding/OnboardingApp.jsx'), { ssr: false, loading: () => <LoginSkeleton /> });
export default function Root({ view }) {
  // Oct 11: an invite link opened before signing in (or creating the account) is finished first, before the
  // dashboard or onboarding take over.
  const [joining, setJoining] = useState(false);
  useEffect(() => { if (pendingJoin()) { setJoining(true); location.replace('/join'); } }, []);
  if (joining) return null;
  return view === 'account' ? <AccountApp /> : view === 'welcome' ? <OnboardingApp /> : <TrackerApp />;
}
