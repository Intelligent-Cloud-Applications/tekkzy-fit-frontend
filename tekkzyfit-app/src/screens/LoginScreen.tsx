import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { confirmPasswordReset, loadGymSettings, loginWithPassword, requestPasswordReset } from '../api';
import { errorMessage } from '../errors';
import { font } from '../fonts';
import { Icon } from '../icons';
import { setAppPrimary } from '../primaryColor';
import { saveSession } from '../session';
import { useTheme } from '../theme';
import type { AuthSession } from '../types';
import { Btn, ErrorText, Field, Label } from '../ui';

type ViewKind = 'login' | 'forgot' | 'code';

export function LoginScreen({ onAuthed }: { onAuthed: (session: AuthSession) => void }) {
  const t = useTheme();
  const [view, setView] = useState<ViewKind>('login');
  const [gymName, setGymName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void loadGymSettings()
      .then((row) => {
        setGymName(String(row.gymName || row.legalName || '').trim());
        setAppPrimary(row.primaryColor);
      })
      .catch(() => undefined);
  }, []);

  async function onLogin() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const session = await loginWithPassword(email, password);
      await saveSession(session);
      onAuthed(session);
    } catch (err) {
      setError(errorMessage(err, 'Sign-in failed'));
    } finally {
      setBusy(false);
    }
  }

  async function onForgot() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await requestPasswordReset(email);
      setNotice('If that email is registered, a reset code is on its way.');
      setView('code');
    } catch (err) {
      setError(errorMessage(err, 'Could not send a reset code'));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await confirmPasswordReset(email, code, nextPassword);
      setPassword('');
      setCode('');
      setNextPassword('');
      setView('login');
      setNotice('Password updated. Sign in with the new password.');
    } catch (err) {
      setError(errorMessage(err, 'Could not update the password'));
    } finally {
      setBusy(false);
    }
  }

  const heading = view === 'login' ? 'Welcome back' : view === 'forgot' ? 'Forgot password' : 'Enter reset code';
  const sub = view === 'login'
    ? 'Sign in with your staff email.'
    : view === 'forgot'
      ? 'We will email a short code if this account exists.'
      : 'Use the code from your email, then choose a new password.';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 48, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: t.text, fontFamily: font.brand, fontSize: 22, letterSpacing: 4, textTransform: 'uppercase' }}>
          Tekkzy <Text style={{ color: t.accent }}>Fit</Text>
        </Text>
        <Text style={{ marginTop: 4, color: t.muted, fontFamily: font.sansMed, fontSize: 12 }}>The desk for a smoother gym day</Text>
        {gymName ? (
          <View style={{ marginTop: 22 }}>
            <Text style={{ color: t.muted, fontFamily: font.sansBold, fontSize: 11, letterSpacing: 1.4 }}>GYM</Text>
            <Text style={{ marginTop: 4, color: t.text, fontFamily: font.displayX, fontSize: 28, letterSpacing: -0.8 }}>{gymName}</Text>
            <View style={{ marginTop: 6, height: 3, width: 48, backgroundColor: t.accent, borderRadius: 99 }} />
          </View>
        ) : null}

        <View style={{ marginTop: 28, padding: 18, borderRadius: 20, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
          {view !== 'login' ? (
            <Pressable
              onPress={() => { setView('login'); setError(''); setNotice(''); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}
            >
              <Icon name="chevronLeft" color={t.muted} size={14} />
              <Text style={{ color: t.muted, fontSize: 12, fontWeight: '700' }}>Back to sign in</Text>
            </Pressable>
          ) : null}
          <Text style={{ color: t.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }}>STAFF SIGN IN</Text>
          <Text style={{ marginTop: 8, color: t.text, fontFamily: font.displayX, fontSize: 26, letterSpacing: -0.6 }}>{heading}</Text>
          <Text style={{ marginTop: 6, marginBottom: 16, color: t.muted, fontSize: 13, lineHeight: 20 }}>{sub}</Text>
          {notice ? <Text style={{ marginBottom: 10, color: t.text, fontSize: 13 }}>{notice}</Text> : null}

          <Label>Email</Label>
          <View style={{ position: 'relative' }}>
            <View style={{ position: 'absolute', left: 12, top: 0, bottom: 0, zIndex: 1, justifyContent: 'center' }}>
              <Icon name="mail" color={t.muted} size={16} />
            </View>
            <Field
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="you@tekkzy.com"
              style={{ paddingLeft: 38, height: 48, fontSize: 13 }}
            />
          </View>

          {view === 'login' ? (
            <>
              <Label>Password</Label>
              <PasswordField value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              <Pressable onPress={() => { setView('forgot'); setError(''); setNotice(''); }} style={{ marginTop: 10, alignSelf: 'flex-end' }}>
                <Text style={{ color: t.accent, fontSize: 12, fontWeight: '700' }}>Forgot password?</Text>
              </Pressable>
              <ErrorText text={error} />
              <Btn title={busy ? 'Signing in…' : 'Sign in'} onPress={() => void onLogin()} busy={busy} style={{ marginTop: 16, minHeight: 48 }} />
            </>
          ) : null}
          {view === 'forgot' ? (
            <>
              <ErrorText text={error} />
              <Btn title={busy ? 'Sending…' : 'Send reset code'} onPress={() => void onForgot()} busy={busy} style={{ marginTop: 16, minHeight: 48 }} />
            </>
          ) : null}
          {view === 'code' ? (
            <>
              <Label>Reset code</Label>
              <Field value={code} onChangeText={setCode} autoCapitalize="none" keyboardType="number-pad" placeholder="123456" style={{ height: 48 }} />
              <Label>New password</Label>
              <PasswordField value={nextPassword} onChange={setNextPassword} show={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              <Text style={{ marginTop: 8, color: t.muted, fontSize: 11 }}>Use at least 8 characters with a letter, a number, and a symbol.</Text>
              <ErrorText text={error} />
              <Btn title={busy ? 'Updating…' : 'Update password'} onPress={() => void onConfirm()} busy={busy} style={{ marginTop: 16, minHeight: 48 }} />
            </>
          ) : null}
        </View>
        <Text style={{ marginTop: 16, color: t.muted, fontSize: 11, textAlign: 'center' }}>
          Authorized staff only. Keep the desk signed out when you step away.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  onToggle,
}: {
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ position: 'relative' }}>
      <Field
        value={value}
        onChangeText={onChange}
        secureTextEntry={!show}
        placeholder="Password"
        style={{ height: 48, paddingRight: 42 }}
      />
      <Pressable onPress={onToggle} style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
        <Icon name={show ? 'eyeOff' : 'eye'} color={t.muted} size={16} />
      </Pressable>
    </View>
  );
}
