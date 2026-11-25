import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from './T';
import { useWide } from '@/lib/layout';
import { color as C, radius, space } from '@/theme/tokens';

// Toast (DS 304:659, phones): surface/dark, radius/sm, a 4px status bar on the left (success / fail), the message in
// Body/Small/Regular white. Shows at the top of the screen for 4 s; screen readers hear it.
type Kind = 'success' | 'fail';
const Ctx = createContext<(message: string, kind?: Kind) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const wide = useWide(); // web, wide screens: the web's position (Ongatu 238:7184), 24 from the right, 116 from the top
  const [toast, setToast] = useState<{ message: string; kind: Kind; n: number } | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((message: string, kind: Kind = 'success') => {
    setToast((t) => ({ message, kind, n: (t?.n || 0) + 1 }));
    AccessibilityInfo.announceForAccessibility(message);
  }, []);
  useEffect(() => {
    if (!toast) return;
    Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(() => setToast(null)), 4000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [toast?.n]);
  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <Animated.View pointerEvents="none" style={[s.wrap, wide ? s.wrapWide : { top: insets.top + space.xs }, { opacity: fade }]}>
          <View style={s.toast} accessibilityLiveRegion="polite">
            <View style={[s.bar, wide && s.barWide, { backgroundColor: toast.kind === 'fail' ? C.statusFail : C.brandMint }]} />
            <T v="BodySmallRegular" w="BodySmallMedium" pinned c={C.textWhite} style={{ flex: 1 }}>{toast.message}</T>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: space.md, alignItems: 'center' },
  toast: { minWidth: 240, maxWidth: 400, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: C.surfaceDark, borderRadius: radius.sm, paddingVertical: space.sm, paddingRight: space.md, overflow: 'hidden' },
  wrapWide: { left: undefined, right: 24, top: 116, alignItems: 'flex-end' },
  barWide: { width: 16, borderRadius: 0, marginLeft: 0, marginVertical: -space.sm },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginLeft: space.xs },
});
