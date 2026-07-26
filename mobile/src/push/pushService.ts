import {
  getInitialNotification,
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  setBackgroundMessageHandler,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import { AppState, Platform } from 'react-native';
import { installationId } from '@/auth/secureSession';
import {
  isPushEnabled,
  savePushInstallation,
  setPushInstallationEnabled,
} from '@/database/repository';
import { requestSync } from '@/sync/syncEngine';
import { runBackgroundSync } from '@/sync/lifecycle';

export type PushDestination = 'Today' | 'Habits' | 'Prayers' | 'Inbox';
let routeHandler: ((destination: PushDestination) => void) | null = null;
let removeListeners = () => {};

export function setPushRouteHandler(
  handler: ((destination: PushDestination) => void) | null
) {
  routeHandler = handler;
}

export async function initializePush() {
  removeListeners();
  try {
    if (!(await isPushEnabled())) return () => {};
    const messaging = getMessaging();
    const permission = await requestPermission(messaging);
    const token = await getToken(messaging);
    await savePushInstallation(
      installationId(),
      Platform.OS as 'ios' | 'android',
      token,
      String(permission)
    );
    const removeRefresh = onTokenRefresh(messaging, (nextToken) => {
      void savePushInstallation(
        installationId(),
        Platform.OS as 'ios' | 'android',
        nextToken,
        String(permission)
      );
    });
    const removeForeground = onMessage(messaging, async (message) => {
      await requestSync();
      routeMessage(message);
    });
    const removeOpened = onNotificationOpenedApp(messaging, (message) => {
      void requestSync();
      routeMessage(message);
    });
    const appStateSubscription = AppState.addEventListener(
      'change',
      (state) => {
        if (state === 'active') void refreshPushRegistration();
      }
    );
    const initial = await getInitialNotification(messaging);
    if (initial) routeMessage(initial);
    removeListeners = () => {
      removeRefresh();
      removeForeground();
      removeOpened();
      appStateSubscription.remove();
      removeListeners = () => {};
    };
    return removeListeners;
  } catch {
    removeListeners = () => {};
    return () => {};
  }
}

export async function refreshPushRegistration() {
  try {
    if (!(await isPushEnabled())) return;
    const messaging = getMessaging();
    const permission = await requestPermission(messaging);
    const token = await getToken(messaging);
    await savePushInstallation(
      installationId(),
      Platform.OS as 'ios' | 'android',
      token,
      String(permission)
    );
  } catch {
    // The app remains fully usable without Firebase configuration or permission.
  }
}

export async function setPushEnabled(enabled: boolean) {
  if (enabled) {
    await refreshPushRegistration();
  }
  await setPushInstallationEnabled(installationId(), enabled);
}

export async function clearPushRegistration() {
  try {
    removeListeners();
    const messaging = getMessaging();
    await deleteToken(messaging);
  } catch {
    // A missing Firebase configuration or revoked permission is already inactive.
  }
}

try {
  setBackgroundMessageHandler(getMessaging(), async () => {
    await runBackgroundSync();
  });
} catch {
  // Native Firebase is configured by the release environment.
}

function routeMessage(message: RemoteMessage) {
  const raw = String(
    message.data?.url ?? message.data?.route ?? ''
  ).toLowerCase();
  const destination: PushDestination = raw.includes('prayer')
    ? 'Prayers'
    : raw.includes('habit')
      ? 'Habits'
      : raw.includes('inbox') || raw.includes('notification')
        ? 'Inbox'
        : 'Today';
  routeHandler?.(destination);
}
