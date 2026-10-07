'use client';
// The tracker renders in the browser only: its figures depend on today's date and on data that loads from
// /api after sign-in, so server-rendered HTML would only be an empty shell that mismatches on hydration.
import dynamic from 'next/dynamic';
import { AppSkeleton, LoginSkeleton } from '../ui/Loading.jsx';

const TrackerApp = dynamic(() => import('./TrackerApp.jsx'), { ssr: false, loading: () => <AppSkeleton /> });
const AccountApp = dynamic(() => import('./AccountApp.jsx'), { ssr: false, loading: () => <AppSkeleton account /> });
const OnboardingApp = dynamic(() => import('../onboarding/OnboardingApp.jsx'), { ssr: false, loading: () => <LoginSkeleton /> });
export default function Root({ view }) { return view === 'account' ? <AccountApp /> : view === 'welcome' ? <OnboardingApp /> : <TrackerApp />; }
