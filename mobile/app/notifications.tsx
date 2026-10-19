import { Fragment, useState } from 'react';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { T } from '@/components/T';
import { Icon } from '@/components/Icon';
import { NotificationItem, useAlerts } from '@/components/Notifications';
import { color as C, radius, space } from '@/theme/tokens';

// Notifications, phones (Ongatu 1070:74832 / Okara 228:455 State=Mobile, Oct 18): full screen on surface/primary.
// A 64 bar (padding 8) with the back arrow (Round button Small); "Notifications" in Heading/XL 16 below, 16 from the
// sides; 24 below, the tabs (menu-item 304:528 at 40 high: padding 8/12, radius/sm, 12 apart): All and Unread, each
// with its menu-item-counter (936:953; Unread in the notification colour). The list starts right under the tabs,
// 16 from the sides, items 12 apart with a Divider between them, and fades out over the last 112px of the screen.
type Tab = 'all' | 'unread';

function Counter({ n, unread, selected }: { n: number; unread?: boolean; selected?: boolean }) {
  return (
    <View style={[s.counter, unread && { borderColor: C.borderNotification }]}>
      <T v="ValueSmall" c={unread ? C.textNotification : selected ? C.textPrimary : C.textSecondary} style={{ textAlign: 'center' }}>{n}</T>
    </View>
  );
}

function TabItem({ label, count, unread, selected, onPress }: { label: string; count: number; unread?: boolean; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={`${label}, ${count}`}
      style={({ pressed }) => [s.tab, selected && { backgroundColor: C.surfaceSecondary }, !selected && pressed && { backgroundColor: C.surfaceBody }]}>
      <T v="LabelDefault" c={selected ? C.textPrimary : C.textSecondary}>{label}</T>
      <Counter n={count} unread={unread} selected={selected} />
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { model } = useSession();
  const { items, markRead } = useAlerts(model);
  const [tab, setTab] = useState<Tab>('all');
  const unreadCount = items.filter((it: any) => it.unread).length;
  const shown = tab === 'unread' ? items.filter((it: any) => it.unread) : items;
  return (
    <View style={{ flex: 1, backgroundColor: C.surfacePrimary, paddingTop: insets.top }}>
      <View style={s.bar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6}
          style={({ pressed }) => [s.round, pressed && { backgroundColor: C.actionSecondaryActive }]}>
          <Icon name="arrowLeft" size={20} />
        </Pressable>
      </View>
      <T v="HeadingXL" accessibilityRole="header" style={s.title}>Notifications</T>
      <View style={s.tabs} accessibilityRole="tablist">
        <TabItem label="All" count={items.length} selected={tab === 'all'} onPress={() => setTab('all')} />
        <TabItem label="Unread" count={unreadCount} unread selected={tab === 'unread'} onPress={() => setTab('unread')} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: insets.bottom + 112, gap: space.sm }}>
        {shown.length === 0 && <NotificationItem date="" text={tab === 'unread' ? 'Nothing unread.' : 'Nothing new. Over-budget alerts show up here.'} />}
        {shown.map((it: any, i: number) => (
          <Fragment key={it.id}>
            {i > 0 && <View style={s.divider} />}
            <NotificationItem date={it.date} text={it.text} unread={it.unread}
              ctas={it.unread ? [{ label: 'View', outline: true, onPress: () => { markRead(it.id); router.back(); } },
                { label: 'Mark as read', onPress: () => markRead(it.id) }] : []} /* read: date and text only (228:462) */ />
          </Fragment>
        ))}
      </ScrollView>
      <LinearGradient pointerEvents="none" colors={[C.surfacePrimaryTransparent, C.surfacePrimary]} style={s.fade} />
    </View>
  );
}

const s = StyleSheet.create({
  bar: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs },
  round: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: space.md, paddingHorizontal: space.md },
  tabs: { marginTop: space.lg, height: 40, flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md },
  tab: { height: 40, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.sm },
  counter: { minWidth: 24, paddingHorizontal: space.tn, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1, borderColor: C.borderDefault, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: C.borderSecondary },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 112 },
});
