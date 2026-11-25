import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native';
import { useWide } from '@/lib/layout';
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

export function Field({ label, children, style, hideLabel }: { label: string; children: ReactNode; style?: object; hideLabel?: boolean }) {
  if (hideLabel) return <View style={style}>{children}</View>;
  return (
    <View style={[{ gap: space.xs }, style]}>
      <T v="BodyDefaultRegular" c={C.textSecondary}>{label}</T>
      {children}
    </View>
  );
}

type Size = 'medium' | 'tiny';
const BOX_H: Record<Size, number> = { medium: 48, tiny: 32 };

const Box = ({ filled, disabled, onPress, label, children, trailing, size = 'medium', boxRef, nativeID, open }: { filled: boolean; disabled?: boolean; onPress: () => void; label: string; children: ReactNode; trailing: ReactNode; size?: Size; boxRef?: any; nativeID?: string; open?: boolean }) => (
  <Pressable ref={boxRef} nativeID={nativeID} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled, expanded: !!open }}
    // Web (trial): hover = border/hover like the web's .ds-dd; the open one keeps the focus border.
    style={({ pressed, hovered }: any) => [s.box, { minHeight: BOX_H[size], paddingHorizontal: size === 'tiny' ? space.sm : space.md, borderColor: open ? C.borderFocus : filled ? C.borderSelectedItem : C.borderDefault },
      hovered && !open && { borderColor: C.borderHover || C.borderFocus }, pressed && { backgroundColor: C.surfaceBody }, disabled && { opacity: opacity.disabled }]}>
    <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    {trailing}
  </Pressable>
);

/** Web, wide screens (trial): the options open in a menu under the box (above it when there is no room), like the
 *  web's Dropdown-list 182:6851, instead of the phone's bottom sheet. */
function Menu({ anchor, visible, onClose, children }: { anchor: { x: number; y: number; w: number; h: number } | null; visible: boolean; onClose: () => void; children: ReactNode }) {
  const { height } = useWindowDimensions();
  if (!anchor) return null;
  const maxH = 320;
  const below = height - (anchor.y + anchor.h) - 16;
  const up = below < Math.min(maxH, 200) && anchor.y > below;
  const pos = up ? { bottom: height - anchor.y + 4 } : { top: anchor.y + anchor.h + 4 };
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.menu, pos, { left: anchor.x, minWidth: Math.max(anchor.w, 242), maxHeight: Math.min(maxH, up ? anchor.y - 16 : below) }]}>
        <ScrollView contentContainerStyle={{ padding: space.md }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

/** A dropdown: the box shows the picked option; tapping opens a sheet with the options (grouped or flat). On a wide
 *  web screen it opens a menu under the box instead. */
export function SelectField({ label, value, options, groups, onChange, placeholder = 'Select', disabled, sheetTitle, size = 'medium', hideLabel, nativeID, lead }: {
  label: string; value: string; options?: Option[]; groups?: OptionGroup[]; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; sheetTitle?: string;
  size?: Size; hideLabel?: boolean; nativeID?: string; lead?: ReactNode;
}) {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const boxRef = useRef<any>(null);
  const all = groups ? groups.flatMap((g) => g.options) : options || [];
  const picked = all.find((o) => o.value === value);
  const shown = picked ? (picked.selectedLabel || picked.label) : '';
  const pick = (v: string) => { setOpen(false); onChange(v); };
  const show = () => {
    if (wide && boxRef.current) boxRef.current.measureInWindow((x: number, y: number, w: number, h: number) => { setAnchor({ x, y, w, h }); setOpen(true); });
    else setOpen(true);
  };
  const row = (o: Option) => {
    const sel = o.value === value;
    return (
      <Pressable key={o.value} onPress={() => pick(o.value)} accessibilityRole="menuitem" accessibilityState={{ selected: sel }}
        style={({ pressed, hovered }: any) => [wide ? s.optWide : s.opt, !wide && sel && { backgroundColor: C.surfaceSecondary }, wide && (sel || hovered || pressed) && { backgroundColor: C.surfaceAccentLight }, !wide && !sel && pressed && { backgroundColor: C.surfaceCover }]}>
        <T pinned v={wide ? 'BodyDefaultRegular' : sel ? 'BodySmallMedium' : 'BodyDefaultRegular'} c={wide && !sel ? C.textSecondary : C.textPrimary} style={{ flex: 1 }}>{o.label}</T>
      </Pressable>
    );
  };
  const body = groups
    ? groups.map((g) => (
      <View key={g.group} style={{ gap: wide ? space.xs : space.tn, marginBottom: wide ? space.xs : space.md }}>
        <T pinned v={wide ? 'HeadingMedium' : 'HeadingSmall'} c={wide ? C.textPrimary : C.textSecondary} style={{ paddingHorizontal: space.sm, paddingVertical: space.xs }}>{g.group}</T>
        {g.options.map(row)}
      </View>))
    : <View style={{ gap: space.tn }}>{all.map(row)}</View>;
  const box = (
    <Box boxRef={boxRef} nativeID={nativeID} size={size} open={open && wide} filled={!!picked} disabled={disabled} onPress={show} label={`${label}: ${shown || placeholder}`}
      trailing={<View style={open && wide ? { transform: [{ rotate: '180deg' }] } : undefined}><Icon name="chevronDown" size={12} fill={C.iconPrimary} /></View>}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        {lead}
        <T pinned v={size === 'tiny' ? 'BodySmallRegular' : 'BodyDefaultRegular'} c={picked ? C.textPrimary : C.textSecondary} numberOfLines={1} style={{ flexShrink: 1 }}>{shown || placeholder}</T>
      </View>
    </Box>
  );
  return (
    <>
      {hideLabel ? box : <Field label={label}>{box}</Field>}
      {wide
        ? <Menu anchor={anchor} visible={open} onClose={() => setOpen(false)}>{body}</Menu>
        : <Sheet visible={open} title={sheetTitle || label} onClose={() => setOpen(false)}>{body}</Sheet>}
    </>
  );
}

/** A text input in the same box. `mono` sets the figure style (amounts). */
export function TextField({ label, mono, style, size = 'medium', hideLabel, ...rest }: TextInputProps & { label: string; mono?: boolean; style?: object; size?: Size; hideLabel?: boolean }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const filled = !!(rest.value && String(rest.value).length);
  return (
    <Field label={label} style={style} hideLabel={hideLabel}>
      <TextInput {...rest} accessibilityLabel={label} placeholderTextColor={C.textMuted} maxFontSizeMultiplier={1.4}
        // @ts-ignore web-only hover events (react-native-web)
        onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }} onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        style={[s.box, s.input, { minHeight: BOX_H[size], paddingHorizontal: size === 'tiny' ? space.sm : space.md }, mono ? text.ValueLarge : size === 'tiny' ? text.BodySmallRegular : text.BodyDefaultRegular, { color: C.textPrimary, borderColor: focus ? C.borderFocus : hover ? C.borderHover : filled ? C.borderSelectedItem : C.borderDefault }, s.noOutline]} />
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
  optWide: { minHeight: 36, padding: space.xs, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center' },
  // Dropdown-list 182:6851 (as the web's .ds-dd-menu): surface/primary, border/secondary, radius/md, padding 16, 8px shadow.
  menu: { position: 'absolute', backgroundColor: C.surfacePrimary, borderRadius: radius.md, borderWidth: 1, borderColor: C.borderSecondary,
    shadowColor: '#16150f', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  noOutline: { outlineStyle: 'none' } as any,
  opt: { minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center' },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xs },
  navBtn: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 48, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
