import { Icon } from './Icon.jsx';
import { glassPress } from './Button.jsx';
import { arrowStraightLeft, x } from './icons.js';

// Panel header (Ongatu 229:19280 / 232:5852, Oct 3): a 64px modal-nav holding the close Round button on the left
// (desktop: Medium Tertiary with an X; phones: Small Tertiary with a 20px back arrow), then the title and the hint.
export function PanelHeader({ title, titleId, hint, hintId, onClose, closeId, faded }) {
  return (
    <>
      <div className="panel-nav">
        {/* Nov 17: the glass Nav round button (Okara 1364:682), 48 with a 24px icon, on desktop and phones. */}
        <button type="button" className="round-btn is-glass panel-close" id={closeId} aria-label="Close" onClick={onClose} {...glassPress()}>
          <Icon icon={x} size="xl" className="panel-close-x" />
          <Icon icon={arrowStraightLeft} size="xl" className="panel-close-back" />
        </button>
      </div>
      <div className={'add-panel-header' + (faded ? ' is-faded' : '')}>
        <h2 className="add-panel-title" id={titleId}>{title}</h2>
        {hint != null && <div className="add-panel-hint" id={hintId}>{hint}</div>}
      </div>
    </>
  );
}
