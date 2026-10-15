'use client';
// Like src/tracker/Root.jsx for the Notifications page: browser-only (the list depends on today's date and on data that
// loads from /api after sign-in), with the Account page's skeleton while it loads.
import dynamic from 'next/dynamic';
import { AppSkeleton } from '../../src/ui/Loading.jsx';

const NotificationsApp = dynamic(() => import('../../src/tracker/NotificationsApp.jsx'), { ssr: false, loading: () => <AppSkeleton account /> });

export default function NotificationsRoot() {
  return <NotificationsApp />;
}
