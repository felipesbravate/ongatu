import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { T } from './T';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { MONTH_NAMES, fmtDateEU } from '@/lib/shared';
import { color as C, opacity, radius, space, text } from '@/theme/tokens';

// Form fields for phones, after the web's Add entry panel on phones (Ongatu 369:13388, Oct 24): the label in
// Body/Default/Regular text/secondary 8 above a 48-high box (radius/sm, padding 16). A box with a value has the
// selected border (border/selected-item); an empty one border/default. Placeholders are text/muted.

export type Option = { value: string; label: string; selectedLabel?: string };
export type OptionGroup = { group: string; options: Option[] };

export function Field({ label, children, style }: { label: string; children: ReactNode; style?: object }) {
  return (
    <View style={[{ gap: space.xs }, style]}>
      <T v="BodyDefaultRegular" c={C.textSecondary}>{label}</T>
      {children}
    </View>
  );
}

function Box({ filled, disabled, onPress, label, children, trailing }: { filled: boolean; disabled?: boolean; onPress: () => void; label: string; children: ReactNode; trailing: ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.box, { borderColor: filled ? C.borderSelectedItem : C.borderDefault }, pressed && { backgroundColor: C.surfaceBody }, disabled && { opacity: opacity.disabled }]}>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {trailing}
    </Pressable>
  );
}

/** A dropdown: the box shows the picked option; tapping opens a sheet with the options (grouped or flat). */
export function SelectField({ label, value, options, groups, onChange, placeholder = 'Select', disabled, sheetTitle }: {
  label: string; value: string; options?: Option[]; groups?: OptionGroup[]; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; sheetTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const all = groups ? groups.flatMap((g) => g.options) : options || [];
  const picked = all.find((o) => o.value === value);
  const shown = picked ? (picked.selectedLabel || picked.label) : '';
  const pick = (v: string) => { setOpen(false); onChange(v); };
  const row = (o: Option) => {
    const sel = o.value === value;
    return (
      <Pressable key={o.value} onPress={() => pick(o.value)} accessibilityRole="button" accessibilityState={{ selected: sel }}
        style={({ pressed }) => [s.opt, sel && { backgroundColor: C.surfaceSecondary }, !sel && pressed && { backgroundColor: C.surfaceCover }]}>
        <T v={sel ? 'BodySmallMedium' : 'BodyDefaultRegular'} style={{ flex: 1 }}>{o.label}</T>
      </Pressable>
    );
  };
  return (
    <Field label={label}>
      <Box filled={!!picked} disabled={disabled} onPress={() => setOpen(true)} label={`${label}: ${shown || placeholder}`} trailing={<Icon name="chevronDown" size={12} fill={C.iconPrimary} />}>
        <T v="BodyDefaultRegular" c={picked ? C.textPrimary : C.textMuted} numberOfLines={1}>{shown || placeholder}</T>
      </Box>
      <Sheet visible={open} title={sheetTitle || label} onClose={() => setOpen(false)}>
        {groups
          ? groups.map((g) => (
            <View key={g.group} style={{ gap: space.tn, marginBottom: space.md }}>
              <T v="HeadingSmall" c={C.textSecondary} style={{ paddingHorizontal: space.sm, paddingVertical: space.xs }}>{g.group}</T>
              {g.options.map(row)}
            </View>))
          : <View style={{ gap: space.tn }}>{all.map(row)}</View>}
      </Sheet>
    </Field>
  );
}

/** A text input in the same box. `mono` sets the figure style (amounts). */
export function TextField({ label, mono, style, ...rest }: TextInputProps & { label: string; mono?: boolean; style?: object }) {
  const [focus, setFocus] = useState(false);
  const filled = !!(rest.value && String(rest.value).length);
  return (
    <Field label={label} style={style}>
      <TextInput {...rest} accessibilityLabel={label} placeholderTextColor={C.textMuted} maxFontSizeMultiplier={1.4}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }} onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        style={[s.box, s.input, mono ? text.ValueLarge : text.BodyDefaultRegular, { color: C.textPrimary, borderColor: focus ? C.borderFocus : filled ? C.borderSelectedItem : C.borderDefault }]} />
    </Field>
  );
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** A date: the box shows dd/mm/yyyy with the calendar icon; tapping opens a month calendar (weeks start Monday). */
export function DateField({ label, value, onChange, min, max, style }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string; style?: object }) {
  const [open, setOpen] = useState(false);
  const [y0, m0] = value.split('-').map(Number);
  const [cursor, setCursor] = useState({ y: y0, m: m0 - 1 });
  const show = () => { setCursor({ y: y0, m: m0 - 1 }); setOpen(true); };
  const cells = useMemo(() => {
    const first = new Date(cursor.y, cursor.m, 1).getDay(); // 0 = Sunday
    const lead = (first + 6) % 7;
    const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
    return [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [cursor]);
  const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const canPrev = !min || ym(cursor.y, cursor.m) > min.slice(0, 7);
  const canNext = !max || ym(cursor.y, cursor.m) < max.slice(0, 7);
  const step = (d: number) => setCursor((c) => { const n = new Date(c.y, c.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const nav = (d: number, ok: boolean, name: 'chevronLeft' | 'chevronRight', a11y: string) => (
    <Pressable onPress={() => step(d)} disabled={!ok} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6}
      style={({ pressed }) => [s.navBtn, pressed && { backgroundColor: C.actionSecondaryActive }, !ok && { opacity: opacity.disabled }]}>
      <Icon name={name} size={16} />
    </Pressable>
  );
  return (
    <Field label={label} style={style}>
      <Box filled onPress={show} label={`${label}: ${fmtDateEU(value)}`} trailing={<Icon name="calendar" size={16} fill={C.iconPrimary} />}>
        <T v="BodyDefaultRegular" numberOfLines={1}>{fmtDateEU(value)}</T>
      </Box>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)} scroll={false}>
        <View style={s.calHead}>
          {nav(-1, canPrev, 'chevronLeft', 'Previous month')}
          <T v="HeadingMedium">{MONTH_NAMES[cursor.m]} {cursor.y}</T>
          {nav(1, canNext, 'chevronRight', 'Next month')}
        </View>
        <View style={s.grid}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <View key={'h' + i} style={s.cell}><T v="LabelSmall" c={C.textSecondary}>{d}</T></View>)}
          {cells.map((d, i) => {
            if (d == null) return <View key={'e' + i} style={s.cell} />;
            const v = iso(cursor.y, cursor.m, d);
            const sel = v === value;
            const off = (!!min && v < min) || (!!max && v > max);
            return (
              <View key={v} style={s.cell}>
                <Pressable onPress={() => { onChange(v); setOpen(false); }} disabled={off} accessibilityRole="button" accessibilityLabel={fmtDateEU(v)} accessibilityState={{ selected: sel, disabled: off }}
                  style={({ pressed }) => [s.day, sel && { backgroundColor: C.surfaceAccent }, !sel && pressed && { backgroundColor: C.surfaceSecondary }, off && { opacity: opacity.disabled }]}>
                  <T v="BodyDefaultRegular" c={sel ? C.textWhite : C.textPrimary}>{d}</T>
                </Pressable>
              </View>
            );
          })}
        </View>
      </Sheet>
    </Field>
  );
}

const s = StyleSheet.create({
  box: { minHeight: 48, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: C.surfacePrimary },
  input: { paddingVertical: 0 },
  opt: { minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center' },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  navBtn: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 48, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
