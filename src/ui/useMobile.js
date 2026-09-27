'use client';
import { useEffect, useState } from 'react';

// True on phones (the Ongatu mobile screens, 390 wide): at most 640px. Server render and first paint are desktop.
export const MOBILE_QUERY = '(max-width: 640px)';
export function useMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setM(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}
