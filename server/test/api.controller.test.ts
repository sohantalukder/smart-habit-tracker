import { describe, expect, it } from "vitest";
import { ApiController } from "../src/api.controller";

describe("ApiController", () => {
  it("describes the versioned API root and its public diagnostics", () => {
    expect(new ApiController().root()).toEqual({
      status: "ok",
      service: "bloom-api",
      version: "v1",
      links: {
        health: "/v1/health",
        readiness: "/v1/health/ready",
        openapi: "/v1/openapi.json",
      },
    });
  });
});
