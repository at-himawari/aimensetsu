import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionScreen } from "./SessionScreen";
import { AuthProvider } from "../state/auth";


describe("SessionScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "aimensetsu_auth_state",
      JSON.stringify({ mode: "demo", demoUserId: "demo_frontend", accessToken: null }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("shows a Cloud Run startup wait notice when session creation is slow", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));

    render(
      <AuthProvider>
        <SessionScreen
          resumeId={null}
          onBilling={vi.fn()}
          onFinish={vi.fn()}
        />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "面接を開始する" }));

    expect(screen.getAllByText("面接セッションを作成しています。").length).toBeGreaterThan(0);

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getAllByText("バックエンドを起動しています。初回アクセスでは数十秒かかる場合があります。このままお待ちください。").length).toBeGreaterThan(0);
  });
});
