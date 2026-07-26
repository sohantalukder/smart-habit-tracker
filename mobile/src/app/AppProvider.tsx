import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { AuthSession, SyncState } from '@/core/models';
import {
  clearSession,
  installationId,
  loadSession,
  saveSession,
} from '@/auth/secureSession';
import { openUserDatabase, purgeUserDatabase } from '@/database/database';
import { initializeSyncLifecycle } from '@/sync/lifecycle';
import {
  requestSync,
  setReauthenticationHandler,
  subscribeSync,
} from '@/sync/syncEngine';
import { clearPushRegistration, initializePush } from '@/push/pushService';
import { apiRequest } from '@/api/client';
import { outboxCount } from '@/database/repository';

type AppContextValue = {
  ready: boolean;
  session: AuthSession | null;
  syncState: SyncState;
  pendingCount: number;
  reauthRequired: boolean;
  completeAuthentication: (session: AuthSession) => Promise<void>;
  refreshSession: (session: AuthSession) => Promise<void>;
  syncNow: () => Promise<void>;
  logout: (discardPending: boolean) => Promise<boolean>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [syncState, setSyncState] = useState<SyncState>('offline');
  const [pendingCount, setPendingCount] = useState(0);
  const [reauthRequired, setReauthRequired] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribeSync = subscribeSync((nextState, count) => {
      if (active) {
        setSyncState(nextState);
        setPendingCount(count);
      }
    });
    setReauthenticationHandler(() => setReauthRequired(true));
    void (async () => {
      const stored = await loadSession();
      if (!stored || new Date(stored.expiresAt).getTime() <= Date.now()) {
        if (active) setReady(true);
        return;
      }
      await openUserDatabase(stored.user.id);
      await initializeSyncLifecycle();
      if (active) {
        setSession(stored);
        setReady(true);
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
    if (session) {
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
  }, [session?.user.id]);

  async function completeAuthentication(nextSession: AuthSession) {
    if (session && session.user.id !== nextSession.user.id) {
      throw new Error(
        'Sign in with the same account to resume pending changes.'
      );
    }
    await saveSession(nextSession);
    await openUserDatabase(nextSession.user.id);
    await initializeSyncLifecycle();
    setSession(nextSession);
    setReauthRequired(false);
    void requestSync();
  }

  async function refreshSession(nextSession: AuthSession) {
    await saveSession(nextSession);
    setSession(nextSession);
  }

  async function logout(discardPending: boolean) {
    if (pendingCount && !discardPending) {
      await requestSync();
      if (await outboxCount()) return false;
    }
    const userId = session?.user.id;
    try {
      await apiRequest(`/push/installations/${installationId()}`, {
        method: 'DELETE',
      });
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      if (!discardPending) return false;
    }
    await clearPushRegistration();
    await clearSession();
    if (userId) await purgeUserDatabase(userId);
    setSession(null);
    setPendingCount(0);
    setSyncState('offline');
    setReauthRequired(false);
    return true;
  }

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      session,
      syncState,
      pendingCount,
      reauthRequired,
      completeAuthentication,
      refreshSession,
      syncNow: requestSync,
      logout,
    }),
    [pendingCount, ready, reauthRequired, session, syncState]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider.');
  return value;
}
