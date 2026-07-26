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
