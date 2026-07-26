import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  OTPInput,
  PasswordInput,
  Text,
  TextInput,
} from '@sohantalukder/rn-kit';
import { apiRequest } from '@/api/client';
import { useApp } from '@/app/AppProvider';
import { Screen } from '@/components/Screen';
import type { AuthSession } from '@/core/models';

export function SecurityScreen() {
  const { refreshSession, logout } = useApp();
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [code, setCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<
    {
      id: string;
      current: boolean;
      createdAt: string;
      expiresAt: string;
    }[]
  >([]);

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions() {
    try {
      setSessions(await apiRequest('/auth/sessions'));
    } catch {
      setSessions([]);
    }
  }

  async function requestEmailChange() {
    setBusy(true);
    try {
      const result = await apiRequest<{
        pendingEmail: string;
        expiresAt: string;
      }>('/auth/request-email-change', {
        method: 'POST',
        body: JSON.stringify({
          newEmail,
          currentPassword: emailPassword,
        }),
      });
      setPendingEmail(result.pendingEmail);
      Alert.alert('Code sent', 'The six-digit code expires in 10 minutes.');
    } catch (error) {
      Alert.alert('Could not change email', message(error));
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmailChange() {
    setBusy(true);
    try {
      const session = await apiRequest<AuthSession>(
        '/auth/verify-email-change',
        { method: 'POST', body: JSON.stringify({ code }) }
      );
      await refreshSession(session);
      setPendingEmail('');
      setCode('');
      Alert.alert(
        'Email updated',
        'Your current session was rotated securely.'
      );
    } catch (error) {
      Alert.alert('Code not accepted', message(error));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setBusy(true);
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      Alert.alert('Password updated', 'Other sessions were signed out.');
    } catch (error) {
      Alert.alert('Could not change password', message(error));
    } finally {
      setBusy(false);
    }
  }

  async function signOutOthers() {
    setBusy(true);
    try {
      const result = await apiRequest<{ signedOut: number }>(
        '/auth/sign-out-others',
        { method: 'POST' }
      );
      await loadSessions();
      Alert.alert(
        'Sessions updated',
        `${result.signedOut} other session(s) signed out.`
      );
    } catch (error) {
      Alert.alert('Could not update sessions', message(error));
    } finally {
      setBusy(false);
    }
  }

  function confirmDeletion() {
    Alert.alert(
      'Delete Bloom account?',
      'This security-sensitive action requires a network connection. Your account enters its recovery window.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              setBusy(true);
              try {
                await apiRequest('/auth/delete-account', {
                  method: 'POST',
                  body: JSON.stringify({
                    currentPassword: deletePassword,
                    confirmation: 'DELETE',
                  }),
                });
                await logout(true);
              } catch (error) {
                Alert.alert('Account not deleted', message(error));
                setBusy(false);
              }
            })(),
        },
      ]
    );
  }

  return (
    <Screen
      title="Security"
      subtitle="These operations require a live server connection."
    >
      <Card variant="outlined">
        <View style={styles.card}>
          <Text
            variant="heading3"
            weight="semibold"
          >
            Change sign-in email
          </Text>
          <TextInput
            label="New email"
            value={newEmail}
            onChangeText={setNewEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <PasswordInput
            label="Current password"
            value={emailPassword}
            onChangeText={setEmailPassword}
          />
          <Button
            text="Send six-digit code"
            disabled={busy || !newEmail.includes('@') || !emailPassword}
            onPress={() => void requestEmailChange()}
          />
          {pendingEmail && (
            <>
              <Text color="secondary">Code sent to {pendingEmail}</Text>
              <OTPInput
                length={6}
                callback={setCode}
              />
              <Button
                text="Verify new email"
                disabled={busy || code.length !== 6}
                onPress={() => void verifyEmailChange()}
              />
            </>
          )}
        </View>
      </Card>
      <Card variant="outlined">
        <View style={styles.card}>
          <Text
            variant="heading3"
            weight="semibold"
          >
            Change password
          </Text>
          <PasswordInput
            label="Current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
          />
          <PasswordInput
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
          />
          <Button
            text="Update password"
            disabled={busy || !currentPassword || newPassword.length < 8}
            onPress={() => void changePassword()}
          />
        </View>
      </Card>
      <Card variant="outlined">
        <View style={styles.card}>
          <Text
            variant="heading3"
            weight="semibold"
          >
            Active sessions
          </Text>
          <Text color="secondary">
            Keep this device signed in and revoke every other active session.
          </Text>
          {sessions.map((session) => (
            <View
              key={session.id}
              style={styles.session}
            >
              <View style={styles.flex}>
                <Text weight="medium">
                  {session.current ? 'This device' : 'Another signed-in device'}
                </Text>
                <Text
                  variant="body3"
                  color="secondary"
                >
                  Started {new Date(session.createdAt).toLocaleString()}
                </Text>
              </View>
              {session.current && <Text color="success">Current</Text>}
            </View>
          ))}
          <Button
            text="Sign out other sessions"
            variant="outline"
            disabled={busy}
            onPress={() => void signOutOthers()}
          />
        </View>
      </Card>
      <Card
        variant="outlined"
        borderColor="#E8B4B4"
      >
        <View style={styles.card}>
          <Text
            variant="heading3"
            color="error"
            weight="semibold"
          >
            Delete account
          </Text>
          <PasswordInput
            label="Current password"
            value={deletePassword}
            onChangeText={setDeletePassword}
          />
          <Button
            text="Delete my account"
            variant="error"
            disabled={busy || !deletePassword}
            onPress={confirmDeletion}
          />
        </View>
      </Card>
    </Screen>
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Please try again.';
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  flex: { flex: 1, gap: 2 },
  session: { alignItems: 'center', flexDirection: 'row', gap: 10 },
});
