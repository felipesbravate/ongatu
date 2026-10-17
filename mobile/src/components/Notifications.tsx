import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { T } from './T';
import { Icon } from './Icon';
import { color as C, radius, space } from '@/theme/tokens';
import { fmtMoney } from '@/lib/shared';

// notification-item (Okara 228:469, Oct 17), same component as the web (src/ui/UserNav.jsx): the date (Body/Small/Medium),
// 8 below the text (Body/Small/Regular, text/secondary once read), 12 below the CTAs (Nano buttons 4 apart, the first
// outlined in border/tertiary, the rest text only, Label/Micro). Padding 16, radius/md. Phones have no hover, so the
// unread Dot (State=Unread-hover) shows while the item is pressed.
export type Cta = { label: string; onPress: () => void; outline?: boolean; disabled?: boolean };
export function NotificationItem({ date, text, unread, ctas = [] }: { date: string; text: string; unread?: boolean; ctas?: Cta[] }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)} accessibilityRole="summary"
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${date}. ${text}`}
      style={[s.item, pressed && { backgroundColor: C.surfaceAccentLight }]}>
      <View style={{ gap: space.xs }}>
        <View style={s.head}>
          <T v="BodySmallMedium">{date}</T>
          {unread && pressed && <Icon name="dot" size={12} fill={C.iconPrimary} />}
        </View>
        <T v="BodySmallRegular" c={unread ? C.textPrimary : C.textSecondary}>{text}</T>
      </View>
      {ctas.length > 0 && (
        <View style={s.ctas}>
          {ctas.map((c) => (
            <Pressable key={c.label} onPress={c.onPress} disabled={c.disabled} accessibilityRole="button" hitSlop={8}
              style={({ pressed: p }) => [s.cta, c.outline && s.ctaOutline, p && { backgroundColor: C.actionSecondaryHover }, c.disabled && { opacity: 0.4 }]}>
              <T v="LabelMicro">{c.label}</T>
            </Pressable>
          ))}
        </View>
      )}
    </Pressable>
  );
}

// Notification bell (228:455 State=Default): Round button Small (36, padding 8, 20px bell) with the 8px data/red-orange
// dot in its top-right corner when something is new.
export function NotificationBell({ onPress, hasNew }: { onPress: () => void; hasNew?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={hasNew ? 'Notifications (new)' : 'Notifications'} hitSlop={6}
      style={({ pressed }) => [s.bell, pressed && { backgroundColor: C.actionSecondaryActive }]}>
      <Icon name="bell" size={20} />
      {hasNew && <View style={s.bellDot} />}
    </Pressable>
  );
}

// Over-budget alerts (model.budgetAlerts, the same list as the web bell) with a read state kept on this phone.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const READ_KEY = 'ongatu.notifications.read';
function whenOf(iso?: string) {
  if (!iso) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(dateOnly ? iso + 'T12:00:00' : iso);
  if (isNaN(+d)) return '';
  const day = `${MON[d.getMonth()]} ${d.getDate()}`;
  return dateOnly ? day : `${day}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function useAlerts(model: any) {
  const [read, setRead] = useState<Set<string> | null>(null);
  useEffect(() => { SecureStore.getItemAsync(READ_KEY).then((v) => setRead(new Set(v ? JSON.parse(v) : [])), () => setRead(new Set())); }, []);
  const alerts = useMemo(() => (model ? model.budgetAlerts() : []), [model]);
  const items = useMemo(() => alerts.map((a: any) => ({
    id: a.id as string, date: whenOf(a.at), unread: !!read && !read.has(a.id),
    text: `${a.item} (${a.group}) is over budget in ${MON[a.mi]}: ${fmtMoney(a.spent, 'EUR')} of ${fmtMoney(a.budget, 'EUR')}.`,
  })), [alerts, read]);
  const markRead = useCallback((id: string) => {
    setRead((r) => {
      const next = new Set(r ?? []); next.add(id);
      SecureStore.setItemAsync(READ_KEY, JSON.stringify([...next].slice(-500))).catch(() => {});
      return next;
    });
  }, []);
  return { items, hasNew: items.some((it: any) => it.unread), markRead };
}

const s = StyleSheet.create({
  item: { padding: space.md, borderRadius: radius.md, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.tn },
  ctas: { flexDirection: 'row', alignItems: 'center', gap: space.tn },
  cta: { minWidth: 48, paddingHorizontal: space.xs, paddingVertical: space.tn, borderRadius: radius.full, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  ctaOutline: { borderColor: C.borderTertiary },
  bell: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: C.dataRedOrange },
});
