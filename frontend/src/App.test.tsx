import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App, { isAuthenticatedForMode } from "./App";
import { AuthProvider } from "./state/auth";

const originalLocation = window.location;

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

function installDefaultFetchMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? "GET";

      if (path === "/api/auth/demo-login") {
        return jsonResponse({
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
        });
      }

      if (path === "/api/resumes" && method === "GET") {
        return jsonResponse({
          data: [
            {
              resume_id: "resume_1",
              title: "resume_2026.pdf",
              file_name: "resume_2026.pdf",
              file_path: "resumes/resume_2026.pdf",
              content_type: "application/pdf",
              file_size: 123,
              has_extracted_text: true,
              extracted_text_preview: "Backend Engineer",
              uploaded_at: "2026-05-01T10:00:00+09:00",
              deleted_at: null,
            },
            {
              resume_id: "resume_2",
              title: "backend-engineer.pdf",
              file_name: "backend-engineer.pdf",
              file_path: "resumes/backend-engineer.pdf",
              content_type: "application/pdf",
              file_size: 456,
              has_extracted_text: true,
              extracted_text_preview: "Django",
              uploaded_at: "2026-05-02T10:00:00+09:00",
              deleted_at: null,
            },
          ],
          meta: { request_id: "req_resumes" },
        });
      }

      if (path === "/api/credits/balance") {
        return jsonResponse({
          data: {
            available_minutes: 30,
          },
          meta: { request_id: "req_balance" },
        });
      }

      if (path === "/api/resumes" && method === "POST") {
        return jsonResponse({
          data: {
            resume_id: "resume_uploaded",
            title: "new-resume.pdf",
            file_name: "new-resume.pdf",
            file_path: "resumes/new-resume.pdf",
            content_type: "application/pdf",
            file_size: 789,
            has_extracted_text: true,
            extracted_text_preview: "Uploaded",
            uploaded_at: "2026-05-03T10:00:00+09:00",
            deleted_at: null,
          },
          meta: { request_id: "req_upload" },
        });
      }

      if (path.startsWith("/api/resumes/") && method === "DELETE") {
        return jsonResponse({
          data: { message: "deleted" },
          meta: { request_id: "req_delete" },
        });
      }

      if (path.startsWith("/api/history/") && method === "DELETE") {
        return jsonResponse({
          data: { message: "deleted" },
          meta: { request_id: "req_history_delete" },
        });
      }

      if (path === "/api/billing/checkout-sessions" && method === "POST") {
        return jsonResponse({
          data: {
            payment_session_id: "pay_test",
            checkout_session_id: "cs_test",
            checkout_url: "https://checkout.stripe.test/session/cs_test",
            expires_at: null,
          },
          meta: { request_id: "req_checkout" },
        }, true, 201);
      }

      if (path === "/api/billing/checkout-sessions/confirm" && method === "POST") {
        return jsonResponse({
          data: {
            payment_session_id: "pay_test",
            checkout_session_id: "cs_test",
            status: "reflected",
            available_minutes: 60,
          },
          meta: { request_id: "req_checkout_confirm" },
        });
      }

      if (path === "/api/history") {
        return jsonResponse({
          error: {
            code: "NOT_FOUND",
            message: "not found",
          },
        }, false, 404);
      }

      return jsonResponse({
        error: {
          code: "NOT_FOUND",
          message: "not found",
        },
      }, false, 404);
    }),
  );
}


describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    installDefaultFetchMock();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
    window.history.pushState({}, "", "/");
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
    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));
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
    expect(screen.getByRole("heading", { name: "練習時間を追加" })).toBeInTheDocument();

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

    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "すべて見る" }));
    await user.click(screen.getByRole("button", { name: "2026-04-24 Backend Engineer 模擬面接" }));

    expect(screen.getByRole("heading", { name: "履歴" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "2026-04-24 Backend Engineer 模擬面接" })).toBeInTheDocument();
    expect(screen.getByText("面接練習の記録を 2 件表示しています。")).toBeInTheDocument();
    expect(screen.getByText("振り返りコメント")).toBeInTheDocument();
    expect(screen.getAllByText("AI面接コーチ")).toHaveLength(3);
    expect(screen.getByText("これまでのご経歴を教えてください。")).toBeInTheDocument();
    expect(screen.queryByText("決済処理のボトルネックを見直し、失敗率を大きく下げました。")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "会話履歴をすべて見る" }));
    expect(screen.getAllByText("あなた")).toHaveLength(2);
    expect(screen.getByText("決済処理のボトルネックを見直し、失敗率を大きく下げました。")).toBeInTheDocument();
    expect(screen.getByText("良かった点")).toBeInTheDocument();
    expect(screen.getByText("具体例を交えて説明できていた")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "履歴を削除" }));

    expect(screen.getByRole("heading", { name: "履歴" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/history/history_1",
      expect.objectContaining({ method: "DELETE" }),
    );
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

    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "経歴書を管理する" }));
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);

    const file = new File(["%PDF-1.7 mock"], "new-resume.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("PDF を追加"), file);

    expect(screen.getByText("選択中: new-resume.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "アップロードする" }));
    expect(screen.getByRole("button", { name: "new-resume.pdf" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "面接を始める" }));
    expect(screen.getByRole("heading", { name: /面接練習/ })).toBeInTheDocument();
  });

  it("keeps the upload action available before selecting a file", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "経歴書を管理する" }));
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);

    const uploadButton = screen.getByRole("button", { name: "アップロードする" });
    expect(uploadButton).toBeEnabled();
    await user.click(uploadButton);
    expect(screen.getByText("アップロードする PDF を選択してください。")).toBeInTheDocument();
  });

  it("rejects oversized resume uploads before calling the API", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "経歴書を管理する" }));
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    const callCountBeforeUpload = vi.mocked(fetch).mock.calls.length;

    const file = new File(["x"], "large-resume.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 50 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText("PDF を追加"), file);

    expect(screen.getByText("ファイルサイズは 50MB 以下にしてください。")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.length).toBe(callCountBeforeUpload);
  });

  it("disables resume uploads after two files are registered", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "経歴書を管理する" }));

    expect(screen.getByLabelText("PDF を追加")).toBeDisabled();
    expect(screen.getByRole("button", { name: "アップロードする" })).toBeDisabled();
    expect(screen.getByText("登録できる履歴書・職務経歴書は2件までです。追加する場合は不要なPDFを削除してください。")).toBeInTheDocument();
  });

  it("loads conversation history from the API", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? "GET";

      if (path === "/api/auth/demo-login") {
        return jsonResponse({
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
          });
      }

      if (path === "/api/resumes" && method === "GET") {
        return jsonResponse({
          data: [],
          meta: { request_id: "req_resumes" },
        });
      }

      if (path === "/api/credits/balance") {
        return jsonResponse({
          data: {
            available_minutes: 30,
          },
          meta: { request_id: "req_balance" },
        });
      }

      if (path === "/api/history") {
        return jsonResponse({
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
          });
      }

      if (path === "/api/history/ses_api_history") {
        return jsonResponse({
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
          });
      }

      return jsonResponse({
          error: {
            code: "NOT_FOUND",
            message: "not found",
          },
        }, false, 404);
    });

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "すべて見る" }));

    expect(await screen.findByRole("button", { name: "2026/05/10 Product Manager" })).toBeInTheDocument();
    expect(await screen.findByText("プロダクト改善の経験を話したいです。")).toBeInTheDocument();
    expect(screen.getByText("成果指標と意思決定の流れを教えてください。")).toBeInTheDocument();
    expect(screen.getByText("成果指標を具体的に話せていた")).toBeInTheDocument();
  });

  it("purchases additional credits from the billing screen", async () => {
    const user = userEvent.setup();
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: {
        ...window.location,
        origin: "http://localhost:5173",
        assign: assignMock,
      },
      writable: true,
    });
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));
    expect(await screen.findByLabelText("残クレジット: 30分")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "追加購入する" }));
    expect(screen.getByText("30分追加パック")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "30分を追加購入する" }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/billing/checkout-sessions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(assignMock).toHaveBeenCalledWith("https://checkout.stripe.test/session/cs_test");

    await user.click(screen.getByRole("button", { name: "ホームへ戻る" }));
    expect(screen.getByLabelText("残クレジット: 30分")).toBeInTheDocument();
  });

  it("refreshes credit balance from the API after checkout succeeds", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "aimensetsu_auth_state",
      JSON.stringify({ mode: "demo", demoUserId: "demo_frontend", accessToken: null }),
    );
    window.history.pushState({}, "", "/?checkout=success&checkout_session_id=cs_test");
    let balanceRequestCount = 0;
    let isCheckoutConfirmed = false;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/credits/balance") {
        balanceRequestCount += 1;
        return jsonResponse({
          data: {
            available_minutes: isCheckoutConfirmed || balanceRequestCount > 1 ? 60 : 0,
          },
          meta: { request_id: "req_balance_success" },
        });
      }
      if (path === "/api/billing/checkout-sessions/confirm") {
        isCheckoutConfirmed = true;
        return jsonResponse({
          data: {
            payment_session_id: "pay_test",
            checkout_session_id: "cs_test",
            status: "reflected",
            available_minutes: 60,
          },
          meta: { request_id: "req_checkout_confirm" },
        });
      }
      if (path === "/api/resumes") {
        return jsonResponse({
          data: [],
          meta: { request_id: "req_resumes" },
        });
      }
      return jsonResponse({
        error: {
          code: "NOT_FOUND",
          message: "not found",
        },
      }, false, 404);
    });

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    expect(await screen.findByLabelText("残クレジット: 60分", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(window.location.search).toBe("");
    await user.click(screen.getByRole("button", { name: "追加購入する" }));
    expect(screen.getByText("30分追加パック")).toBeInTheDocument();
  });

  it("disables starting practice when credit balance is zero", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? "GET";

      if (path === "/api/auth/demo-login") {
        return jsonResponse({
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
        });
      }
      if (path === "/api/resumes" && method === "GET") {
        return jsonResponse({
          data: [
            {
              resume_id: "resume_1",
              title: "resume.pdf",
              file_name: "resume.pdf",
              file_path: "resumes/resume.pdf",
              content_type: "application/pdf",
              file_size: 123,
              has_extracted_text: true,
              uploaded_at: "2026-05-01T10:00:00+09:00",
              deleted_at: null,
            },
          ],
          meta: { request_id: "req_resumes" },
        });
      }
      if (path === "/api/credits/balance") {
        return jsonResponse({
          data: {
            available_minutes: 0,
          },
          meta: { request_id: "req_balance" },
        });
      }
      return jsonResponse({
        error: {
          code: "NOT_FOUND",
          message: "not found",
        },
      }, false, 404);
    });

    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));

    const startButton = await screen.findByRole("button", { name: "クレジットを追加して始める" });
    expect(startButton).toBeEnabled();
    await user.click(startButton);
    expect(screen.getByRole("heading", { name: "練習時間を追加" })).toBeInTheDocument();
  });

  it("starts practice from home even when no resume remains", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "経歴書を管理する" }));
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    expect(screen.getByText("履歴書・職務経歴書はまだ登録されていません。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ホームへ戻る" }));
    await user.click(screen.getByRole("button", { name: "今すぐ面接練習を始める" }));
    expect(screen.getByRole("dialog", { name: "職務経歴書なしで始めますか？" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "このまま始める" }));
    expect(screen.getByRole("heading", { name: /面接練習/ })).toBeInTheDocument();
  });

  it("offers a resume upload path before starting without a resume", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "経歴書を管理する" }));
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    await user.click(screen.getAllByRole("button", { name: "削除" })[0]);
    await user.click(screen.getByRole("button", { name: "ホームへ戻る" }));

    await user.click(screen.getByRole("button", { name: "今すぐ面接練習を始める" }));
    await user.click(screen.getByRole("button", { name: "職務経歴書を追加する" }));

    expect(screen.getByRole("heading", { name: "履歴書・職務経歴書アップロード" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "職務経歴書なしで始めますか？" })).not.toBeInTheDocument();
  });

  it("opens logout inside the shared menu", async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );

    await user.click(screen.getByRole("button", { name: "無料体験を始める" }));
    await screen.findByRole("heading", { name: "ホーム" });
    await user.click(screen.getByRole("button", { name: "メニューを開く" }));
    expect(screen.getByRole("menuitem", { name: "ログアウト" })).toBeInTheDocument();
  });

  it("does not treat persisted demo auth as logged in for cognito production mode", () => {
    expect(isAuthenticatedForMode(
      { mode: "demo", demoUserId: "demo_frontend", accessToken: null },
      "cognito",
    )).toBe(false);
    expect(isAuthenticatedForMode(
      { mode: "jwt", demoUserId: null, accessToken: "access-token" },
      "cognito",
    )).toBe(true);
  });
});
