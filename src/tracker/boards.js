'use client';
// Shared ("joint") boards in the app (Oct 11; designs Oct 13, Ongatu 938:32419 ff.). The server side is src/lib/boards.js.
//   useBoards()      the boards I'm on, the active one and my role there; also marks <html data-board-role> so viewers
//                    don't see controls that change data (the server refuses them anyway).
//   pending joins    an invite link opened while signed out is kept in sessionStorage until sign-in, then /join resumes.
import { useCallback, useEffect, useState } from 'react';
import { boardsApi, getActiveBoard, setActiveBoard } from './api.js';

export const ROLE_LABEL = { co_owner: 'Co-owner', editor: 'Collaborator', viewer: 'Viewer' }; // Oct 15 frames: editor = "Collaborator"
export const ROLE_HINT = {
  viewer: 'Can see the board.',
  editor: 'Can add and change entries and budgets.',
  co_owner: 'Can do everything: invite, manage members, rename and delete the board.',
};
export const ROLE_OPTIONS = ['viewer', 'editor', 'co_owner'].map((v) => ({ value: v, label: ROLE_LABEL[v] }));

// Figma calls them "joint boards". The personal board is "<first name>’s personal board" (board-dropdown 1052:6292).
export const personalBoardName = (first) => (first ? `${first}’s personal board` : 'My personal board');
/** "Create joint board": the joint-board setup (OnboardingApp) creates the board itself. */
export function startJointBoard() { location.assign('/welcome?joint=new'); }
/** The board's settings page (/board-settings); the personal board's when there is no joint board. */
export const boardSettingsHref = (id) => `/board-settings?board=${id ? encodeURIComponent(id) : 'personal'}`;

// One request per page load, shared by every component that asks.
let listPromise = null;
function loadList(force) {
  if (force || !listPromise) listPromise = boardsApi.list().then((r) => r.boards || []).catch((e) => { listPromise = null; throw e; });
  return listPromise;
}

export function markRole(role) {
  if (typeof document === 'undefined') return;
  if (role) document.documentElement.dataset.boardRole = role;
  else delete document.documentElement.dataset.boardRole;
}

/** @returns {{ boards: any[]|null, active: any|null, role: string|null, reload: () => Promise<void> }} */
export function useBoards() {
  const [boards, setBoards] = useState(null);
  const activeId = getActiveBoard();
  const reload = useCallback(async () => { try { setBoards(await loadList(true)); } catch { /* keep the last list */ } }, []);
  useEffect(() => {
    let live = true;
    loadList().then((list) => {
      if (!live) return;
      setBoards(list);
      // No longer on the active board (removed, left, or deleted): back to the personal board.
      if (activeId && !list.some((b) => b.id === activeId)) setActiveBoard(null, '/');
    }).catch(() => { if (live) setBoards([]); });
    return () => { live = false; };
  }, [activeId]);
  const active = activeId && boards ? boards.find((b) => b.id === activeId) || null : null;
  const role = activeId ? (active ? active.role : null) : 'owner';
  useEffect(() => { markRole(activeId && active ? active.role : null); }, [activeId, active]);
  return { boards, active, role, reload };
}

// ---- invite links opened while signed out ----
const JOIN_KEY = 'ongatu.join';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export function stashJoin(token) { try { if (TOKEN_RE.test(token)) sessionStorage.setItem(JOIN_KEY, token); } catch { /* ignore */ } }
export function pendingJoin() { try { const t = sessionStorage.getItem(JOIN_KEY); return t && TOKEN_RE.test(t) ? t : null; } catch { return null; } }
export function clearJoin() { try { sessionStorage.removeItem(JOIN_KEY); } catch { /* ignore */ } }
export const tokenFromHash = (hash) => { const t = String(hash || '').replace(/^#/, ''); return TOKEN_RE.test(t) ? t : null; };

// ---- "added by" on a shared board: member names by user id (filled once per page load) ----
const memberNames = new Map();
let memberList = []; // the shown joint board's members: [{ userId, name, email, role, you }]
let namesFor = null;
/** Loads the active shared board's members so entries can say who added them. Returns a version that changes when loaded. */
export function useMemberNames() {
  const id = getActiveBoard();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!id || namesFor === id) return;
    namesFor = id;
    boardsApi.get(id).then((b) => {
      memberNames.clear();
      memberList = b.members || [];
      (b.members || []).forEach((m) => { if (!m.you) memberNames.set(m.userId, (m.name || m.email || '').split(/[\s@]/)[0]); });
      setV((x) => x + 1);
    }).catch(() => { namesFor = null; });
  }, [id]);
  return v;
}
/** The shown joint board's members (after useMemberNames has loaded them). */
export const boardMembers = () => memberList;
/** Another member's first name for an entry they added (null for my own, or on the personal board). */
export const addedBy = (entry) => (entry && getActiveBoard() ? memberNames.get(entry.createdBy) || null : null);
