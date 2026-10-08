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
export function Input({ icon, iconSize, size = 'medium', className, placeholder = ' ', ...rest }) {
  return (
    <span className={['ds-input', size !== 'medium' && size, rest.disabled && 'is-disabled', icon && 'has-icon', className].filter(Boolean).join(' ')}>
      {icon && <Icon icon={icon} size={iconSize || (size === 'tiny' ? 'md' : 'lg')} />}
      <input placeholder={placeholder} {...rest} />
    </span>
  );
}
