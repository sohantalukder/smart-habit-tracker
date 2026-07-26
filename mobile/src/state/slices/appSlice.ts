import type { StateCreator } from 'zustand';
import type { AuthSession, SyncState } from '@/core/models';
import {
  clearSession,
  installationId,
  saveSession,
} from '@/auth/secureSession';
import { openUserDatabase, purgeUserDatabase } from '@/database/database';
import { outboxCount } from '@/database/repository';
import { clearPushRegistration } from '@/push/pushService';
import { initializeSyncLifecycle } from '@/sync/lifecycle';
import { requestSync } from '@/sync/syncEngine';
import { apiRequest } from '@/api/client';

export interface AppState {
  pendingCount: number;
  ready: boolean;
  reauthRequired: boolean;
  session: AuthSession | null;
  syncState: SyncState;
  completeAuthentication: (session: AuthSession) => Promise<void>;
  logout: (discardPending: boolean) => Promise<boolean>;
  refreshSession: (session: AuthSession) => Promise<void>;
  setBootstrapSession: (session: AuthSession | null) => void;
  setReauthRequired: (required: boolean) => void;
  setSyncSnapshot: (state: SyncState, pendingCount: number) => void;
  syncNow: () => Promise<void>;
}

export const createAppSlice: StateCreator<AppState> = (set, get) => ({
  pendingCount: 0,
  ready: false,
  reauthRequired: false,
  session: null,
  syncState: 'offline',

  setBootstrapSession: (session) => set({ ready: true, session }),
  setReauthRequired: (reauthRequired) => set({ reauthRequired }),
  setSyncSnapshot: (syncState, pendingCount) =>
    set({ pendingCount, syncState }),
  syncNow: requestSync,

  completeAuthentication: async (nextSession) => {
    const currentSession = get().session;
    if (currentSession && currentSession.user.id !== nextSession.user.id) {
      throw new Error(
        'Sign in with the same account to resume pending changes.'
      );
    }
    await saveSession(nextSession);
    await openUserDatabase(nextSession.user.id);
    await initializeSyncLifecycle();
    set({
      ready: true,
      reauthRequired: false,
      session: nextSession,
    });
    void requestSync();
  },

  refreshSession: async (nextSession) => {
    await saveSession(nextSession);
    set({ session: nextSession });
  },

  logout: async (discardPending) => {
    const { pendingCount, session } = get();
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
    set({
      pendingCount: 0,
      reauthRequired: false,
      session: null,
      syncState: 'offline',
    });
    return true;
  },
});
