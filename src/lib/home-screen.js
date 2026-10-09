// Home Screen ("Add to Home Screen") setup, Oct 9: the iPhone launch images and the theme colours.
// scripts/gen-splash.mjs draws public/splash/launch-<w>x<h>@<s>x-<light|dark>.png for each device below.

// iPhones in portrait: CSS points and pixel ratio.
export const DEVICES = [
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [420, 912, 3], // iPhone Air
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [430, 932, 3], // 14 Pro Max, 15 Plus / Pro Max, 16 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12 / 13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 13 Pro, 14, 16e
  [375, 812, 3], // X, XS, 11 Pro, 12 mini, 13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 6+ to 8 Plus
  [375, 667, 2], // SE (2nd, 3rd gen), 6 to 8
];

// surface/body (theme-generated.css), the colour around the app and behind the status bar.
export const SURFACE_BODY = { light: '#f9f9f7', dark: '#161713' };

// <link rel="apple-touch-startup-image"> entries. A saved theme gets only its own images; otherwise both, picked by
// the phone's appearance.
export function startupImages(theme) {
  const themes = theme ? [theme] : ['light', 'dark'];
  return DEVICES.flatMap(([w, h, s]) => themes.map((t) => ({
    href: `/splash/launch-${w}x${h}@${s}x-${t}.png`,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${s}) and (orientation: portrait)${theme ? '' : ` and (prefers-color-scheme: ${t})`}`,
  })));
}
