import { Pressable, StyleSheet } from 'react-native';
import { T } from './T';
import { useWide } from '@/lib/layout';
import { color as C, opacity, radius, space } from '@/theme/tokens';

// Button (DS 41:119): Medium 48 / Small 36; Primary (action/primary) or Tertiary (bare, fills on hover/press from Small
// down). Same component on phones and the web build (trial): hover comes from react-native-web's Pressable state.
type Props = { label: string; onPress: () => void; variant?: 'primary' | 'tertiary'; size?: 'medium' | 'small'; disabled?: boolean; full?: boolean; nativeID?: string };
export function Button({ label, onPress, variant = 'primary', size = 'medium', disabled, full, nativeID }: Props) {
  const primary = variant === 'primary';
  const wide = useWide();
  return (
    <Pressable nativeID={nativeID} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      style={({ pressed, hovered }: any) => [
        s.btn, { height: size === 'medium' ? 48 : 36, paddingHorizontal: size === 'medium' ? space.md : space.sm, minWidth: size === 'medium' ? 80 : 64 },
        full && { alignSelf: 'stretch' },
        primary ? { backgroundColor: pressed ? C.actionPrimaryPress : hovered ? C.actionPrimaryHover : C.actionPrimary }
          : (pressed || (hovered && size !== 'medium')) && { backgroundColor: C.actionSecondaryActive },
        disabled && { opacity: opacity.disabled },
      ]}>
      <T pinned v={size === 'medium' ? 'LabelSmall' : 'LabelDefault'} c={primary ? C.textOnPrimary : C.textPrimary}>{label}</T>
    </Pressable>
  );
}
const s = StyleSheet.create({ btn: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' } });
