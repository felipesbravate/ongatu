import { Platform, useWindowDimensions } from 'react-native';

// Web (trial, Nov 25): the same screens run in a browser. "wide" = the web's desktop layout (above 640px, the
// breakpoint of src/ui/okara.css); phones in a browser and the native app keep the phone layout.
export const isWeb = Platform.OS === 'web';
export function useWide() {
  const { width } = useWindowDimensions();
  return isWeb && width > 640;
}
