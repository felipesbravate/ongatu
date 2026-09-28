import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

// Session lives in the iOS Keychain / Android Keystore. SecureStore values are capped near 2 KB and a
// Supabase session is larger, so it is split into chunks.
const CHUNK = 1800;
const storage = {
  async getItem(key: string) {
    const n = await SecureStore.getItemAsync(`${key}.n`);
    if (!n) return null;
    let s = '';
    for (let i = 0; i < Number(n); i++) s += (await SecureStore.getItemAsync(`${key}.${i}`)) ?? '';
    return s;
  },
  async setItem(key: string, value: string) {
    const parts = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < parts; i++) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${key}.n`, String(parts));
  },
  async removeItem(key: string) {
    const n = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

export const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, {
  auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
