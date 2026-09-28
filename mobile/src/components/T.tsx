import { Text, type TextProps } from 'react-native';
import { color, text } from '@/theme/tokens';

// Text in an Okara text style: <T v="HeadingMedium">…</T>. Colour defaults to text/primary.
export function T({ v, c = color.textPrimary, style, ...rest }: TextProps & { v: keyof typeof text; c?: string }) {
  return <Text {...rest} maxFontSizeMultiplier={1.4} style={[text[v], { color: c }, style]} />;
}
