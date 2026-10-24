import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from './T';
import { Icon } from './Icon';
import { color as C, radius, space } from '@/theme/tokens';

// A bottom sheet for pickers (Oct 24): the modal scrim (surface/modal), a surface/primary card with radius/lg top
// corners, the title in Heading/Large with the close Round button, and a scrolling body. Tapping the scrim closes it.
export function Sheet({ visible, title, onClose, children, scroll = true }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[s.card, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <View style={s.head}>
            <T v="HeadingLarge" accessibilityRole="header" style={{ flex: 1 }}>{title}</T>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}
              style={({ pressed }) => [s.close, pressed && { backgroundColor: C.actionSecondaryActive }]}>
              <Icon name="x" size={20} />
            </Pressable>
          </View>
          {scroll ? <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={s.body}>{children}</View>}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: C.surfaceModal },
  card: { maxHeight: '85%', backgroundColor: C.surfacePrimary, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingTop: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingLeft: space.md, paddingRight: space.xs, minHeight: 48 },
  close: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.xs },
});
