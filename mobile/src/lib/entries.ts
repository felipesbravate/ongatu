import { useCallback } from 'react';
import { useSession, type Writer } from './session';
import { createModel, yearsFromDocs, MONTH_ABBR } from './shared';
import { useBusy } from '@/components/BusyOverlay';
import { useToast } from '@/components/Toast';

// Saving entries from the phone (Oct 24): the web's save.entries, with its rules —
//  - a month of a year that isn't there yet (January of next year, from 25 December) creates that year first, with the
//    categories of the newest year;
//  - the entries go out a few at a time and the board reloads once at the end (session.write);
//  - from BUSY_ROWS entries on, the "may take a few seconds" overlay covers the screen while it runs;
//  - a Toast says what was added ("“Rent” added to Oct 2026." / "12 entries added to Oct 2026.").
export const BUSY_ROWS = 5;
const POOL = 6;

export type EntryRow = { type: string; group: string | null; category: string | null; item: string; description: string; amount: number; date: string };

async function inPool<T>(items: T[], fn: (item: T, i: number) => Promise<unknown>) {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(POOL, items.length) }, worker));
}
const copy = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const modelOf = (d: any) => createModel({ data: yearsFromDocs(d.years), entries: d.entries, overrides: d.overrides, budgets: d.budgets, budgetDefaults: d.budgetDefaults });

export function useSaveEntries() {
  const { model, data, write } = useSession();
  const busy = useBusy();
  const toast = useToast();

  /** Books rows in the month `periodKey` (YYYY-MM). Resolves with the indexes that failed; throws when none could be saved. */
  return useCallback(async (periodKey: string, rows: EntryRow[]): Promise<{ failed: number[] }> => {
    const year = periodKey.slice(0, 4), monthIndex = parseInt(periodKey.slice(5), 10) - 1;
    // The year first, when it's the open "next year" (model.periodOptions offers it before it exists).
    if (!model.DATA.some((y: any) => y.year === year)) {
      const numeric = model.DATA.filter((y: any) => /^\d{4}$/.test(y.year)).sort((a: any, b: any) => Number(b.year) - Number(a.year));
      const currency = (numeric[0] && numeric[0].currency) || 'EUR';
      const { data: fresh } = await write((db) => db.add('years', { year, currency, createdAt: new Date().toISOString(), taxonomy: copy(model.taxonomyForYear(year)) }));
      if (!fresh || !modelOf(fresh).DATA.some((y: any) => y.year === year)) throw new Error(`Could not create ${year}.`);
    }
    const docs = rows.map((r) => ({ year, monthIndex, ...r, createdAt: new Date().toISOString() }));
    const failed: number[] = [];
    const run = () => write(async (db: Writer) => {
      await inPool(docs, (d, i) => db.add('entries', d).catch(() => { failed.push(i); }));
    });
    if (docs.length >= BUSY_ROWS) await busy(`Adding ${docs.length} entries`, run); else await run();
    const added = docs.filter((_, i) => !failed.includes(i));
    if (!added.length) throw new Error(docs.length === 1 ? 'The entry could not be saved.' : 'None of the entries could be saved.');
    const where = ` to ${MONTH_ABBR[monthIndex]} ${year}`;
    toast(added.length === 1 && added[0].description ? `“${added[0].description}” added${where}.` : `${added.length} ${added.length === 1 ? 'entry' : 'entries'} added${where}.`, 'success');
    return { failed: failed.sort((a, b) => a - b) };
  }, [model, data, write, busy, toast]);
}
