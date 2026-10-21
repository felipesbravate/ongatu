import { Icon } from './Icon.jsx';
import { euro } from './icons.js';
import { fmtFigure, currencySymbol } from './format.js';

// Value (Figma): the figure + 4px gap + the Euro icon after it (Oct 16: € after, KPI card 1028:49142). Other currencies
// keep the trailing code.
export function Money({ value, currency, iconSize = 12 }) {
  const sign = value < 0 ? '-' : '';
  if (currency === 'EUR') {
    return <span className="money"><span>{sign}{fmtFigure(value)}</span><span className="money-ic" data-s={iconSize}><Icon icon={euro} size={iconSize} /></span></span>;
  }
  return <span className="money">{`${sign}${fmtFigure(value)} ${currencySymbol(currency)}`}</span>;
}
