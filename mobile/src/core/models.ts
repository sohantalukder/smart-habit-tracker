export type SyncState =
  | 'offline'
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'needs_attention';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  onboardingCompleted: boolean;
};

export type AuthSession = {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
};

export type Habit = {
  id: string;
  template_id: string | null;
  name: string;
  icon: string;
  category: string;
  habit_type: 'do' | 'avoid' | 'count' | 'duration';
  target: number | null;
  unit: string | null;
  frequency: string;
  forgiving: number;
  state: 'active' | 'paused' | 'archived';
  deleted_at: string | null;
  client_modified_at: string;
  last_mutation_id: string;
  sync_error: string | null;
};

export type HabitLog = {
  id: string;
  habit_id: string;
  local_date: string;
  status: 'done' | 'skipped' | 'partial';
  value: number | null;
  note: string | null;
  deleted_at: string | null;
  client_modified_at: string;
  last_mutation_id: string;
  sync_error: string | null;
};

export type MutationEntity =
  | 'profile'
  | 'preferences'
  | 'habit'
  | 'habit_log'
  | 'journal'
  | 'prayer_log'
  | 'habit_reminder'
  | 'prayer_reminder'
  | 'onboarding'
  | 'push_installation';

export type SyncMutation = {
  mutationId: string;
  entityType: MutationEntity;
  entityId: string;
  operation: 'upsert' | 'delete';
  clientModifiedAt: string;
  payload: Record<string, unknown>;
};
