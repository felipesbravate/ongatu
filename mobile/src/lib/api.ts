import { supabase } from './supabase';

// Same /api/* as the web app, authenticated with the Supabase access token (Authorization: Bearer).
const ORIGIN = process.env.EXPO_PUBLIC_API_ORIGIN!;

export class ApiError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } }

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError('unauthenticated', 'Sign in first', 401);
  let res: Response;
  try {
    res = await fetch(ORIGIN + path, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new ApiError('network', 'Network error', 0); }
  let json: any = null;
  try { json = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new ApiError(json?.error?.code ?? `http_${res.status}`, json?.error?.message ?? `Request failed (${res.status})`, res.status);
  return json as T;
}

export const COLLECTIONS = ['entries', 'years', 'overrides', 'budgets', 'budgetDefaults'] as const;
export type Collections = Record<(typeof COLLECTIONS)[number], any[]>;

export async function loadAll(): Promise<Collections> {
  const lists = await Promise.all(COLLECTIONS.map((c) => api<{ docs: { id: string; data: any }[] }>('GET', '/api/db/' + c)));
  return Object.fromEntries(COLLECTIONS.map((c, i) => [c, lists[i].docs.map((d) => ({ id: d.id, ...d.data }))])) as Collections;
}
