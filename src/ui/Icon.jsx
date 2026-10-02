// Icon (DS Icons page 85:1268). Pass an icon object from ./icons.js and a Size: 20 (default), 12 or 10, as in Figma.
// The drawings are in the 20px frame's coordinates, so Size=20 shows the whole 20x20 frame (glyph and its padding).
// Figma's 12 and 10px variants are the 20px drawing scaled from its inner 18x18 area (the 1px margin is dropped),
// which is the viewBox "1 1 18 18". X, Euro and Dollar have their own drawings for 10 and 12px (icon.sizes).
// Size is set here, not in CSS, so an icon can only be one of the three DS sizes.
import { iconFrame } from './iconFrame.js';

// Oct 2: a size can also be one of the DS icon-size variables: 'xl' (24, 16 on desktop), 'lg' (20, 16 on desktop),
// 'md' 16, 'sm' 12, 'tn' 10. xl and lg change with the Surface mode, so their svg carries .ico-xl / .ico-lg, the only
// CSS allowed to size an icon; the drawing is the 24 / 20 one (the same 20px frame, scaled).
export const ICON_SIZE = { xl: 24, lg: 20, md: 16, sm: 12, tn: 10 };
export function Icon({ icon, size = 20, className, ...rest }) {
  if (!icon) return null;
  const token = typeof size === 'string' ? size : null;
  const { px, drawing: ic, viewBox } = iconFrame(icon, token ? ICON_SIZE[token] : size);
  if (token === 'xl' || token === 'lg') className = (className ? className + ' ' : '') + 'ico-' + token;
  if (className) rest.className = className;
  // data-icon names the glyph, so tests and tools can tell which icon is drawn without comparing paths.
  const common = { viewBox, width: px, height: px, xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': 'true', 'data-icon': icon.name, 'data-size': px, ...rest };
  if (ic.type === 'dots') {
    return <svg {...common}>{ic.circles.map((c, i) => <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="currentColor" />)}</svg>;
  }
  if (ic.type === 'stroke-only') {
    return <svg {...common}>{ic.strokes.map((s, i) => <path key={i} d={s.d} fill="none" stroke="currentColor" strokeWidth={s.w} strokeLinecap={s.cap} strokeLinejoin="round" />)}</svg>;
  }
  if (ic.type === 'mixed') {
    return (
      <svg {...common}>
        <path d={ic.fillD} fill="currentColor" fillRule={ic.fillRule} />
        {ic.strokes.map((s, i) => <path key={i} d={s.d} fill="none" stroke="currentColor" strokeWidth={s.w} strokeLinecap={(s.cap || 'round').toLowerCase()} strokeLinejoin="round" />)}
      </svg>
    );
  }
  // type 'paths' (Sept 29): one <path> per Figma vector path, so paths that overlap add up (as in Figma) instead of
  // cutting each other out under one fill rule.
  if (ic.type === 'paths') return <svg {...common} fill="currentColor">{ic.paths.map((p, i) => <path key={i} fillRule={p.fillRule} d={p.d} />)}</svg>;
  return <svg {...common} fill="currentColor"><path fillRule={ic.fillRule} d={ic.d} /></svg>;
}
