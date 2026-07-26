import { describe, expect, it, vi } from "vitest";
import type {
  ExperienceProfile,
  HabitLog,
  TodayHabit,
} from "./api/types";
import {
  QUERY_CACHE_TIME,
  QUERY_STALE_TIME,
  adminQueryKey,
  appQueries,
  createAppQueryClient,
  queryKeys,
  updateTodayHabitLog,
} from "./queries";

describe("TanStack Query cache policy", () => {
  it("keeps a fresh query cached across repeat mounts", async () => {
    const client = createAppQueryClient();
    const queryFn = vi.fn().mockResolvedValue(["cached"]);
    const options = {
      queryKey: queryKeys.user.habits,
      queryFn,
    };

    await client.fetchQuery(options);
    await client.fetchQuery(options);

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(client.getDefaultOptions().queries).toMatchObject({
      staleTime: QUERY_STALE_TIME,
      gcTime: QUERY_CACHE_TIME,
    });
  });

  it("uses the server profile as fresh initial data without a duplicate fetch", async () => {
    const client = createAppQueryClient();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const profile = {
      id: "user-1",
      email: "amina@example.com",
      name: "Amina",
      timezone: "Asia/Dhaka",
      units: "metric",
      account_created_at: "2026-07-26T00:00:00.000Z",
      has_avatar: false,
    } satisfies ExperienceProfile;

    const result = await client.fetchQuery(appQueries.profile(profile));

    expect(result).toEqual(profile);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("uses independent keys for dates, ranges, and admin searches", () => {
    expect(queryKeys.user.today("2026-07-25")).not.toEqual(
      queryKeys.user.today("2026-07-26"),
    );
    expect(queryKeys.user.tracking("2026-07-01", "2026-07-07")).not.toEqual(
      queryKeys.user.tracking("2026-07-01", "2026-07-31"),
    );
    expect(adminQueryKey("users", "amina", 1)).not.toEqual(
      adminQueryKey("users", "amina", 2),
    );
    expect(adminQueryKey("users", "amina", 1)).not.toEqual(
      adminQueryKey("users", "sohan", 1),
    );
  });

  it("invalidates all cached date variants through their root key", async () => {
    const client = createAppQueryClient();
    const firstKey = queryKeys.user.today("2026-07-25");
    const secondKey = queryKeys.user.today("2026-07-26");
    client.setQueryData(firstKey, []);
    client.setQueryData(secondKey, []);

    await client.invalidateQueries({
      queryKey: queryKeys.user.todayRoot,
      refetchType: "none",
    });

    expect(client.getQueryState(firstKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(secondKey)?.isInvalidated).toBe(true);
  });

  it("lets explicit notification events bypass the freshness window", async () => {
    const client = createAppQueryClient();
    client.setQueryData(queryKeys.user.notifications, []);

    await client.invalidateQueries({
      queryKey: queryKeys.user.notifications,
      refetchType: "none",
    });

    expect(
      client.getQueryState(queryKeys.user.notifications)?.isInvalidated,
    ).toBe(true);
  });
});

describe("optimistic habit check-ins", () => {
  const habit = {
    id: "habit-1",
    user_id: "user-1",
    name: "Read",
    icon: "R",
    category: "learning",
    habit_type: "do",
    target: null,
    unit: null,
    frequency: { kind: "daily" },
    state: "active",
  } satisfies TodayHabit;

  it("updates one cached habit and can restore the failure snapshot", () => {
    const client = createAppQueryClient();
    const key = queryKeys.user.today("2026-07-26");
    const snapshot = [habit];
    const optimisticLog = {
      id: "optimistic-habit-1",
      habit_id: habit.id,
      user_id: habit.user_id,
      local_date: "2026-07-26",
      status: "done",
      value: null,
      note: null,
    } satisfies HabitLog;
    client.setQueryData(key, snapshot);

    client.setQueryData<TodayHabit[]>(key, (current = []) =>
      updateTodayHabitLog(current, habit.id, optimisticLog));
    expect(client.getQueryData<TodayHabit[]>(key)?.[0]?.todayLog).toEqual(
      optimisticLog,
    );

    client.setQueryData(key, snapshot);
    expect(client.getQueryData<TodayHabit[]>(key)?.[0]?.todayLog).toBeUndefined();
  });
});
