import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { useSaveEntries } from '@/lib/entries';
import { fmtDateEU, fmtNum, hasGroups, parseAmount, periodKeyOfDate, periodLabel, periodMismatch, todayISO } from '@/lib/shared';
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
  return <BusyProvider><AddEntry /></BusyProvider>;
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

  // "Track in" follows the date (when that month exists) until the person picks one.
  const onDate = (v: string) => {
    setDateVal(v);
    if (!periodTouched) { const k = periodKeyOfDate(v); if (k && model.periodExists(k)) setPeriod(k); }
  };

  const submit = async () => {
    setStatus(null);
    const description = desc.trim();
    const amt = Math.round(parseAmount(amount) * 100) / 100;
    if (!description) return setStatus('Add a description.');
    if (!itemVal) return setStatus('Pick a type.');
    if (periodMismatch(dateVal, periodKey)) return setStatus(`The date of the entry (${fmtDateEU(dateVal)}) doesn't match the month and year selected (${periodLabel(periodKey)}). Change the date or the month.`);
    if (!(amt > 0)) return setStatus('Enter an amount greater than 0.');
    setBusy(true);
    try {
      await saveEntries(periodKey, [{ type: entryType, group: isExp ? entryGroup : (subVal || null), category: grouped ? (itemCat || null) : null, item: itemVal, description, amount: amt, date: dateVal }]);
      router.back();
    } catch (e: any) {
      setStatus('Could not save: ' + (e?.message || 'unknown error'));
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.page, { paddingBottom: Math.max(insets.bottom, space.lg) + space.lg }]} keyboardShouldPersistTaps="handled">
        <View style={{ gap: space.xs }}>
          <T v="HeadingXL" accessibilityRole="header">Add an entry</T>
          <T v="BodyDefaultRegular" c={C.textSecondary}>Enter the information by hand.</T>
        </View>

        <View style={{ gap: space.md }}>
          <T v="HeadingLarge" accessibilityRole="header">Enter manually</T>
          <SelectField label="Track in" value={periodKey} groups={model.periodOptions()} onChange={(v) => { setPeriod(v); setPeriodTouched(true); }} />
          <View style={{ height: space.xs }} />
          <SelectField label="Category" value={entryType}
            options={kinds.filter((k) => typeHas(k.type) || k.type === entryType).map((k) => ({ value: k.type, label: k.label }))}
            onChange={(v) => { setEntryType(v); setEntryGroup(v === 'expense' ? expDefault('Fixed') : ''); setCat(''); setItem(''); }} />
          {(isExp || namedSubs.length > 0) && (
            <SelectField label={isExp ? 'Sub-category' : 'Sub-category (Optional)'} value={isExp ? subVal : (subVal || '__none')} options={subOptions}
              onChange={(v) => { setEntryGroup(v === '__none' ? '' : v); setCat(''); setItem(''); }} />
          )}
          <TextField label="Description" placeholder="e.g., Grocery store" value={desc} onChangeText={setDesc} autoComplete="off" autoCorrect={false} returnKeyType="next" />
          <View style={s.pair}>
            {grouped && (
              <View style={{ flex: 1 }}>
                <SelectField label="Group (Optional)" value={catVal || itemCat} options={opts(groupNames.filter(Boolean))}
                  onChange={(v) => { setCat(v); if (!(gc[v] || []).includes(itemVal)) setItem(''); }} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <SelectField label="Type" value={itemVal} options={opts(pool)} onChange={setItem} />
            </View>
          </View>
          <View style={s.pair}>
            <TextField style={{ flex: 1 }} label="Amount" mono placeholder="0,00" keyboardType="decimal-pad" value={amount} onChangeText={setAmount}
              onBlur={() => { if (amount.trim()) setAmount(fmtNum(parseAmount(amount))); }} />
            <DateField style={{ flex: 1 }} label="Date" value={dateVal} onChange={onDate} min={bounds.min} max={bounds.max} />
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Pressable onPress={submit} disabled={busy || !ready} accessibilityRole="button" accessibilityLabel="Save entry" accessibilityState={{ disabled: busy || !ready, busy }}
            style={({ pressed }) => [s.btn, pressed && { backgroundColor: C.actionPrimaryPress }, (busy || !ready) && { opacity: opacity.disabled }]}>
            <T v="LabelLarge" c={C.textOnPrimary}>{busy ? 'Saving…' : 'Save entry'}</T>
          </Pressable>
          {status && <T v="BodySmallRegular" c={C.statusFail} accessibilityRole="alert">{status}</T>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  loading: { flex: 1, padding: space.lg },
  page: { padding: space.md, paddingTop: space.lg, gap: space.lg },
  pair: { flexDirection: 'row', gap: space.md },
  btn: { height: 48, borderRadius: radius.full, backgroundColor: C.actionPrimary, alignItems: 'center', justifyContent: 'center' },
});
