import { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Button, Card, Text, TextInput } from '@sohantalukder/rn-kit';
import { Screen } from '@/components/Screen';
import { useApp } from '@/app/AppProvider';
import { saveProfile } from '@/database/repository';
import { useReactiveQuery } from '@/database/useReactiveQuery';
import { chooseAndStageAvatar, stageAvatarRemoval } from '@/profile/avatar';

const avatarPlaceholder = '#E5EFE7';

type Profile = {
  id: string;
  email: string;
  name: string;
  timezone: string;
  units: 'metric' | 'imperial';
  avatar_uri: string | null;
  sync_error: string | null;
};

export function ProfileScreen() {
  const { session } = useApp();
  const params = useMemo(() => [session?.user.id ?? ''], [session?.user.id]);
  const tables = useMemo(() => ['profile', 'pending_asset_uploads'], []);
  const { data } = useReactiveQuery<Profile>(
    'select * from profile where id=?',
    params,
    tables
  );
  const profile = data[0];
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const currentName = name || profile?.name || session?.user.name || '';
  const currentTimezone = timezone || profile?.timezone || 'UTC';

  return (
    <Screen
      title="Profile"
      subtitle="Personal details update locally first."
    >
      <Card variant="outlined">
        <View style={styles.photo}>
          {profile?.avatar_uri ? (
            <Image
              source={{ uri: `file://${profile.avatar_uri}` }}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.placeholder]}>
              <Text variant="heading1">
                {currentName.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.flex}>
            <Text
              variant="heading3"
              weight="semibold"
            >
              {currentName}
            </Text>
            <Text color="secondary">
              {profile?.email || session?.user.email}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Button
            text="Choose photo"
            onPress={() =>
              session && void chooseAndStageAvatar(session.user.id)
            }
          />
          {profile?.avatar_uri && (
            <Button
              text="Remove"
              variant="outline"
              onPress={() =>
                session && void stageAvatarRemoval(session.user.id)
              }
            />
          )}
        </View>
      </Card>
      <Card variant="outlined">
        <View style={styles.form}>
          <TextInput
            label="Display name"
            value={currentName}
            onChangeText={setName}
          />
          <TextInput
            label="Timezone"
            value={currentTimezone}
            onChangeText={setTimezone}
            autoCapitalize="none"
          />
          <Text color="secondary">
            Units: {profile?.units ?? 'metric'} · change in Settings
          </Text>
          {profile?.sync_error && (
            <Text color="error">{profile.sync_error}</Text>
          )}
          <Button
            text="Save profile"
            disabled={!session || currentName.trim().length < 2}
            onPress={() =>
              session &&
              void saveProfile({
                id: session.user.id,
                email: profile?.email || session.user.email,
                name: currentName,
                timezone: currentTimezone,
                units: profile?.units ?? 'metric',
              })
            }
          />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  avatar: { borderRadius: 36, height: 72, width: 72 },
  flex: { flex: 1, gap: 3 },
  form: { gap: 14 },
  photo: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  placeholder: {
    alignItems: 'center',
    backgroundColor: avatarPlaceholder,
    justifyContent: 'center',
  },
});
