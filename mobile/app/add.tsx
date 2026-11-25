import { useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { useSaveEntries } from '@/lib/entries';
import { MERCHANTS_DOC, applyMerchants, fmtDateEU, fmtNum, hasGroups, learnMerchants, parseAmount, periodKeyOfDate, periodLabel, periodMismatch, todayISO, typedRows } from '@/lib/shared';
import { api, dbPath } from '@/lib/api';
import { useWide } from '@/lib/layout';
import { fitRows, type ReviewState, type Row } from '@/lib/review';
import { Upload } from '@/components/Upload';
import { Review } from '@/components/Review';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { T } from '@/components/T';
import { DateField, SelectField, TextField, type Option } from '@/components/Field';
import { BusyProvider } from '@/components/BusyOverlay';
import { color as C, opacity, radius, space } from '@/theme/tokens';

// Add entry, phones (Ongatu 369:13388; the web's Add panel on phones, Oct 24): "Add an entry" and its line, then
// "Enter manually": Track in, Category, Sub-category, Description, Group (Optional) | Type, Amount | Date, and one full
// width "Save entry" (40% until the entry has a description, a type and an amount). The same rules as the web form
// (src/tracker/AddPanel.jsx): Type lists every type of the sub-category until a group is picked, and picking a type
// fills its group; "Track in" follows the date until it is picked. Saving closes the sheet and a Toast confirms.
// Not here yet: Upload documents, and "Add item" (a new type).
const GROUP_ORDER = ['Fixed', 'Variable', 'Additional', 'Extra'];
const opts = (values: string[]): Option[] => values.map((v) => ({ value: v, label: v }));

// The busy overlay is a Modal: it has to be opened from inside this sheet to show above it, so the sheet has its own.
export default function AddScreen() {
  return <BusyProvider><Shell><AddEntry /></Shell></BusyProvider>;
}

// Web, wide screens (trial, Nov 25): the panel slides over the page from the right like the web's #add-panel —
// 640 wide, the dim backdrop (click closes), the glass close button in a 64 nav, content 40 from the sides.
// Phones (native and narrow browsers) keep the sheet / full screen.
function Shell({ children }: { children: ReactNode }) {
  const wide = useWide();
  const close = useClose();
  if (!wide && Platform.OS === 'web') return (
    <View style={{ flex: 1, backgroundColor: C.surfacePrimary }} nativeID="add-panel">
      <View style={s.navNarrow}>
        <Pressable nativeID="entry-close-btn" onPress={close} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }: any) => [s.close, pressed && { transform: [{ scale: 0.94 }] }]}>
          <Icon name="x" size={24} />
        </Pressable>
      </View>
      {children}
    </View>
  );
  if (!wide) return <>{children}</>;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: C.surfaceModal, opacity: 0.35 }]} onPress={close} accessibilityLabel="Close" />
      <View style={s.panel} nativeID="add-panel" accessibilityRole={'dialog' as any} aria-modal>
        <View style={s.nav}>
          <Pressable nativeID="entry-close-btn" onPress={close} accessibilityRole="button" accessibilityLabel="Close"
            style={({ pressed, hovered }: any) => [s.close, (hovered || pressed) && { backgroundColor: C.actionSecondaryActive }, pressed && { transform: [{ scale: 0.94 }] }]}>
            <Icon name="x" size={24} />
          </Pressable>
        </View>
        {children}
      </View>
    </View>
  );
}

// Closing: back to where the panel was opened from. Opened straight from a link (no history), the web build goes to
// the site's dashboard and the app to Home — before, Close and Save did nothing in that case (bug bash, Nov 25).
function useClose() {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else if (Platform.OS === 'web') location.assign('/');
    else router.replace('/');
  };
}

// Remembered merchants (Nov 18, shared merchants.js): read before the review, written after a save. Quiet on failure.
async function loadMerchants() {
  try { const r = await api<{ docs: { id: string; data: any }[] }>('GET', dbPath('settings')); const d = r.docs.find((x) => x.id === MERCHANTS_DOC); return d ? d.data : null; }
  catch { return null; }
}
async function rememberMerchants(rows: any[]) {
  try {
    if (!rows.some((r) => r.readDescription != null)) return;
    const { store, changed } = learnMerchants(await loadMerchants(), rows, new Date().toISOString());
    if (changed) await api('PUT', dbPath('settings', MERCHANTS_DOC), store);
  } catch { /* remembered next time */ }
}

function AddEntry() {
  const { model } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const saveEntries = useSaveEntries();

  const [entryType, setEntryType] = useState('expense');
  const [entryGroup, setEntryGroup] = useState('Fixed');
  const [cat, setCat] = useState('');
  const [item, setItem] = useState('');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [dateVal, setDateVal] = useState(todayISO());
  const [period, setPeriod] = useState<string | null>(null);
  const [periodTouched, setPeriodTouched] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false); // a second press while the first save runs does nothing (bug bash: 3 fast clicks = 3 entries)
  const close = useClose();
  const wide = useWide();
  const [review, setReviewState] = useState<ReviewState | null>(null);
  const [reviewMeta, setReviewMeta] = useState<{ failed: number; clear: () => void } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reading, setReading] = useState(false);
  const setReview = (fn: (rv: ReviewState) => ReviewState) => setReviewState((rv) => (rv ? fn(rv) : rv));

  if (!model) return <View style={s.loading}><T v="BodySmallRegular" c={C.textSecondary}>Loading…</T></View>;

  const cur = model.currentYearMonthIndex();
  const yi = cur ? cur.yearIdx : Math.max(0, model.DATA.length - 1);
  const mi = cur ? cur.monthIndex : (model.DATA[yi] ? model.defaultMonth(model.DATA[yi]) : 0);
  const periodKey: string = period && model.periodExists(period) ? period : model.defaultPeriodKey(yi, mi);
  const yearLabel = periodKey.slice(0, 4);
  const TX = model.taxonomyForYear(yearLabel);
  const isExp = entryType === 'expense';
  const grouped = hasGroups(entryType);
  const kinds: { type: string; label: string }[] = model.kindsOf(yearLabel);
  const namedSubs: string[] = model.subsOf(entryType, yearLabel).filter(Boolean);
  const subVal = isExp ? entryGroup : (namedSubs.includes(entryGroup) ? entryGroup : '');
  const gc: Record<string, string[]> = !grouped ? {} : (TX.expenses[subVal] || {});
  const groupNames = Object.keys(gc).sort();
  const catVal = grouped && cat && gc[cat] ? cat : '';
  const typeOwner = (it: string) => groupNames.find((g) => gc[g].includes(it)) || '';
  const pool: string[] = grouped
    ? (catVal ? gc[catVal].slice().sort() : [...new Set(groupNames.flatMap((g) => gc[g]))].sort())
    : model.catOptions(entryType, subVal || null, yearLabel).map((o: any) => o.item);
  const itemVal = pool.includes(item) ? item : (grouped && catVal && pool.length === 1 ? pool[0] : '');
  const itemCat = grouped ? (catVal || typeOwner(itemVal)) : '';
  const typeHas = (v: string) => model.subsOf(v, yearLabel).some((g: string) => model.catOptions(v, g, yearLabel).length > 0);
  const expDefault = (g: string) => { const subs: string[] = model.subsOf('expense', yearLabel).filter(Boolean); return subs.includes(g) ? g : subs.includes('Fixed') ? 'Fixed' : (subs[0] || 'Fixed'); };
  const subOptions: Option[] = isExp
    ? opts(GROUP_ORDER.filter((g) => namedSubs.includes(g)).concat(namedSubs.filter((g) => !GROUP_ORDER.includes(g))).filter((g) => Object.keys(TX.expenses[g] || {}).length || g === entryGroup))
    : [{ value: '__none', label: 'None' }, ...opts(namedSubs)];
  const bounds = model.entryDateBounds();
  const ready = !!desc.trim() && !!itemVal && (!isExp || !!itemCat) && parseAmount(amount) > 0;

  const onRows = async (rows: Row[], failed: number, clear: () => void) => {
    const applied: Row[] = applyMerchants(rows, await loadMerchants(), model);
    const ks = applied.map((r) => periodKeyOfDate(r.date) as string).filter((k: any) => k && model.periodExists(k)).sort();
    setReviewMeta({ failed, clear });
    setReviewState(fitRows({ rows: applied, period: ks.length ? ks[ks.length - 1] : periodKey, status: null }, model));
  };
  const closeReview = () => { reviewMeta?.clear(); setReviewState(null); setReviewMeta(null); };
  const submitReview = async () => {
    if (!review || saving.current) return;
    saving.current = true;
    setSubmitting(true);
    try {
      const rows = review.rows;
      const res = await saveEntries(review.period, rows.map((r) => ({ type: r.type, group: r.type === 'expense' ? r.group : null, category: r.type === 'expense' ? r.category : null, item: r.item as string, description: r.description.trim(), amount: r.amount, date: r.date })));
      rememberMerchants(rows.filter((_, i) => !res.failed.includes(i)));
      if (!res.failed.length) { reviewMeta?.clear(); close(); }
      else setReview((rv) => ({ ...rv, rows: rv.rows.filter((_, i) => res.failed.includes(i)), status: { err: true, text: `${res.failed.length} of ${rows.length} couldn't be saved. Try Submit again.` } }));
    } catch (e: any) {
      setReview((rv) => ({ ...rv, status: { err: true, text: e?.message || 'Could not save.' } }));
    } finally { setSubmitting(false); saving.current = false; }
  };

  // "Track in" follows the date (when that month exists) until the person picks one.
  const onDate = (v: string) => {
    setDateVal(v);
    if (!periodTouched) { const k = periodKeyOfDate(v); if (k && model.periodExists(k)) setPeriod(k); }
  };

  const submit = async () => {
    if (saving.current) return;
    setStatus(null);
    const description = desc.trim();
    const amt = Math.round(parseAmount(amount) * 100) / 100;
    if (!description) return setStatus('Add a description.');
    if (!itemVal) return setStatus('Pick a type.');
    if (periodMismatch(dateVal, periodKey)) return setStatus(`The date of the entry (${fmtDateEU(dateVal)}) doesn't match the month and year selected (${periodLabel(periodKey)}). Change the date or the month.`);
    if (!(amt > 0)) return setStatus('Enter an amount greater than 0.');
    setBusy(true);
    saving.current = true;
    try {
      const entry = { type: entryType, group: isExp ? entryGroup : (subVal || null), category: grouped ? (itemCat || null) : null, item: itemVal, description, amount: amt, date: dateVal };
      await saveEntries(periodKey, [entry]);
      rememberMerchants(typedRows([entry])); // Nov 18: the category chosen here comes back on the next upload
      close();
    } catch (e: any) {
      setStatus('Could not save: ' + (e?.message || 'unknown error'));
    } finally { setBusy(false); saving.current = false; }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.page, wide && s.pageWide, { paddingBottom: wide ? space.xl : Math.max(insets.bottom, space.lg) + space.lg }]} keyboardShouldPersistTaps="handled">
        <View style={{ gap: wide ? space.sm : space.md }}>
          <T v="HeadingXL" accessibilityRole="header">{review && wide ? 'Review imported entries' : 'Add an entry'}</T>
          <T v="BodyDefaultRegular" c={C.textSecondary}>{review
            ? (wide ? "Edit details, adjust categories, or remove entries you don't want to track." : "Check your entries. Change anything that's wrong, or remove what doesn't belong.")
            : Platform.OS === 'web' ? 'Upload receipts or statements or enter the information by hand.' : 'Enter the information by hand.'}</T>
        </View>

        {review ? <Review review={review} setReview={setReview} model={model} failedFiles={reviewMeta?.failed || 0} submitting={submitting} onSubmit={submitReview} onCancel={closeReview} /> : <>
        <Upload model={model} onRows={onRows} onBusy={setReading} />
        {Platform.OS === 'web' && <View style={[s.divider, { marginTop: wide ? 0 : -space.md, marginBottom: wide ? 0 : -space.md }, reading && s.faded]} />}

        <View style={[{ gap: space.md }, reading && s.faded]} pointerEvents={reading ? 'none' : 'auto'}>
          <T v="HeadingLarge" w="HeadingXL" accessibilityRole="header" style={{ marginBottom: wide ? space.xs : 0 }}>Enter manually</T>
          <View style={wide ? { width: 242 } : undefined}><SelectField nativeID="entry-period" label="Track in" value={periodKey} groups={model.periodOptions()} onChange={(v) => { setPeriod(v); setPeriodTouched(true); }} /></View>
          <View style={{ height: wide ? space.tn : space.xs }} />
          <View style={wide ? s.pair : { gap: space.md }}>
          <View style={wide ? { flex: 1 } : undefined}><SelectField nativeID="entry-kind" label="Category" value={entryType}
            options={kinds.filter((k) => typeHas(k.type) || k.type === entryType).map((k) => ({ value: k.type, label: k.label }))}
            onChange={(v) => { setEntryType(v); setEntryGroup(v === 'expense' ? expDefault('Fixed') : ''); setCat(''); setItem(''); }} /></View>
          {(isExp || namedSubs.length > 0) && (
            <View style={wide ? { flex: 1 } : undefined}><SelectField nativeID="entry-sub" label={isExp ? 'Sub-category' : 'Sub-category (Optional)'} value={isExp ? subVal : (subVal || '__none')} options={subOptions}
              onChange={(v) => { setEntryGroup(v === '__none' ? '' : v); setCat(''); setItem(''); }} /></View>
          )}
          </View>
           <TextField nativeID="entry-desc" label="Description" placeholder="e.g., Grocery store" value={desc} onChangeText={setDesc} autoComplete="off" autoCorrect={false} returnKeyType="next" />
          <View style={s.pair}>
            {grouped && (
              <View style={{ flex: 1 }}>
                <SelectField nativeID="entry-cat" label="Group (Optional)" value={catVal || itemCat} options={opts(groupNames.filter(Boolean))}
                  onChange={(v) => { setCat(v); if (!(gc[v] || []).includes(itemVal)) setItem(''); }} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <SelectField nativeID="entry-item" label="Type" value={itemVal} options={opts(pool)} onChange={setItem} />
            </View>
          </View>
          <View style={s.pair}>
            <TextField nativeID="entry-amount" style={{ flex: 1 }} label="Amount" mono placeholder="0,00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount}
              onBlur={() => { if (amount.trim()) setAmount(fmtNum(parseAmount(amount))); }} />
            <DateField nativeID="entry-date" style={{ flex: 1 }} label="Date" value={dateVal} onChange={onDate} min={bounds.min} max={bounds.max} />
          </View>
        </View>

        <View style={[{ gap: space.sm }, !wide && Platform.OS === 'web' && { marginTop: space.xl - space.tn }, wide && { flexDirection: 'row-reverse', alignItems: 'center', gap: space.md, marginTop: space.xl - space.xs }]}>
          <Pressable nativeID="entry-submit" onPress={submit} disabled={busy || !ready} accessibilityRole="button" accessibilityLabel="Save entry" accessibilityState={{ disabled: busy || !ready, busy }}
            style={({ pressed, hovered }: any) => [s.btn, wide && s.btnWide, hovered && { backgroundColor: C.actionPrimaryHover }, pressed && { backgroundColor: C.actionPrimaryPress }, (busy || !ready) && { opacity: opacity.disabled }]}>
            <T pinned v="LabelSmall" c={C.textOnPrimary}>{busy ? 'Saving…' : 'Save entry'}</T>
          </Pressable>
          {status && <T v="BodySmallRegular" c={C.statusFail} accessibilityRole="alert" style={{ flexShrink: 1 }}>{status}</T>}
        </View>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, padding: space.lg },
  page: { padding: space.md, paddingTop: Platform.OS === 'web' ? space.md : space.lg, gap: Platform.OS === 'web' ? space.xl : space.lg },
  pair: { flexDirection: 'row', gap: space.md },
  pageWide: { paddingHorizontal: space.xl, paddingTop: space.lg, gap: space.xl },
  navNarrow: { height: 64, justifyContent: 'center', paddingHorizontal: space.xs },
  panel: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 640, maxWidth: '100%', backgroundColor: C.surfacePrimary, borderLeftWidth: 1, borderLeftColor: C.borderSecondary, shadowColor: '#16150f', shadowOpacity: 0.24, shadowRadius: 64 },
  nav: { height: 64, justifyContent: 'center', paddingHorizontal: space.sm },
  close: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: C.borderSecondary },
  divider: { height: 1, backgroundColor: C.borderSecondary },
  faded: { opacity: 0.4 },
  btnWide: { alignSelf: 'flex-start', paddingHorizontal: space.md, minWidth: 80 },
  btn: { height: 48, borderRadius: radius.full, backgroundColor: C.actionPrimary, alignItems: 'center', justifyContent: 'center' },
});
