import { View } from 'react-native';
import { T } from '@/components/T';
import { color as C, space } from '@/theme/tokens';

// Add entry (Ongatu 369:13050) opens here as a native sheet. The form itself is the next spike step.
export default function AddEntry() {
  return (
    <View style={{ flex: 1, padding: space.lg, gap: space.xs }}>
      <T v="HeadingXL" accessibilityRole="header">Add entry</T>
      <T v="BodyMediumRegular" c={C.textSecondary}>Coming next: the form from the Add entry frame.</T>
    </View>
  );
}
