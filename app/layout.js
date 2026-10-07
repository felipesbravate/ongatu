import { cookies } from 'next/headers';
import { ThemeProvider } from '../src/ui/Theme.jsx';
import '../src/ui/okara.css';
import '../src/ui/theme-generated.css';
import '../src/ui/theme.css';
// Required by Next.js. Every real page in this app is served by a route handler (see app/route.js).
export const metadata = { title: 'Ongatu - Smart finance', icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-icon.png' }, robots: { index: false, follow: false } };
export default async function RootLayout({ children }) {
  const theme = (await cookies()).get('ongatu-theme')?.value === 'dark' ? 'dark' : 'light';
  return (<html lang="en" data-theme={theme}><body><ThemeProvider initialTheme={theme}>{children}</ThemeProvider></body></html>);
}
