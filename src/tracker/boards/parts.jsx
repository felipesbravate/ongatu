'use client';
// Pieces shared by the joint-board screens (Ongatu, Oct 13-15): the card, the privacy note and the copy the frames use
// for each access level.
import { Icon } from '../../ui/Icon.jsx';
import { lock } from '../../ui/icons.js';
import '../boards.css';

// Oct 15 (970:18246): the access names the frames use; the editor role reads "Collaborator".
export const ACCESS_LABEL = { viewer: 'Viewer', editor: 'Collaborator', co_owner: 'Co-owner' };
export const ACCESS_MENU = ['viewer', 'co_owner', 'editor']; // the order of the role menu (986:27011)
// "Access option" descriptions (938:33414 / 938:33425 / 938:33432).
export const ACCESS_HINT = {
  viewer: 'View balances and entries. Cannot add, edit or delete data, invite people or rename the board.',
  editor: 'View, add, edit and delete joint-board entries. Cannot manage members or rename the board.',
  co_owner: 'Editor access, plus invite people, manage roles and rename this joint board.',
};
// The invitee's version ("Join joint board" modal, 938:32116).
export const ACCESS_HINT_YOU = {
  viewer: 'View balances and entries. You cannot add, edit or delete data, invite people or rename the board.',
  editor: 'View, add, edit and delete joint-board entries. You cannot manage members or rename the board.',
  co_owner: 'Editor access, plus invite people, manage roles and rename this joint board.',
};
export const article = (role) => (role === 'editor' ? 'a Collaborator' : role === 'viewer' ? 'a Viewer' : 'a Co-owner');

/** Privacy reassurance (938:33450): accent-light, 12 padding, a 16px lock and Body/Small text. */
export function BoardNote({ children, id, className }) {
  return (
    <p className={'jb-note' + (className ? ' ' + className : '')} id={id}>
      <Icon icon={lock} size={16} />
      <span>{children}</span>
    </p>
  );
}

/** "Card" (938:33288): surface/primary, radius md, 24 padding (16 on phones), the Card shadow. */
export function BoardCard({ id, title, text, children, className, titleId }) {
  return (
    <section className={'jb-card' + (className ? ' ' + className : '')} id={id} aria-labelledby={titleId}>
      {title && <h2 className="jb-card-title" id={titleId}>{title}</h2>}
      {text && <p className="jb-card-text">{text}</p>}
      {children}
    </section>
  );
}
