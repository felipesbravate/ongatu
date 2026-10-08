import { iconFrame } from './iconFrame.js';
import { SvgArtwork } from './SvgArtwork.jsx';

// Token sizes retain the responsive Surface variables; numeric sizes are fixed.
export const ICON_SIZE = { '2xl': 32, xl: 24, lg: 20, md: 16, sm: 12, tn: 10 };
export function Icon({ icon, size = 20, className, ...rest }) {
  if (!icon) return null;
  const token = typeof size === 'string' ? size : null;
  const { px, viewBox } = iconFrame(icon, token ? ICON_SIZE[token] : size);
  if (token === '2xl' || token === 'xl' || token === 'lg') className = (className ? className + ' ' : '') + 'ico-' + token;
  return (
    <svg viewBox={viewBox} width={px} height={px} overflow="hidden" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-icon={icon.name} data-size={px} className={className} {...rest}>
      <SvgArtwork {...icon} viewBox={viewBox} />
    </svg>
  );
}
