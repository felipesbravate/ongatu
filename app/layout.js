// Required by Next.js. Every real page in this app is served by a route handler (see app/route.js).
export const metadata = { title: 'Ongatu - Smart finance', icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/icon.svg', type: 'image/svg+xml' }], apple: '/apple-icon.png' }, robots: { index: false, follow: false } };
export default function RootLayout({ children }) {
  return (<html lang="en"><body>{children}</body></html>);
}
