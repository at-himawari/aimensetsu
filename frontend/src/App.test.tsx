import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { AuthProvider } from "./state/auth";


describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            user: {
              user_id: "demo_frontend",
              name: "Frontend Demo",
              auth_provider: "demo",
              roles: ["user"],
            },
            token_type: "demo",
            access_token: "demo_frontend",
          },
          meta: { request_id: "req_test" },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("navigates between major screens", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(screen.getByRole("heading", { name: "ログイン" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "デモログインで開始" }));
    expect(await screen.findByRole("heading", { name: "ホーム" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/demo-login",
      expect.objectContaining({ method: "POST" }),
    );

    await user.click(screen.getByRole("button", { name: "今すぐ面接練習を始める" }));
    expect(screen.getByRole("heading", { name: /面接練習/ })).toBeInTheDocument();
    expect(screen.getByText("対話ログ")).toBeInTheDocument();
    expect(screen.getByText("接続後、あなたとAIの発話がここに表示されます。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "クレジット追加" }));
    expect(screen.getByRole("heading", { name: "課金" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ホームへ戻る" }));
    await user.click(screen.getByRole("button", { name: "経歴書を管理する" }));
    expect(screen.getByRole("heading", { name: "履歴書・職務経歴書アップロード" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "面接を始める" }));
    expect(screen.getByRole("heading", { name: /面接練習/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "面接を終了する" }));
    expect(screen.getByRole("heading", { name: "振り返り" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "メニューを開く" }));
    await user.click(screen.getByRole("menuitem", { name: "振り返り・履歴" }));
    expect(screen.getByRole("heading", { name: "履歴" })).toBeInTheDocument();
  });

  it("opens and deletes a history item", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "デモログインで開始" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "履歴を見る" }));
    await user.click(screen.getByRole("button", { name: "2026-04-24 Backend Engineer 模擬面接" }));

    expect(screen.getByRole("heading", { name: "履歴" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "2026-04-24 Backend Engineer 模擬面接" })).toBeInTheDocument();
    expect(screen.getByText("表示中: 2 件")).toBeInTheDocument();
    expect(screen.getByText("振り返りコメント")).toBeInTheDocument();
    expect(screen.getAllByText("AI面接コーチ")).toHaveLength(2);
    expect(screen.getByText("これまでのご経歴を教えてください。")).toBeInTheDocument();
    expect(screen.queryByText("決済処理のボトルネックを見直し、失敗率を大きく下げました。")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "会話履歴をすべて見る" }));
    expect(screen.getAllByText("あなた")).toHaveLength(2);
    expect(screen.getByText("決済処理のボトルネックを見直し、失敗率を大きく下げました。")).toBeInTheDocument();
    expect(screen.getByText("良かった点")).toBeInTheDocument();
    expect(screen.getByText("具体例を交えて説明できていた")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "履歴を削除" }));

    expect(screen.getByRole("heading", { name: "履歴" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2026-04-24 Backend Engineer 模擬面接" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2026-04-23 自己紹介集中練習" })).toBeInTheDocument();
  });

  it("uploads a resume and starts a session with it", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "デモログインで開始" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "経歴書を管理する" }));

    const file = new File(["%PDF-1.7 mock"], "new-resume.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("PDF を追加"), file);

    expect(screen.getByRole("button", { name: "new-resume.pdf" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "面接を始める" }));
    expect(screen.getByRole("heading", { name: /面接練習/ })).toBeInTheDocument();
  });

  it("loads conversation history from the API", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const path = String(input);

      if (path === "/api/auth/demo-login") {
        return {
          ok: true,
          json: async () => ({
            data: {
              user: {
                user_id: "demo_frontend",
                name: "Frontend Demo",
                auth_provider: "demo",
                roles: ["user"],
              },
              token_type: "demo",
              access_token: "demo_frontend",
            },
            meta: { request_id: "req_login" },
          }),
        } as Response;
      }

      if (path === "/api/history") {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                session_id: "ses_api_history",
                status: "completed",
                mode: "text",
                job_role: "Product Manager",
                consumed_minutes: 8,
                remaining_credit_minutes_after: 22,
                used_fallback: false,
                started_at: "2026-05-10T10:00:00+09:00",
                ended_at: "2026-05-10T10:08:00+09:00",
              },
            ],
            meta: { request_id: "req_history" },
          }),
        } as Response;
      }

      if (path === "/api/history/ses_api_history") {
        return {
          ok: true,
          json: async () => ({
            data: {
              session: {
                session_id: "ses_api_history",
                status: "completed",
                mode: "text",
                job_role: "Product Manager",
                consumed_minutes: 8,
                remaining_credit_minutes_after: 22,
                used_fallback: false,
                started_at: "2026-05-10T10:00:00+09:00",
                ended_at: "2026-05-10T10:08:00+09:00",
              },
              messages: [
                {
                  message_id: "msg_user",
                  sender_type: "user",
                  message_type: "text",
                  content: "プロダクト改善の経験を話したいです。",
                  created_at: "2026-05-10T10:01:00+09:00",
                },
                {
                  message_id: "msg_assistant",
                  sender_type: "assistant",
                  message_type: "text",
                  content: "成果指標と意思決定の流れを教えてください。",
                  ai_mode: "azure",
                  created_at: "2026-05-10T10:02:00+09:00",
                },
              ],
              reflection: {
                reflection_id: "ref_api",
                strengths: ["成果指標を具体的に話せていた"],
                improvements: ["意思決定の背景を先に置く"],
                advice: "課題、施策、結果の順で短くまとめましょう。",
                ai_mode: "azure",
                created_at: "2026-05-10T10:09:00+09:00",
              },
            },
            meta: { request_id: "req_history_detail" },
          }),
        } as Response;
      }

      return {
        ok: false,
        json: async () => ({
          error: {
            code: "NOT_FOUND",
            message: "not found",
          },
        }),
      } as Response;
    });

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "デモログインで開始" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "履歴を見る" }));

    expect(await screen.findByRole("button", { name: "2026/05/10 Product Manager" })).toBeInTheDocument();
    expect(await screen.findByText("プロダクト改善の経験を話したいです。")).toBeInTheDocument();
    expect(screen.getByText("成果指標と意思決定の流れを教えてください。")).toBeInTheDocument();
    expect(screen.getByText("成果指標を具体的に話せていた")).toBeInTheDocument();
  });

  it("purchases additional credits from the billing screen", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "デモログインで開始" }));
    expect(await screen.findByText("残クレジット: 30分")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "追加購入する" }));
    expect(screen.getByText("現在残高: 30分")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stripe Checkoutへ進む" }));
    expect(screen.getByText("現在残高: 60分")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ホームへ戻る" }));
    expect(screen.getByText("残クレジット: 60分")).toBeInTheDocument();
  });

  it("routes to resume setup from home when no resume remains", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "デモログインで開始" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "経歴書を管理する" }));
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    expect(screen.getByText("まだ RESUME がありません。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ホームへ戻る" }));
    await user.click(screen.getByRole("button", { name: "面接練習の準備を始める" }));
    expect(screen.getByRole("heading", { name: "履歴書・職務経歴書アップロード" })).toBeInTheDocument();
  });

  it("opens logout inside the shared menu", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "デモログインで開始" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "メニューを開く" }));
    expect(screen.getByRole("menuitem", { name: "ログアウト" })).toBeInTheDocument();
  });
});
