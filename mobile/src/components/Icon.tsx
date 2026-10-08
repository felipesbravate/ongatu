import { SvgXml } from 'react-native-svg';
import { color as C } from '@/theme/tokens';
import { iconAssets } from './iconAssets';

export type IconName = keyof typeof iconAssets;
export function Icon({ name, size = 20, fill = C.textPrimary }: { name: IconName; size?: 10 | 12 | 16 | 20 | 24; fill?: string }) {
  const asset = iconAssets[name];
  const xml = asset.xml.replace(/viewBox="[^"]+"/, `viewBox="${asset.sizes[size].viewBox}"`);
  return <SvgXml xml={xml} width={size} height={size} color={fill} accessible={false} />;
}
