import { cookies, headers } from 'next/headers';
import { AppNavigation } from '../src/tracker/AppNavigation.jsx';
import { ThemeProvider } from '../src/ui/Theme.jsx';
import { SURFACE_BODY, startupImages } from '../src/lib/home-screen.js';
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
    {/* Home Screen (Oct 9): full-screen launch on iPhone, the name under the icon, the status bar in surface/body,
        and a launch image per iPhone size (light / dark) shown while the app starts. Android uses app/manifest.js (Next adds its <link>). */}
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Ongatu" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    {theme
      ? <meta name="theme-color" content={SURFACE_BODY[theme]} />
      : <><meta name="theme-color" media="(prefers-color-scheme: light)" content={SURFACE_BODY.light} /><meta name="theme-color" media="(prefers-color-scheme: dark)" content={SURFACE_BODY.dark} /></>}
    {startupImages(theme).map((l) => <link key={l.href} rel="apple-touch-startup-image" href={l.href} media={l.media} />)}
    {/* Resolve the system preference before paint, without saving it as a manual override. */}
    {!theme && <script nonce={nonce || undefined} dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.theme=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';" }} />}
  </head><body><ThemeProvider initialTheme={theme}><AppNavigation>{children}</AppNavigation></ThemeProvider></body></html>);
}
