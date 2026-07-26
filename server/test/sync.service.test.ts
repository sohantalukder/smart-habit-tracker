import { describe, expect, it, vi } from "vitest";
import { syncPushSchema } from "../src/contracts";
import type { DatabaseService } from "../src/platform/database.service";
import {
  clampClientTimestamp,
  compareSyncVersion,
  decodeSyncCursor,
  encodeSyncCursor,
  SyncService,
} from "../src/sync/sync.service";

describe("offline sync contract", () => {
  it("limits batches to 100 ordered mutations", () => {
    const mutation = {
      mutationId: "4245f96d-1a2b-4f3c-9d5e-112233445566",
      entityType: "habit",
      entityId: "5245f96d-1a2b-4f3c-9d5e-112233445566",
      operation: "delete",
      clientModifiedAt: "2026-07-26T12:00:00.000Z",
      payload: {},
    };
    expect(syncPushSchema.safeParse({
      deviceId: "device-12345",
      mutations: Array.from({ length: 100 }, (_, index) => ({
        ...mutation,
        mutationId: `4245f96d-1a2b-4f3c-9d5e-${String(index).padStart(12, "0")}`,
      })),
    }).success).toBe(true);
    expect(syncPushSchema.safeParse({
      deviceId: "device-12345",
      mutations: Array.from({ length: 101 }, () => mutation),
    }).success).toBe(false);
  });

  it("uses timestamp then mutation id for deterministic multi-device conflicts", () => {
    expect(compareSyncVersion(
      "2026-07-26T12:00:01.000Z",
      "a",
      "2026-07-26T12:00:00.000Z",
      "z",
    )).toBeGreaterThan(0);
    expect(compareSyncVersion(
      "2026-07-26T12:00:00.000Z",
      "b",
      "2026-07-26T12:00:00.000Z",
      "a",
    )).toBeGreaterThan(0);
  });

  it("clamps a client clock more than five minutes ahead", () => {
    const before = Date.now();
    const clamped = clampClientTimestamp("2999-01-01T00:00:00.000Z");
    expect(clamped.getTime()).toBeGreaterThanOrEqual(before + 4 * 60_000);
    expect(clamped.getTime()).toBeLessThanOrEqual(Date.now() + 5 * 60_000);
  });

  it("round trips opaque cursors and rejects malformed input", () => {
    const cursor = encodeSyncCursor("9007199254740993");
    expect(cursor).not.toContain("9007199254740993");
    expect(decodeSyncCursor(cursor)).toBe("9007199254740993");
    expect(() => decodeSyncCursor("not-a-cursor")).toThrow();
  });

  it("returns an already processed mutation without applying it again", async () => {
    const response = {
      mutationId: "4245f96d-1a2b-4f3c-9d5e-112233445566",
      status: "applied",
      canonical: { id: "habit-1" },
    };
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [{ response }] }),
    };
    const database = {
      transaction: vi.fn(async (work) => work(client)),
    } as unknown as DatabaseService;
    const service = new SyncService(database);

    const result = await service.push("user-1", {
      deviceId: "device-12345",
      mutations: [{
        mutationId: "4245f96d-1a2b-4f3c-9d5e-112233445566",
        entityType: "habit",
        entityId: "5245f96d-1a2b-4f3c-9d5e-112233445566",
        operation: "delete",
        clientModifiedAt: "2026-07-26T12:00:00.000Z",
        payload: {},
      }],
    });

    expect(result.results).toEqual([response]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("paginates changes inside the authenticated user's boundary", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          sequence: "11",
          entity_type: "habit",
          entity_id: "habit-1",
          operation: "upsert",
          payload: { id: "habit-1" },
          changed_at: new Date(),
        },
        {
          sequence: "12",
          entity_type: "habit",
          entity_id: "habit-2",
          operation: "delete",
          payload: null,
          changed_at: new Date(),
        },
      ],
    });
    const service = new SyncService({ query } as unknown as DatabaseService);
    const response = await service.pull(
      "authenticated-user",
      encodeSyncCursor("10"),
      1,
    );

    expect(response.hasMore).toBe(true);
    expect(response.changes).toHaveLength(1);
    expect(decodeSyncCursor(response.nextCursor)).toBe("11");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("where user_id = $1"),
      ["authenticated-user", "10", 2],
    );
  });

  it("returns retryable results without dropping a failed batch item", async () => {
    const database = {
      transaction: vi.fn().mockRejectedValue(new Error("connection reset")),
    } as unknown as DatabaseService;
    const service = new SyncService(database);
    const result = await service.push("user-1", {
      deviceId: "device-12345",
      mutations: [{
        mutationId: "4245f96d-1a2b-4f3c-9d5e-112233445566",
        entityType: "habit",
        entityId: "5245f96d-1a2b-4f3c-9d5e-112233445566",
        operation: "delete",
        clientModifiedAt: "2026-07-26T12:00:00.000Z",
        payload: {},
      }],
    });
    expect(result.results[0]).toMatchObject({
      status: "retryable",
      mutationId: "4245f96d-1a2b-4f3c-9d5e-112233445566",
    });
  });
});
