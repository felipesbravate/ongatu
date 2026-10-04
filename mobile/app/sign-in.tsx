import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { T } from '@/components/T';
import { color as C, space, radius, text } from '@/theme/tokens';

// Login - mobile (Ongatu 369:11424): "Sign in or create an account", email, then the 6-digit code from the email.
// Same Supabase OTP as the web (no magic link). Visual pass against the frame comes in the spike.
export default function SignIn() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) { setErr(error.message); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
    setStep('code');
  }
  async function verify() {
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) { setErr('That code did not work. Check the latest email and try again.'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  const canGo = step === 'email' ? /.+@.+\..+/.test(email) : /^\d{6}$/.test(code.trim());
  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.center}>
        <View style={s.card}>
          <T v="HeadingXL" style={{ textAlign: 'center' }}>{step === 'email' ? 'Sign in or create an account' : 'Check your email'}</T>
          {step === 'code' && <T v="BodyMediumRegular" c={C.textSecondary} style={{ textAlign: 'center' }}>We sent a 6-digit code to {email}.</T>}
          <View style={{ gap: space.xs }}>
            <T v="LabelDefaultMedium" c={C.textSecondary}>{step === 'email' ? 'ENTER YOUR EMAIL' : 'ENTER THE CODE'}</T>
            <TextInput
              key={step} autoFocus style={s.input} placeholder={step === 'email' ? 'you@example.com' : '123456'} placeholderTextColor={C.textMuted}
              value={step === 'email' ? email : code} onChangeText={step === 'email' ? setEmail : setCode}
              keyboardType={step === 'email' ? 'email-address' : 'number-pad'} autoCapitalize="none" autoCorrect={false}
              textContentType={step === 'email' ? 'emailAddress' : 'oneTimeCode'} autoComplete={step === 'email' ? 'email' : 'one-time-code'}
              maxLength={step === 'code' ? 6 : 254} returnKeyType="go" onSubmitEditing={() => canGo && (step === 'email' ? sendCode() : verify())}
              accessibilityLabel={step === 'email' ? 'Email' : 'Code'}
            />
          </View>
          {err && <T v="BodySmallMedium" c={C.statusFail}>{err}</T>}
          <Pressable disabled={!canGo || busy} onPress={step === 'email' ? sendCode : verify} accessibilityRole="button"
            style={({ pressed }) => [s.btn, { backgroundColor: pressed ? C.actionPrimaryPress : C.actionPrimary, opacity: !canGo || busy ? 0.4 : 1 }]}>
            {busy ? <ActivityIndicator color={C.textWhite} /> : <T v="BodyLargeMedium" c={C.textWhite}>{step === 'email' ? 'Continue' : 'Sign in'}</T>}
          </Pressable>
          {step === 'code' && <Pressable onPress={() => { setStep('email'); setCode(''); }} accessibilityRole="button"><T v="BodyMediumMedium" c={C.linkDefault} style={{ textAlign: 'center' }}>Use another email</T></Pressable>}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surfaceBody },
  center: { flex: 1, justifyContent: 'center', padding: space.md },
  card: { backgroundColor: C.surfacePrimary, borderRadius: radius.card, padding: space.lg, gap: space.md },
  input: { ...text.BodyLargeMedium, height: 48, borderWidth: 1, borderColor: C.borderDefault, borderRadius: radius.sm, paddingHorizontal: space.sm, color: C.textPrimary },
  btn: { height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
