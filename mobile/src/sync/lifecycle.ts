import NetInfo from '@react-native-community/netinfo';
import BackgroundFetch, {
  type HeadlessEvent,
} from 'react-native-background-fetch';
import { AppState } from 'react-native';
import { loadSession } from '@/auth/secureSession';
import { currentDatabase, openUserDatabase } from '@/database/database';
import { requestSync } from './syncEngine';

let initialized = false;

export async function initializeSyncLifecycle() {
  currentDatabase().updateHook((change) => {
    if (change.table === 'mutation_outbox') void requestSync();
  });
  if (initialized) return;
  initialized = true;
  NetInfo.addEventListener((network) => {
    if (network.isConnected) void requestSync();
  });
  AppState.addEventListener('change', (next) => {
    if (next === 'active') void requestSync();
  });
  await BackgroundFetch.configure(
    {
      minimumFetchInterval: 15,
      stopOnTerminate: false,
      startOnBoot: true,
      enableHeadless: true,
      requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
    },
    async (taskId) => {
      await runBackgroundSync();
      BackgroundFetch.finish(taskId);
    },
    (taskId) => BackgroundFetch.finish(taskId)
  );
}

export async function runBackgroundSync() {
  const session = await loadSession();
  if (!session) return;
  await openUserDatabase(session.user.id);
  await requestSync();
}

export async function backgroundFetchHeadlessTask(event: HeadlessEvent) {
  if (!event.timeout) await runBackgroundSync();
  BackgroundFetch.finish(event.taskId);
}
