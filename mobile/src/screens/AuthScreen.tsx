/* eslint-disable react-native/no-raw-text */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Button,
  IconByVariant,
  OTPInput,
  PasswordInput,
  TextInput,
} from '@sohantalukder/rn-kit';
import { ApiError } from '@/api/client';
import { useApp } from '@/app/AppProvider';
import { BloomLogo } from '@/components/BloomLogo';
import { BloomText } from '@/components/BloomText';
import { useAuthMutations } from '@/modules/auth/hooks/useAuthMutations';
import { bloomColors, bloomFonts } from '@/theme/bloomTheme';

type MessageTone = 'error' | 'success';

export function AuthScreen() {
  const { width } = useWindowDimensions();
  const { reauthRequired, session } = useApp();
  const mutations = useAuthMutations();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('error');
  const [canRestore, setCanRestore] = useState(false);

  const showStory = width >= 840;
  const busy = Object.values(mutations).some((mutation) => mutation.isPending);

  function showMessage(text: string, tone: MessageTone = 'error') {
    setMessage(text);
    setMessageTone(tone);
  }

  async function submit() {
    setMessage('');
    setCanRestore(false);
    try {
      if (mode === 'signup') {
        const response = await mutations.signup.mutateAsync({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        });
        setPendingEmail(response.email);
        showMessage('Enter the six-digit code sent to your email.', 'success');
      } else {
        await mutations.login.mutateAsync({
          email: email.trim().toLowerCase(),
          password,
        });
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
      showMessage(error instanceof Error ? error.message : 'Please try again.');
    }
  }

  async function verify() {
    if (code.length !== 6) return;
    setMessage('');
    try {
      await mutations.verifyEmail.mutateAsync({
        code,
        email: pendingEmail,
      });
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : 'Code not accepted.'
      );
    }
  }

  async function resend() {
    setMessage('');
    try {
      await mutations.resendVerification.mutateAsync(pendingEmail);
      showMessage(
        'A new six-digit code is on its way. It expires in 10 minutes.',
        'success'
      );
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Could not resend.');
    }
  }

  async function restore() {
    setMessage('');
    try {
      await mutations.restoreAccount.mutateAsync({
        email: email.trim().toLowerCase(),
        password,
      });
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : 'Account could not be restored.'
      );
    }
  }

  function changeMode(nextMode: 'login' | 'signup') {
    setMode(nextMode);
    setPendingEmail('');
    setCode('');
    setMessage('');
    setCanRestore(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.layout, showStory && styles.wideLayout]}>
        {showStory && (
          <View style={styles.story}>
            <BloomLogo inverse />
            <View style={styles.storyCopy}>
              <BloomText style={styles.storyEyebrow}>
                PRIVATE PRACTICE · HONEST RECORD
              </BloomText>
              <BloomText
                family="display"
                style={styles.storyTitle}
              >
                Build a life that keeps its word.
              </BloomText>
              <BloomText
                family="displayItalic"
                style={styles.storySubtitle}
              >
                Structure for the promises that deserve a place in your day.
              </BloomText>
            </View>
            <View style={styles.storyCircleOne} />
            <View style={styles.storyCircleTwo} />
          </View>
        )}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          style={styles.formPane}
        >
          <View style={styles.form}>
            {!showStory && <BloomLogo />}
            <View style={styles.lock}>
              <IconByVariant
                color={bloomColors.forest}
                height={23}
                path={pendingEmail ? 'checkCircle' : 'lock'}
                width={23}
              />
            </View>
            <BloomText style={styles.eyebrow}>
              {pendingEmail
                ? 'VERIFY YOUR EMAIL'
                : mode === 'login'
                  ? 'WELCOME BACK'
                  : 'BEGIN YOUR PRACTICE'}
            </BloomText>
            <BloomText
              family="display"
              style={styles.title}
            >
              {pendingEmail
                ? 'Confirm this space is yours'
                : mode === 'login'
                  ? 'Enter your private space'
                  : 'Create a space that is yours'}
            </BloomText>
            <BloomText style={styles.description}>
              {reauthRequired
                ? 'Your encrypted changes are safe. Sign in to the same account to resume sync.'
                : pendingEmail
                  ? `We sent a six-digit code to ${pendingEmail}. Five failed attempts lock this code.`
                  : mode === 'login'
                    ? 'Your habits and records appear only after your session is verified.'
                    : 'Start with your name, email, and one promise you intend to keep.'}
            </BloomText>

            {!pendingEmail && (
              <View style={styles.fields}>
                {mode === 'signup' && (
                  <TextInput
                    autoComplete="name"
                    label="Your name"
                    labelStyle={styles.fieldLabel}
                    onChangeText={setName}
                    required
                    style={styles.field}
                    value={name}
                  />
                )}
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  label="Email"
                  labelStyle={styles.fieldLabel}
                  onChangeText={setEmail}
                  required
                  style={styles.field}
                  value={email}
                />
                <PasswordInput
                  label="Password"
                  labelStyle={styles.fieldLabel}
                  onChangeText={setPassword}
                  required
                  style={styles.field}
                  value={password}
                />
                <Button
                  borderRadius={0}
                  disabled={
                    busy ||
                    !email.includes('@') ||
                    password.length < 8 ||
                    (mode === 'signup' && name.trim().length < 2)
                  }
                  isLoading={busy}
                  onPress={() => void submit()}
                  text={
                    mode === 'login'
                      ? 'Sign in securely'
                      : 'Create private space'
                  }
                  textStyle={styles.buttonText}
                  wrapStyle={styles.primaryButton}
                />
                {canRestore && (
                  <View style={styles.restore}>
                    <BloomText
                      weight="semibold"
                      style={styles.restoreTitle}
                    >
                      Deletion can still be cancelled
                    </BloomText>
                    <BloomText style={styles.restoreCopy}>
                      Your account is still inside its recovery window.
                    </BloomText>
                    <Button
                      borderRadius={0}
                      disabled={busy}
                      onPress={() => void restore()}
                      text="Restore my account"
                      textStyle={styles.secondaryButtonText}
                      variant="outline"
                      wrapStyle={styles.secondaryButton}
                    />
                  </View>
                )}
              </View>
            )}

            {pendingEmail && (
              <View style={styles.fields}>
                <OTPInput
                  callback={setCode}
                  length={6}
                />
                <Button
                  borderRadius={0}
                  disabled={busy || code.length !== 6}
                  isLoading={mutations.verifyEmail.isPending}
                  onPress={() => void verify()}
                  text="Verify email"
                  textStyle={styles.buttonText}
                  wrapStyle={styles.primaryButton}
                />
                <Button
                  borderRadius={0}
                  disabled={busy}
                  onPress={() => void resend()}
                  text="Resend code"
                  textStyle={styles.secondaryButtonText}
                  variant="outline"
                  wrapStyle={styles.secondaryButton}
                />
              </View>
            )}

            {message ? (
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.message,
                  messageTone === 'success'
                    ? styles.successMessage
                    : styles.errorMessage,
                ]}
              >
                <BloomText
                  style={
                    messageTone === 'success'
                      ? styles.successMessageText
                      : styles.errorMessageText
                  }
                >
                  {message}
                </BloomText>
              </View>
            ) : null}

            {!pendingEmail && (
              <View style={styles.footer}>
                <BloomText style={styles.footerCopy}>
                  {mode === 'login' ? 'New to Bloom?' : 'Already registered?'}
                </BloomText>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() =>
                    changeMode(mode === 'login' ? 'signup' : 'login')
                  }
                >
                  <BloomText
                    weight="bold"
                    style={styles.footerLink}
                  >
                    {mode === 'login' ? 'Create an account' : 'Sign in'}
                  </BloomText>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  buttonText: {
    color: bloomColors.white,
    fontFamily: bloomFonts.bodyBold,
    fontSize: 14,
  },
  description: {
    color: bloomColors.muted,
    fontSize: 14,
    lineHeight: 24,
    textAlign: 'center',
  },
  errorMessage: {
    backgroundColor: bloomColors.errorSurface,
    borderColor: bloomColors.errorBorder,
  },
  errorMessageText: {
    color: bloomColors.errorText,
    fontSize: 13,
    lineHeight: 20,
  },
  eyebrow: {
    color: bloomColors.muted,
    fontFamily: bloomFonts.bodyBold,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 2,
    textAlign: 'center',
  },
  field: {
    backgroundColor: bloomColors.white,
    borderColor: bloomColors.rule,
    borderRadius: 0,
    height: 52,
  },
  fieldLabel: {
    color: bloomColors.ink,
    fontFamily: bloomFonts.bodySemibold,
    fontSize: 13,
  },
  fields: { gap: 16, marginTop: 8 },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    marginTop: 4,
  },
  footerCopy: { color: bloomColors.muted, fontSize: 13 },
  footerLink: { color: bloomColors.forest, fontSize: 13 },
  form: {
    alignItems: 'stretch',
    gap: 16,
    maxWidth: 460,
    width: '100%',
  },
  formPane: { backgroundColor: bloomColors.paper, flex: 1 },
  layout: { backgroundColor: bloomColors.paper, flex: 1 },
  lock: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: bloomColors.pale,
    height: 52,
    justifyContent: 'center',
    marginTop: 8,
    width: 52,
  },
  message: { borderWidth: 1, paddingHorizontal: 15, paddingVertical: 13 },
  primaryButton: {
    backgroundColor: bloomColors.forest,
    borderColor: bloomColors.forest,
    height: 52,
  },
  restore: {
    backgroundColor: bloomColors.restoreSurface,
    borderColor: bloomColors.restoreBorder,
    borderWidth: 1,
    gap: 8,
    padding: 15,
  },
  restoreCopy: {
    color: bloomColors.restoreText,
    fontSize: 12,
    lineHeight: 18,
  },
  restoreTitle: { color: bloomColors.ink, fontSize: 13 },
  root: { backgroundColor: bloomColors.paper, flex: 1 },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 42,
  },
  secondaryButton: {
    backgroundColor: bloomColors.paper,
    borderColor: bloomColors.forest,
    height: 52,
  },
  secondaryButtonText: {
    color: bloomColors.forest,
    fontFamily: bloomFonts.bodyBold,
    fontSize: 14,
  },
  story: {
    backgroundColor: bloomColors.forest,
    flex: 0.92,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: 58,
    paddingVertical: 46,
  },
  storyCircleOne: {
    borderColor: bloomColors.storyRing,
    borderRadius: 350,
    borderWidth: 1,
    bottom: -280,
    height: 700,
    position: 'absolute',
    right: -260,
    width: 700,
  },
  storyCircleTwo: {
    borderColor: bloomColors.storyRingSoft,
    borderRadius: 260,
    borderWidth: 48,
    bottom: -185,
    height: 520,
    position: 'absolute',
    right: -170,
    width: 520,
  },
  storyCopy: { gap: 18, zIndex: 1 },
  storyEyebrow: {
    color: bloomColors.storyText,
    fontFamily: bloomFonts.bodyBold,
    fontSize: 11,
    letterSpacing: 2,
  },
  storySubtitle: {
    color: bloomColors.storyText,
    fontSize: 21,
    lineHeight: 30,
    maxWidth: 500,
  },
  storyTitle: {
    color: bloomColors.white,
    fontSize: 64,
    letterSpacing: -3,
    lineHeight: 62,
    maxWidth: 620,
  },
  successMessage: {
    backgroundColor: bloomColors.successSurface,
    borderColor: bloomColors.successBorder,
  },
  successMessageText: {
    color: bloomColors.success,
    fontSize: 13,
    lineHeight: 20,
  },
  title: {
    color: bloomColors.ink,
    fontSize: 42,
    letterSpacing: -1.8,
    lineHeight: 44,
    textAlign: 'center',
  },
  wideLayout: { flexDirection: 'row' },
});
