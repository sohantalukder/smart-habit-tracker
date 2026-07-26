import { describe, expect, it, vi } from "vitest";
import {
  isHabitScheduledOnDate,
  UserController,
} from "../src/user.controller";
import type { AuthenticatedRequest } from "../src/auth/auth.guard";
import type { DatabaseService } from "../src/platform/database.service";

const request = {
  user: {
    id: "4245f96d-1a2b-4f3c-9d5e-112233445566",
    email: "user@example.com",
    name: "User",
  },
} as AuthenticatedRequest;

describe("UserController habit creation", () => {
  it("copies authoritative values from an active template", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: "5245f96d-1a2b-4f3c-9d5e-112233445566",
            name: "Read & learn",
            icon: "📚",
            category: "learning",
            habit_type: "duration",
            default_target: 20,
            default_unit: "minutes",
            default_frequency: { kind: "daily" },
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: "6245f96d-1a2b-4f3c-9d5e-112233445566",
            template_id: "5245f96d-1a2b-4f3c-9d5e-112233445566",
            name: "Read & learn",
          }],
        }),
    };
    const database = {
      transaction: vi.fn(async (work) => work(client)),
    } as unknown as DatabaseService;
    const controller = new UserController(database);

    const result = await controller.createHabit(request, {
      templateId: "5245f96d-1a2b-4f3c-9d5e-112233445566",
    });

    expect(result).toMatchObject({ name: "Read & learn" });
    expect(client.query).toHaveBeenLastCalledWith(
      expect.stringContaining("insert into habits"),
      expect.arrayContaining(["Read & learn", "learning", "duration"]),
    );
  });

  it("rejects inactive or unknown templates", async () => {
    const database = {
      transaction: vi.fn(async (work) => work({
        query: vi.fn().mockResolvedValue({ rows: [] }),
      })),
    } as unknown as DatabaseService;
    const controller = new UserController(database);

    await expect(controller.createHabit(request, {
      templateId: "5245f96d-1a2b-4f3c-9d5e-112233445566",
    })).rejects.toMatchObject({ status: 400 });
  });

  it("returns a conflict when a template is already active", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: "5245f96d-1a2b-4f3c-9d5e-112233445566",
            name: "Read & learn",
            icon: "📚",
            category: "learning",
            habit_type: "duration",
            default_target: 20,
            default_unit: "minutes",
            default_frequency: { kind: "daily" },
          }],
        })
        .mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "23505" })),
    };
    const database = {
      transaction: vi.fn(async (work) => work(client)),
    } as unknown as DatabaseService;
    const controller = new UserController(database);

    await expect(controller.createHabit(request, {
      templateId: "5245f96d-1a2b-4f3c-9d5e-112233445566",
    })).rejects.toMatchObject({ status: 409 });
  });
});

describe("isHabitScheduledOnDate", () => {
  it("keeps daily and weekly-target habits available every day", () => {
    expect(isHabitScheduledOnDate({ kind: "daily" }, "2026-07-26")).toBe(true);
    expect(isHabitScheduledOnDate(
      { kind: "weekly_target", target: 4 },
      "2026-07-26",
    )).toBe(true);
  });

  it("shows weekday habits only on selected local weekdays", () => {
    expect(isHabitScheduledOnDate(
      { kind: "weekdays", days: [1, 3, 5] },
      "2026-07-27",
    )).toBe(true);
    expect(isHabitScheduledOnDate(
      { kind: "weekdays", days: [1, 3, 5] },
      "2026-07-26",
    )).toBe(false);
  });
});

describe("UserController tracking report", () => {
  it("returns honest daily totals for the selected range", async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: "habit-1",
              name: "Read",
              icon: "📚",
              habit_type: "duration",
              target: 20,
              unit: "minutes",
              frequency: { kind: "daily" },
              created_at: "2026-07-25T10:00:00.000Z",
            },
            {
              id: "habit-2",
              name: "Run",
              icon: "🏃",
              habit_type: "do",
              target: null,
              unit: null,
              frequency: { kind: "weekdays", days: [0] },
              created_at: "2026-07-25T10:00:00.000Z",
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{
            habit_id: "habit-1",
            local_date: "2026-07-26",
            status: "done",
            value: 20,
            note: null,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            local_date: "2026-07-26",
            win_note: "Kept the promise.",
            reflection_note: null,
          }],
        }),
    } as unknown as DatabaseService;
    const controller = new UserController(database);

    const result = await controller.tracking(
      request,
      "2026-07-26",
      "2026-07-27",
    );

    expect(result).toMatchObject({
      totalCompleted: 1,
      totalScheduled: 3,
      completionRate: 33,
    });
    expect(result.days[0]).toMatchObject({
      date: "2026-07-26",
      completed: 1,
      scheduled: 2,
      winNote: "Kept the promise.",
    });
    expect(result.days[1]).toMatchObject({
      date: "2026-07-27",
      completed: 0,
      scheduled: 1,
    });
  });

  it("rejects invalid, reversed, and excessive date ranges before querying", async () => {
    const database = { query: vi.fn() } as unknown as DatabaseService;
    const controller = new UserController(database);

    await expect(controller.tracking(request, "26-07-2026", "2026-07-27"))
      .rejects.toMatchObject({ status: 400 });
    await expect(controller.tracking(request, "2026-07-28", "2026-07-27"))
      .rejects.toMatchObject({ status: 400 });
    await expect(controller.tracking(request, "2025-01-01", "2026-07-27"))
      .rejects.toMatchObject({ status: 400 });
    expect(database.query).not.toHaveBeenCalled();
  });
});

describe("UserController check-in removal", () => {
  it("deletes only the authenticated user's log for the selected date", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    } as unknown as DatabaseService;
    const controller = new UserController(database);

    await expect(controller.removeCheckIn(request, "habit-1", "2026-07-26"))
      .resolves.toEqual({ deleted: true });
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("delete from habit_daily_logs"),
      ["habit-1", request.user.id, "2026-07-26"],
    );
  });
});

describe("UserController daily journal", () => {
  it("returns an empty private journal when the date has no reflection", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as DatabaseService;
    const controller = new UserController(database);

    await expect(controller.journal(request, "2026-07-26")).resolves.toEqual({
      id: null,
      user_id: request.user.id,
      local_date: "2026-07-26",
      win_note: null,
      reflection_note: null,
    });
  });

  it("upserts trimmed reflection text for the authenticated user", async () => {
    const saved = {
      id: "journal-1",
      user_id: request.user.id,
      local_date: "2026-07-26",
      win_note: "A focused morning",
      reflection_note: null,
    };
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [saved] }),
    } as unknown as DatabaseService;
    const controller = new UserController(database);

    await expect(controller.saveJournal(request, "2026-07-26", {
      winNote: "  A focused morning  ",
      reflectionNote: "",
    })).resolves.toEqual(saved);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("insert into daily_journals"),
      [
        request.user.id,
        "2026-07-26",
        "A focused morning",
        null,
      ],
    );
  });
});
