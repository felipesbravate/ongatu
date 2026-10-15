'use client';
// "Share your board" (Ongatu "Desktop - Shared board - Owner - Invite" 994:40092, modal 994:40586; phones 994:51849,
// sheet 994:52459): the DS Modal (480 wide here) with the Share illustration (67 wide), "Share your board", the
// privacy line, then the Board sharing block (Sharing.jsx): add email addresses + Send invite, Copy link, People with
// access. Opened from the joint dashboard's "+" (TrackerApp) and from /account?share=<id>. Co-owners only.
//   <SharePanel open board={{ id, name, role }} onClose showToast />
import { Modal, illustrations } from '../../ui/index.js';
import { useConfirm } from '../ConfirmModal.jsx';
import { BoardSharing, useBoardPeople } from './Sharing.jsx';

export function SharePanel({ open, board, onClose, showToast }) {
  const can = !!board && board.role === 'co_owner';
  const people = useBoardPeople(open && can ? board.id : null);
  const [confirmModal, confirm] = useConfirm('share-confirm');
  return (
    <>
      <Modal open={!!open} id="share-modal" onClose={onClose} illustration={illustrations.share} illustrationWidth={67} title="Share your board"
        description="Member access never includes anyone’s personal board. Each member can switch back to their own private budget.">
        {can && people.board
          ? <BoardSharing board={people.board} invites={people.invites} reload={people.reload} showToast={showToast} confirm={confirm} idPrefix="share" />
          : <p className="jb-small" role="status">{people.error || (can ? 'Loading…' : 'Only co-owners can invite people to this board.')}</p>}
      </Modal>
      {confirmModal}
    </>
  );
}
