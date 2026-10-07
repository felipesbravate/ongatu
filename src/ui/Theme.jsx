'use client';
import { createContext, useContext, useState } from 'react';
const ThemeContext = createContext({ theme: 'light', setTheme: () => {} });
export function ThemeProvider({ initialTheme, children }) {
  const [theme, update] = useState(initialTheme);
  const setTheme = (next) => {
    const value = next === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = value;
    document.cookie = `ongatu-theme=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
    update(value);
  };
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
