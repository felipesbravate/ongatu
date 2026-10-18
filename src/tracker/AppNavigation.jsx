'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MobileBottomNav } from '../ui/MobileNav.jsx';

const NavigationContext = createContext(null);

// Lives above route content so section navigation never replaces the mobile bar.
export function AppNavigation({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [image, setImage] = useState(null);
  const action = useRef(null);
  const register = useCallback((nextImage, onAdd) => {
    if (nextImage !== undefined) setImage(nextImage || null);
    action.current = onAdd;
    return () => { if (action.current === onAdd) action.current = null; };
  }, []);
  const visible = pathname === '/' || pathname === '/account' || pathname === '/notifications';
  // The Notifications page on phones is a full-screen page without the bar (notifications-mobile 1070:74832, Oct 18).
  const bar = visible && pathname !== '/notifications';
  return <NavigationContext.Provider value={register}>
    <div className={visible ? 'app-route-content' : undefined} key={pathname}>{children}</div>
    {bar && <MobileBottomNav selection={pathname === '/account' ? 'account' : 'home'} image={image}
      onAdd={() => action.current ? action.current() : router.push('/?add=1')} />}
  </NavigationContext.Provider>;
}

export function useAppNavigation(image, onAdd) {
  const register = useContext(NavigationContext);
  useEffect(() => register?.(image, onAdd), [register, image, onAdd]);
}
