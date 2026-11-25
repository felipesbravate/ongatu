import { Text, type TextProps } from 'react-native';
import { useWide } from '@/lib/layout';
import { color, text, textDesktop } from '@/theme/tokens';

// Text in an Okara text style: <T v="HeadingMedium">…</T>. Colour defaults to text/primary.
// Web build (trial, Nov 25): on wide screens the style takes the Surface "Desktop" mode (tokens.textDesktop), like the
// web's CSS variables, e.g. Heading/XL is 24/24 on phones and 20/20 on desktop. `pinned` keeps the Mobile mode — the
// components Felipe pinned to Mobile on Oct 3 (inputs, dropdowns, menus, buttons, action links). `w` picks another
// style on wide screens where the web screen itself uses one (the Add panel's "Enter manually").
type Key = keyof typeof text;
export function T({ v, w, pinned, c = color.textPrimary, style, ...rest }: TextProps & { v: Key; w?: Key; pinned?: boolean; c?: string }) {
  const wide = useWide();
  const key = wide && w ? w : v;
  return <Text {...rest} maxFontSizeMultiplier={1.4} style={[(wide && !pinned ? textDesktop : text)[key], { color: c }, style]} />;
}
