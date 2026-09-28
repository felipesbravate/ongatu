import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';
import { MartianMono_400Regular, MartianMono_500Medium, MartianMono_600SemiBold } from '@expo-google-fonts/martian-mono';
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
      {/* Add entry opens as a native iOS sheet with detents; drag down to close. */}
      <Stack.Screen name="add" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: color.surfacePrimary } }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, MartianMono_400Regular, MartianMono_500Medium, MartianMono_600SemiBold });
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
