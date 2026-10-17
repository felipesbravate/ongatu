import { Fragment } from 'react';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { T } from '@/components/T';
import { Icon } from '@/components/Icon';
import { NotificationItem, useAlerts } from '@/components/Notifications';
import { color as C, radius, space } from '@/theme/tokens';

// Notifications (Okara 228:455 State=Mobile, 407:905): full screen on surface/primary. A 64 bar (padding 8: the back
// arrow as a Round button Small, "Notifications" in Heading/Large, 8 apart), then the items 16 below, 16 from the sides,
// 12 apart with a Divider between them. Each alert: View (back to the dashboard) and, while unread, Mark as read.
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { model } = useSession();
  const { items, markRead } = useAlerts(model);
  return (
    <View style={{ flex: 1, backgroundColor: C.surfacePrimary, paddingTop: insets.top }}>
      <View style={s.bar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={6}
          style={({ pressed }) => [s.round, pressed && { backgroundColor: C.actionSecondaryActive }]}>
          <Icon name="arrowLeft" size={20} />
        </Pressable>
        <T v="HeadingLarge" accessibilityRole="header" style={{ flex: 1 }}>Notifications</T>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: insets.bottom + space.lg, gap: space.sm }}>
        {items.length === 0 && <NotificationItem date="" text="Nothing new. Over-budget alerts show up here." />}
        {items.map((it: any, i: number) => (
          <Fragment key={it.id}>
            {i > 0 && <View style={s.divider} />}
            <NotificationItem date={it.date} text={it.text} unread={it.unread}
              ctas={[{ label: 'View', outline: true, onPress: () => { markRead(it.id); router.back(); } },
                ...(it.unread ? [{ label: 'Mark as read', onPress: () => markRead(it.id) }] : [])]} />
          </Fragment>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { height: 64, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
  round: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: C.borderSecondary },
});
