import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/lib/session';
import { T } from '@/components/T';
import { color as C, space, radius } from '@/theme/tokens';

// Placeholder until the Profile frame is designed for mobile (the web Account page: email, delete data, sign out).
export default function Profile() {
  const { me, signOut } = useSession();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 48, paddingHorizontal: space.md, gap: space.lg }}>
      <T v="DisplayTitle" accessibilityRole="header">Profile</T>
      <View style={{ backgroundColor: C.surfacePrimary, borderRadius: radius.md, padding: space.md, gap: space.xs }}>
        <T v="LabelSmall" c={C.textSecondary}>SIGNED IN AS</T>
        <T v="BodyLargeMedium">{me?.email ?? '…'}</T>
      </View>
      <Pressable onPress={signOut} accessibilityRole="button" style={({ pressed }) => ({ height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? C.actionSecondaryPress : C.surfaceSecondary })}>
        <T v="BodyLargeMedium">Sign out</T>
      </Pressable>
    </View>
  );
}
