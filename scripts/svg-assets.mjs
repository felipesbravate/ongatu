// Metadata only: artwork is served byte-for-byte as exported by Figma.
import { createHash } from 'node:crypto';
export function svgMetadata(svg, file) {
  const head = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!head) throw new Error(`${file}: missing SVG root`);
  const width = Number(head.match(/\bwidth="([\d.]+)"/)?.[1]);
  const height = Number(head.match(/\bheight="([\d.]+)"/)?.[1]);
  const viewBox = head.match(/\bviewBox="([^"]+)"/)?.[1];
  if (!(width > 0 && height > 0) || viewBox !== `0 0 ${width} ${height}`) throw new Error(`${file}: unexpected SVG dimensions`);
  if (/<(?:script|foreignObject|image)\b|\son\w+=|(?:href|xlink:href)=/i.test(svg)) throw new Error(`${file}: expected self-contained vector artwork`);
  return { width, height, viewBox, hash: createHash('sha256').update(svg).digest('hex').slice(0, 12) };
}
export const camel = (name) => name.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^./, c => c.toLowerCase());
