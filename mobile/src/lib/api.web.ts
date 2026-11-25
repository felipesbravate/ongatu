// Web build of the app (trial, Nov 25): the page is served by the Next.js site itself, so it uses the web's own
// cookie-authenticated client (../src/tracker/api.js) instead of the phone's bearer token. Same exports as api.ts.
// @ts-ignore plain JS module shared with the Next.js app
import { api as webApi, getActiveBoard } from '../../../src/tracker/api.js';

export class ApiError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } }

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  try { return await webApi(method, path, body); }
  catch (e: any) { throw new ApiError(e?.code || 'error', e?.message || 'Request failed', 0); }
}

export const COLLECTIONS = ['entries', 'years', 'overrides', 'budgets', 'budgetDefaults'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];
export type Collections = Record<CollectionName, any[]>;

/** Where a collection lives: the active shared board (chosen on the web) or the personal one. */
export const dbPath = (col: string, id?: string) => {
  const board = getActiveBoard();
  return (board && col !== 'settings' ? `/api/boards/${board}/db/` : '/api/db/') + col + (id ? '/' + encodeURIComponent(id) : '');
};

const list = (c: string) => api<{ docs: { id: string; data: any }[] }>('GET', dbPath(c)).then((r) => r.docs.map((d) => ({ id: d.id, ...d.data })));
export async function loadAll(): Promise<Collections> {
  const lists = await Promise.all(COLLECTIONS.map(list));
  return Object.fromEntries(COLLECTIONS.map((c, i) => [c, lists[i]])) as Collections;
}
export async function loadSome(cols: CollectionName[]): Promise<Partial<Collections>> {
  const lists = await Promise.all(cols.map(list));
  return Object.fromEntries(cols.map((c, i) => [c, lists[i]]));
}
