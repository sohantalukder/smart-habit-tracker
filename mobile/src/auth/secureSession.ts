import 'react-native-get-random-values';
import * as Keychain from 'react-native-keychain';
import { v4 as uuid } from 'uuid';
import type { AuthSession } from '@/core/models';
import localStore from '@/services/storage/localStore.service';

const SESSION_SERVICE = 'com.sohantalukder.bloom.session';
const DATABASE_SERVICE_PREFIX = 'com.sohantalukder.bloom.database.';
const INSTALLATION_KEY = 'bloomInstallationId';
const ACTIVE_USER_KEY = 'activeUserId';

export async function saveSession(session: AuthSession) {
  await Keychain.setGenericPassword(session.user.id, JSON.stringify(session), {
    service: SESSION_SERVICE,
  });
  localStore.setString(ACTIVE_USER_KEY, session.user.id);
}

export async function loadSession(): Promise<AuthSession | null> {
  const credentials = await Keychain.getGenericPassword({
    service: SESSION_SERVICE,
  });
  if (!credentials) return null;
  try {
    return JSON.parse(credentials.password) as AuthSession;
  } catch {
    return null;
  }
}

export async function clearSession() {
  await Keychain.resetGenericPassword({ service: SESSION_SERVICE });
  localStore.delete(ACTIVE_USER_KEY);
}

export async function databaseKey(userId: string) {
  const service = `${DATABASE_SERVICE_PREFIX}${userId}`;
  const existing = await Keychain.getGenericPassword({ service });
  if (existing) return existing.password;
  const bytes = new Uint8Array(32);
  global.crypto.getRandomValues(bytes);
  const key = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, '0')
  ).join('');
  await Keychain.setGenericPassword(userId, key, { service });
  return key;
}

export async function clearDatabaseKey(userId: string) {
  await Keychain.resetGenericPassword({
    service: `${DATABASE_SERVICE_PREFIX}${userId}`,
  });
}

export function installationId() {
  const existing = localStore.getString(INSTALLATION_KEY);
  if (existing) return existing;
  const value = uuid();
  localStore.setString(INSTALLATION_KEY, value);
  return value;
}
