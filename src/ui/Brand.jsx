'use client';
import { Icon } from './Icon.jsx';
import { checkmark } from './icons.js';
import { useMobile } from './useMobile.js';

const cx = (...c) => c.filter(Boolean).join(' ');

// logo_ongatu (DS 277:670). Variant Full (Horizontal: symbol + ONGATU, 482x147.4), Vertical (below) or Symbol (147.4x147.4). Drawn in the raw
// brand colours the component uses (brand/indigo #4f46e5, brand/mint #13d075; no Color variable is bound).
// `height` sets the size; the width follows.
const SYMBOL = [
  ['M147.38 56.603L140.83 50.0504L123.76 67.1273L80.23 23.5796L97.25 6.55267L90.7 0L73.68 17.0269L66.85 10.1941L60.3 16.7468L67.13 23.5796L23.6 67.1273L16.77 60.2945L10.22 66.8472L17.05 73.68L0 90.7469L6.55 97.2996L23.62 80.2227L67.15 123.77L50.08 140.847L56.63 147.4L73.7 130.323L80.58 137.206L87.13 130.653L80.25 123.77L123.78 80.2227L130.61 87.0554L137.16 80.5028L130.33 73.67L147.4 56.593L147.38 56.603ZM73.69 117.218L30.16 73.67L73.69 30.1223L117.22 73.67L73.69 117.218Z', 'indigo'],
  ['M73.73 65.9662L65.9359 73.7174L73.6416 81.4721L81.4358 73.721L73.73 65.9662Z', 'indigo'],
  ['M43.3 73.7501L73.65 104.112C73.65 104.112 73.64 104.122 73.63 104.132L73.65 104.112C74.57 103.192 104.08 73.6201 104.08 73.6201L73.75 43.2777L43.3 73.7401V73.7501ZM73.65 91.0171L56.4 73.7601L73.76 56.393L91 73.6401C85.88 78.7722 78.79 85.8751 73.66 91.0171H73.65Z', 'mint'],
];
const TYPE = [
  'M211.778 53.0036C209.142 50.3676 206 48.2568 202.441 46.7307C198.892 45.2046 195.066 44.4316 191.081 44.4316C187.097 44.4316 183.261 45.2046 179.722 46.7307C176.163 48.2568 173.021 50.3676 170.384 53.0036C167.748 55.6395 165.636 58.7809 164.11 62.3385C162.583 65.8862 161.81 69.7014 161.81 73.705C161.81 77.7085 162.583 81.5237 164.11 85.0615C165.636 88.6191 167.748 91.7605 170.384 94.3965C173.021 97.0325 176.163 99.1432 179.722 100.669C183.27 102.195 187.087 102.968 191.081 102.968C195.076 102.968 198.902 102.195 202.451 100.669C206.009 99.1432 209.152 97.0325 211.788 94.3965C214.425 91.7605 216.536 88.6191 218.063 85.0615C219.589 81.5138 220.363 77.6986 220.363 73.705C220.363 69.7113 219.589 65.8862 218.063 62.3385C216.536 58.7809 214.425 55.6395 211.788 53.0036H211.778ZM203.769 79.0661C203.056 80.731 202.064 82.1976 200.825 83.4363C199.586 84.675 198.119 85.666 196.454 86.3795C194.789 87.1029 192.975 87.4696 191.081 87.4696C189.188 87.4696 187.374 87.1029 185.709 86.3795C184.054 85.666 182.577 84.675 181.338 83.4363C180.098 82.1976 179.107 80.731 178.394 79.0661C177.67 77.4013 177.303 75.5878 177.303 73.6951C177.303 71.8023 177.67 69.9987 178.394 68.324C179.107 66.6691 180.098 65.2024 181.338 63.9538C182.577 62.7151 184.044 61.7241 185.709 61.0106C187.384 60.2872 189.188 59.9205 191.081 59.9205C192.975 59.9205 194.779 60.2872 196.454 61.0106C198.109 61.7241 199.576 62.7151 200.825 63.9538C202.064 65.1925 203.056 66.6592 203.769 68.324C204.493 69.9987 204.86 71.8023 204.86 73.6951C204.86 75.5878 204.493 77.3914 203.769 79.0661Z',
  'M258.139 66.7285V71.4951L255.363 67.6204L239.057 46.3739H225.418V101.026H241.407V80.7607V75.9941L244.182 79.8688L260.399 101.026H274.127V46.3739H258.139V66.7285Z',
  'M314.283 79.7796H321.152L319.239 82.1778C317.94 83.7931 316.364 85.0912 314.55 86.0327C312.706 86.984 310.645 87.4696 308.424 87.4696C306.541 87.4696 304.737 87.1227 303.072 86.439C301.406 85.7552 299.929 84.794 298.69 83.585C297.441 82.3661 296.44 80.8895 295.727 79.195C295.013 77.5004 294.646 75.6572 294.646 73.705C294.646 71.7528 294.973 69.9393 295.627 68.2546C296.282 66.5601 297.194 65.0835 298.343 63.8646C299.503 62.6457 300.891 61.6746 302.467 60.9809C304.053 60.2872 305.817 59.9305 307.711 59.9305C309.376 59.9305 311.091 60.2079 312.806 60.743C313.985 61.1196 315.056 61.6052 315.987 62.2097L324.938 49.4856C323.947 48.7622 322.787 48.0784 321.469 47.4442C319.913 46.6712 317.97 45.9676 315.67 45.3433C313.4 44.7388 310.665 44.4316 307.532 44.4316C303.538 44.4316 299.771 45.2046 296.311 46.7208C292.842 48.2469 289.809 50.3477 287.291 52.9738C284.773 55.6098 282.761 58.7413 281.314 62.2989C279.867 65.8466 279.143 69.6816 279.143 73.6852C279.143 77.6887 279.916 81.6823 281.443 85.2201C282.969 88.7777 285.081 91.8992 287.717 94.5055C290.354 97.1117 293.486 99.1928 297.045 100.689C300.594 102.186 304.42 102.949 308.414 102.949C311.13 102.949 313.807 102.582 316.364 101.859C318.912 101.135 321.32 100.095 323.511 98.7667C325.702 97.4388 327.714 95.8136 329.488 93.9605C331.183 92.1866 332.67 90.2047 333.909 88.0443V70.4149H314.283V79.7598V79.7796Z',
  'M356.063 46.3739L334.167 101.026H350.017L351.652 96.7946L352.019 95.8433H372.567L372.934 96.7946L374.57 101.026H390.42L368.523 46.3739H356.053H356.063ZM366.402 86.0624H355.974L356.777 84.0903L360.881 73.9923L362.308 70.4744L363.735 73.9923L367.839 84.0903L368.642 86.0624H366.412H366.402Z',
  'M389.29 59.2565H398.974H400.501V60.7926V101.026H417.49V60.7926V59.2565H419.027H428.701V46.3739H389.29V59.2565Z',
  'M465.565 45.601V78.8184C465.565 81.2859 465.01 83.2381 463.92 84.6354C462.74 86.1417 460.847 86.9047 458.3 86.9047C455.752 86.9047 453.859 86.1417 452.679 84.6354C451.589 83.248 451.034 81.2859 451.034 78.8184V45.601H434.678V79.6409C434.678 83.4363 435.243 86.7759 436.344 89.5506C437.434 92.2857 439 94.5748 440.993 96.3487C443.005 98.1423 445.483 99.5 448.358 100.402C451.292 101.323 454.642 101.789 458.29 101.789C461.938 101.789 465.278 101.323 468.222 100.402C471.097 99.5 473.595 98.1324 475.646 96.3388C477.669 94.5649 479.245 92.2758 480.335 89.5407C481.445 86.766 482 83.4264 482 79.631V45.5911H465.556L465.565 45.601Z',
];

// Variant Vertical (349:565, 248.04 x 197.44): the symbol at 136 centred on top, ONGATU 248 wide 152 below its top.
// Same paths, placed with transforms: the wordmark spans x 161.81-482, y 44.43-102.97 in the Full drawing.
const VERT = { w: 248.04, h: 197.44, sym: 'translate(56.02 0) scale(0.92266)', type: 'translate(0 152.09) scale(0.774656) translate(-161.81 -44.4316)' };

export function Logo({ variant = 'symbol', height = 48, className, title = 'Ongatu' }) {
  const full = variant === 'full', vertical = variant === 'vertical';
  const w = vertical ? VERT.w : full ? 482 : 147.4, h = vertical ? VERT.h : 147.4;
  return (
    <svg className={cx('ds-logo', className)} viewBox={`0 0 ${w} ${h}`} height={height} width={Math.round((height * w / h) * 100) / 100}
      role="img" aria-label={title} data-variant={vertical ? 'vertical' : full ? 'full' : 'symbol'}>
      <g transform={vertical ? VERT.sym : undefined}>{SYMBOL.map(([d, c], i) => <path key={i} d={d} className={`ds-logo-${c}`} />)}</g>
      {(full || vertical) && <g transform={vertical ? VERT.type : undefined}>{TYPE.map((d, i) => <path key={'t' + i} d={d} className="ds-logo-indigo" />)}</g>}
    </svg>
  );
}

// Toggle (DS 298:637): 38x24 pill. Off: surface/secondary, border/default, 22px surface/tertiary knob on the left.
// On: brand/mint-light, brand/mint border, surface/dark knob on the right. A switch for screen readers.
export function Toggle({ on, onChange, label, id, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on ? 'true' : 'false'} aria-label={label} id={id} disabled={disabled}
      className={cx('ds-toggle', on && 'is-on')} onClick={() => onChange && onChange(!on)}>
      <span className="ds-toggle-knob" aria-hidden="true" />
    </button>
  );
}

// Checkbox (as drawn on the Account page, 272:24091): 18x18, radius 4, surface/primary, border/default. Checked is not
// designed: it fills surface/dark with a white 12px checkmark.
export function Checkbox({ checked, onChange, id, children }) {
  return (
    <label className="ds-check" htmlFor={id}>
      <input type="checkbox" id={id} checked={!!checked} onChange={(e) => onChange && onChange(e.target.checked)} />
      <span className="ds-check-box" aria-hidden="true">{checked && <Icon icon={checkmark} size={12} />}</span>
      <span className="ds-check-label">{children}</span>
    </label>
  );
}

// App header (DS 285:600): full width, 64 high, padding 8/40, surface/body; the Symbol logo (48) on the left and the
// User nav on the right. On the page it sits 40px from the top and sticks to the top edge when the page scrolls.
// On phones (Ongatu 342:7994) the bar is 64 high with 16 padding and a 32px logo; the user menu gives way to the bottom nav.
export function AppHeader({ children, homeHref = '/' }) {
  const mobile = useMobile();
  return (
    <header className="ds-app-header" id="app-header">
      <a className="ds-app-header-logo" href={homeHref} aria-label="Ongatu, dashboard"><Logo variant="symbol" height={mobile ? 32 : 48} /></a>
      {children}
    </header>
  );
}
