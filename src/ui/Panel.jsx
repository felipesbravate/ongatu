import { Icon } from './Icon.jsx';
import { arrowStraightLeft, x } from './icons.js';

// Panel header (Ongatu 229:19280 / 232:5852, Sept 28): a 64px modal-nav holding the 32px Round close button on the left
// (an X on desktop, a back arrow on phones: the Screen=Mobile variants), then the 24px title with the 16px hint under it.
export function PanelHeader({ title, titleId, hint, hintId, onClose, closeId, faded }) {
  return (
    <>
      <div className="panel-nav">
        <button type="button" className="round-btn tiny panel-close" id={closeId} aria-label="Close" onClick={onClose}>
          <Icon icon={x} size={20} className="panel-close-x" />
          <Icon icon={arrowStraightLeft} size={20} className="panel-close-back" />
        </button>
      </div>
      <div className={'add-panel-header' + (faded ? ' is-faded' : '')}>
        <h2 className="add-panel-title" id={titleId}>{title}</h2>
        {hint != null && <div className="add-panel-hint" id={hintId}>{hint}</div>}
      </div>
    </>
  );
}
