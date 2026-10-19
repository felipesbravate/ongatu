import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Geist_300Light, Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist'; // Oct 19: Display, Heading, Label/Tab
import { MartianMono_300Light, MartianMono_400Regular, MartianMono_500Medium, MartianMono_600SemiBold } from '@expo-google-fonts/martian-mono';
import { SessionProvider, useSession } from '@/lib/session';
import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { session, ready } = useSession();
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === 'sign-in';
    if (!session && !inAuth) router.replace('/sign-in');
    else if (session && inAuth) router.replace('/');
  }, [session, ready, segments]);
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.surfaceBody } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
      {/* Notifications (Okara 228:455 State=Mobile): a full screen pushed over the tabs. */}
      <Stack.Screen name="notifications" options={{ contentStyle: { backgroundColor: color.surfacePrimary } }} />
      {/* Add entry opens as a native iOS sheet with detents; drag down to close. */}
      <Stack.Screen name="add" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: color.surfacePrimary } }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Geist_300Light, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, MartianMono_300Light, MartianMono_400Regular, MartianMono_500Medium, MartianMono_600SemiBold });
  useEffect(() => { if (loaded) SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          <Gate />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
