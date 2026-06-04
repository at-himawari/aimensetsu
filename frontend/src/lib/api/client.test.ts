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

  it("prepares a phone number update", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          phone_number: "+818011112222",
        },
        meta: { request_id: "req_phone" },
      }),
    });
    const client = createApiClient({ baseUrl: "", fetchImpl: fetchMock as typeof fetch });

    const response = await client.preparePhoneNumberUpdate(
      { mode: "jwt", demoUserId: null, accessToken: "access-token" },
      "080-1111-2222",
    );

    expect(response.data.phone_number).toBe("+818011112222");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/users/phone-number/prepare",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phone_number: "080-1111-2222" }),
      }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer access-token");
  });

  it("uploads resumes as multipart form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          resume_id: "res_1",
          title: "resume.pdf",
          file_name: "resume.pdf",
          file_path: "resumes/resume.pdf",
          content_type: "application/pdf",
          file_size: 123,
          has_extracted_text: true,
          extracted_text_preview: "Python",
          uploaded_at: "2026-05-12T10:00:00+09:00",
          deleted_at: null,
        },
        meta: { request_id: "req_1" },
      }),
    });
    const client = createApiClient({ baseUrl: "", fetchImpl: fetchMock as typeof fetch });
    const file = new File(["%PDF-1.7"], "resume.pdf", { type: "application/pdf" });

    await client.uploadResume({ mode: "demo", demoUserId: "demo_1", accessToken: null }, file, "resume.pdf");

    const init = fetchMock.mock.calls[0][1];
    const headers = init.headers as Headers;
    expect(init.body).toBeInstanceOf(FormData);
    expect(headers.get("Content-Type")).toBeNull();
    expect(headers.get("X-Demo-User")).toBe("demo_1");
  });

  it("deletes a history entry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { message: "deleted" },
        meta: { request_id: "req_1" },
      }),
    });
    const client = createApiClient({ baseUrl: "", fetchImpl: fetchMock as typeof fetch });

    await client.deleteHistory({ mode: "demo", demoUserId: "demo_1", accessToken: null }, "ses_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/history/ses_1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("gets credit balance", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          available_minutes: 60,
        },
        meta: { request_id: "req_1" },
      }),
    });
    const client = createApiClient({ baseUrl: "", fetchImpl: fetchMock as typeof fetch });

    const response = await client.getCreditBalance({ mode: "demo", demoUserId: "demo_1", accessToken: null });

    expect(response.data.available_minutes).toBe(60);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/credits/balance",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a checkout session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          payment_session_id: "pay_1",
          checkout_session_id: "cs_1",
          checkout_url: "https://checkout.stripe.test/session/cs_1",
          expires_at: null,
        },
        meta: { request_id: "req_1" },
      }),
    });
    const client = createApiClient({ baseUrl: "", fetchImpl: fetchMock as typeof fetch });

    await client.createCheckoutSession(
      { mode: "demo", demoUserId: "demo_1", accessToken: null },
      {
        plan_code: "minutes_30",
        quantity: 1,
        success_url: "http://localhost/success",
        cancel_url: "http://localhost/cancel",
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing/checkout-sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          plan_code: "minutes_30",
          quantity: 1,
          success_url: "http://localhost/success",
          cancel_url: "http://localhost/cancel",
        }),
      }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Idempotency-Key")).toContain("checkout_");
  });

  it("confirms a checkout session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          payment_session_id: "pay_1",
          checkout_session_id: "cs_1",
          status: "reflected",
          available_minutes: 60,
        },
        meta: { request_id: "req_1" },
      }),
    });
    const client = createApiClient({ baseUrl: "", fetchImpl: fetchMock as typeof fetch });

    const response = await client.confirmCheckoutSession(
      { mode: "demo", demoUserId: "demo_1", accessToken: null },
      "cs_1",
    );

    expect(response.data.available_minutes).toBe(60);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing/checkout-sessions/confirm",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ checkout_session_id: "cs_1" }),
      }),
    );
  });
});
