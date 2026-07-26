import { useEffect, type PropsWithChildren } from 'react';
import { loadSession } from '@/auth/secureSession';
import { openUserDatabase } from '@/database/database';
import { initializeSyncLifecycle } from '@/sync/lifecycle';
import {
  requestSync,
  setReauthenticationHandler,
  subscribeSync,
} from '@/sync/syncEngine';
import { initializePush } from '@/push/pushService';
import { useStore } from '@/state/store';

export function AppProvider({ children }: PropsWithChildren) {
  const userId = useStore((state) => state.session?.user.id);

  useEffect(() => {
    let active = true;
    const unsubscribeSync = subscribeSync((nextState, count) => {
      if (active) {
        useStore.getState().setSyncSnapshot(nextState, count);
      }
    });
    setReauthenticationHandler(() =>
      useStore.getState().setReauthRequired(true)
    );
    void (async () => {
      const stored = await loadSession();
      if (!stored || new Date(stored.expiresAt).getTime() <= Date.now()) {
        if (active) useStore.getState().setBootstrapSession(null);
        return;
      }
      await openUserDatabase(stored.user.id);
      await initializeSyncLifecycle();
      if (active) {
        useStore.getState().setBootstrapSession(stored);
      }
      void requestSync();
    })();
    return () => {
      active = false;
      unsubscribeSync();
      setReauthenticationHandler(null);
    };
  }, []);

  useEffect(() => {
    let removePush = () => {};
    let active = true;
    if (userId) {
      void initializePush().then((remove) => {
        if (active) {
          removePush = remove;
        } else {
          remove();
        }
      });
    }
    return () => {
      active = false;
      removePush();
    };
  }, [userId]);

  return children;
}

export function useApp() {
  return useStore();
}
