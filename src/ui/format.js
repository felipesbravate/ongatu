// Money formatting, European style: "1.234,56 €" — the symbol after the figure, a no-break space between (Oct 16,
// Felipe: € after everywhere, as in the new Figma frames).
// Oct 21: the currencies a year (and a board) can be kept in. Every amount uses the same European format with the symbol
// after the figure ("1.234,56 €", "1.234,56 £", "1.234,56 R$"), like the rest of the app.
export const CURRENCIES = Object.freeze([
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British pound' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian real' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish krona' },
]);
export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);
/** The symbol shown after a figure: €, £, R$, kr (an unknown code shows the code). */
export const currencySymbol = (cur) => (CURRENCIES.find((c) => c.code === cur) || { symbol: cur || '€' }).symbol;
const sym = currencySymbol;
const de = (v, digits) => Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "1.234,56 €" (EUR) or "1.234,56 kr" (others). */
export function fmtMoney(v, cur) {
  const s = de(v, 2);
  return (v < 0 ? '-' : '') + `${s}\u00a0${sym(cur)}`;
}
/** Rounded to whole units: "1.235 €". */
export function fmtMoneyShort(v, cur) {
  const s = Math.round(Math.abs(v)).toLocaleString('de-DE');
  return (v < 0 ? '-' : '') + `${s}\u00a0${sym(cur)}`;
}
/** Just the figure, no symbol: "1.234,56". */
export const fmtFigure = (v) => de(v, 2);
