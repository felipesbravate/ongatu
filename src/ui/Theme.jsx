'use client';
import { createContext, useContext, useEffect, useState } from 'react';
const ThemeContext = createContext({ theme: 'light', setTheme: () => {} });
export function ThemeProvider({ initialTheme, children }) {
  const [preference, setPreference] = useState(initialTheme);
  const [theme, update] = useState(initialTheme || 'light');
  useEffect(() => {
    if (preference) return;
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      const value = system.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = value;
      update(value);
    };
    sync();
    system.addEventListener('change', sync);
    return () => system.removeEventListener('change', sync);
  }, [preference]);
  const setTheme = (next) => {
    const value = next === 'dark' ? 'dark' : 'light';
    setPreference(value);
    document.documentElement.dataset.theme = value;
    document.cookie = `ongatu-theme=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
    update(value);
  };
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
