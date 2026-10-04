import { Icon } from './Icon.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');

// Button (DS 41:119, Sept 29). variant: primary | secondary | tertiary | destructive (Primary filled with action/destructive,
// as overridden in the Cost-tracker delete modal; the DS has no destructive style of its own).
// size: medium | small | tiny | micro. The height hugs padding + content, so it follows the Surface mode (Desktop is
// denser): Medium pad space/sm space/md, 24px icon, Body/Large/Medium; Small pad 8 space/md, 20px icon; Tiny pad
// space/xs space/sm, 16px icon, Body/Medium/Medium; Micro pad space/tn space/xs, 16px icon, Body/Small/Medium.
// Figma's Secondary is the `ghost` class in CSS.
// Oct 3 (41:119): Medium 20px icon, Small 16, Tiny and Micro 12.
export const BUTTON_ICON = { medium: 'lg', small: 'md', tiny: 'sm', micro: 'sm' };
// Oct 2: `trailing` draws the DS "Right Icon" after the label (Add category +, Add Type +).
export function Button({ variant = 'primary', size = 'medium', icon, trailing, iconSize, className, children, type = 'button', ...rest }) {
  const isz = iconSize || BUTTON_ICON[size] || 20;
  return (
    <button type={type} className={cx('btn-pill', variant === 'secondary' && 'ghost', variant === 'tertiary' && 'tertiary', variant === 'destructive' && 'destructive', size !== 'medium' && size, className)} {...rest}>
      {icon && <Icon icon={icon} size={isz} />}
      {icon || trailing ? <span>{children}</span> : children}
      {trailing && <Icon icon={trailing} size={isz} />}
    </button>
  );
}

// Round button (DS 52:629, Sept 29). variant: tertiary (default) | secondary | primary. size: medium | small | tiny | micro.
// Medium hugs space/sm around a 24px icon (48 on phones, 40 on desktop); Small is a fixed 40 with a 20px icon; Tiny hugs
// space/xs around 16 (32 / 24); Micro hugs space/tn around 16 (24 / 20). `iconSize` overrides the icon where a screen
// draws another one. `active` draws State=Active (a menu it opens is showing).
// Oct 3 (52:629): Medium 24, Small 20, Tiny 16, Micro 12, Nano 10.
export const ROUND_ICON = { medium: 'xl', small: 'lg', tiny: 'md', micro: 'sm', nano: 'tn' };
export function RoundButton({ icon, size = 'medium', iconSize, variant, active, className, label, type = 'button', ...rest }) {
  return (
    <button type={type} className={cx('round-btn', variant && variant !== 'tertiary' && variant, size !== 'medium' && size, active && 'is-active', className)} aria-label={label} {...rest}>
      <Icon icon={icon} size={iconSize || ROUND_ICON[size] || 20} />
    </button>
  );
}

// Action link (DS 607:1368, Oct 2): no padding, gap space/tn, link/default. size: small (default, Label/Tiny) |
// medium (Label/Large 18) | tiny (Label/Micro). `icon` leads, `trailing` follows; both 12px (icon-size/sm).
// With `href` it is a link (<a>), otherwise a button.
export function ActionLink({ icon, trailing, size, iconSize, className, children, type = 'button', href, ...rest }) {
  const cls = cx('ds-action-link', size && size !== 'small' && size, className);
  // Action link 607:1368 (Oct 3): Medium and Small carry a 16px icon, Tiny 12px.
  const is = iconSize || (size === 'tiny' ? 'sm' : 'md');
  const inner = <>{icon && <Icon icon={icon} size={is} />}{children}{trailing && <Icon icon={trailing} size={is} />}</>;
  if (href) return <a href={href} className={cls} {...rest}>{inner}</a>;
  return <button type={type} className={cls} {...rest}>{inner}</button>;
}
