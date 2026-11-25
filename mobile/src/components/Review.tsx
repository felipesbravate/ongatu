import { StyleSheet, View } from 'react-native';
import { T } from './T';
import { Icon } from './Icon';
import { Button } from './Button';
import { SelectField, TextField, type Option, type OptionGroup } from './Field';
import { useWide } from '@/lib/layout';
import { TYPE_OPTS, fmtNum, hasGroups, parseAmount, periodLabel, typeKeyOf } from '@/lib/shared';
import { fitRows, reviewStatus, rowCatLabel, shortDate, type ReviewState, type Row } from '@/lib/review';
import { color as C, space } from '@/theme/tokens';

// Review imported entries (trial, Nov 25; Ongatu 229:18717 desktop / 415:14256 phones). One component for both:
// desktop = one line per entry (date | description | type | category | amount); phones = the fields stacked.
export function Review({ review, setReview, model, failedFiles, submitting, onSubmit, onCancel }: {
  review: ReviewState; setReview: (fn: (rv: ReviewState) => ReviewState) => void; model: any; failedFiles: number; submitting: boolean;
  onSubmit: () => void; onCancel: () => void;
}) {
  const wide = useWide();
  const { rows, period } = review;
  const yl = period.slice(0, 4);
  const { issues, bad, st } = reviewStatus(rows, period, review.status);
  const patch = (id: number, p: Partial<Row>) => setReview((rv) => ({ ...rv, rows: rv.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) }));
  return (
    <View style={{ gap: space.lg, marginTop: wide ? -space.md : -space.md - space.tn }} nativeID="ap-review">
      {rows.length > 0 && (
        // 229:18717: "Track in" over a 200 dropdown; 415:14256 (phones): the label on the left of a 206 dropdown.
        <View style={wide ? { width: 200, gap: space.xs } : { flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <T v="BodyDefaultRegular" c={C.textSecondary}>Track in</T>
          <View style={wide ? undefined : { width: 206 }}>
            <SelectField hideLabel nativeID="rv-period" label="Track in" value={period} groups={model.periodOptions()}
              onChange={(v) => setReview((rv) => fitRows({ ...rv, period: v, status: null }, model))} />
          </View>
        </View>
      )}
      {rows.length === 0 ? <T v="BodySmallRegular" c={C.textSecondary}>No entries left to submit.</T>
        : failedFiles > 0 && <T v="BodySmallRegular" c={C.textSecondary}>{`${failedFiles} ${failedFiles === 1 ? 'file' : 'files'} couldn't be read and ${failedFiles === 1 ? 'is' : 'are'} not listed here.`}</T>}
      {rows.length > 0 && (
        <View style={{ gap: wide ? space.md : space.lg, marginTop: wide ? space.tn : space.md + space.tn }} nativeID="rv-rows">
          {rows.map((r, i) => <ReviewRow key={r.id} r={r} iss={issues[i]} wide={wide} yl={yl} period={period} model={model} patch={patch} />)}
        </View>
      )}
      <View style={[s.actions, { marginTop: space.lg }, !wide && { flexDirection: 'column', alignItems: 'stretch', gap: space.md }]}>
        {st?.text ? (
          <View style={[s.status, wide && { flex: 1 }]}>
            {st.guess && <Icon name="question" size={wide ? 16 : 20} fill={C.textSecondary} />}
            <T v="BodySmallRegular" c={st.err ? C.statusFail : C.textSecondary} style={{ flexShrink: 1 }} nativeID="rv-status">{st.text}</T>
          </View>
        ) : wide ? <View style={{ flex: 1 }} /> : null}
        {wide && <Button nativeID="rv-cancel" label="Cancel" variant="tertiary" onPress={onCancel} />}
        <Button nativeID="rv-submit" label={submitting ? 'Saving…' : 'Save entries'} disabled={!rows.length || bad > 0 || submitting} onPress={onSubmit} full={!wide} />
        {!wide && <Button nativeID="rv-cancel" label="Cancel" variant="tertiary" onPress={onCancel} full />}
      </View>
    </View>
  );
}

function ReviewRow({ r, iss, wide, yl, period, model, patch }: { r: Row; iss: string[]; wide: boolean; yl: string; period: string; model: any; patch: (id: number, p: Partial<Row>) => void }) {
  const has = (k: string) => iss.includes(k);
  const typeKey = typeKeyOf(r.type, r.group);
  const allTypes = model.typeOpts(yl);
  const list = model.typeOptsForYear(yl, typeKey);
  const typeOptions: (Option | OptionGroup)[] = list.filter((t: any) => t.type !== 'expense').map((t: any) => ({ value: t.key, label: t.label, selectedLabel: t.label }));
  const exp = list.filter((t: any) => t.type === 'expense');
  const typeGroups: OptionGroup[] = [{ group: 'Income and savings', options: typeOptions as Option[] }];
  if (exp.length) typeGroups.push({ group: 'Expenses', options: exp.map((t: any) => ({ value: t.key, label: t.group, selectedLabel: t.label })) });
  const cats = model.catOptions(r.type, r.group, yl);
  const catLabel = rowCatLabel(r);
  let catGroups: OptionGroup[] | undefined; let catOptions: Option[] | undefined;
  if (hasGroups(r.type)) {
    const by = new Map<string, any[]>();
    cats.forEach((o: any) => { if (!by.has(o.category)) by.set(o.category, []); by.get(o.category)!.push(o); });
    catGroups = [...by].map(([c, os]) => ({ group: c, options: os.map((o) => ({ value: o.label, label: o.item, selectedLabel: o.label })) }));
  } else catOptions = cats.map((o: any) => ({ value: o.label, label: o.item, selectedLabel: o.label }));
  const guess = !!(r.guess && catLabel);
  const amountOk = r.amount > 0 && !has('amount') && !has('flag');
  const size = wide ? 'tiny' : 'medium';
  const date = <T v="LabelSmall" numberOfLines={1} c={has('date') ? C.statusFail : C.textSecondary} style={wide ? s.cDate : undefined}>{shortDate(r.date)}</T>;
  const fields = (
    <>
      <View style={wide ? s.cField : undefined}>
        <TextField hideLabel size={size} label="Description" value={r.description} placeholder="Description" onChangeText={(v) => patch(r.id, { description: v })} />
        {!!r.renamedFrom && <T v="BodyTinyRegular" c={C.textSecondary} numberOfLines={1} style={{ marginTop: space.tn }}>Was: {r.renamedFrom}</T>}
      </View>
      <View style={wide ? s.cField : undefined}>
        <SelectField hideLabel size={size} label="Type" value={typeKey} lead={guess && !wide ? <Icon name="question" size={20} fill={C.textSecondary} /> : undefined} groups={typeGroups.filter((g) => g.options.length)}
          onChange={(v) => {
            const t = allTypes.find((o: any) => o.key === v) || TYPE_OPTS.find((o: any) => o.key === v); if (!t) return;
            const keep = model.catOptions(t.type, t.group, yl).find((o: any) => o.label === catLabel);
            patch(r.id, { type: t.type, group: t.group, category: keep ? keep.category : null, item: keep ? keep.item : null });
          }} />
      </View>
      <View style={wide ? s.cField : undefined}>
        <SelectField hideLabel size={size} label="Category" value={catLabel} groups={catGroups} options={catOptions} placeholder="Select"
          lead={guess ? <Icon name="question" size={wide ? 12 : 20} fill={C.textSecondary} /> : undefined}
          onChange={(v) => { const o = cats.find((x: any) => x.label === v); patch(r.id, { category: o ? o.category : null, item: o ? o.item : null, guess: false }); }} />
      </View>
    </>
  );
  const amount = amountOk
    ? <View style={[s.value, wide && s.cAmt]}><T v="ValueMedium">{fmtNum(r.amount)}</T><Icon name="euro" size={16} /></View>
    : <View style={wide ? s.cAmt : undefined}><TextField hideLabel size={size} mono label="Amount" placeholder="0,00" defaultValue={r.amount > 0 ? fmtNum(r.amount) : ''}
        onChangeText={(v) => patch(r.id, { amount: parseAmount(v), flag: '' })} /></View>;
  if (wide) return <View style={[s.line, { minHeight: 32 }]}>{date}{fields}{amount}</View>;
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <View style={{ width: 44, paddingTop: space.sm }}>{date}</View>
      <View style={{ flex: 1, gap: space.xs }}>{fields}</View>
      <View style={{ paddingTop: space.xs }}>{amount}</View>
    </View>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  cDate: { width: 40, marginRight: space.xs, paddingTop: 7 },
  cField: { width: 140 },
  cAmt: { minWidth: 72, alignItems: 'flex-start' },
  value: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32, paddingLeft: space.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
