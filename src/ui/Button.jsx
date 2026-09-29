import { Icon } from './Icon.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');

// Button (DS 41:119, Sept 29). variant: primary | secondary | tertiary | destructive (Primary filled with action/destructive,
// as overridden in the Cost-tracker delete modal; the DS has no destructive style of its own).
// size: medium | small | tiny | micro. The height hugs padding + content, so it follows the Surface mode (Desktop is
// denser): Medium pad space/sm space/md, 24px icon, Body/Large/Medium; Small pad 8 space/md, 20px icon; Tiny pad
// space/xs space/sm, 16px icon, Body/Medium/Medium; Micro pad space/tn space/xs, 16px icon, Body/Small/Medium.
// Figma's Secondary is the `ghost` class in CSS.
export const BUTTON_ICON = { medium: 24, small: 20, tiny: 16, micro: 16 };
export function Button({ variant = 'primary', size = 'medium', icon, iconSize, className, children, type = 'button', ...rest }) {
  return (
    <button type={type} className={cx('btn-pill', variant === 'secondary' && 'ghost', variant === 'tertiary' && 'tertiary', variant === 'destructive' && 'destructive', size !== 'medium' && size, className)} {...rest}>
      {icon && <Icon icon={icon} size={iconSize || BUTTON_ICON[size] || 20} />}
      {icon ? <span>{children}</span> : children}
    </button>
  );
}

// Round button (DS 52:629, Sept 29). variant: tertiary (default) | secondary | primary. size: medium | small | tiny | micro.
// Medium hugs space/sm around a 24px icon (48 on phones, 40 on desktop); Small is a fixed 40 with a 20px icon; Tiny hugs
// space/xs around 16 (32 / 24); Micro hugs space/tn around 16 (24 / 20). `iconSize` overrides the icon where a screen
// draws another one. `active` draws State=Active (a menu it opens is showing).
export const ROUND_ICON = { medium: 24, small: 20, tiny: 16, micro: 16 };
export function RoundButton({ icon, size = 'medium', iconSize, variant, active, className, label, type = 'button', ...rest }) {
  return (
    <button type={type} className={cx('round-btn', variant && variant !== 'tertiary' && variant, size !== 'medium' && size, active && 'is-active', className)} aria-label={label} {...rest}>
      <Icon icon={icon} size={iconSize || ROUND_ICON[size] || 20} />
    </button>
  );
}

// Action link (DS 106:3611, Sept 29): pad space/tn 0, gap space/tn, Body/Medium/Medium, optional 16px leading icon.
// size: small (default) | medium (same drawing in the DS today).
// With `href` it is a link (<a>), otherwise a button.
export function ActionLink({ icon, size, className, children, type = 'button', href, ...rest }) {
  const cls = cx('ds-action-link', size === 'medium' && 'medium', className);
  const inner = <>{icon && <Icon icon={icon} size={16} />}{children}</>;
  if (href) return <a href={href} className={cls} {...rest}>{inner}</a>;
  return <button type={type} className={cls} {...rest}>{inner}</button>;
}
