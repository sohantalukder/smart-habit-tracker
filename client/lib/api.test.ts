import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiRequest } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("preserves the browser multipart boundary for avatar uploads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ has_avatar: true }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const body = new FormData();
    body.set("file", new Blob(["avatar"], { type: "image/webp" }), "avatar.webp");

    await apiRequest("/profile/avatar", { method: "PUT", body });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.has("content-type")).toBe(false);
    expect(headers.has("x-correlation-id")).toBe(true);
  });

  it("retains structured field errors from the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        code: "VALIDATION_ERROR",
        message: "Please check the submitted values.",
        fieldErrors: { name: ["Name is too short."] },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    )));

    await expect(apiRequest("/profile")).rejects.toMatchObject({
      name: "ApiRequestError",
      code: "VALIDATION_ERROR",
      fieldErrors: { name: ["Name is too short."] },
    } satisfies Partial<ApiRequestError>);
  });
});
