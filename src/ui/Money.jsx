import { Icon } from './Icon.jsx';
import { euro } from './icons.js';
import { fmtFigure } from './format.js';

// Value (Figma): the Euro icon + 4px gap + the figure. Other currencies keep the trailing code.
export function Money({ value, currency, iconSize = 12 }) {
  const sign = value < 0 ? '-' : '';
  if (currency === 'EUR') {
    return <span className="money">{sign}<span className="money-ic" data-s={iconSize}><Icon icon={euro} size={iconSize} /></span><span>{fmtFigure(value)}</span></span>;
  }
  return <span className="money">{`${sign}${fmtFigure(value)} ${currency === 'SEK' ? 'kr' : currency}`}</span>;
}
