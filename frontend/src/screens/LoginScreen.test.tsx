import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginScreen } from "./LoginScreen";


function renderLoginScreen(overrides: Partial<ComponentProps<typeof LoginScreen>> = {}) {
  return render(
    <LoginScreen
      onDemoLogin={vi.fn()}
      onPasswordLogin={vi.fn(async () => undefined)}
      onSignUp={vi.fn(async () => undefined)}
      onConfirmSignUp={vi.fn(async () => undefined)}
      onResendConfirmationCode={vi.fn(async () => undefined)}
      onForgotPassword={vi.fn(async () => undefined)}
      onConfirmForgotPassword={vi.fn(async () => undefined)}
      authMode="cognito"
      isCognitoConfigured
      {...overrides}
    />,
  );
}


describe("LoginScreen", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("locks account tabs after starting SMS confirmation", async () => {
    const user = userEvent.setup();
    const onSignUp = vi.fn(async () => undefined);
    renderLoginScreen({ onSignUp });

    await user.click(screen.getByRole("tab", { name: "新規登録" }));
    await user.type(screen.getByLabelText("お名前"), "山田太郎");
    await user.type(screen.getByLabelText("メールアドレス"), "user@example.com");
    await user.type(screen.getByLabelText("電話番号"), "090-1234-5678");
    await user.type(screen.getByLabelText("パスワード"), "Password1!");
    await user.click(screen.getByRole("button", { name: "新規登録" }));

    expect(await screen.findByRole("heading", { name: "電話番号確認" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "ログイン" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "新規登録" })).toBeDisabled();
    expect(window.localStorage.getItem("aimensetsu_pending_confirmation_email")).toBe("user@example.com");
  });

  it("restores the SMS confirmation screen after leaving before confirmation", () => {
    window.localStorage.setItem("aimensetsu_pending_confirmation_email", "user@example.com");

    renderLoginScreen();

    expect(screen.getByRole("heading", { name: "電話番号確認" })).toBeInTheDocument();
    expect(screen.getByLabelText("SMS確認コード")).toBeInTheDocument();
  });

  it("moves back to SMS confirmation when login is attempted before phone verification", async () => {
    const user = userEvent.setup();
    const view = renderLoginScreen();

    await user.type(screen.getByLabelText("メールアドレス"), "user@example.com");
    view.rerender(
      <LoginScreen
        onDemoLogin={vi.fn()}
        onPasswordLogin={vi.fn(async () => undefined)}
        onSignUp={vi.fn(async () => undefined)}
        onConfirmSignUp={vi.fn(async () => undefined)}
        onResendConfirmationCode={vi.fn(async () => undefined)}
        onForgotPassword={vi.fn(async () => undefined)}
        onConfirmForgotPassword={vi.fn(async () => undefined)}
        authMode="cognito"
        isCognitoConfigured
        errorMessage="電話番号確認が完了していません。SMSの確認コードを入力してください。"
      />,
    );

    expect(await screen.findByRole("heading", { name: "電話番号確認" })).toBeInTheDocument();
    expect(screen.getByLabelText("SMS確認コード")).toBeInTheDocument();
  });

  it("announces an incorrect password message on the login form", () => {
    renderLoginScreen({
      errorMessage: "メールアドレスまたはパスワードが正しくありません。",
    });

    expect(screen.getByRole("alert")).toHaveTextContent("メールアドレスまたはパスワードが正しくありません。");
  });

  it("moves migrated users to password reset when Cognito requires it", async () => {
    const user = userEvent.setup();
    const view = renderLoginScreen();

    await user.type(screen.getByLabelText("メールアドレス"), "migrated@example.com");
    view.rerender(
      <LoginScreen
        onDemoLogin={vi.fn()}
        onPasswordLogin={vi.fn(async () => undefined)}
        onSignUp={vi.fn(async () => undefined)}
        onConfirmSignUp={vi.fn(async () => undefined)}
        onResendConfirmationCode={vi.fn(async () => undefined)}
        onForgotPassword={vi.fn(async () => undefined)}
        onConfirmForgotPassword={vi.fn(async () => undefined)}
        authMode="cognito"
        isCognitoConfigured
        errorMessage="パスワード再設定が必要です。確認コードを受け取り、新しいパスワードを設定してください。"
      />,
    );

    expect(await screen.findByRole("heading", { name: "パスワード再設定" })).toBeInTheDocument();
    expect(screen.getByLabelText("メールアドレス")).toHaveValue("migrated@example.com");
    expect(screen.getByRole("button", { name: "確認コードを送信" })).toBeInTheDocument();
  });

  it("completes the password reset code flow", async () => {
    const user = userEvent.setup();
    const onForgotPassword = vi.fn(async () => undefined);
    const onConfirmForgotPassword = vi.fn(async () => undefined);
    renderLoginScreen({ onForgotPassword, onConfirmForgotPassword });

    await user.click(screen.getByRole("button", { name: "パスワードを再設定する" }));
    await user.type(screen.getByLabelText("メールアドレス"), "user@example.com");
    await user.click(screen.getByRole("button", { name: "確認コードを送信" }));

    expect(onForgotPassword).toHaveBeenCalledWith({ email: "user@example.com" });
    expect(await screen.findByRole("heading", { name: "パスワード再設定" })).toBeInTheDocument();
    expect(screen.getByLabelText("確認コード")).toBeInTheDocument();

    await user.type(screen.getByLabelText("確認コード"), "123456");
    await user.type(screen.getByLabelText("新しいパスワード"), "NewPassword1!");
    await user.click(screen.getByRole("button", { name: "パスワードを再設定" }));

    expect(onConfirmForgotPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      code: "123456",
      newPassword: "NewPassword1!",
    });
    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
    expect(screen.getByText("パスワードを再設定しました。新しいパスワードでログインしてください。")).toBeInTheDocument();
  });
});
