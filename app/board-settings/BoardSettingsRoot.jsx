'use client';
// Like src/tracker/Root.jsx for the Board settings page: browser-only (it loads from /api after sign-in), with the
// Account page's skeleton while it loads.
import dynamic from 'next/dynamic';
import { AppSkeleton } from '../../src/ui/Loading.jsx';

const BoardSettingsApp = dynamic(() => import('../../src/tracker/boards/BoardSettingsApp.jsx'), { ssr: false, loading: () => <AppSkeleton account /> });

export default function BoardSettingsRoot() {
  return <BoardSettingsApp />;
}
