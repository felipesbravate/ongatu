import { Platform, useWindowDimensions } from 'react-native';

// Web (trial, Nov 25): the same screens run in a browser. "wide" = the web's desktop layout (above 640px, the
// breakpoint of src/ui/okara.css); phones in a browser and the native app keep the phone layout.
export const isWeb = Platform.OS === 'web';
export function useWide() {
  const { width } = useWindowDimensions();
  return isWeb && width > 640;
}

// Keyboard focus (web build): like CSS :focus-visible, a focus ring shows only when the last input was a key, not a
// pointer. The flag is read while rendering the focused state, which re-renders on focus anyway.
let keyboardMode = false;
if (isWeb && typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboardMode = true; }, true);
  document.addEventListener('pointerdown', () => { keyboardMode = false; }, true);
}
export const focusVisible = (focused: boolean) => focused && keyboardMode;
