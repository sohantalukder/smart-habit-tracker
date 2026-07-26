import {
  ANDROID_DATABASE_PATH,
  IOS_LIBRARY_PATH,
  open,
  type DB,
  type QueryResult,
  type Scalar,
} from '@op-engineering/op-sqlite';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { clearDatabaseKey, databaseKey } from '@/auth/secureSession';
import { schema } from './schema';

let activeDatabase: DB | null = null;
let activeUserId: string | null = null;

export async function openUserDatabase(userId: string) {
  if (activeDatabase && activeUserId === userId) return activeDatabase;
  activeDatabase?.close();
  const key = await databaseKey(userId);
  activeDatabase = open({
    name: `bloom-${userId}.sqlite`,
    location: Platform.OS === 'ios' ? IOS_LIBRARY_PATH : ANDROID_DATABASE_PATH,
    encryptionKey: key,
  });
  activeUserId = userId;
  await activeDatabase.executeBatch(schema);
  return activeDatabase;
}

export function currentDatabase() {
  if (!activeDatabase) throw new Error('The encrypted database is not open.');
  return activeDatabase;
}

export async function purgeUserDatabase(userId: string) {
  if (activeUserId === userId && activeDatabase) {
    activeDatabase.delete();
    activeDatabase = null;
    activeUserId = null;
  } else {
    const key = await databaseKey(userId);
    const database = open({
      name: `bloom-${userId}.sqlite`,
      location:
        Platform.OS === 'ios' ? IOS_LIBRARY_PATH : ANDROID_DATABASE_PATH,
      encryptionKey: key,
    });
    database.delete();
  }
  const assetDirectory = `${RNFS.DocumentDirectoryPath}/avatars/${userId}`;
  if (await RNFS.exists(assetDirectory)) await RNFS.unlink(assetDirectory);
  await clearDatabaseKey(userId);
}

export async function rows<T>(
  sql: string,
  params: Scalar[] = []
): Promise<T[]> {
  const result = await currentDatabase().execute(sql, params);
  return result.rows as T[];
}

export async function first<T>(
  sql: string,
  params: Scalar[] = []
): Promise<T | null> {
  return (await rows<T>(sql, params))[0] ?? null;
}

export function resultRows<T>(result: QueryResult) {
  return result.rows as T[];
}
