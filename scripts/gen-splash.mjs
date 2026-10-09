// Home Screen assets (Oct 9): the iPhone launch images (light and dark) and the PWA icons, drawn from the logo paths
// in src/ui/Brand.jsx so they always match the app's logo. Output goes to public/splash and public/icons/app; the PNGs
// are committed, so nothing here runs at build or request time.
//
//   node scripts/gen-splash.mjs
//
// Launch image: surface/body with the Vertical logo (120 pt wide, like the phone sign-in header) in the middle.
// Needs `sharp` (installed with Next on macOS/Linux).
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEVICES, SURFACE_BODY } from '../src/lib/home-screen.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let sharp;
try { sharp = (await import('sharp')).default; } catch { console.error('sharp is missing: run `npm i --no-save sharp` and try again.'); process.exit(1); }

// ---- logo paths from Brand.jsx ----
const brand = readFileSync(join(root, 'src/ui/Brand.jsx'), 'utf8');
const block = (name) => brand.slice(brand.indexOf(`const ${name} = [`), brand.indexOf('];', brand.indexOf(`const ${name} = [`)));
const SYMBOL = [...block('SYMBOL').matchAll(/\['([^']+)',\s*'(indigo|mint)'\]/g)].map((m) => [m[1], m[2]]);
const TYPE = [...block('TYPE').matchAll(/'(M[^']+)'/g)].map((m) => m[1]);
const vert = /const VERT = \{ w: ([\d.]+), h: ([\d.]+), sym: '([^']+)', type: '([^']+)' \}/.exec(brand);
if (!SYMBOL.length || !TYPE.length || !vert) throw new Error('Could not read the logo from src/ui/Brand.jsx');
const VERT = { w: +vert[1], h: +vert[2], sym: vert[3], type: vert[4] };

// theme-generated.css: surface/body, logo/indigo, logo/mint (Light, Dark).
const THEMES = {
  light: { bg: SURFACE_BODY.light, indigo: '#4f46e5', mint: '#13d075' },
  dark: { bg: SURFACE_BODY.dark, indigo: '#756dff', mint: '#42d98f' },
};
const symbolPaths = (t) => SYMBOL.map(([d, c]) => `<path d="${d}" fill="${t[c]}"/>`).join('');
const typePaths = (t) => TYPE.map((d) => `<path d="${d}" fill="${t.indigo}"/>`).join('');

function launchSvg(w, h, scale, t) {
  const lw = 120 * scale, lh = lw * VERT.h / VERT.w; // 120 pt wide
  const x = (w - lw) / 2, y = (h - lh) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="100%" height="100%" fill="${t.bg}"/>
<g transform="translate(${x} ${y}) scale(${lw / VERT.w})"><g transform="${VERT.sym}">${symbolPaths(t)}</g><g transform="${VERT.type}">${typePaths(t)}</g></g>
</svg>`;
}
function iconSvg(size, t, inset) {
  const s = size * (1 - 2 * inset), o = size * inset; // the symbol is 147.4 x 147.4
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="100%" height="100%" fill="${t.bg}"/>
<g transform="translate(${o} ${o}) scale(${s / 147.4})">${symbolPaths(t)}</g>
</svg>`;
}


mkdirSync(join(root, 'public/splash'), { recursive: true });
mkdirSync(join(root, 'public/icons/app'), { recursive: true });
const png = (svg, file) => sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(join(root, file));

const jobs = [];
for (const [w, h, s] of DEVICES) for (const [name, t] of Object.entries(THEMES)) jobs.push(png(launchSvg(w * s, h * s, s, t), `public/splash/launch-${w}x${h}@${s}x-${name}.png`));
jobs.push(png(iconSvg(192, { ...THEMES.light, bg: '#ffffff' }, 0.12), 'public/icons/app/icon-192.png'));
jobs.push(png(iconSvg(512, { ...THEMES.light, bg: '#ffffff' }, 0.12), 'public/icons/app/icon-512.png'));
jobs.push(png(iconSvg(512, { ...THEMES.light, bg: '#ffffff' }, 0.22), 'public/icons/app/icon-maskable-512.png')); // inside the 80% safe zone
await Promise.all(jobs);
console.log(`wrote ${jobs.length} images`);
