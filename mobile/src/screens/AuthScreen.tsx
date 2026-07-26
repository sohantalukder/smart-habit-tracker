import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  Button,
  Card,
  OTPInput,
  PasswordInput,
  Text,
  TextInput,
  useTheme,
} from '@sohantalukder/rn-kit';
import { authApi, ApiError } from '@/api/client';
import { useApp } from '@/app/AppProvider';

const bloomGreen = '#6A8D73';

export function AuthScreen() {
  const { colors } = useTheme();
  const { completeAuthentication, reauthRequired, session } = useApp();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [canRestore, setCanRestore] = useState(false);

  async function submit() {
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signup') {
        const response = await authApi.signup({ name, email, password });
        setPendingEmail(response.email);
        setMessage('Enter the six-digit code sent to your email.');
      } else {
        await completeAuthentication(await authApi.login(email, password));
      }
    } catch (error) {
      if (
        mode === 'login' &&
        error instanceof ApiError &&
        error.code === 'EMAIL_NOT_VERIFIED'
      ) {
        setPendingEmail(email.trim().toLowerCase());
      }
      setCanRestore(
        mode === 'login' &&
          error instanceof ApiError &&
          error.code === 'ACCOUNT_DELETION_PENDING'
      );
      setMessage(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await completeAuthentication(
        await authApi.verifyEmail(pendingEmail, code)
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Code not accepted.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      await authApi.resend(pendingEmail);
      setMessage('A new code was sent. It expires in 10 minutes.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not resend.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Text style={styles.mark}>✦</Text>
          <Text
            variant="heading1"
            weight="bold"
          >
            Bloom
          </Text>
          <Text
            color="secondary"
            style={styles.center}
          >
            {reauthRequired
              ? 'Your encrypted changes are safe. Sign in to the same account to resume sync.'
              : 'A private, offline-first place for the promises you keep.'}
          </Text>
        </View>
        <Card
          padding={20}
          variant="outlined"
        >
          <View style={styles.form}>
            <Text
              variant="heading2"
              weight="semibold"
            >
              {pendingEmail
                ? 'Verify your email'
                : mode === 'login'
                  ? 'Welcome back'
                  : 'Begin your practice'}
            </Text>
            {!pendingEmail && mode === 'signup' && (
              <TextInput
                label="Your name"
                value={name}
                onChangeText={setName}
                autoComplete="name"
                required
              />
            )}
            {!pendingEmail && (
              <>
                <TextInput
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  required
                />
                <PasswordInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  inputProps={{
                    autoComplete:
                      mode === 'login' ? 'current-password' : 'new-password',
                  }}
                />
                <Button
                  text={
                    mode === 'login' ? 'Sign in securely' : 'Create account'
                  }
                  onPress={() => void submit()}
                  isLoading={busy}
                  disabled={
                    busy ||
                    !email.includes('@') ||
                    password.length < 8 ||
                    (mode === 'signup' && name.trim().length < 2)
                  }
                />
                {canRestore && (
                  <Button
                    text="Restore my account"
                    variant="outline"
                    onPress={() =>
                      void (async () => {
                        setBusy(true);
                        try {
                          await completeAuthentication(
                            await authApi.restore(email, password)
                          );
                        } catch (error) {
                          setMessage(
                            error instanceof Error
                              ? error.message
                              : 'Account could not be restored.'
                          );
                        } finally {
                          setBusy(false);
                        }
                      })()
                    }
                  />
                )}
                <Button
                  text={
                    mode === 'login'
                      ? 'Create an account'
                      : 'I already have an account'
                  }
                  variant="outline"
                  onPress={() => {
                    setMode(mode === 'login' ? 'signup' : 'login');
                    setMessage('');
                  }}
                />
              </>
            )}
            {pendingEmail && (
              <>
                <Text color="secondary">
                  We sent a code to {pendingEmail}. Five failed attempts lock
                  this code.
                </Text>
                <OTPInput
                  length={6}
                  callback={setCode}
                />
                <Button
                  text="Verify email"
                  onPress={() => void verify()}
                  isLoading={busy}
                  disabled={busy || code.length !== 6}
                />
                <Button
                  text="Resend code"
                  variant="outline"
                  onPress={() => void resend()}
                  disabled={busy}
                />
              </>
            )}
            {message ? (
              <Text
                color={
                  message.startsWith('Enter') || message.startsWith('A new')
                    ? 'success'
                    : 'error'
                }
                accessibilityLiveRegion="polite"
              >
                {message}
              </Text>
            ) : null}
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: 8 },
  center: { maxWidth: 300, textAlign: 'center' },
  content: {
    flexGrow: 1,
    gap: 28,
    justifyContent: 'center',
    padding: 22,
  },
  form: { gap: 16 },
  mark: { color: bloomGreen, fontSize: 46 },
  root: { flex: 1 },
});
