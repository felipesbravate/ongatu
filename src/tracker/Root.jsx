'use client';
// The tracker renders in the browser only: its figures depend on today's date and on data that loads from
// /api after sign-in, so server-rendered HTML would only be an empty shell that mismatches on hydration.
import dynamic from 'next/dynamic';

const TrackerApp = dynamic(() => import('./TrackerApp.jsx'), { ssr: false });
const AccountApp = dynamic(() => import('./AccountApp.jsx'), { ssr: false });
const OnboardingApp = dynamic(() => import('../onboarding/OnboardingApp.jsx'), { ssr: false });
export default function Root({ view }) { return view === 'account' ? <AccountApp /> : view === 'welcome' ? <OnboardingApp /> : <TrackerApp />; }
