'use client';
import { useId } from 'react';

// Use the exported SVG's alpha channel as a mask: its geometry, clipping and
// original dimensions stay intact, while the visible ink inherits theme color.
// IDs are unique even when the same icon appears repeatedly on a page.
export function SvgArtwork({ asset, width, height, viewBox, twoTone = false }) {
  const id = useId();
  const [x, y, w, h] = viewBox.split(' ').map(Number);
  if (twoTone) {
    // Filled status icons have white details. Separate the exported ink (#16150F)
    // from white, tint only the ink, then restore the source's original alpha.
    const slope = 255 / 233;
    return <>
      <defs><filter id={id} x="0" y="0" width={width} height={height} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${-slope} 0 0 0 ${slope}`} result="inkMask" />
        <feFlood floodColor="currentColor" result="color" />
        <feComposite in="color" in2="inkMask" operator="in" result="ink" />
        <feColorMatrix in="SourceGraphic" values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  ${slope} 0 0 0 ${-22 / 233}`} result="white" />
        <feComposite in="ink" in2="white" operator="arithmetic" k2="1" k3="1" result="tinted" />
        <feComposite in="tinted" in2="SourceGraphic" operator="in" />
      </filter></defs>
      <image href={asset} width={width} height={height} filter={`url(#${id})`} />
    </>;
  }
  return <>
    <defs>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} style={{ maskType: 'alpha' }}>
        <image href={asset} width={width} height={height} />
      </mask>
    </defs>
    <rect x={x} y={y} width={w} height={h} fill="currentColor" mask={`url(#${id})`} />
  </>;
}
