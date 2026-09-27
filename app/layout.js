// Required by Next.js. Every real page in this app is served by a route handler (see app/route.js).
export const metadata = { title: 'Ongatu - Smart finance', robots: { index: false, follow: false } };
export default function RootLayout({ children }) {
  return (<html lang="en"><body>{children}</body></html>);
}
