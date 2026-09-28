import { Tabs } from 'expo-router/tabs';
import { OkaraTabBar } from '@/components/OkaraTabBar';
import { color } from '@/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <OkaraTabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.surfaceBody } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
