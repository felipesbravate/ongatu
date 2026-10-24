import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { T } from './T';
import { illustrationAssets } from './illustrationAssets';
import { color as C, radius, space } from '@/theme/tokens';

// Busy overlay, phones (Ongatu 1106:41718, same as the web's): surface/modal over everything (the Add sheet too), the
// Modal card 16 from the screen sides, min 240 high, radius/lg: the Calculating illustration 72 high, wobbling while the
// save runs, 24 above the title (Heading/XL) and "This may take a few seconds." (Body/Default/Regular, text/secondary).
const art = illustrationAssets.calculating;
const ART_H = 72;
const ART_W = Math.round((ART_H * art.width) / art.height);

export function BusyOverlay({ message, hint = 'This may take a few seconds.' }: { message: string | null; hint?: string }) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!message) return;
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      // A damped swing every 1.4 s, like the web's ds-busy-wobble: −6°, +5°, −3°, +2°, rest.
      const to = (v: number, ms: number) => Animated.timing(turn, { toValue: v, duration: ms, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
      loop = Animated.loop(Animated.sequence([to(-6, 280), to(5, 280), to(-3, 280), to(2, 280), to(0, 280)]));
      loop.start();
    });
    AccessibilityInfo.announceForAccessibility(message);
    return () => { loop?.stop(); turn.setValue(0); };
  }, [message]);
  const rotate = turn.interpolate({ inputRange: [-6, 6], outputRange: ['-6deg', '6deg'] });
  return (
    <Modal visible={!!message} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { /* stays until the save ends */ }}>
      <View style={s.scrim} accessibilityViewIsModal>
        <View style={s.card} accessibilityRole="progressbar" accessibilityLabel={message || undefined}>
          <View style={{ height: ART_H, justifyContent: 'center' }}>
            {/* Pivot near the base (the web's transform-origin 50% 85%): shift down, rotate, shift back. */}
            <Animated.View style={{ transform: [{ translateY: ART_H * 0.35 }, { rotate }, { translateY: -ART_H * 0.35 }] }}>
              <SvgXml xml={art.xml} width={ART_W} height={ART_H} />
            </Animated.View>
          </View>
          <View style={{ gap: space.xs, alignSelf: 'stretch' }}>
            <T v="HeadingXL" style={{ textAlign: 'center' }}>{message}</T>
            <T v="BodyDefaultRegular" c={C.textSecondary} style={{ textAlign: 'center' }}>{hint}</T>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.surfaceModal, justifyContent: 'center', paddingHorizontal: space.md },
  card: {
    minHeight: 240, backgroundColor: C.surfacePrimary, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', gap: space.lg,
    paddingTop: space.xs, paddingHorizontal: space.xl, paddingBottom: space.md,
    shadowColor: C.textPrimary, shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
});

// One overlay for the whole app: run(message, fn) shows it, runs fn, and hides it when fn ends (Oct 24, as on the web).
const BusyCtx = createContext<<T>(message: string, fn: () => Promise<T>) => Promise<T>>(async (_m, fn) => fn());
export const useBusy = () => useContext(BusyCtx);
export function BusyProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const run = useCallback(async <T,>(msg: string, fn: () => Promise<T>) => {
    setMessage(msg);
    await new Promise((r) => requestAnimationFrame(() => r(null))); // the overlay is up before the work starts
    try { return await fn(); } finally { setMessage(null); }
  }, []);
  return <BusyCtx.Provider value={run}>{children}<BusyOverlay message={message} /></BusyCtx.Provider>;
}
