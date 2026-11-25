/** @type {import('next').NextConfig} */
export default {
  // Keep production checks from overwriting a running development server's chunks.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  poweredByHeader: false,
  devIndicators: false,
  reactStrictMode: true,
  // Trial (Nov 25): the Expo web build is exported into public/rn/ (`npm run web:export` in mobile/). Any /rn/ path
  // that is not a file serves its index.html, so the app's own router takes over (deep links, reloads).
  async rewrites() {
    return { fallback: [{ source: '/rn', destination: '/rn/index.html' }, { source: '/rn/:path*', destination: '/rn/index.html' }] };
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    ] }];
  },
};
