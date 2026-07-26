import {
  QueryClient,
  queryOptions,
} from "@tanstack/react-query";
import { apiRequest } from "./api";
import type {
  DailyJournal,
  ExperienceProfile,
  HabitTemplate,
  HabitWithReminder,
  NotificationDelivery,
  TodayHabit,
  TrackingReport,
} from "./api/types";

export const QUERY_STALE_TIME = 5 * 60 * 1000;
export const QUERY_CACHE_TIME = 30 * 60 * 1000;

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME,
        gcTime: QUERY_CACHE_TIME,
      },
    },
  });
}

export type PrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export type PrayerStatus = "on_time" | "late" | "missed";

export type PrayerSchedule = {
  date: string;
  timezone: string;
  madhab: string;
  calculationMethod: string;
  prayers: Array<{
    name: PrayerName;
    time: string;
    status: PrayerStatus | null;
  }>;
  nextPrayer: { name: PrayerName; time: string } | null;
};

export type AdminPage =
  | "overview"
  | "users"
  | "templates"
  | "notifications"
  | "health"
  | "audit";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  timezone: string;
  units: "metric" | "imperial";
  created_at: string;
  suspended_at: string | null;
  deleted_at?: string | null;
  role?: "support" | "moderator" | "super_admin" | null;
};

export type AdminUserPage = {
  data: AdminUser[];
  count: number;
  page: number;
  pageSize: number;
};

export type AdminTemplate = {
  id: string;
  slug: string;
  icon: string;
  name: string;
  description: string;
  category: string;
  habit_type: "do" | "avoid" | "count" | "duration";
  active: boolean;
  default_target: number | null;
  default_unit: string | null;
  default_frequency: Frequency;
  goal_tags: string[];
  recommendation_priority: number;
};

export type Frequency =
  | { kind: "daily" }
  | { kind: "weekly_target"; target: number }
  | { kind: "weekdays"; days: number[] };

export type AdminUserDetails = {
  account: AdminUser & {
    goal_preferences: string[];
    starting_pace: "light" | "balanced" | "ambitious";
    religion_preference: "muslim" | "other" | "unspecified";
    daily_digest_time: string;
    daily_digest_enabled: boolean;
    prayer_enabled: boolean;
    latitude: number | null;
    longitude: number | null;
    madhab: "hanafi" | "shafi" | "maliki" | "hanbali" | null;
    prayer_calculation_method:
      | "karachi"
      | "muslim_world_league"
      | "egyptian"
      | "umm_al_qura"
      | "dubai"
      | "qatar"
      | "kuwait"
      | "moonsighting_committee"
      | "singapore"
      | "turkey"
      | "tehran"
      | "north_america"
      | null;
    onboarding_completed_at: string | null;
    updated_at: string;
  };
  habits: Array<{
    id: string;
    name: string;
    icon: string;
    category: string;
    habit_type: "do" | "avoid" | "count" | "duration";
    target: number | null;
    unit: string | null;
    frequency: Frequency;
    forgiving: boolean;
    state: "active" | "paused" | "archived";
    deleted_at: string | null;
    reminder_enabled: boolean | null;
    reminder_time: string | null;
  }>;
  checkIns: Array<{
    id: string;
    habit_id: string;
    habit_name: string;
    local_date: string;
    status: "done" | "skipped" | "partial";
    value: number | null;
    note: string | null;
    prayer_status: "on_time" | "late" | "missed" | null;
  }>;
  journals: Array<{
    id: string;
    local_date: string;
    win_note: string | null;
    reflection_note: string | null;
  }>;
  prayerLogs: Array<{
    id: string;
    local_date: string;
    prayer_name: PrayerName;
    status: PrayerStatus;
  }>;
  prayerReminders: Array<{
    prayer_name: PrayerName;
    enabled: boolean;
    offset_minutes: number;
  }>;
  notifications: AdminDelivery[];
  sessions: Array<{
    id: string;
    expires_at: string;
    revoked_at: string | null;
    created_at: string;
  }>;
  verificationRequests: Array<{
    id: string;
    kind: "email_verification" | "email_change";
    pending_email: string | null;
    expires_at: string;
    consumed_at: string | null;
    created_at: string;
  }>;
  installations: Array<{
    id: string;
    platform: string;
    active: boolean;
    last_seen_at: string;
    created_at: string;
    updated_at: string;
  }>;
};

export type AdminDelivery = {
  id: string;
  title: string;
  body?: string;
  channel: string;
  state: string;
  scheduled_at: string;
  sent_at?: string | null;
  attempt_count?: number;
  error_message?: string | null;
  profiles?: { email?: string; name?: string };
};

export type AdminAudit = {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  created_at: string;
  profiles?: { email?: string; name?: string };
};

export type AdminAnalytics = {
  users: number;
  activeHabits: number;
  deliveredNotifications: number;
};

export type AdminHealth = {
  api?: string;
  postgres?: string;
  queue?: {
    connected?: boolean;
    failed?: number;
  };
};

export type AdminQueryData =
  | AdminAnalytics
  | AdminUserPage
  | AdminTemplate[]
  | AdminDelivery[]
  | AdminHealth
  | AdminAudit[];

export const queryKeys = {
  user: {
    all: ["user"] as const,
    profile: ["user", "profile"] as const,
    notifications: ["user", "notifications"] as const,
    habits: ["user", "habits"] as const,
    habitTemplates: ["user", "habit-templates"] as const,
    todayRoot: ["user", "today"] as const,
    today: (date: string) => ["user", "today", date] as const,
    journalRoot: ["user", "journal"] as const,
    journal: (date: string) => ["user", "journal", date] as const,
    trackingRoot: ["user", "tracking"] as const,
    tracking: (from: string, to: string) =>
      ["user", "tracking", from, to] as const,
    prayerRoot: ["user", "prayer-times"] as const,
    prayer: (date: string) => ["user", "prayer-times", date] as const,
  },
  admin: {
    all: ["admin"] as const,
    analytics: ["admin", "analytics"] as const,
    usersRoot: ["admin", "users"] as const,
    users: (search: string, page = 1) => ["admin", "users", search, page] as const,
    userDetails: (id: string) => ["admin", "users", id, "details"] as const,
    templates: ["admin", "templates"] as const,
    notifications: ["admin", "notifications"] as const,
    health: ["admin", "health"] as const,
    audit: ["admin", "audit"] as const,
  },
};

export const appQueries = {
  profile: (initialData: ExperienceProfile) => queryOptions({
    queryKey: queryKeys.user.profile,
    queryFn: ({ signal }) =>
      apiRequest<ExperienceProfile>("/profile", { signal }),
    initialData,
  }),
  notifications: () => queryOptions({
    queryKey: queryKeys.user.notifications,
    queryFn: ({ signal }) =>
      apiRequest<NotificationDelivery[]>("/notifications", { signal }),
  }),
  habits: () => queryOptions({
    queryKey: queryKeys.user.habits,
    queryFn: ({ signal }) =>
      apiRequest<HabitWithReminder[]>("/habits", { signal }),
  }),
  habitTemplates: () => queryOptions({
    queryKey: queryKeys.user.habitTemplates,
    queryFn: ({ signal }) =>
      apiRequest<HabitTemplate[]>("/habit-templates", { signal }),
  }),
  today: (date: string) => queryOptions({
    queryKey: queryKeys.user.today(date),
    queryFn: ({ signal }) =>
      apiRequest<TodayHabit[]>(`/today?date=${date}`, { signal }),
  }),
  journal: (date: string) => queryOptions({
    queryKey: queryKeys.user.journal(date),
    queryFn: ({ signal }) =>
      apiRequest<DailyJournal>(`/journal/${date}`, { signal }),
  }),
  tracking: (from: string, to: string) => queryOptions({
    queryKey: queryKeys.user.tracking(from, to),
    queryFn: ({ signal }) =>
      apiRequest<TrackingReport>(`/tracking?from=${from}&to=${to}`, { signal }),
  }),
  prayer: (date: string) => queryOptions({
    queryKey: queryKeys.user.prayer(date),
    queryFn: ({ signal }) =>
      apiRequest<PrayerSchedule>(`/prayer-times?date=${date}`, { signal }),
  }),
  admin: (page: AdminPage, search = "", userPage = 1) => queryOptions({
    queryKey: adminQueryKey(page, search, userPage),
    queryFn: ({ signal }) => loadAdminPage(page, search, userPage, signal),
  }),
};

export function adminQueryKey(page: AdminPage, search = "", userPage = 1) {
  if (page === "users") return queryKeys.admin.users(search, userPage);
  if (page === "overview") return queryKeys.admin.analytics;
  if (page === "templates") return queryKeys.admin.templates;
  if (page === "notifications") return queryKeys.admin.notifications;
  if (page === "health") return queryKeys.admin.health;
  return queryKeys.admin.audit;
}

export function updateTodayHabitLog(
  habits: TodayHabit[],
  habitId: string,
  todayLog: TodayHabit["todayLog"],
) {
  return habits.map((habit) =>
    habit.id === habitId ? { ...habit, todayLog } : habit
  );
}

async function loadAdminPage(
  page: AdminPage,
  search: string,
  userPage: number,
  signal: AbortSignal,
): Promise<AdminQueryData> {
  if (page === "overview") {
    return apiRequest<AdminAnalytics>("/admin/analytics", { signal });
  }
  if (page === "users") {
    return apiRequest<AdminUserPage>(
      `/admin/users?q=${encodeURIComponent(search)}&page=${userPage}&limit=50`,
      { signal },
    );
  }
  if (page === "templates") {
    return apiRequest<AdminTemplate[]>("/admin/templates", { signal });
  }
  if (page === "notifications") {
    return apiRequest<AdminDelivery[]>("/admin/notifications", { signal });
  }
  if (page === "health") {
    return apiRequest<AdminHealth>("/admin/health", { signal });
  }
  return apiRequest<AdminAudit[]>("/admin/audit-logs", { signal });
}
