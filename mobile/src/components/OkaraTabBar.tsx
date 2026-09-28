import { useEffect, useState } from 'react';
import { Pressable, View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { color as C, space, radius } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { T } from './T';

// mobile-bottom-nav (Okara DS 378:673). Two 136x56 slots + the 48px "+" action in the middle.
// The lavender pill (surface/accent-light) slides between the slots (Felipe, Sept 28); runs on the UI thread.
const SLOT_W = 136, SLOT_H = 56, FAB = 48;
const TABS: Record<string, { icon: IconName; label: string }> = { index: { icon: 'home', label: 'Home' }, profile: { icon: 'user', label: 'Profile' } };

export function OkaraTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const slotX = (i: number) => (i === 0 ? space.xs : w - space.xs - SLOT_W);
  useEffect(() => { if (w) x.value = withTiming(slotX(state.index), { duration: 200, easing: Easing.out(Easing.cubic) }); }, [state.index, w]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (e: LayoutChangeEvent) => { const nw = e.nativeEvent.layout.width; if (!w) x.value = nw && state.index ? nw - space.xs - SLOT_W : space.xs; setW(nw); };

  return (
    <LinearGradient colors={[C.surfacePrimaryTransparent, C.surfacePrimary]} style={[s.scrim, { paddingBottom: Math.max(insets.bottom, space.lg) }]} pointerEvents="box-none">
      <View style={s.nav} onLayout={onLayout} accessibilityRole="tablist">
        {w > 0 && <Animated.View style={[s.pill, pill]} />}
        {state.routes.map((route, i) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const selected = state.index === i;
          const press = () => {
            Haptics.selectionAsync();
            const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !e.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable key={route.key} onPress={press} style={s.slot} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={meta.label} hitSlop={4}>
              <Icon name={meta.icon} size={24} fill={selected ? C.surfaceAccent : C.textPrimary} />
              {selected && <Animated.View entering={FadeIn.duration(150).delay(80)}><T v="LabelDefaultSemiBold" c={C.textAccent}>{meta.label}</T></Animated.View>}
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/add'); }}
          style={({ pressed }) => [s.fab, { left: w / 2 - FAB / 2, backgroundColor: pressed ? C.actionPrimaryPress : C.actionPrimary }]}
          accessibilityRole="button" accessibilityLabel="Add entry">
          <Icon name="plus" size={20} fill={C.textWhite} />
        </Pressable>
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.sm, paddingTop: space.lg },
  nav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: space.xs, paddingVertical: space.navPaddingY, borderRadius: radius.full,
    backgroundColor: C.surfacePrimary + 'e0', // surface/primary @88%
    shadowColor: C.textPrimary, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6, // "Nav shadow" 0 3 12
  },
  slot: { width: SLOT_W, height: SLOT_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.tn, borderRadius: radius.lg },
  pill: { position: 'absolute', top: space.navPaddingY, left: 0, width: SLOT_W, height: SLOT_H, borderRadius: radius.lg, backgroundColor: C.surfaceAccentLight },
  fab: { position: 'absolute', top: space.navPaddingY + (SLOT_H - FAB) / 2, width: FAB, height: FAB, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});

export const TAB_BAR_SPACE = SLOT_H + 2 * space.navPaddingY + space.lg * 2; // bottom inset for scroll content (plus safe area)
