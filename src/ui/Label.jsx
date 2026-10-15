import { Icon } from './Icon.jsx';

// Label (DS 211:859). Without `type` it is the neutral chip used for tags. With `type`
// (positive | negative | warning) and an icon it is the chart delta.
export function Label({ type, icon, className, children, ...rest }) {
  if (!type && !icon) return <span className={['insight-tag', className].filter(Boolean).join(' ')} {...rest}>{children}</span>;
  return (
    <span className={['hc-delta', type, className].filter(Boolean).join(' ')} {...rest}>
      {icon && <Icon icon={icon} size={10} />}<span>{children}</span>
    </span>
  );
}
