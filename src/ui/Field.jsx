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

// Input (DS 71:1093). size: 'medium' (default, 48 high) | 'small' (40) | 'tiny' (32); every size writes 14px Medium.
// Empty shows the placeholder in text/secondary; Filled (has a value) turns the border border/selected-item; Focus
// border/focus; Disable fills surface/secondary with text/muted. `icon` = an optional icon before the text (20px at
// Medium, 12px smaller). The placeholder defaults to " " so an empty field without one still reads as Empty.
// `ref` (React 19: a plain prop) reaches the <input>.
// iconSize overrides the icon (the Amount field draws its € at 16, like the Value text beside it).
export function Input({ icon, iconSize, size = 'medium', className, placeholder = ' ', ...rest }) {
  return (
    <span className={['ds-input', size !== 'medium' && size, rest.disabled && 'is-disabled', icon && 'has-icon', className].filter(Boolean).join(' ')}>
      {icon && <Icon icon={icon} size={iconSize || (size === 'tiny' ? 'md' : 'xl')} />}
      <input placeholder={placeholder} {...rest} />
    </span>
  );
}
