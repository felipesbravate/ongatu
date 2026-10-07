import { cookies, headers } from 'next/headers';
import { AppNavigation } from '../src/tracker/AppNavigation.jsx';
import { ThemeProvider } from '../src/ui/Theme.jsx';
import '../src/ui/okara.css';
import '../src/ui/theme-generated.css';
import '../src/ui/theme.css';
// Required by Next.js. Every real page in this app is served by a route handler (see app/route.js).
export const metadata = { title: 'Ongatu - Smart finance', icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-icon.png' }, robots: { index: false, follow: false } };
export default async function RootLayout({ children }) {
  const nonce = (await headers()).get('x-nonce');
  const savedTheme = (await cookies()).get('ongatu-theme')?.value;
  const theme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : null;
  return (<html lang="en" data-theme={theme || 'light'} suppressHydrationWarning><head>
    {/* Resolve the system preference before paint, without saving it as a manual override. */}
    {!theme && <script nonce={nonce || undefined} dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';" }} />}
  </head><body><ThemeProvider initialTheme={theme}><AppNavigation>{children}</AppNavigation></ThemeProvider></body></html>);
}
