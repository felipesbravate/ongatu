// Web app manifest (/manifest.webmanifest), Oct 9: what Android and desktop Chrome use when Ongatu is saved to the
// Home Screen or installed — the name under the icon, the icons, full-screen (standalone) launch, and the launch
// screen colour (Android draws its own launch screen from background_color + the icon + the name).
import { SURFACE_BODY } from '../src/lib/home-screen.js';

export default function manifest() {
  return {
    id: '/',
    name: 'Ongatu - Smart finance',
    short_name: 'Ongatu',
    description: 'Take charge of your money',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: SURFACE_BODY.light,
    theme_color: SURFACE_BODY.light,
    icons: [
      { src: '/icons/app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/app/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
