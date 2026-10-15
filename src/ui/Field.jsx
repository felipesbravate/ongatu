import { Icon } from './Icon.jsx';

// Field: uppercase label over a control (Input 71:1093 / Dropdown). `htmlFor` should name the control
// (for a Dropdown, its trigger: `${id}-trigger`).
export function Field({ label, htmlFor, className, id, children, ...rest }) {
  return (
    <div className={['field', className].filter(Boolean).join(' ')} id={id} {...rest}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

// Group label + control stack (the "Type" controller in the panels).
export function FieldGroup({ label, className, children }) {
  return (
    <div className={['field-group', className].filter(Boolean).join(' ')}>
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

// Input field (Okara 918:1064): Medium 48px, Small 36px, Tiny 32px.
// All sizes use Surface/Mobile. Leading icons are 20px (Medium/Small) or 16px (Tiny).
// The empty, filled, focus and disabled states follow the semantic text, border and icon roles.
// React 19 forwards a ref in rest to the native input.
// `trailing` (918:1064's optional right icon, e.g. Cancel to clear): { icon, label, onClick } → a button after the input.
export function Input({ icon, iconSize, trailing, size = 'medium', className, placeholder = ' ', ...rest }) {
  const tSize = iconSize || (size === 'tiny' ? 'md' : 'lg');
  return (
    <span className={['ds-input', size !== 'medium' && size, rest.disabled && 'is-disabled', icon && 'has-icon', trailing && 'has-trailing', className].filter(Boolean).join(' ')}>
      {icon && <Icon icon={icon} size={tSize} />}
      <input placeholder={placeholder} {...rest} />
      {trailing && <button type="button" className="ds-input-trailing" aria-label={trailing.label} onClick={trailing.onClick} disabled={rest.disabled}><Icon icon={trailing.icon} size={tSize} /></button>}
    </span>
  );
}
