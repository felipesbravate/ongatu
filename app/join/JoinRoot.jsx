'use client';
// Like src/tracker/Root.jsx for /join: browser-only (the token lives in the URL fragment and everything loads from
// /api after sign-in), with the Account page's skeleton while it loads.
import dynamic from 'next/dynamic';
import { AppSkeleton } from '../../src/ui/Loading.jsx';

const JoinApp = dynamic(() => import('../../src/tracker/JoinApp.jsx'), { ssr: false, loading: () => <AppSkeleton account /> });

export default function JoinRoot() {
  return <JoinApp />;
}
