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
  created_at: string;
  suspended_at: string | null;
};

export type AdminTemplate = {
  id: string;
  icon: string;
  name: string;
  category: string;
  active: boolean;
  default_target: number | null;
  default_unit: string | null;
};

export type AdminDelivery = {
  id: string;
  title: string;
  channel: string;
  state: string;
  scheduled_at: string;
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
  | { data: AdminUser[] }
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
    users: (search: string) => ["admin", "users", search] as const,
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
  admin: (page: AdminPage, search = "") => queryOptions({
    queryKey: adminQueryKey(page, search),
    queryFn: ({ signal }) => loadAdminPage(page, search, signal),
  }),
};

export function adminQueryKey(page: AdminPage, search = "") {
  if (page === "users") return queryKeys.admin.users(search);
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
  signal: AbortSignal,
): Promise<AdminQueryData> {
  if (page === "overview") {
    return apiRequest<AdminAnalytics>("/admin/analytics", { signal });
  }
  if (page === "users") {
    return apiRequest<{ data: AdminUser[] }>(
      `/admin/users?q=${encodeURIComponent(search)}`,
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
