import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "./client";


describe("api client", () => {
  it("calls backend demo login endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          user: {
            user_id: "demo_1",
            name: "Demo",
            auth_provider: "demo",
            roles: ["user"],
          },
          token_type: "demo",
          access_token: "demo_1",
        },
        meta: { request_id: "req_1" },
      }),
    });
    const client = createApiClient({ baseUrl: "", fetchImpl: fetchMock as typeof fetch });

    const response = await client.demoLogin("demo_1", "Demo");

    expect(response.data.access_token).toBe("demo_1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/demo-login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ demo_user_id: "demo_1", name: "Demo" }),
      }),
    );
  });

  it("sends X-Demo-User when demo auth is active", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          user_id: "demo_1",
          name: "Demo",
          auth_provider: "demo",
          roles: ["user"],
          credit_balance_minutes: 30,
        },
        meta: { request_id: "req_1" },
      }),
    });
    const client = createApiClient({ baseUrl: "http://localhost:8000", fetchImpl: fetchMock as typeof fetch });

    await client.getAuthMe({ mode: "demo", demoUserId: "demo_1", accessToken: null });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/auth/me",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("X-Demo-User")).toBe("demo_1");
  });

  it("throws ApiError when api response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          code: "UNAUTHORIZED",
          message: "認証が必要です。",
        },
      }),
    });
    const client = createApiClient({ baseUrl: "http://localhost:8000", fetchImpl: fetchMock as typeof fetch });

    await expect(client.getAuthMe({ mode: "anonymous", demoUserId: null, accessToken: null })).rejects.toMatchObject({
      name: "ApiError",
      message: "認証が必要です。",
      status: 401,
      code: "UNAUTHORIZED",
    } satisfies Partial<ApiError>);
  });
});
