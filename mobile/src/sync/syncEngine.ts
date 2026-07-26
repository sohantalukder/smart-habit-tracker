import NetInfo from '@react-native-community/netinfo';
import { apiReachable, apiRequest, ApiError } from '@/api/client';
import { installationId } from '@/auth/secureSession';
import type { SyncMutation, SyncState } from '@/core/models';
import { currentDatabase, first } from '@/database/database';
import {
  needsAttentionCount,
  outboxCount,
  pendingMutations,
} from '@/database/repository';
import { applyChanges, applyInitialSnapshot } from './applyRemote';
import { loadSession } from '@/auth/secureSession';
import appConfig from '@/config/appConfig';

type PushResult = {
  mutationId: string;
  status: 'applied' | 'superseded' | 'retryable' | 'rejected';
  canonical?: Record<string, unknown> | null;
  code?: string;
  message?: string;
};
type PullResponse = {
  snapshot?: Parameters<typeof applyInitialSnapshot>[0];
  changes: Parameters<typeof applyChanges>[0];
  nextCursor: string;
  hasMore: boolean;
};

type StateListener = (state: SyncState, pending: number) => void;
const listeners = new Set<StateListener>();
let running: Promise<void> | null = null;
let state: SyncState = 'offline';
let reauthHandler: (() => void) | null = null;

export function setReauthenticationHandler(handler: (() => void) | null) {
  reauthHandler = handler;
}

export function subscribeSync(listener: StateListener) {
  listeners.add(listener);
  void emitState();
  return () => listeners.delete(listener);
}

export async function requestSync() {
  if (running) return running;
  running = synchronize().finally(() => {
    running = null;
  });
  return running;
}

async function synchronize() {
  const network = await NetInfo.fetch();
  if (!network.isConnected || !(await apiReachable())) {
    state = (await outboxCount()) ? 'pending' : 'offline';
    await emitState();
    return;
  }
  state = 'syncing';
  await emitState();
  try {
    await uploadPendingAssets();
    let batch = await pendingMutations();
    while (batch.length) {
      const response = await apiRequest<{
        results: PushResult[];
      }>('/sync/push', {
        method: 'POST',
        body: JSON.stringify({
          deviceId: installationId(),
          mutations: batch,
        }),
      });
      await handlePushResults(batch, response.results);
      batch = await pendingMutations();
    }
    await pullAll();
    state = (await needsAttentionCount()) ? 'needs_attention' : 'synced';
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await setMetadata('reauth_required', 'true');
      state = 'needs_attention';
      reauthHandler?.();
    } else {
      state = (await outboxCount()) ? 'pending' : 'offline';
    }
  }
  await emitState();
}

async function uploadPendingAssets() {
  const session = await loadSession();
  if (!session) return;
  const assets = await currentDatabase().execute(
    `select id,entity_type,private_path,mime_type from pending_asset_uploads
     where state in ('pending','retry') order by created_at`
  );
  for (const row of assets.rows) {
    const id = String(row.id);
    try {
      if (row.entity_type === 'profile_avatar_remove') {
        const response = await fetch(
          `${appConfig.api.baseUrl}/profile/avatar`,
          {
            method: 'DELETE',
            headers: { authorization: `Bearer ${session.accessToken}` },
          }
        );
        if (!response.ok) {
          await handleAssetResponse(response, id);
          continue;
        }
      } else {
        const form = new FormData();
        form.append('file', {
          uri: `file://${String(row.private_path)}`,
          type: String(row.mime_type),
          name: `avatar.${row.mime_type === 'image/png' ? 'png' : 'jpg'}`,
        } as unknown as Blob);
        const response = await fetch(
          `${appConfig.api.baseUrl}/profile/avatar`,
          {
            method: 'PUT',
            headers: { authorization: `Bearer ${session.accessToken}` },
            body: form,
          }
        );
        if (!response.ok) {
          await handleAssetResponse(response, id);
          continue;
        }
      }
      await currentDatabase().execute(
        'delete from pending_asset_uploads where id=?',
        [id]
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error;
      await currentDatabase().execute(
        `update pending_asset_uploads set state='retry',
         attempt_count=attempt_count+1,last_error=? where id=?`,
        [error instanceof Error ? error.message : 'Upload failed.', id]
      );
      return;
    }
  }
}

async function handleAssetResponse(response: Response, id: string) {
  if (response.status === 401) {
    throw new ApiError(401, 'SESSION_INVALID', 'Please sign in again.');
  }
  const message = await response.json().then(
    (value) =>
      String((value as { message?: string }).message ?? 'Upload rejected.'),
    () => 'Upload rejected.'
  );
  if (response.status >= 400 && response.status < 500) {
    await currentDatabase().transaction(async (tx) => {
      await tx.execute(
        `update pending_asset_uploads set state='rejected',
         last_error=? where id=?`,
        [message, id]
      );
      await tx.execute(
        `update profile set sync_error=?
         where id=(select entity_id from pending_asset_uploads where id=?)`,
        [message, id]
      );
    });
    return;
  }
  throw new Error(message);
}

async function handlePushResults(batch: SyncMutation[], results: PushResult[]) {
  const database = currentDatabase();
  await database.transaction(async (tx) => {
    for (const result of results) {
      const mutation = batch.find(
        (item) => item.mutationId === result.mutationId
      );
      if (!mutation) continue;
      if (result.status === 'applied' || result.status === 'superseded') {
        if (mutation.entityType === 'onboarding') {
          await tx.execute('delete from habits where last_mutation_id=?', [
            mutation.mutationId,
          ]);
        }
        await tx.execute('delete from mutation_outbox where mutation_id=?', [
          result.mutationId,
        ]);
        continue;
      }
      if (result.status === 'rejected') {
        await tx.execute(
          `update mutation_outbox set state='rejected',error_code=?,
           error_message=? where mutation_id=?`,
          [
            result.code ?? 'REJECTED',
            result.message ?? 'This change needs attention.',
            result.mutationId,
          ]
        );
        const target = localTarget(mutation.entityType);
        if (target) {
          await tx.execute(
            `update ${target[0]} set sync_error=? where ${target[1]}=?`,
            [result.message ?? 'Needs attention', mutation.entityId]
          );
        }
        continue;
      }
      const attempt = await first<{ attempt_count: number }>(
        'select attempt_count from mutation_outbox where mutation_id=?',
        [result.mutationId]
      );
      const nextAttempt = new Date(
        Date.now() + retryDelay((attempt?.attempt_count ?? 0) + 1)
      ).toISOString();
      await tx.execute(
        `update mutation_outbox set state='retry',
         attempt_count=attempt_count+1,next_attempt_at=? where mutation_id=?`,
        [nextAttempt, result.mutationId]
      );
    }
  });
}

async function pullAll() {
  const stored = await first<{ value: string }>(
    "select value from sync_metadata where key='cursor'"
  );
  let cursor = stored?.value;
  do {
    const response = await apiRequest<PullResponse>(
      cursor
        ? `/sync/pull?cursor=${encodeURIComponent(cursor)}&limit=500`
        : '/sync/pull?limit=500'
    );
    if (response.snapshot) await applyInitialSnapshot(response.snapshot);
    if (response.changes.length) await applyChanges(response.changes);
    cursor = response.nextCursor;
    await setMetadata('cursor', cursor);
    if (!response.hasMore) return;
  } while (true);
}

async function setMetadata(key: string, value: string) {
  await currentDatabase().execute(
    `insert into sync_metadata(key,value) values(?,?)
     on conflict(key) do update set value=excluded.value`,
    [key, value]
  );
}

async function emitState() {
  const pending = await outboxCount().catch(() => 0);
  for (const listener of listeners) listener(state, pending);
}

function retryDelay(attempt: number) {
  const base = Math.min(30 * 60_000, 1000 * 2 ** Math.min(attempt, 10));
  return base / 2 + Math.random() * (base / 2);
}

function localTarget(entityType: SyncMutation['entityType']) {
  return {
    profile: ['profile', 'id'],
    preferences: ['preferences', 'user_id'],
    habit: ['habits', 'id'],
    habit_log: ['habit_logs', 'id'],
    journal: ['journals', 'id'],
    prayer_log: ['prayer_logs', 'id'],
    habit_reminder: ['habit_reminders', 'habit_id'],
    prayer_reminder: ['prayer_reminders', 'prayer_name'],
    onboarding: null,
    push_installation: null,
  }[entityType];
}
