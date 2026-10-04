import { Icon } from './Icon.jsx';
import { arrowStraightLeft, x } from './icons.js';

// Panel header (Ongatu 229:19280 / 232:5852, Oct 3): a 64px modal-nav holding the close Round button on the left
// (desktop: Medium Tertiary with an X; phones: Small Tertiary with a 20px back arrow), then the title and the hint.
export function PanelHeader({ title, titleId, hint, hintId, onClose, closeId, faded }) {
  return (
    <>
      <div className="panel-nav">
        <button type="button" className="round-btn panel-close" id={closeId} aria-label="Close" onClick={onClose}>
          <Icon icon={x} size="md" className="panel-close-x" />
          <Icon icon={arrowStraightLeft} size="lg" className="panel-close-back" />
        </button>
      </div>
      <div className={'add-panel-header' + (faded ? ' is-faded' : '')}>
        <h2 className="add-panel-title" id={titleId}>{title}</h2>
        {hint != null && <div className="add-panel-hint" id={hintId}>{hint}</div>}
      </div>
    </>
  );
}
